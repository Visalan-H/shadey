import { generateState } from 'arctic';
import { Router } from 'express';
import { connectDb } from '../db.js';
import { env } from '../env.js';
import { getUserToken, isAdmin, loadSessionUser, requireUser } from '../middleware/requireUser.js';
import { PaintingModel } from '../models/Painting.js';
import { ReportModel } from '../models/Report.js';
import { User } from '../models/User.js';
import { forgetCalendars } from '../services/calendar.js';
import { encrypt } from '../services/crypto.js';
import { BASE_SCOPES, fetchProfile, githubClient, isExtraScope, revokeGrant } from '../services/githubOAuth.js';
import { cookieOptions, endSession, signToken, startSession, verifyToken } from '../services/session.js';

export const router = Router();

const STATE_COOKIE = 'gp_oauth';
const STATE_AUDIENCE = 'oauth-state';
const STATE_TTL_MS = 10 * 60 * 1000;

// Only same-site relative paths: "/x" but not "//evil.com" or "/\evil.com" (browsers read both as hosts).
export function safeReturnTo(value: unknown): string | null {
    if (value === undefined) return '/';
    if (typeof value !== 'string' || value.length > 2048) return null;
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
    if ([...value].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return null;
    return value;
}

function appUrl(path: string) {
    return new URL(path, env().APP_URL).toString();
}

router.get('/login', async (req, res) => {
    const returnTo = safeReturnTo(req.query.returnTo);
    if (returnTo === null) {
        res.status(400).json({ error: 'Invalid returnTo' });
        return;
    }
    const scope = req.query.scope;
    if (scope !== undefined && !isExtraScope(scope)) {
        res.status(400).json({ error: 'Invalid scope' });
        return;
    }

    const state = generateState();
    const scopes = scope ? [...BASE_SCOPES, scope] : BASE_SCOPES;
    const url = githubClient().createAuthorizationURL(state, scopes);
    const token = await signToken({ state, returnTo }, STATE_AUDIENCE, `${STATE_TTL_MS / 1000}s`);
    res.cookie(STATE_COOKIE, token, cookieOptions(STATE_TTL_MS));
    res.redirect(url.toString());
});

router.get('/callback', async (req, res) => {
    const saved = await verifyToken(req.cookies?.[STATE_COOKIE], STATE_AUDIENCE);
    res.clearCookie(STATE_COOKIE, cookieOptions());
    const { code, state } = req.query;
    // Also covers ?error=access_denied when the user cancels on GitHub.
    if (!saved || typeof code !== 'string' || typeof state !== 'string' || state !== saved.state) {
        res.redirect(appUrl('/?auth_error=1'));
        return;
    }

    try {
        const tokens = await githubClient().validateAuthorizationCode(code);
        const accessToken = tokens.accessToken();
        const profile = await fetchProfile(accessToken);
        await connectDb();
        const user = await User.findOneAndUpdate(
            { githubId: profile.githubId },
            { ...profile, tokenEnc: encrypt(accessToken) },
            { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        );
        await startSession(res, user.id);
    } catch (err) {
        console.error('GitHub sign-in failed', err);
        res.redirect(appUrl('/?auth_error=1'));
        return;
    }
    res.redirect(appUrl(safeReturnTo(saved.returnTo) ?? '/'));
});

router.get('/me', async (req, res) => {
    const user = await loadSessionUser(req);
    if (!user) {
        res.json({ user: null });
        return;
    }
    const { login, name, avatarUrl, githubId, scopes } = user;
    res.json({ user: { login, name, avatarUrl, githubId, scopes, ...(isAdmin(githubId) ? { admin: true } : {}) } });
});

// Deletes everything Shadey stores about the user and removes the app from their GitHub
// account. Painted repos belong to the user and stay on GitHub.
router.delete('/me', requireUser, async (req, res) => {
    const user = req.user!;
    const token = getUserToken(user);
    await connectDb();
    const shareIds = await PaintingModel.distinct('shareId', { userId: user._id });
    // Reports about their paintings, and the ones they filed while signed in.
    await ReportModel.deleteMany({ $or: [{ shareId: { $in: shareIds } }, { reporterKey: `user:${user.id}` }] });
    await PaintingModel.deleteMany({ userId: user._id });
    await forgetCalendars(user.login).catch((e: unknown) => console.error('Clearing cached graphs failed', e));
    await user.deleteOne();
    const revoked = await revokeGrant(token);
    if (!revoked) console.error('Revoking the GitHub grant failed for', user.login);
    endSession(res);
    res.status(204).end();
});

router.post('/logout', (_req, res) => {
    endSession(res);
    res.status(204).end();
});

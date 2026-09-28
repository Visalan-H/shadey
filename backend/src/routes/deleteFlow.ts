import { generateState, GitHub } from 'arctic';
import { Router } from 'express';
import { Octokit } from 'octokit';
import { connectDb } from '../db.js';
import { env } from '../env.js';
import { loadSessionUser, requireUser } from '../middleware/requireUser.js';
import { PaintingModel } from '../models/Painting.js';
import { forgetCalendars } from '../services/calendar.js';
import { fetchProfile } from '../services/githubOAuth.js';
import { deleteRepo } from '../services/paint/github.js';
import { cookieOptions, signToken, verifyToken } from '../services/session.js';

// "Delete for me": a one-off GitHub authorization with delete_repo, used once and thrown away,
// so the app never holds a token that can delete repos.
export const router = Router();

// A token without `repo` can't see a private repo, so its delete 404s and would read as
// "already gone". Private paintings ask for both; the token is revoked right after either way.
export function deleteScopes(isPrivate: boolean) {
    return isPrivate ? ['delete_repo', 'repo'] : ['delete_repo'];
}

const DELETE_COOKIE = 'gp_delete';
const DELETE_AUDIENCE = 'delete-state';
const DELETE_TTL_MS = 10 * 60 * 1000;
const CALLBACK_PATH = '/api/auth/callback/delete';

function appUrl(path: string) {
    return new URL(path, env().APP_URL).toString();
}

// A sub-path of the OAuth app's registered callback, which GitHub accepts as a redirect_uri.
function deleteClient() {
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env();
    return new GitHub(GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, appUrl(CALLBACK_PATH));
}

function resultUrl(key: 'deleted' | 'delete_error', shareId: string) {
    return appUrl(`/me?${new URLSearchParams({ [key]: shareId })}`);
}

// Best effort: revoke the one-off token right away instead of leaving it valid until it expires.
async function revokeToken(accessToken: string) {
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env();
    try {
        await fetch(`https://api.github.com/applications/${GITHUB_CLIENT_ID}/token`, {
            method: 'DELETE',
            headers: {
                accept: 'application/vnd.github+json',
                authorization: `Basic ${Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString('base64')}`,
                'content-type': 'application/json',
                'user-agent': 'shadey',
            },
            body: JSON.stringify({ access_token: accessToken }),
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        // The token is discarded either way.
    }
}

// A POST from the site's own form. As a GET, any site could link here: Lax cookies ride along on
// cross-site links, and GitHub skips its consent screen once delete_repo was granted before, so
// one click on someone else's page could delete a repo. Browsers without Sec-Fetch-Site still
// leave the session cookie off cross-site POSTs.
router.post('/api/auth/delete', requireUser, async (req, res) => {
    const site = req.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin') {
        res.status(403).json({ error: 'Start this from My paintings' });
        return;
    }
    const shareId = req.query.painting;
    if (typeof shareId !== 'string' || !shareId) {
        res.status(400).json({ error: 'Missing painting' });
        return;
    }
    await connectDb();
    const painting = await PaintingModel.findOne({ shareId, userId: req.user!._id, status: { $ne: 'deleted' } }).select('shareId isPrivate').lean();
    if (!painting) {
        res.redirect(resultUrl('delete_error', shareId));
        return;
    }

    const state = generateState();
    const url = deleteClient().createAuthorizationURL(state, deleteScopes(painting.isPrivate));
    const token = await signToken({ state, shareId, uid: req.user!.id }, DELETE_AUDIENCE, `${DELETE_TTL_MS / 1000}s`);
    res.cookie(DELETE_COOKIE, token, cookieOptions(DELETE_TTL_MS));
    res.redirect(url.toString());
});

router.get(CALLBACK_PATH, async (req, res) => {
    const saved = await verifyToken(req.cookies?.[DELETE_COOKIE], DELETE_AUDIENCE);
    res.clearCookie(DELETE_COOKIE, cookieOptions());
    const shareId = typeof saved?.shareId === 'string' ? saved.shareId : '';
    const fail = () => res.redirect(shareId ? resultUrl('delete_error', shareId) : appUrl('/me?delete_error=1'));

    const { code, state } = req.query;
    // Also covers ?error=access_denied when the user cancels on GitHub.
    if (!saved || !shareId || typeof code !== 'string' || typeof state !== 'string' || state !== saved.state) {
        fail();
        return;
    }

    try {
        const user = await loadSessionUser(req);
        if (!user || user.id !== saved.uid) {
            fail();
            return;
        }
        const painting = await PaintingModel.findOne({ shareId, userId: user._id, status: { $ne: 'deleted' } });
        if (!painting) {
            fail();
            return;
        }

        // Kept in this scope only: never stored, logged or attached to the user.
        const accessToken = (await deleteClient().validateAuthorizationCode(code)).accessToken();
        try {
            const profile = await fetchProfile(accessToken);
            const granted = deleteScopes(painting.isPrivate).every((s) => profile.scopes.includes(s));
            if (!granted || profile.githubId !== user.githubId) {
                fail();
                return;
            }
            // false means it was already gone, which is the outcome the user wanted anyway.
            await deleteRepo(new Octokit({ auth: accessToken }), painting.repoOwner, painting.repoName);
        } finally {
            await revokeToken(accessToken);
        }

        painting.status = 'deleted';
        await painting.save();
        await forgetCalendars(painting.login).catch((e: unknown) => console.error('Clearing cached graphs failed', e));
    } catch (err) {
        // Log only the message: request errors can carry the Authorization header.
        console.error('Deleting a painting repo failed:', (err as Error)?.message);
        fail();
        return;
    }
    res.redirect(resultUrl('deleted', shareId));
});

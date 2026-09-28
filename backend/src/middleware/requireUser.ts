import type { Request, RequestHandler } from 'express';
import { connectDb } from '../db.js';
import { env } from '../env.js';
import { User, type UserDoc } from '../models/User.js';
import { decrypt } from '../services/crypto.js';
import { readSession } from '../services/session.js';

declare module 'express-serve-static-core' {
    interface Request {
        // Set by requireUser (includes tokenEnc; its toJSON never exposes it).
        user?: UserDoc;
    }
}

// The signed-in user with tokenEnc loaded, or null.
export async function loadSessionUser(req: Request): Promise<UserDoc | null> {
    const userId = await readSession(req);
    if (!userId) return null;
    await connectDb();
    return User.findById(userId).select('+tokenEnc');
}

export const requireUser: RequestHandler = async (req, res, next) => {
    const user = await loadSessionUser(req);
    if (!user) {
        res.status(401).json({ error: 'Sign in required' });
        return;
    }
    req.user = user;
    next();
};

export function getUserToken(user: UserDoc): string {
    if (!user.tokenEnc) throw new Error('User loaded without tokenEnc');
    return decrypt(user.tokenEnc);
}

// By GitHub account id, not login: a renamed login can be registered by someone else.
export function isAdmin(githubId: number): boolean {
    const admins = (env().ADMIN_GITHUB_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return admins.includes(String(githubId));
}

export const requireAdmin: RequestHandler = async (req, res, next) => {
    const user = await loadSessionUser(req);
    // Same answer as a missing route, so the admin API doesn't advertise itself.
    if (!user || !isAdmin(user.githubId)) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    req.user = user;
    next();
};

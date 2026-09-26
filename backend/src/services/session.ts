import type { CookieOptions, Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../env.js';

export const SESSION_COOKIE = 'gp_session';
const SESSION_DAYS = 30;
// Audience keeps session tokens and OAuth state tokens (same secret) from being swapped.
const AUDIENCE = 'session';

function secret() {
    return new TextEncoder().encode(env().SESSION_SECRET);
}

export function cookieOptions(maxAgeMs?: number): CookieOptions {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
    };
}

// Signs a short JWT with the given audience; used for sessions and the OAuth state cookie.
export function signToken(payload: Record<string, unknown>, audience: string, expiresIn: string) {
    return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setAudience(audience).setIssuedAt().setExpirationTime(expiresIn).sign(secret());
}

// Returns the payload, or null for a missing, expired or forged token.
export async function verifyToken(token: unknown, audience: string) {
    if (typeof token !== 'string' || !token) return null;
    try {
        const { payload } = await jwtVerify(token, secret(), { audience, algorithms: ['HS256'] });
        return payload;
    } catch {
        return null;
    }
}

export function createSession(userId: string): Promise<string> {
    return signToken({ sub: userId }, AUDIENCE, `${SESSION_DAYS}d`);
}

export async function startSession(res: Response, userId: string) {
    res.cookie(SESSION_COOKIE, await createSession(userId), cookieOptions(SESSION_DAYS * 24 * 60 * 60 * 1000));
}

export function endSession(res: Response) {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
}

// The signed-in user's id, or null.
export async function readSession(req: Request): Promise<string | null> {
    const payload = await verifyToken(req.cookies?.[SESSION_COOKIE], AUDIENCE);
    return typeof payload?.sub === 'string' ? payload.sub : null;
}

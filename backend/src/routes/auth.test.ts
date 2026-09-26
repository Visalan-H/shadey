import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { decrypt } from '../services/crypto.js';
import { createSession } from '../services/session.js';
import { cookiePair, setAuthEnv, setCookie } from '../test/authEnv.js';
import { useTestDb } from '../test/mongo.js';

// useTestDb already connected mongoose to the in-memory server.
vi.mock('../db.js', () => ({ connectDb: async () => undefined }));

setAuthEnv();
useTestDb();

const github = setupServer(
    http.post('https://github.com/login/oauth/access_token', () =>
        HttpResponse.json({ access_token: 'gho_plaintext_token', token_type: 'bearer', scope: 'public_repo,read:user' }),
    ),
    http.get('https://api.github.com/user', () =>
        HttpResponse.json(
            { id: 4242, login: 'octo', name: 'Octo Cat', avatar_url: 'https://avatars.test/4242' },
            { headers: { 'x-oauth-scopes': 'public_repo, read:user' } },
        ),
    ),
);
beforeAll(() => github.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => github.resetHandlers());
afterAll(() => github.close());
beforeEach(async () => {
    await User.deleteMany({});
});

const app = createApp();

async function startLogin(query = '') {
    const res = await request(app).get(`/api/auth/login${query}`);
    const location = new URL(res.headers.location ?? '');
    return { res, location, state: location.searchParams.get('state') ?? '', cookie: cookiePair(setCookie(res.headers, 'gp_oauth')) };
}

describe('GET /api/auth/login', () => {
    it('redirects to GitHub with client id, scopes and state, and sets a state cookie', async () => {
        const { res, location, state } = await startLogin('?returnTo=/draw?x=1');
        expect(res.status).toBe(302);
        expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
        expect(location.searchParams.get('client_id')).toBe('test-client-id');
        expect(location.searchParams.get('scope')).toBe('read:user public_repo');
        expect(location.searchParams.get('redirect_uri')).toBe('https://painter.test/api/auth/callback');
        expect(state.length).toBeGreaterThan(10);
        const cookie = setCookie(res.headers, 'gp_oauth');
        expect(cookie).toMatch(/HttpOnly/);
        expect(cookie).toMatch(/Path=\//);
        expect(cookie).toMatch(/SameSite=Lax/);
    });

    it('adds the repo scope on request', async () => {
        const { location } = await startLogin('?scope=repo');
        expect(location.searchParams.get('scope')).toBe('read:user public_repo repo');
    });

    it('rejects scopes outside the whitelist', async () => {
        const res = await request(app).get('/api/auth/login?scope=delete_repo');
        expect(res.status).toBe(400);
    });

    it.each(['https://evil.test/', '//evil.test', '/\\evil.test', 'relative', '/a%0d%0aSet-Cookie:x'])('rejects returnTo %s', async (returnTo) => {
        const res = await request(app).get('/api/auth/login').query({ returnTo: decodeURIComponent(returnTo) });
        expect(res.status).toBe(400);
    });
});

describe('GET /api/auth/callback', () => {
    it('creates the user, stores the token encrypted, starts a session and returns', async () => {
        const { state, cookie } = await startLogin('?returnTo=/draw?x=1');
        const res = await request(app).get('/api/auth/callback').query({ code: 'abc', state }).set('Cookie', cookie);

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('https://painter.test/draw?x=1');
        const session = setCookie(res.headers, 'gp_session');
        expect(session).toMatch(/HttpOnly/);
        expect(session).toMatch(/SameSite=Lax/);
        expect(session).toMatch(/Path=\//);

        const user = await User.findOne({ githubId: 4242 }).select('+tokenEnc').lean();
        expect(user).toMatchObject({ login: 'octo', name: 'Octo Cat', avatarUrl: 'https://avatars.test/4242', scopes: ['public_repo', 'read:user'] });
        expect(user?.tokenEnc).not.toContain('gho_plaintext_token');
        expect(decrypt(user!.tokenEnc)).toBe('gho_plaintext_token');

        const me = await request(app).get('/api/auth/me').set('Cookie', cookiePair(session));
        expect(me.body.user).toMatchObject({ login: 'octo', githubId: 4242 });
    });

    it('updates an existing user instead of duplicating', async () => {
        for (let i = 0; i < 2; i++) {
            const { state, cookie } = await startLogin();
            await request(app).get('/api/auth/callback').query({ code: 'abc', state }).set('Cookie', cookie);
        }
        expect(await User.countDocuments()).toBe(1);
    });

    it('rejects a state that does not match the cookie', async () => {
        const { cookie } = await startLogin();
        const res = await request(app).get('/api/auth/callback').query({ code: 'abc', state: 'forged' }).set('Cookie', cookie);
        expect(res.headers.location).toBe('https://painter.test/?auth_error=1');
        expect(setCookie(res.headers, 'gp_session')).toBeUndefined();
        expect(await User.countDocuments()).toBe(0);
    });

    it('rejects a callback without the state cookie', async () => {
        const { state } = await startLogin();
        const res = await request(app).get('/api/auth/callback').query({ code: 'abc', state });
        expect(res.headers.location).toBe('https://painter.test/?auth_error=1');
    });

    it('handles the user cancelling on GitHub', async () => {
        const { state, cookie } = await startLogin();
        const res = await request(app).get('/api/auth/callback').query({ error: 'access_denied', state }).set('Cookie', cookie);
        expect(res.headers.location).toBe('https://painter.test/?auth_error=1');
    });

    it('handles a failed code exchange', async () => {
        github.use(http.post('https://github.com/login/oauth/access_token', () => HttpResponse.json({ error: 'bad_verification_code' })));
        const { state, cookie } = await startLogin();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).get('/api/auth/callback').query({ code: 'stale', state }).set('Cookie', cookie);
        errors.mockRestore();
        expect(res.headers.location).toBe('https://painter.test/?auth_error=1');
        expect(await User.countDocuments()).toBe(0);
    });
});

describe('GET /api/auth/me', () => {
    it('returns null without a session', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ user: null });
    });

    it('returns null for a forged session', async () => {
        const res = await request(app).get('/api/auth/me').set('Cookie', 'gp_session=not-a-jwt');
        expect(res.body).toEqual({ user: null });
    });

    it('returns the public profile, never the token', async () => {
        const user = await User.create({ githubId: 1, login: 'mona', name: null, avatarUrl: 'a', tokenEnc: 'secret', scopes: ['repo'] });
        const res = await request(app)
            .get('/api/auth/me')
            .set('Cookie', `gp_session=${await createSession(user.id)}`);
        expect(res.body).toEqual({ user: { login: 'mona', name: null, avatarUrl: 'a', githubId: 1, scopes: ['repo'] } });
        expect(JSON.stringify(user.toJSON())).not.toContain('secret');
    });
});

describe('POST /api/auth/logout', () => {
    it('clears the session cookie', async () => {
        const res = await request(app).post('/api/auth/logout').set('Cookie', 'gp_session=whatever');
        expect(res.status).toBe(204);
        const cookie = setCookie(res.headers, 'gp_session');
        expect(cookie).toMatch(/^gp_session=;/);
        expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    });
});

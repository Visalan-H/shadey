import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { PaintingModel } from '../models/Painting.js';
import { User } from '../models/User.js';
import { decrypt, encrypt } from '../services/crypto.js';
import { createSession } from '../services/session.js';
import { cookiePair, setAuthEnv, setCookie } from '../test/authEnv.js';
import { useTestDb } from '../test/mongo.js';

// useTestDb already connected mongoose to the in-memory server.
vi.mock('../db.js', () => ({ connectDb: async () => undefined }));

setAuthEnv();
useTestDb();

const DELETE_TOKEN = 'gho_delete_once';
const api = setupServer();
beforeAll(() => api.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => api.resetHandlers());
afterAll(() => api.close());
beforeEach(async () => {
    await PaintingModel.deleteMany({});
    await User.deleteMany({});
});

const app = createApp();

async function makeUser(githubId = 7) {
    const user = await User.create({ githubId, login: `user${githubId}`, name: null, avatarUrl: '', tokenEnc: encrypt('gho_main'), scopes: ['public_repo'] });
    return { user, cookie: `gp_session=${await createSession(user.id)}` };
}

let counter = 0;
async function makePainting(userId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
    counter++;
    return PaintingModel.create({
        shareId: `share${counter}`,
        userId,
        login: 'user7',
        repoOwner: 'user7',
        repoName: `paint-${counter}`,
        repoUrl: `https://github.com/user7/paint-${counter}`,
        isPrivate: false,
        text: 'HI',
        pattern: Array.from({ length: 7 }, () => [true]),
        placement: { mode: 'year', year: 2024, offset: 0 },
        shade: 4,
        perCell: 1,
        totalCommits: 7,
        cells: [{ date: '2024-01-07', level: 4, count: 1 }],
        ...overrides,
    });
}

describe('GET /api/me/paintings', () => {
    it('requires sign-in', async () => {
        expect((await request(app).get('/api/me/paintings')).status).toBe(401);
    });

    it("lists only the user's paintings, newest first", async () => {
        const { user, cookie } = await makeUser();
        const { user: other } = await makeUser(8);
        const older = await makePainting(user._id);
        const newer = await makePainting(user._id, { status: 'deleted' });
        await makePainting(other._id);

        const res = await request(app).get('/api/me/paintings').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.paintings.map((p: { shareId: string }) => p.shareId)).toEqual([newer.shareId, older.shareId]);
        expect(res.body.paintings[0]).toEqual({
            shareId: newer.shareId,
            text: 'HI',
            repoName: newer.repoName,
            repoUrl: newer.repoUrl,
            isPrivate: false,
            status: 'deleted',
            createdAt: expect.any(String),
            totalCommits: 7,
        });
    });
});

describe('POST /api/me/paintings/:shareId/deleted ("Delete it myself")', () => {
    it('marks the painting deleted once the repo is gone', async () => {
        const { user, cookie } = await makeUser();
        const p = await makePainting(user._id);
        api.use(http.get(`https://api.github.com/repos/user7/${p.repoName}`, () => HttpResponse.json({ message: 'Not Found' }, { status: 404 })));

        const res = await request(app).post(`/api/me/paintings/${p.shareId}/deleted`).set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.painting.status).toBe('deleted');
        expect((await PaintingModel.findById(p._id))?.status).toBe('deleted');
    });

    it('refuses while the repo still exists', async () => {
        const { user, cookie } = await makeUser();
        const p = await makePainting(user._id);
        api.use(http.get(`https://api.github.com/repos/user7/${p.repoName}`, () => HttpResponse.json({ id: 1 })));

        const res = await request(app).post(`/api/me/paintings/${p.shareId}/deleted`).set('Cookie', cookie);
        expect(res.status).toBe(409);
        expect((await PaintingModel.findById(p._id))?.status).toBe('painted');
    });

    it("404s someone else's painting", async () => {
        const { cookie } = await makeUser();
        const { user: other } = await makeUser(8);
        const p = await makePainting(other._id);
        const res = await request(app).post(`/api/me/paintings/${p.shareId}/deleted`).set('Cookie', cookie);
        expect(res.status).toBe(404);
    });
});

describe('"Delete for me"', () => {
    // GitHub's side of the one-off authorization and the delete.
    function mockGitHub({ scopes = 'delete_repo', githubId = 7, repoStatus = 204 } = {}) {
        const calls = { deleted: [] as string[], revoked: [] as string[], deleteAuth: [] as string[] };
        api.use(
            http.post('https://github.com/login/oauth/access_token', () =>
                HttpResponse.json({ access_token: DELETE_TOKEN, token_type: 'bearer', scope: scopes }),
            ),
            http.get('https://api.github.com/user', () =>
                HttpResponse.json({ id: githubId, login: 'user7', name: null, avatar_url: '' }, { headers: { 'x-oauth-scopes': scopes } }),
            ),
            http.delete('https://api.github.com/repos/:owner/:repo', ({ params, request }) => {
                calls.deleted.push(`${params.owner}/${params.repo}`);
                calls.deleteAuth.push(request.headers.get('authorization') ?? '');
                return repoStatus === 204 ? new HttpResponse(null, { status: 204 }) : HttpResponse.json({ message: 'x' }, { status: repoStatus });
            }),
            http.delete('https://api.github.com/applications/:clientId/token', async ({ request }) => {
                calls.revoked.push(((await request.json()) as { access_token: string }).access_token);
                return new HttpResponse(null, { status: 204 });
            }),
        );
        return calls;
    }

    async function start(cookie: string, shareId: string) {
        const res = await request(app).get('/api/auth/delete').query({ painting: shareId }).set('Cookie', cookie);
        const location = new URL(res.headers.location ?? '', 'https://shadey.test');
        return { res, location, state: location.searchParams.get('state') ?? '', deleteCookie: cookiePair(setCookie(res.headers, 'gp_delete')) };
    }

    async function finish(cookie: string, shareId: string, query?: Record<string, string>) {
        const { state, deleteCookie } = await start(cookie, shareId);
        return request(app)
            .get('/api/auth/callback/delete')
            .query(query ?? { code: 'abc', state })
            .set('Cookie', `${cookie}; ${deleteCookie}`);
    }

    it('asks GitHub for delete_repo only, on the delete callback', async () => {
        const { user, cookie } = await makeUser();
        const p = await makePainting(user._id);
        const { res, location } = await start(cookie, p.shareId);
        expect(res.status).toBe(302);
        expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
        expect(location.searchParams.get('scope')).toBe('delete_repo');
        expect(location.searchParams.get('redirect_uri')).toBe('https://shadey.test/api/auth/callback/delete');
    });

    it('also asks for repo when the painting is private', async () => {
        const { user, cookie } = await makeUser();
        const p = await makePainting(user._id, { isPrivate: true });
        const { location } = await start(cookie, p.shareId);
        expect(location.searchParams.get('scope')).toBe('delete_repo repo');
    });

    it('deletes the repo, revokes the token and never stores it', async () => {
        const calls = mockGitHub();
        const { user, cookie } = await makeUser();
        const p = await makePainting(user._id);

        const res = await finish(cookie, p.shareId);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`https://shadey.test/me?deleted=${p.shareId}`);
        expect(calls.deleted).toEqual([`user7/${p.repoName}`]);
        expect(calls.deleteAuth[0]).toContain(DELETE_TOKEN);
        expect(calls.revoked).toEqual([DELETE_TOKEN]);
        expect((await PaintingModel.findById(p._id))?.status).toBe('deleted');

        // The stored token is still the normal one, and the delete token appears nowhere in the database.
        const stored = await User.findById(user._id).select('+tokenEnc').lean();
        expect(decrypt(stored!.tokenEnc)).toBe('gho_main');
        for (const name of Object.keys(mongoose.connection.collections)) {
            const docs = await mongoose.connection.collections[name]!.find({}).toArray();
            expect(JSON.stringify(docs)).not.toContain(DELETE_TOKEN);
        }
    });

    it('counts a repo that is already gone as deleted', async () => {
        mockGitHub({ repoStatus: 404 });
        const { user, cookie } = await makeUser();
        const p = await makePainting(user._id);
        const res = await finish(cookie, p.shareId);
        expect(res.headers.location).toBe(`https://shadey.test/me?deleted=${p.shareId}`);
        expect((await PaintingModel.findById(p._id))?.status).toBe('deleted');
    });

    it('fails without deleting when the user unticks delete_repo', async () => {
        const calls = mockGitHub({ scopes: '' });
        const { user, cookie } = await makeUser();
        const p = await makePainting(user._id);
        const res = await finish(cookie, p.shareId);
        expect(res.headers.location).toBe(`https://shadey.test/me?delete_error=${p.shareId}`);
        expect(calls.deleted).toEqual([]);
        expect(calls.revoked).toEqual([DELETE_TOKEN]);
        expect((await PaintingModel.findById(p._id))?.status).toBe('painted');
    });

    it('fails when a different GitHub account authorizes', async () => {
        const calls = mockGitHub({ githubId: 999 });
        const { user, cookie } = await makeUser();
        const p = await makePainting(user._id);
        const res = await finish(cookie, p.shareId);
        expect(res.headers.location).toContain('delete_error=');
        expect(calls.deleted).toEqual([]);
    });

    it('fails when the user cancels on GitHub', async () => {
        const calls = mockGitHub();
        const { user, cookie } = await makeUser();
        const p = await makePainting(user._id);
        const { state } = await start(cookie, p.shareId);
        const res = await finish(cookie, p.shareId, { error: 'access_denied', state });
        expect(res.headers.location).toContain('delete_error=');
        expect(calls.deleted).toEqual([]);
    });

    it('fails on a forged state', async () => {
        const calls = mockGitHub();
        const { user, cookie } = await makeUser();
        const p = await makePainting(user._id);
        const res = await finish(cookie, p.shareId, { code: 'abc', state: 'forged' });
        expect(res.headers.location).toContain('delete_error=');
        expect(calls.deleted).toEqual([]);
    });

    it("won't start for someone else's painting", async () => {
        const { cookie } = await makeUser();
        const { user: other } = await makeUser(8);
        const p = await makePainting(other._id);
        const { res } = await start(cookie, p.shareId);
        expect(res.headers.location).toBe(`https://shadey.test/me?delete_error=${p.shareId}`);
    });
});

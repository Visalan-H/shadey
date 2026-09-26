import cookieParser from 'cookie-parser';
import express from 'express';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Octokit } from 'octokit';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintingModel } from '../models/Painting.js';
import { User } from '../models/User.js';
import { encrypt } from '../services/crypto.js';
import { createSession } from '../services/session.js';
import { setAuthEnv } from '../test/authEnv.js';
import { startGitServer, type GitServer } from '../test/gitServer.js';
import { useTestDb } from '../test/mongo.js';
import { createPaintingsRouter } from './paintings.js';

// useTestDb already connected mongoose to the in-memory server.
vi.mock('../db.js', () => ({ connectDb: async () => undefined }));

setAuthEnv();
useTestDb();

const TOKEN = 'gho_user';
// Only api.github.com is mocked; git traffic goes through to the local git server.
const api = setupServer();
let git: GitServer;
let app: express.Express;

beforeAll(async () => {
    api.listen({ onUnhandledRequest: 'bypass' });
    git = await startGitServer({ token: TOKEN });
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(
        '/api/paintings',
        createPaintingsRouter({
            octokit: (token) => new Octokit({ auth: token, throttle: { enabled: false }, retry: { enabled: false } }),
            gitBaseUrl: git.baseUrl,
            pushRetryDelaysMs: [],
        }),
    );
});
afterEach(() => api.resetHandlers());
afterAll(async () => {
    api.close();
    await git.close();
});
beforeEach(async () => {
    await PaintingModel.deleteMany({});
    await User.deleteMany({});
});

let nextId = 1;
async function signIn(scopes = ['read:user', 'public_repo']) {
    const githubId = nextId++;
    const user = await User.create({ githubId, login: 'octo', name: 'Octo Cat', avatarUrl: '', tokenEnc: encrypt(TOKEN), scopes });
    return `gp_session=${await createSession(user.id)}`;
}

// `bare` controls whether the created repo really exists on the git server, i.e. whether the push works.
function mockGitHub({ bare = true, taken = false } = {}) {
    const calls = { created: [] as Record<string, unknown>[], deleted: [] as string[] };
    api.use(
        http.post('https://api.github.com/user/repos', async ({ request }) => {
            const body = (await request.json()) as Record<string, unknown>;
            calls.created.push(body);
            if (taken) return HttpResponse.json({ message: 'Repository creation failed.', errors: [{ message: 'name already exists on this account' }] }, { status: 422 });
            const name = String(body.name);
            if (bare) await git.createRepo(`octo/${name}`);
            return HttpResponse.json(
                { name, owner: { login: 'octo' }, html_url: `https://github.com/octo/${name}`, clone_url: '', default_branch: 'main' },
                { status: 201 },
            );
        }),
        http.delete('https://api.github.com/repos/:owner/:repo', ({ params }) => {
            calls.deleted.push(`${params.owner}/${params.repo}`);
            // Paintings never hold delete_repo, so cleanup is refused like on GitHub.
            return HttpResponse.json({ message: 'Must have admin rights to Repository.' }, { status: 403 });
        }),
    );
    return calls;
}

let repoCounter = 0;
function body(overrides: Record<string, unknown> = {}) {
    return {
        text: 'Hi',
        pattern: Array.from({ length: 7 }, (_, r) => [r === 1, r === 2]),
        placement: { mode: 'year', year: 2024, offset: 3 },
        shade: 4,
        perCell: 2,
        plan: [
            { date: '2024-01-22', count: 2 },
            { date: '2024-01-30', count: 2 },
        ],
        repoName: `paint-hi-${++repoCounter}`,
        isPrivate: false,
        ...overrides,
    };
}

const post = (cookie: string | null, payload: unknown) => {
    const req = request(app).post('/api/paintings');
    if (cookie) req.set('Cookie', cookie);
    return req.send(payload as object);
};

describe('POST /api/paintings', () => {
    it('requires sign-in', async () => {
        const res = await post(null, body());
        expect(res.status).toBe(401);
    });

    it('creates the repo, pushes the commits and saves the painting', async () => {
        const calls = mockGitHub();
        const cookie = await signIn();
        const payload = body({ repoName: 'paint-hi' });
        const res = await post(cookie, payload);

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ shareId: expect.any(String), repoUrl: 'https://github.com/octo/paint-hi', repoName: 'paint-hi', commitCount: 4 });
        expect(calls.created[0]).toMatchObject({ name: 'paint-hi', private: false, homepage: `https://painter.test/p/${res.body.shareId}` });

        // One commit per count; the README rides along. Authored as the noreply address at noon UTC.
        expect((await git.git('octo/paint-hi', 'rev-list', '--count', 'main')).trim()).toBe('4');
        const dates = (await git.git('octo/paint-hi', 'log', '--format=%ad %ae', '--date=iso-strict', 'main')).trim().split('\n');
        expect(dates.filter((l) => l.startsWith('2024-01-22T12:'))).toHaveLength(2);
        expect(dates.every((l) => l.endsWith(`+octo@users.noreply.github.com`))).toBe(true);

        const saved = await PaintingModel.findOne({ shareId: res.body.shareId }).lean();
        expect(saved).toMatchObject({
            login: 'octo',
            repoOwner: 'octo',
            repoName: 'paint-hi',
            text: 'Hi',
            shade: 4,
            perCell: 2,
            totalCommits: 4,
            status: 'painted',
            placement: { mode: 'year', year: 2024, offset: 3 },
        });
        expect(saved?.cells).toEqual([
            { date: '2024-01-22', level: 4, count: 2 },
            { date: '2024-01-30', level: 4, count: 2 },
        ]);
    });

    it.each([
        ['a pattern without 7 rows', { pattern: [[true]] }, /Pattern must have 7 rows/],
        ['a future date', { plan: [{ date: '2999-01-01', count: 1 }] }, /future/],
        ['a made-up date', { plan: [{ date: '2024-02-30', count: 1 }] }, /Not a real date/],
        ['duplicate dates', { plan: [{ date: '2024-01-22', count: 1 }, { date: '2024-01-22', count: 1 }] }, /unique/],
        ['year mode without a year', { placement: { mode: 'year', offset: 0 } }, /Year is required/],
        ['an empty plan', { plan: [] }, /Nothing to paint/],
    ])('rejects %s', async (_name, overrides, message) => {
        const calls = mockGitHub();
        const res = await post(await signIn(), body(overrides));
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(message);
        expect(calls.created).toEqual([]);
    });

    it('rejects offensive text before touching GitHub', async () => {
        const calls = mockGitHub();
        const res = await post(await signIn(), body({ text: 'fuck' }));
        expect(res.status).toBe(400);
        expect(calls.created).toEqual([]);
    });

    it('points a bad repo name at the field', async () => {
        const res = await post(await signIn(), body({ repoName: 'no spaces' }));
        expect(res.status).toBe(400);
        expect(res.body.field).toBe('repoName');
    });

    it('asks for the repo scope before painting privately', async () => {
        const calls = mockGitHub();
        const res = await post(await signIn(), body({ isPrivate: true }));
        expect(res.status).toBe(403);
        expect(res.body.needScope).toBe('repo');
        expect(calls.created).toEqual([]);
    });

    it('creates a private repo once the user granted repo', async () => {
        const calls = mockGitHub();
        const res = await post(await signIn(['read:user', 'public_repo', 'repo']), body({ isPrivate: true, repoName: 'paint-secret' }));
        expect(res.status).toBe(201);
        expect(calls.created[0]).toMatchObject({ private: true });

        const shared = await request(app).get(`/api/paintings/${res.body.shareId}`);
        expect(shared.body.isPrivate).toBe(true);
        expect(shared.body).not.toHaveProperty('repoUrl');
    });

    it('returns 409 on the field when every name is taken, and refunds the quota', async () => {
        mockGitHub({ taken: true });
        const cookie = await signIn();
        for (let i = 0; i < 6; i++) {
            const res = await post(cookie, body());
            expect(res.status).toBe(409);
            expect(res.body.field).toBe('repoName');
        }
    });

    it('reports a failed push and where the partial repo was left', async () => {
        const calls = mockGitHub({ bare: false });
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await post(await signIn(), body({ repoName: 'paint-broken' }));
        errors.mockRestore();
        expect(res.status).toBe(502);
        expect(res.body.repoUrl).toBe('https://github.com/octo/paint-broken');
        expect(calls.deleted).toEqual(['octo/paint-broken']);
        expect(await PaintingModel.countDocuments()).toBe(0);
    });

    it('maps an expired GitHub token to 401', async () => {
        api.use(http.post('https://api.github.com/user/repos', () => HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })));
        const res = await post(await signIn(), body());
        expect(res.status).toBe(401);
    });

    it('allows 5 paintings a day', async () => {
        mockGitHub();
        const cookie = await signIn();
        for (let i = 0; i < 5; i++) expect((await post(cookie, body())).status).toBe(201);
        const res = await post(cookie, body());
        expect(res.status).toBe(429);
        expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    });
});

describe('GET /api/paintings/:shareId', () => {
    it('returns the public painting', async () => {
        mockGitHub();
        const created = await post(await signIn(), body({ repoName: 'paint-public' }));
        const res = await request(app).get(`/api/paintings/${created.body.shareId}`);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            shareId: created.body.shareId,
            login: 'octo',
            text: 'Hi',
            repoUrl: 'https://github.com/octo/paint-public',
            status: 'painted',
            cells: [
                { date: '2024-01-22', level: 4, count: 2 },
                { date: '2024-01-30', level: 4, count: 2 },
            ],
        });
        expect(JSON.stringify(res.body)).not.toContain('userId');
    });

    it('404s an unknown painting', async () => {
        const res = await request(app).get('/api/paintings/nope');
        expect(res.status).toBe(404);
    });
});

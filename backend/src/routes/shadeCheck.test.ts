import cookieParser from 'cookie-parser';
import express from 'express';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaintingModel } from '../models/Painting.js';
import { User } from '../models/User.js';
import { encrypt } from '../services/crypto.js';
import { buildCommits, pushCommits } from '../services/paint/index.js';
import { createSession } from '../services/session.js';
import { setAuthEnv } from '../test/authEnv.js';
import { startGitServer, type GitServer } from '../test/gitServer.js';
import { useTestDb } from '../test/mongo.js';
import { createShadeCheckRouter } from './shadeCheck.js';

// useTestDb already connected mongoose to the in-memory server.
vi.mock('../db.js', () => ({ connectDb: async () => undefined }));

setAuthEnv();
useTestDb();

const TOKEN = 'gho_user';
const LEVEL_NAMES = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
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
    app.use('/api/me/paintings', createShadeCheckRouter({ gitBaseUrl: git.baseUrl }));
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

// Eight busy days at 10 commits, then the painted days as GitHub reports them.
function mockGraph(painted: [date: string, count: number, level: number][]) {
    const busy = Array.from({ length: 8 }, (_, i): [string, number, number] => [`2024-02-0${i + 1}`, 10, 4]);
    const days = [...busy, ...painted].map(([date, count, level]) => ({
        date,
        contributionCount: count,
        contributionLevel: LEVEL_NAMES[level],
        weekday: 0,
    }));
    api.use(
        http.post('https://api.github.com/graphql', () =>
            HttpResponse.json({
                data: { user: { login: 'octo', contributionsCollection: { contributionCalendar: { weeks: days.map((d) => ({ contributionDays: [d] })) } } } },
            }),
        ),
    );
}

let counter = 0;
async function setup(overrides: Record<string, unknown> = {}) {
    const user = await User.create({ githubId: 1, login: 'octo', name: 'Octo Cat', avatarUrl: '', tokenEnc: encrypt(TOKEN), scopes: ['public_repo'] });
    const repoName = `paint-${++counter}`;
    await git.createRepo(`octo/${repoName}`);
    const author = { name: 'Octo Cat', email: '1+octo@users.noreply.github.com' };
    const plan = [
        { date: '2024-03-01', count: 2 },
        { date: '2024-03-02', count: 2 },
    ];
    await pushCommits({ url: git.repoUrl(`octo/${repoName}`), token: TOKEN, commits: buildCommits({ plan, author }), readme: '# Hi\n' });
    const painting = await PaintingModel.create({
        userId: user._id,
        login: 'octo',
        repoOwner: 'octo',
        repoName,
        repoUrl: `https://github.com/octo/${repoName}`,
        isPrivate: false,
        pattern: Array.from({ length: 7 }, () => [true]),
        placement: { mode: 'year', year: 2024, offset: 0 },
        shade: 4,
        perCell: 2,
        totalCommits: 4,
        cells: plan.map((d) => ({ ...d, level: 4 })),
        ...overrides,
    });
    return { painting, repoName, cookie: `gp_session=${await createSession(user.id)}` };
}

const check = (cookie: string, shareId: string) => request(app).post(`/api/me/paintings/${shareId}/check-shades`).set('Cookie', cookie);

describe('POST /api/me/paintings/:shareId/check-shades', () => {
    it('requires sign-in', async () => {
        expect((await request(app).post('/api/me/paintings/x/check-shades')).status).toBe(401);
    });

    it('waits while GitHub has not counted the commits yet', async () => {
        const { painting, cookie } = await setup();
        mockGraph([
            ['2024-03-01', 0, 0],
            ['2024-03-02', 2, 1],
        ]);
        expect((await check(cookie, painting.shareId)).body).toEqual({ result: 'pending' });
    });

    it('does nothing when the shades already match', async () => {
        const { painting, repoName, cookie } = await setup();
        mockGraph([
            ['2024-03-01', 10, 4],
            ['2024-03-02', 10, 4],
        ]);
        expect((await check(cookie, painting.shareId)).body).toEqual({ result: 'ok' });
        expect((await git.git(`octo/${repoName}`, 'rev-list', '--count', 'main')).trim()).toBe('4');
    });

    it('tops up the days that came out light', async () => {
        const { painting, repoName, cookie } = await setup();
        mockGraph([
            ['2024-03-01', 2, 1],
            ['2024-03-02', 10, 4],
        ]);
        const res = await check(cookie, painting.shareId);
        expect(res.body).toEqual({ result: 'toppedUp', lightDays: 1, added: 8, capped: false });

        const repo = `octo/${repoName}`;
        expect((await git.git(repo, 'rev-list', '--count', 'main')).trim()).toBe('12');
        const topUp = (await git.git(repo, 'log', '-8', '--format=%ad', '--date=short', 'main')).trim().split('\n');
        expect(new Set(topUp)).toEqual(new Set(['2024-03-01']));

        const saved = await PaintingModel.findById(painting._id).lean();
        expect(saved).toMatchObject({ totalCommits: 12, topUps: 1 });
        expect(saved!.cells).toEqual([
            { date: '2024-03-01', level: 4, count: 10 },
            { date: '2024-03-02', level: 4, count: 2 },
        ]);
    });

    it('stops after three top-ups', async () => {
        const { painting, cookie } = await setup({ topUps: 3 });
        mockGraph([
            ['2024-03-01', 2, 1],
            ['2024-03-02', 2, 1],
        ]);
        expect((await check(cookie, painting.shareId)).body).toEqual({ result: 'limit', lightDays: 2 });
    });

    it("won't check someone else's or a deleted painting", async () => {
        const { painting, cookie } = await setup({ status: 'deleted' });
        expect((await check(cookie, painting.shareId)).status).toBe(404);
        expect((await check(cookie, 'nope')).status).toBe(404);
    });

    it('explains when the repo is gone', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { painting, cookie } = await setup({ repoName: 'missing' });
        mockGraph([
            ['2024-03-01', 2, 1],
            ['2024-03-02', 10, 4],
        ]);
        const res = await check(cookie, painting.shareId);
        expect(res.status).toBe(502);
        expect(res.body.error).toMatch(/Couldn't push the extra commits/);
    });
});

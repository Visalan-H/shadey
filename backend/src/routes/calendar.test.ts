import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../test/mongo.js';

Object.assign(process.env, {
    MONGODB_URI: 'mongodb://unused',
    GITHUB_TOKEN: 'test-token',
    GITHUB_CLIENT_ID: 'id',
    GITHUB_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 'x'.repeat(32),
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    APP_URL: 'http://localhost:5173',
});

// useTestDb() already connected mongoose to the in-memory server.
vi.mock('../db.js', () => ({ connectDb: async () => undefined }));

const { createApp } = await import('../app.js');
const { CalendarCache } = await import('../models/CalendarCache.js');
const { User } = await import('../models/User.js');
const { encrypt } = await import('../services/crypto.js');
const { createSession } = await import('../services/session.js');
const { forgetCalendars } = await import('../services/calendar.js');

const GQL = 'https://api.github.com/graphql';

function day(date: string, weekday: number, count: number, level: string) {
    return { date, contributionCount: count, contributionLevel: level, weekday };
}

// Starts on a Wednesday and ends on a Monday, so both weeks are partial.
const weeks = [
    {
        contributionDays: [
            day('2025-01-01', 3, 0, 'NONE'),
            day('2025-01-02', 4, 1, 'FIRST_QUARTILE'),
            day('2025-01-03', 5, 3, 'SECOND_QUARTILE'),
            day('2025-01-04', 6, 5, 'THIRD_QUARTILE'),
        ],
    },
    { contributionDays: [day('2025-01-05', 0, 9, 'FOURTH_QUARTILE'), day('2025-01-06', 1, 0, 'NONE')] },
];

let calls: { query: string; variables: Record<string, unknown>; auth: string | null }[] = [];

const server = setupServer();
useTestDb();
beforeAll(() =>
    server.listen({
        // supertest talks to the app over localhost; anything else must be mocked.
        onUnhandledRequest: (req, print) => {
            if (new URL(req.url).hostname !== '127.0.0.1') print.error();
        },
    }),
);
afterAll(() => server.close());
beforeEach(async () => {
    calls = [];
    await CalendarCache.deleteMany({});
});
afterEach(() => server.resetHandlers());

function respondWith(body: Record<string, unknown>, status = 200) {
    server.use(
        http.post(GQL, async ({ request: req }) => {
            const sent = (await req.json()) as Omit<(typeof calls)[number], 'auth'>;
            calls.push({ ...sent, auth: req.headers.get('authorization') });
            return HttpResponse.json(body, { status });
        }),
    );
}

const ok = { data: { user: { login: 'Octocat', contributionsCollection: { contributionCalendar: { weeks } } } } };

describe('GET /api/calendar/:login', () => {
    it('maps levels and pads partial weeks by weekday', async () => {
        respondWith(ok);
        const res = await request(createApp()).get('/api/calendar/octocat');
        expect(res.status).toBe(200);
        expect(res.body.login).toBe('Octocat');
        expect(res.body.from).toBe('2025-01-01');
        expect(res.body.to).toBe('2025-01-06');
        expect(res.body.weeks).toEqual([
            [
                null,
                null,
                null,
                { date: '2025-01-01', count: 0, level: 0 },
                { date: '2025-01-02', count: 1, level: 1 },
                { date: '2025-01-03', count: 3, level: 2 },
                { date: '2025-01-04', count: 5, level: 3 },
            ],
            [
                { date: '2025-01-05', count: 9, level: 4 },
                { date: '2025-01-06', count: 0, level: 0 },
                null,
                null,
                null,
                null,
                null,
            ],
        ]);
        // No year: GitHub's default rolling window.
        expect(calls[0]?.variables).toEqual({ login: 'octocat' });
    });

    it('asks for the whole calendar year when ?year is given', async () => {
        respondWith(ok);
        const res = await request(createApp()).get('/api/calendar/octocat?year=2025');
        expect(res.status).toBe(200);
        expect(calls[0]?.variables).toEqual({
            login: 'octocat',
            from: '2025-01-01T00:00:00Z',
            to: '2025-12-31T23:59:59Z',
        });
    });

    it('serves repeat requests from the cache', async () => {
        respondWith(ok);
        const app = createApp();
        await request(app).get('/api/calendar/octocat');
        const res = await request(app).get('/api/calendar/OctoCat');
        expect(res.status).toBe(200);
        expect(res.body.weeks).toHaveLength(2);
        expect(calls).toHaveLength(1);

        // A different year is a different cache entry.
        await request(app).get('/api/calendar/octocat?year=2024');
        expect(calls).toHaveLength(2);
    });

    it('refetches once the cache entry is older than an hour', async () => {
        respondWith(ok);
        const app = createApp();
        await request(app).get('/api/calendar/octocat');
        await CalendarCache.updateOne({}, { createdAt: new Date(Date.now() - 61 * 60 * 1000) });
        await request(app).get('/api/calendar/octocat');
        expect(calls).toHaveLength(2);
    });

    it('returns 404 for an unknown user', async () => {
        respondWith({
            data: { user: null },
            errors: [{ type: 'NOT_FOUND', path: ['user'], message: "Could not resolve to a User with the login of 'nobody-here'." }],
        });
        const res = await request(createApp()).get('/api/calendar/nobody-here');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'User not found' });
    });

    it.each(['-octocat', 'octocat-', 'octo--cat', 'octo_cat', 'a'.repeat(40)])('rejects the login %s', async (bad) => {
        const res = await request(createApp()).get(`/api/calendar/${bad}`);
        expect(res.status).toBe(400);
        expect(calls).toHaveLength(0);
    });

    it.each(['2007', String(new Date().getUTCFullYear() + 1), 'abc', '2020.5'])('rejects the year %s', async (bad) => {
        const res = await request(createApp()).get(`/api/calendar/octocat?year=${bad}`);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid year' });
    });

    it('returns 502 when GitHub rate limits us', async () => {
        respondWith({ errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] });
        const res = await request(createApp()).get('/api/calendar/octocat');
        expect(res.status).toBe(502);
        expect(res.body.error).toMatch(/rate limit/i);
    });

    it('returns 502 when GitHub is down', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        respondWith({ message: 'Server Error' }, 500);
        const res = await request(createApp()).get('/api/calendar/octocat');
        expect(res.status).toBe(502);
        expect(res.body.error).toBe('Could not load the contribution graph from GitHub');
    });
});

describe('GET /api/calendar/:login when signed in', () => {
    async function signIn(login = 'hubber') {
        await User.deleteMany({});
        const user = await User.create({ githubId: 42, login, name: null, avatarUrl: '', tokenEnc: encrypt('gho_viewer'), scopes: [] });
        return `gp_session=${await createSession(user.id)}`;
    }

    it('keeps your own graph fresh', async () => {
        respondWith(ok);
        const app = createApp();
        const cookie = await signIn('OctoCat');

        const res = await request(app).get('/api/calendar/octocat').set('Cookie', cookie);
        expect(res.headers['cache-control']).toBe('private, no-cache');
        await request(app).get('/api/calendar/octocat').set('Cookie', cookie);
        expect(calls).toHaveLength(1);

        // Older than two minutes: GitHub is asked again instead of waiting out the hour.
        await CalendarCache.updateOne({}, { createdAt: new Date(Date.now() - 3 * 60 * 1000) });
        await request(app).get('/api/calendar/octocat').set('Cookie', cookie);
        expect(calls).toHaveLength(2);
    });

    it('forgets every cached copy of a graph after a paint or delete', async () => {
        respondWith(ok);
        const app = createApp();
        await request(app).get('/api/calendar/octocat').set('Cookie', await signIn());
        await request(app).get('/api/calendar/octocat?year=2023');
        await request(app).get('/api/calendar/octocat-2');
        expect(await CalendarCache.countDocuments()).toBe(3);

        await forgetCalendars('OctoCat');
        expect((await CalendarCache.find().lean()).map((c) => c.key)).toEqual(['octocat-2:rolling']);
    });

    it("reads with the viewer's token and keeps the result to them", async () => {
        respondWith(ok);
        const app = createApp();
        const cookie = await signIn();

        const mine = await request(app).get('/api/calendar/octocat').set('Cookie', cookie);
        expect(mine.status).toBe(200);
        expect(mine.headers['cache-control']).toBe('private, max-age=300');
        expect(calls[0]?.auth).toBe('token gho_viewer');

        // Their repeat request comes from their own cache entry.
        await request(app).get('/api/calendar/octocat').set('Cookie', cookie);
        expect(calls).toHaveLength(1);

        // A signed-out visitor never gets the viewer's copy.
        const theirs = await request(app).get('/api/calendar/octocat');
        expect(theirs.headers['cache-control']).toBe('public, max-age=300');
        expect(calls).toHaveLength(2);
        expect(calls[1]?.auth).toBe('token test-token');
    });

    it("falls back to the server's token when the viewer's is revoked", async () => {
        let first = true;
        server.use(
            http.post(GQL, async ({ request: req }) => {
                const sent = (await req.json()) as Omit<(typeof calls)[number], 'auth'>;
                calls.push({ ...sent, auth: req.headers.get('authorization') });
                if (first) {
                    first = false;
                    return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 });
                }
                return HttpResponse.json(ok);
            }),
        );
        const res = await request(createApp()).get('/api/calendar/octocat').set('Cookie', await signIn());
        expect(res.status).toBe(200);
        expect(calls.map((c) => c.auth)).toEqual(['token gho_viewer', 'token test-token']);
        // The server-token result is the public graph, so it goes in the shared cache.
        expect(await CalendarCache.findOne({ key: 'octocat:rolling' })).not.toBeNull();
    });
});

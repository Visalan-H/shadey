import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Octokit } from 'octokit';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startGitServer, type GitServer } from '../../test/gitServer.js';
import { paint, PlanError, PushError, type PaintInput } from './index.js';

const token = 'gho_user';
// Only api.github.com is mocked; git traffic goes through to the local server.
const api = setupServer();
let git: GitServer;

beforeAll(async () => {
    api.listen({ onUnhandledRequest: 'bypass' });
    git = await startGitServer({ token });
});
afterEach(() => api.resetHandlers());
afterAll(async () => {
    api.close();
    await git.close();
});

function input(overrides: Partial<PaintInput> = {}): PaintInput {
    return {
        token,
        user: { login: 'octocat', githubId: 583231, name: 'The Octocat' },
        repoName: 'paint-hi',
        isPrivate: false,
        text: 'Hi',
        plan: [
            { date: '2025-06-01', count: 2 },
            { date: '2025-06-02', count: 1 },
        ],
        appUrl: 'https://paint.test',
        shareUrl: 'https://paint.test/s/abc',
        octokit: new Octokit({ auth: token, throttle: { enabled: false } }),
        gitBaseUrl: git.baseUrl,
        pushRetryDelaysMs: [0, 0],
        ...overrides,
    };
}

// Mocks repo creation; `createBare` controls whether the repo really exists for the push.
function mockGitHub(opts: { createBare: boolean }) {
    const calls = { created: [] as Record<string, unknown>[], deleted: [] as string[] };
    api.use(
        http.post('https://api.github.com/user/repos', async ({ request }) => {
            const body = (await request.json()) as Record<string, unknown>;
            calls.created.push(body);
            const name = body.name as string;
            if (opts.createBare) await git.createRepo(`octocat/${name}`);
            return HttpResponse.json(
                {
                    name,
                    owner: { login: 'octocat' },
                    html_url: `https://github.com/octocat/${name}`,
                    clone_url: `https://github.com/octocat/${name}.git`,
                    default_branch: 'main',
                },
                { status: 201 },
            );
        }),
        http.delete('https://api.github.com/repos/:owner/:repo', ({ params }) => {
            calls.deleted.push(`${params.owner}/${params.repo}`);
            return new HttpResponse(null, { status: 204 });
        }),
    );
    return calls;
}

describe('paint', () => {
    it('creates the repo and pushes the painting', async () => {
        const calls = mockGitHub({ createBare: true });
        const result = await paint(input());

        expect(result.repo).toMatchObject({ owner: 'octocat', name: 'paint-hi', defaultBranch: 'main' });
        expect(result.commitCount).toBe(3);
        expect(result.pushMs).toBeGreaterThanOrEqual(0);
        expect(calls.created[0]).toMatchObject({
            name: 'paint-hi',
            private: false,
            auto_init: false,
            homepage: 'https://paint.test/s/abc',
            description: expect.stringContaining('"Hi"'),
        });
        expect(calls.deleted).toEqual([]);

        const repo = 'octocat/paint-hi';
        expect((await git.git(repo, 'rev-parse', 'main')).trim()).toBe(result.headOid);
        expect((await git.git(repo, 'rev-list', '--count', 'main')).trim()).toBe('3');
        expect((await git.git(repo, 'log', '-1', '--format=%an <%ae>', 'main')).trim()).toBe(
            'The Octocat <583231+octocat@users.noreply.github.com>',
        );
        expect(await git.git(repo, 'show', 'main:README.md')).toContain('https://paint.test/s/abc');
        await git.git(repo, 'fsck', '--strict');
    });

    it('falls back to the login as author name', async () => {
        mockGitHub({ createBare: true });
        await paint(input({ repoName: 'paint-noname', user: { login: 'octocat', githubId: 583231, name: null } }));
        expect((await git.git('octocat/paint-noname', 'log', '-1', '--format=%an', 'main')).trim()).toBe('octocat');
    });

    it('deletes the new repo when the push fails', async () => {
        const calls = mockGitHub({ createBare: false });
        await expect(paint(input({ repoName: 'paint-broken' }))).rejects.toBeInstanceOf(PushError);
        expect(calls.deleted).toEqual(['octocat/paint-broken']);
    });

    it('still reports the push error when cleanup fails too', async () => {
        mockGitHub({ createBare: false });
        api.use(
            http.delete('https://api.github.com/repos/:owner/:repo', () =>
                HttpResponse.json({ message: 'Must have admin rights' }, { status: 403 }),
            ),
        );
        const err = await paint(input({ repoName: 'paint-broken-2' })).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PushError);
        expect(err).toMatchObject({ repoUrl: 'https://github.com/octocat/paint-broken-2', repoLeftBehind: true });
    });

    it('marks the repo as cleaned up when the delete works', async () => {
        mockGitHub({ createBare: false });
        const err = await paint(input({ repoName: 'paint-broken-3' })).catch((e: unknown) => e);
        expect(err).toMatchObject({ repoUrl: 'https://github.com/octocat/paint-broken-3', repoLeftBehind: false });
    });

    it('retries a push GitHub refuses right after creating the repo', async () => {
        const calls = mockGitHub({ createBare: true });
        let refused = 0;
        // The first contact with the new repo fails, as if GitHub had not finished setting it up.
        api.use(
            http.get(
                `${git.baseUrl}/octocat/paint-retry.git/info/refs`,
                () => {
                    refused++;
                    return new HttpResponse('Repository not found', { status: 404 });
                },
                { once: true },
            ),
        );
        const result = await paint(input({ repoName: 'paint-retry', pushRetryDelaysMs: [10, 10] }));
        expect(refused).toBe(1);
        expect(result.commitCount).toBe(3);
        expect((await git.git('octocat/paint-retry', 'rev-parse', 'main')).trim()).toBe(result.headOid);
        expect(calls.deleted).toEqual([]);
    });

    it('gives up after the last retry', async () => {
        mockGitHub({ createBare: false });
        const before = git.requests.length;
        await expect(paint(input({ repoName: 'paint-never' }))).rejects.toBeInstanceOf(PushError);
        const attempts = git.requests.slice(before).filter((r) => r.url.includes('/paint-never.git/info/refs'));
        // Each attempt is an anonymous probe plus an authenticated retry.
        expect(attempts.filter((r) => r.authorization).length).toBe(3);
    });

    it('validates the plan before creating anything', async () => {
        const calls = mockGitHub({ createBare: true });
        await expect(paint(input({ plan: [] }))).rejects.toBeInstanceOf(PlanError);
        expect(calls.created).toEqual([]);
    });
});

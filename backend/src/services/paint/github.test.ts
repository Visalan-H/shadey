import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Octokit } from 'octokit';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
    createPaintRepo,
    deleteRepo,
    InvalidRepoNameError,
    MAX_NAME_ATTEMPTS,
    repoNameFromText,
    RepoNameTakenError,
    validateRepoName,
} from './github.js';

const api = setupServer();
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }));
afterEach(() => api.resetHandlers());
afterAll(() => api.close());

// Throttling spaces out writes by a second each, which only slows the tests down.
const octokit = () => new Octokit({ auth: 'gho_user', throttle: { enabled: false } });

function repoJson(name: string, isPrivate: boolean) {
    return {
        name,
        private: isPrivate,
        owner: { login: 'octocat' },
        html_url: `https://github.com/octocat/${name}`,
        clone_url: `https://github.com/octocat/${name}.git`,
        default_branch: 'main',
    };
}

const taken = () =>
    HttpResponse.json(
        {
            message: 'Repository creation failed.',
            errors: [{ resource: 'Repository', code: 'custom', field: 'name', message: 'name already exists on this account' }],
        },
        { status: 422 },
    );

describe('createPaintRepo', () => {
    it('creates an empty repo with the user token', async () => {
        let body: Record<string, unknown> = {};
        let auth: string | null = null;
        api.use(
            http.post('https://api.github.com/user/repos', async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                auth = request.headers.get('authorization');
                return HttpResponse.json(repoJson(body.name as string, body.private as boolean), { status: 201 });
            }),
        );
        const repo = await createPaintRepo(octokit(), {
            name: 'paint-hi',
            isPrivate: true,
            description: 'desc',
            homepage: 'https://app.test/s/abc',
        });
        expect(repo).toEqual({
            owner: 'octocat',
            name: 'paint-hi',
            htmlUrl: 'https://github.com/octocat/paint-hi',
            cloneUrl: 'https://github.com/octocat/paint-hi.git',
            defaultBranch: 'main',
        });
        expect(body).toMatchObject({
            name: 'paint-hi',
            private: true,
            auto_init: false,
            description: 'desc',
            homepage: 'https://app.test/s/abc',
        });
        expect(auth).toBe('token gho_user');
    });

    it('retries with a numeric suffix when the name is taken', async () => {
        const tried: string[] = [];
        api.use(
            http.post('https://api.github.com/user/repos', async ({ request }) => {
                const { name } = (await request.json()) as { name: string };
                tried.push(name);
                return tried.length < 3 ? taken() : HttpResponse.json(repoJson(name, false), { status: 201 });
            }),
        );
        const repo = await createPaintRepo(octokit(), { name: 'paint-hi', isPrivate: false });
        expect(tried).toEqual(['paint-hi', 'paint-hi-2', 'paint-hi-3']);
        expect(repo.name).toBe('paint-hi-3');
    });

    it('gives up after too many taken names', async () => {
        const tried: string[] = [];
        api.use(
            http.post('https://api.github.com/user/repos', async ({ request }) => {
                tried.push(((await request.json()) as { name: string }).name);
                return taken();
            }),
        );
        await expect(createPaintRepo(octokit(), { name: 'x'.repeat(100), isPrivate: false })).rejects.toBeInstanceOf(
            RepoNameTakenError,
        );
        expect(tried).toHaveLength(MAX_NAME_ATTEMPTS);
        // Suffixes still fit within the 100 character limit.
        expect(tried.at(-1)).toBe('x'.repeat(97) + '-10');
    });

    it('rethrows other errors', async () => {
        api.use(
            http.post('https://api.github.com/user/repos', () =>
                HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
            ),
        );
        await expect(createPaintRepo(octokit(), { name: 'paint-hi', isPrivate: false })).rejects.toMatchObject({
            status: 401,
        });
    });

    it('refuses invalid names without calling GitHub', async () => {
        await expect(createPaintRepo(octokit(), { name: 'bad name', isPrivate: false })).rejects.toBeInstanceOf(
            InvalidRepoNameError,
        );
    });
});

describe('deleteRepo', () => {
    it('deletes the repo', async () => {
        let path = '';
        api.use(
            http.delete('https://api.github.com/repos/:owner/:repo', ({ request }) => {
                path = new URL(request.url).pathname;
                return new HttpResponse(null, { status: 204 });
            }),
        );
        expect(await deleteRepo(octokit(), 'octocat', 'paint-hi')).toBe(true);
        expect(path).toBe('/repos/octocat/paint-hi');
    });

    it('treats a missing repo as already deleted', async () => {
        api.use(
            http.delete('https://api.github.com/repos/:owner/:repo', () =>
                HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
            ),
        );
        expect(await deleteRepo(octokit(), 'octocat', 'gone')).toBe(false);
    });

    it('rethrows other errors', async () => {
        api.use(
            http.delete('https://api.github.com/repos/:owner/:repo', () =>
                HttpResponse.json({ message: 'Must have admin rights to Repository.' }, { status: 403 }),
            ),
        );
        await expect(deleteRepo(octokit(), 'octocat', 'paint-hi')).rejects.toMatchObject({ status: 403 });
    });
});

describe('repoNameFromText', () => {
    it.each([
        ['Hire me', 'paint-hire-me'],
        ['  HELLO, World!! ', 'paint-hello-world'],
        ['Café 2026', 'paint-cafe-2026'],
        ['a--b__c', 'paint-a-b-c'],
        ['', 'paint'],
        ['!!!', 'paint'],
        ['日本', 'paint'],
    ])('%j -> %j', (text, name) => {
        expect(repoNameFromText(text)).toBe(name);
    });

    it('caps the length without a trailing hyphen', () => {
        const name = repoNameFromText('ab '.repeat(60));
        expect(name.length).toBeLessThanOrEqual(100);
        expect(name).toMatch(/^paint-[a-z0-9-]*[a-z0-9]$/);
        expect(validateRepoName(name)).toBeNull();
    });
});

describe('validateRepoName', () => {
    it.each(['paint', 'paint-hire-me', 'My_Repo.v2', 'a'.repeat(100)])('accepts %j', (name) => {
        expect(validateRepoName(name)).toBeNull();
    });

    it.each(['', 'a'.repeat(101), 'has space', 'emoji-\u{1F600}', 'slash/name', '.', '..', 'repo.git'])(
        'rejects %j',
        (name) => {
            expect(validateRepoName(name)).toEqual(expect.any(String));
        },
    );
});

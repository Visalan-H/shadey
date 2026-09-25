import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startGitServer, type GitServer } from '../../test/gitServer.js';
import { buildCommits } from './buildCommits.js';
import { pushCommits, PushError } from './pushRepo.js';

const author = { name: 'Octo Cat', email: '1+octocat@users.noreply.github.com' };
const token = 'gho_test_token';

let server: GitServer;
beforeAll(async () => {
    server = await startGitServer({ token });
});
afterAll(async () => {
    await server.close();
});

describe('pushCommits', () => {
    it('pushes backdated empty commits that git accepts', async () => {
        await server.createRepo('basic');
        const commits = buildCommits({
            plan: [
                { date: '2025-01-05', count: 2 },
                { date: '2025-01-06', count: 3 },
            ],
            author,
        });
        const result = await pushCommits({ url: server.repoUrl('basic'), token, commits, readme: '# Hi\n' });

        expect(result.commitCount).toBe(5);
        expect(result.headOid).toMatch(/^[0-9a-f]{40}$/);
        expect((await server.git('basic', 'rev-parse', 'main')).trim()).toBe(result.headOid);
        expect((await server.git('basic', 'rev-list', '--count', 'main')).trim()).toBe('5');

        const dates = (await server.git('basic', 'log', '--reverse', '--format=%ad|%cd', '--date=iso-strict', 'main'))
            .trim()
            .split('\n');
        expect(dates).toEqual([
            '2025-01-05T12:00:00+00:00|2025-01-05T12:00:00+00:00',
            '2025-01-05T12:00:01+00:00|2025-01-05T12:00:01+00:00',
            '2025-01-06T12:00:00+00:00|2025-01-06T12:00:00+00:00',
            '2025-01-06T12:00:01+00:00|2025-01-06T12:00:01+00:00',
            '2025-01-06T12:00:02+00:00|2025-01-06T12:00:02+00:00',
        ]);
        const emails = new Set((await server.git('basic', 'log', '--format=%ae %ce', 'main')).trim().split('\n'));
        expect([...emails]).toEqual([`${author.email} ${author.email}`]);

        expect(await server.git('basic', 'show', 'main:README.md')).toBe('# Hi\n');
        // Only the root commit touches the tree.
        expect((await server.git('basic', 'log', '--format=%H', '--', 'README.md')).trim().split('\n')).toHaveLength(1);
        await server.git('basic', 'fsck', '--strict');

        const expected = 'Basic ' + Buffer.from(`x-access-token:${token}`).toString('base64');
        expect(server.requests.some((r) => r.url.includes('/basic.git/') && r.authorization === expected)).toBe(true);
    });

    it('pushes to a custom branch', async () => {
        await server.createRepo('branch');
        const commits = buildCommits({ plan: [{ date: '2024-02-29', count: 1 }], author });
        await pushCommits({ url: server.repoUrl('branch'), token, commits, readme: 'x', branch: 'paint' });
        expect((await server.git('branch', 'rev-list', '--count', 'paint')).trim()).toBe('1');
    });

    it('handles a large painting', { timeout: 60_000 }, async () => {
        await server.createRepo('large');
        const plan = Array.from({ length: 50 }, (_, i) => ({
            date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
            count: 60,
        }));
        const commits = buildCommits({ plan, author });
        await pushCommits({ url: server.repoUrl('large'), token, commits, readme: 'x' });
        expect((await server.git('large', 'rev-list', '--count', 'main')).trim()).toBe('3000');
        await server.git('large', 'fsck');
    });

    it('fails with a PushError on bad credentials', async () => {
        await server.createRepo('denied');
        const commits = buildCommits({ plan: [{ date: '2025-01-05', count: 1 }], author });
        await expect(
            pushCommits({ url: server.repoUrl('denied'), token: 'wrong', commits, readme: 'x' }),
        ).rejects.toBeInstanceOf(PushError);
    });

    it('fails with a PushError when the repo does not exist', async () => {
        const commits = buildCommits({ plan: [{ date: '2025-01-05', count: 1 }], author });
        await expect(
            pushCommits({ url: server.repoUrl('missing'), token, commits, readme: 'x' }),
        ).rejects.toBeInstanceOf(PushError);
    });
});

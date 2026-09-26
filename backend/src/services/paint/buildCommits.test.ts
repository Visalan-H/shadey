import { describe, expect, it } from 'vitest';
import { buildCommits, MAX_PER_DAY, MAX_TOTAL, PlanError, type PlanDay } from './buildCommits.js';

const author = { name: 'Octo Cat', email: '1+octocat@users.noreply.github.com' };

function days(n: number, count: number): PlanDay[] {
    return Array.from({ length: n }, (_, i) => ({
        date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
        count,
    }));
}

describe('buildCommits', () => {
    it('stamps each commit at noon UTC plus i seconds, oldest first', () => {
        const commits = buildCommits({
            plan: [
                { date: '2025-03-02', count: 3 },
                { date: '2025-03-01', count: 1 },
            ],
            author,
        });
        const noon1 = Date.UTC(2025, 2, 1, 12) / 1000;
        const noon2 = Date.UTC(2025, 2, 2, 12) / 1000;
        expect(commits.map((c) => c.author.timestamp)).toEqual([noon1, noon2, noon2 + 1, noon2 + 2]);
        for (const c of commits) {
            expect(c.author).toMatchObject({ ...author, timezoneOffset: 0 });
            expect(c.message).toBe('Paint');
        }
    });

    it('accepts the limits exactly', () => {
        expect(buildCommits({ plan: days(MAX_TOTAL / MAX_PER_DAY, MAX_PER_DAY), author })).toHaveLength(MAX_TOTAL);
    });

    it.each<[string, PlanDay[], string]>([
        ['an empty plan', [], 'empty_plan'],
        ['a malformed date', [{ date: '2025-3-1', count: 1 }], 'invalid_date'],
        ['an impossible date', [{ date: '2025-02-30', count: 1 }], 'invalid_date'],
        ['a date before 1970', [{ date: '1969-12-31', count: 1 }], 'invalid_date'],
        ['a zero count', [{ date: '2025-03-01', count: 0 }], 'invalid_count'],
        ['a fractional count', [{ date: '2025-03-01', count: 1.5 }], 'invalid_count'],
        ['too many commits in a day', [{ date: '2025-03-01', count: MAX_PER_DAY + 1 }], 'invalid_count'],
        [
            'a duplicate date',
            [
                { date: '2025-03-01', count: 1 },
                { date: '2025-03-01', count: 2 },
            ],
            'duplicate_date',
        ],
        ['too many commits in total', days(MAX_TOTAL / MAX_PER_DAY + 1, MAX_PER_DAY), 'too_many_commits'],
    ])('rejects %s', (_label, plan, code) => {
        let caught: unknown;
        try {
            buildCommits({ plan, author });
        } catch (err) {
            caught = err;
        }
        expect(caught).toBeInstanceOf(PlanError);
        expect((caught as PlanError).code).toBe(code);
    });

    it('rejects a missing author', () => {
        expect(() =>
            buildCommits({ plan: [{ date: '2025-03-01', count: 1 }], author: { name: '', email: '' } }),
        ).toThrow(PlanError);
    });
});

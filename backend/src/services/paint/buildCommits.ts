export const MAX_PER_DAY = 500;
export const MAX_TOTAL = 25_000;

export interface PlanDay {
    date: string; // YYYY-MM-DD
    count: number;
}

export interface CommitAuthor {
    name: string;
    email: string;
}

// Shaped like isomorphic-git's commit author so it can be passed straight to writeCommit.
export interface CommitSpec {
    message: string;
    author: CommitAuthor & { timestamp: number; timezoneOffset: 0 };
}

export type PlanErrorCode =
    | 'empty_plan'
    | 'invalid_date'
    | 'duplicate_date'
    | 'invalid_count'
    | 'too_many_commits'
    | 'invalid_author';

export class PlanError extends Error {
    constructor(
        readonly code: PlanErrorCode,
        message: string,
    ) {
        super(message);
        this.name = 'PlanError';
    }
}

// Midnight UTC in seconds, or null if the string isn't a real calendar date.
function parseDate(date: unknown): number | null {
    if (typeof date !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const ms = Date.UTC(y, mo - 1, d);
    const back = new Date(ms);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    // Git timestamps before the epoch are poorly supported.
    if (y < 1970) return null;
    return ms / 1000;
}

export function buildCommits(input: { plan: PlanDay[]; author: CommitAuthor }): CommitSpec[] {
    const { plan, author } = input;
    if (!author.name || !author.email) throw new PlanError('invalid_author', 'Author name and email are required');
    if (plan.length === 0) throw new PlanError('empty_plan', 'Nothing to paint');

    const days: { start: number; count: number }[] = [];
    const seen = new Set<string>();
    let total = 0;
    for (const { date, count } of plan) {
        const midnight = parseDate(date);
        if (midnight === null) throw new PlanError('invalid_date', `Invalid date: ${String(date)}`);
        if (seen.has(date)) throw new PlanError('duplicate_date', `Duplicate date: ${date}`);
        seen.add(date);
        if (!Number.isInteger(count) || count < 1 || count > MAX_PER_DAY) {
            throw new PlanError('invalid_count', `Count for ${date} must be 1-${MAX_PER_DAY}`);
        }
        total += count;
        if (total > MAX_TOTAL) throw new PlanError('too_many_commits', `At most ${MAX_TOTAL} commits per painting`);
        // With a +0000 offset GitHub buckets the commit by its UTC date; noon keeps it well clear of either edge.
        days.push({ start: midnight + 12 * 3600, count });
    }

    // Oldest first so the parent chain runs forward in time.
    days.sort((a, b) => a.start - b.start);
    const commits: CommitSpec[] = [];
    for (const { start, count } of days) {
        for (let i = 0; i < count; i++) {
            commits.push({
                message: 'Paint',
                author: { name: author.name, email: author.email, timestamp: start + i, timezoneOffset: 0 },
            });
        }
    }
    return commits;
}

import { Octokit } from 'octokit';
import { env } from '../env.js';
import { CACHE_TTL_SECONDS, CalendarCache } from '../models/CalendarCache.js';
import type { Calendar, CalendarDay, Level } from '../types.js';

export class UserNotFoundError extends Error {
    constructor() {
        super('User not found');
    }
}

export class UpstreamError extends Error {}

const LEVELS: Record<string, Level> = {
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4,
};

interface GqlDay {
    date: string;
    contributionCount: number;
    contributionLevel: string;
    weekday: number;
}

interface GqlResponse {
    user: {
        login: string;
        contributionsCollection: {
            contributionCalendar: { weeks: { contributionDays: GqlDay[] }[] };
        };
    } | null;
}

const QUERY = `
    query($login: String!, $from: DateTime, $to: DateTime) {
        user(login: $login) {
            login
            contributionsCollection(from: $from, to: $to) {
                contributionCalendar {
                    weeks { contributionDays { date contributionCount contributionLevel weekday } }
                }
            }
        }
    }
`;

// GitHub's first and last weeks are partial; slot each day by weekday so every column has 7 rows.
export function toCalendar(login: string, weeks: { contributionDays: GqlDay[] }[]): Calendar {
    const out: (CalendarDay | null)[][] = [];
    for (const week of weeks) {
        const slots: (CalendarDay | null)[] = Array(7).fill(null);
        for (const d of week.contributionDays) {
            slots[d.weekday] = { date: d.date, count: d.contributionCount, level: LEVELS[d.contributionLevel] ?? 0 };
        }
        if (slots.some(Boolean)) out.push(slots);
    }
    const days = out.flat().filter((d): d is CalendarDay => d !== null);
    return { login, from: days[0]?.date ?? '', to: days.at(-1)?.date ?? '', weeks: out };
}

function isRateLimit(err: unknown) {
    const e = err as { status?: number; errors?: { type?: string }[]; message?: string };
    if (e.errors?.some((x) => x.type === 'RATE_LIMITED')) return true;
    return (e.status === 403 || e.status === 429) && /rate limit/i.test(e.message ?? '');
}

async function fetchFromGitHub(login: string, year?: number): Promise<Calendar> {
    // Retries and throttling would hold the request open for minutes on a serverless function.
    const octokit = new Octokit({ auth: env().GITHUB_TOKEN, retry: { enabled: false }, throttle: { enabled: false } });
    const vars = year ? { login, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` } : { login };
    let res: GqlResponse;
    try {
        res = await octokit.graphql<GqlResponse>(QUERY, vars);
    } catch (err) {
        const e = err as { errors?: { type?: string }[] };
        if (e.errors?.some((x) => x.type === 'NOT_FOUND')) throw new UserNotFoundError();
        if (isRateLimit(err)) throw new UpstreamError('GitHub rate limit reached, try again in a few minutes');
        console.error(err);
        throw new UpstreamError('Could not load the contribution graph from GitHub');
    }
    if (!res.user) throw new UserNotFoundError();
    return toCalendar(res.user.login, res.user.contributionsCollection.contributionCalendar.weeks);
}

export async function getCalendar(login: string, year?: number): Promise<Calendar> {
    const key = `${login.toLowerCase()}:${year ?? 'rolling'}`;
    const fresh = new Date(Date.now() - CACHE_TTL_SECONDS * 1000);
    const cached = await CalendarCache.findOne({ key, createdAt: { $gt: fresh } }).lean();
    if (cached) return cached.calendar;

    const calendar = await fetchFromGitHub(login, year);
    await CalendarCache.updateOne({ key }, { calendar, createdAt: new Date() }, { upsert: true });
    return calendar;
}

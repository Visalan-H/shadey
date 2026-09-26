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

// A revoked token or a used-up rate limit: worth one more try with the server's token.
class ViewerTokenError extends Error {}

async function fetchFromGitHub(login: string, year: number | undefined, token: string, isViewer: boolean): Promise<Calendar> {
    // Retries and throttling would hold the request open for minutes on a serverless function.
    const octokit = new Octokit({ auth: token, retry: { enabled: false }, throttle: { enabled: false } });
    const vars = year ? { login, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` } : { login };
    let res: GqlResponse;
    try {
        res = await octokit.graphql<GqlResponse>(QUERY, vars);
    } catch (err) {
        const e = err as { errors?: { type?: string }[]; status?: number };
        if (e.errors?.some((x) => x.type === 'NOT_FOUND')) throw new UserNotFoundError();
        if (isViewer && (e.status === 401 || isRateLimit(err))) throw new ViewerTokenError();
        if (isRateLimit(err)) throw new UpstreamError('GitHub rate limit reached, try again in a few minutes');
        console.error(err);
        throw new UpstreamError('Could not load the contribution graph from GitHub');
    }
    if (!res.user) throw new UserNotFoundError();
    return toCalendar(res.user.login, res.user.contributionsCollection.contributionCalendar.weeks);
}

export interface Viewer {
    githubId: number;
    login: string;
    token: string;
}

// Your own graph changes when you paint or delete, and GitHub takes a minute or two to catch up,
// so it only stays cached long enough to absorb reloads.
const OWN_GRAPH_TTL_SECONDS = 2 * 60;

// Signed-in viewers read with their own token, so graph lookups spread over each user's
// GitHub rate limit instead of all landing on the server's. A user's token can see more
// than the public (their own private contribution counts), so those results are cached
// per viewer and never served to anyone else.
export async function getCalendar(login: string, year?: number, viewer?: Viewer): Promise<Calendar> {
    const graph = `${login.toLowerCase()}:${year ?? 'rolling'}`;
    const key = viewer ? `${graph}:viewer:${viewer.githubId}` : graph;
    const ownGraph = viewer?.login.toLowerCase() === login.toLowerCase();
    const fresh = new Date(Date.now() - (ownGraph ? OWN_GRAPH_TTL_SECONDS : CACHE_TTL_SECONDS) * 1000);
    const cached = await CalendarCache.findOne({ key, createdAt: { $gt: fresh } }).lean();
    if (cached) return cached.calendar;

    let calendar: Calendar;
    try {
        calendar = await fetchFromGitHub(login, year, viewer?.token ?? env().GITHUB_TOKEN, Boolean(viewer));
    } catch (err) {
        if (!(err instanceof ViewerTokenError)) throw err;
        // The server token only sees the public graph, so its result is safe to share.
        return getCalendar(login, year);
    }
    await CalendarCache.updateOne({ key }, { calendar, createdAt: new Date() }, { upsert: true });
    return calendar;
}

// Drops every cached graph for a login, shared and per viewer, after a paint or delete changes it.
export async function forgetCalendars(login: string) {
    const prefix = login.toLowerCase().replace(/[^a-z\d-]/g, '');
    await CalendarCache.deleteMany({ key: { $regex: `^${prefix}:` } });
}

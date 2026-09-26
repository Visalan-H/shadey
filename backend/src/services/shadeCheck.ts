import type { PaintingDoc } from '../models/Painting.js';
import { fetchCalendarFresh, forgetCalendars } from './calendar.js';
import { appendCommits, buildCommits, MAX_PER_DAY, MAX_TOTAL, noreplyEmail } from './paint/index.js';
import { planTopUp } from './shade.js';

export const MAX_TOP_UPS = 3;
// Extra commits per light day, at most. Past this the model is guessing anyway.
const TOP_UP_CAP = 100;

export type ShadeCheck =
    // GitHub hasn't counted all the painted commits yet, so the shades mean nothing so far.
    | { result: 'pending' }
    | { result: 'ok' }
    | { result: 'limit'; lightDays: number }
    | { result: 'toppedUp'; lightDays: number; added: number; capped: boolean };

export interface ShadeCheckDeps {
    gitBaseUrl?: string;
}

// One year's graph when the painting sits in one year; the rolling graph when it crosses New Year.
function graphYear(dates: string[]): number | undefined {
    const years = new Set(dates.map((d) => Number(d.slice(0, 4))));
    return years.size === 1 ? [...years][0] : undefined;
}

export async function checkShades(
    painting: PaintingDoc,
    user: { login: string; githubId: number; name?: string | null },
    token: string,
    deps: ShadeCheckDeps = {},
): Promise<ShadeCheck> {
    const dates = painting.cells.map((c) => c.date);
    const calendar = await fetchCalendarFresh(painting.login, graphYear(dates), token);
    const counts = new Map(calendar.weeks.flat().flatMap((d) => (d ? [[d.date, d.count] as const] : [])));
    if (painting.cells.some((c) => (counts.get(c.date) ?? 0) < c.count)) return { result: 'pending' };

    const room = Math.min(
        TOP_UP_CAP,
        MAX_PER_DAY - Math.max(...painting.cells.map((c) => c.count)),
        Math.floor((MAX_TOTAL - painting.totalCommits) / Math.max(1, dates.length)),
    );
    const plan = planTopUp(calendar, dates, painting.shade, room);
    if (plan.dates.length === 0) return { result: 'ok' };
    if (painting.topUps >= MAX_TOP_UPS || plan.perCell === 0) return { result: 'limit', lightDays: plan.dates.length };

    const commits = buildCommits({
        plan: plan.dates.map((date) => ({ date, count: plan.perCell })),
        author: { name: user.name || user.login, email: noreplyEmail(user) },
        // Each round an hour after the last, so no two commits share a timestamp.
        startSecond: 3600 * (painting.topUps + 1),
    });
    const gitBaseUrl = (deps.gitBaseUrl ?? 'https://github.com').replace(/\/+$/, '');
    await appendCommits({ url: `${gitBaseUrl}/${painting.repoOwner}/${painting.repoName}.git`, token, commits });

    const light = new Set(plan.dates);
    for (const cell of painting.cells) if (light.has(cell.date)) cell.count += plan.perCell;
    painting.totalCommits += commits.length;
    painting.topUps += 1;
    await painting.save();
    await forgetCalendars(painting.login).catch((e: unknown) => console.error('Clearing cached graphs failed', e));
    return { result: 'toppedUp', lightDays: plan.dates.length, added: commits.length, capped: plan.capped };
}

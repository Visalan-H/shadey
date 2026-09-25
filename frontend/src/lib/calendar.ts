import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { Calendar } from './types';

// Same rules GitHub uses: 1-39 chars, alphanumeric or single hyphens, no leading/trailing hyphen.
const LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d]))*$/i;

export function isValidLogin(login: string) {
    return login.length <= 39 && LOGIN.test(login);
}

// People paste "@name" or a profile URL; reduce either to the bare login.
export function cleanLogin(input: string) {
    return input
        .trim()
        .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
        .replace(/^@/, '')
        .replace(/\/.*$/, '');
}

export const FIRST_YEAR = 2008;

export function selectableYears(now = new Date()) {
    const years: number[] = [];
    for (let y = now.getFullYear(); y >= FIRST_YEAR; y--) years.push(y);
    return years;
}

export function parseYear(value: string | null, now = new Date()) {
    const year = Number(value);
    return Number.isInteger(year) && year >= FIRST_YEAR && year <= now.getFullYear() ? year : undefined;
}

export function calendarPath(login: string, year?: number) {
    return `/api/calendar/${encodeURIComponent(login)}${year ? `?year=${year}` : ''}`;
}

// Shared by the preview and anything else that needs the same calendar; React Query dedupes the fetch.
export function useCalendar(login: string | undefined, year?: number) {
    return useQuery({
        queryKey: ['calendar', login?.toLowerCase(), year ?? 'rolling'],
        queryFn: () => api<Calendar>(calendarPath(login!, year)),
        enabled: Boolean(login),
        staleTime: 5 * 60 * 1000,
        retry: (failures, err) => failures < 1 && !isFinal(err),
    });
}

// Retrying a missing user, a bad request or a rate limit just repeats the same answer.
function isFinal(err: unknown) {
    return err instanceof ApiError && (err.status < 500 || isRateLimit(err));
}

function isRateLimit(err: ApiError) {
    return /rate limit/i.test(err.message);
}

export function calendarErrorMessage(err: unknown, login: string) {
    if (err instanceof ApiError) {
        if (err.status === 404) return `No GitHub user named "${login}".`;
        if (err.status === 400) return `"${login}" doesn't look like a GitHub username.`;
        if (isRateLimit(err)) return 'GitHub is rate limiting us right now. Try again in a few minutes.';
        if (err.status >= 500) return 'Could not reach GitHub. Try again in a moment.';
    }
    return 'Something went wrong loading this graph.';
}

export function totalContributions(calendar: Calendar) {
    let total = 0;
    for (const week of calendar.weeks) for (const day of week) total += day?.count ?? 0;
    return total;
}

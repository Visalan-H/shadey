import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { Calendar, CalendarDay, Level, Pattern } from './types';

export interface SharedPainting {
    shareId: string;
    login: string;
    text?: string | null;
    repoUrl?: string;
    repoName: string;
    isPrivate: boolean;
    status: 'painted' | 'deleted';
    createdAt: string;
    placement: { mode: 'rolling' | 'year'; year?: number; offset: number };
    shade: 1 | 2 | 3 | 4;
    pattern: Pattern;
    cells: { date: string; level: Level; count: number }[];
}

export function useSharedPainting(shareId: string) {
    return useQuery({
        queryKey: ['painting', shareId],
        queryFn: () => api<SharedPainting>(`/api/paintings/${encodeURIComponent(shareId)}`),
        retry: (failures, err) => failures < 1 && !(err instanceof ApiError && err.status < 500),
    });
}

export function useReportPainting(shareId: string) {
    return useMutation({
        mutationFn: (reason: string) =>
            api<unknown>(`/api/paintings/${encodeURIComponent(shareId)}/report`, {
                method: 'POST',
                body: JSON.stringify({ reason: reason.trim() || undefined }),
            }),
    });
}

const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 53;

function utc(date: string) {
    return new Date(`${date}T00:00:00Z`);
}

function iso(date: Date) {
    return date.toISOString().slice(0, 10);
}

// Only the painting, on the same window as the share image (backend routes/share.ts):
// the whole year in year mode, otherwise the 53 weeks ending with the latest painted week.
export function paintingCalendar(painting: Pick<SharedPainting, 'login' | 'placement' | 'cells' | 'createdAt'>): Calendar {
    let from: Date;
    let to: Date;
    const { placement } = painting;
    if (placement.mode === 'year' && placement.year) {
        from = new Date(Date.UTC(placement.year, 0, 1));
        to = new Date(Date.UTC(placement.year, 11, 31));
    } else {
        const latest = painting.cells.reduce((max, c) => (c.date > max ? c.date : max), '');
        const end = latest ? utc(latest) : new Date(painting.createdAt);
        to = new Date(end.getTime() + (6 - end.getUTCDay()) * DAY);
        from = new Date(to.getTime() - (WEEKS * 7 - 1) * DAY);
    }

    const levels = new Map(painting.cells.map((c) => [c.date, c]));
    const weeks: (CalendarDay | null)[][] = [];
    const cursor = new Date(from.getTime() - from.getUTCDay() * DAY);
    while (cursor <= to) {
        const week: (CalendarDay | null)[] = [];
        for (let d = 0; d < 7; d++) {
            const date = iso(cursor);
            const cell = levels.get(date);
            week.push(cursor < from || cursor > to ? null : { date, count: cell?.count ?? 0, level: cell?.level ?? 0 });
            cursor.setTime(cursor.getTime() + DAY);
        }
        weeks.push(week);
    }
    return { login: painting.login, from: iso(from), to: iso(to), weeks };
}

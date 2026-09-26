import type { Calendar, CalendarDay } from '../types';

// Test helper: builds a Calendar covering from..to (inclusive), padded with null
// slots to whole Sunday-first weeks, the same shape the API returns.
export function makeCalendar(
    from: string,
    to: string,
    countFor: (date: string, week: number, weekday: number) => number = () => 0,
): Calendar {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    const cursor = new Date(start);
    cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());

    const weeks: (CalendarDay | null)[][] = [];
    while (cursor <= end) {
        const week: (CalendarDay | null)[] = [];
        for (let weekday = 0; weekday < 7; weekday++) {
            const date = cursor.toISOString().slice(0, 10);
            if (cursor >= start && cursor <= end) {
                week.push({ date, count: countFor(date, weeks.length, weekday), level: 0 });
            } else {
                week.push(null);
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        weeks.push(week);
    }
    return { login: 'test', from, to, weeks };
}

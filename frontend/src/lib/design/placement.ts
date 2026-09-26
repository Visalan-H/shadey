import type { Calendar, Pattern } from '../types';
import { DAYS, patternWidth } from './pattern';

// rolling = the last-12-months graph (paint should end near today);
// year = a single calendar year (paint sits in the middle).
export type PlacementMode = 'rolling' | 'year';

// offset = index of the calendar week-column where pattern column 0 lands.
export interface Placement {
    mode: PlacementMode;
    offset: number;
}

export type CellStatus = 'ok' | 'outOfBounds' | 'future';

export interface PlacedCell {
    week: number;
    weekday: number;
    date: string | null;
    status: CellStatus;
}

export interface ConflictCell {
    week: number;
    weekday: number;
    date: string;
    count: number;
}

export interface Conflicts {
    cells: ConflictCell[];
    count: number;
}

export interface BestPlacement {
    offset: number;
    conflicts: number;
}

// Largest offset that keeps the whole pattern inside the calendar (0 if it is wider).
export function maxOffset(calendar: Calendar, pattern: Pattern): number {
    return Math.max(0, calendar.weeks.length - patternWidth(pattern));
}

function centerOffset(calendar: Calendar, pattern: Pattern): number {
    return Math.floor(maxOffset(calendar, pattern) / 2);
}

// Every lit pixel, in date order (column by column, Sunday first). Dates are
// compared as YYYY-MM-DD strings, so today must use the same format.
export function cellsFor(calendar: Calendar, pattern: Pattern, offset: number, today: string): PlacedCell[] {
    const cells: PlacedCell[] = [];
    const width = patternWidth(pattern);
    for (let col = 0; col < width; col++) {
        const week = offset + col;
        for (let weekday = 0; weekday < DAYS; weekday++) {
            if (!pattern[weekday]?.[col]) continue;
            const day = calendar.weeks[week]?.[weekday] ?? null;
            if (!day) cells.push({ week, weekday, date: null, status: 'outOfBounds' });
            else cells.push({ week, weekday, date: day.date, status: day.date > today ? 'future' : 'ok' });
        }
    }
    return cells;
}

function fits(calendar: Calendar, pattern: Pattern, offset: number, today: string): boolean {
    return cellsFor(calendar, pattern, offset, today).every((cell) => cell.status === 'ok');
}

// Real contributions inside the pattern's columns on cells the pattern leaves
// dark: they show up as stray green in the negative space and smudge the text.
export function conflicts(calendar: Calendar, pattern: Pattern, offset: number): Conflicts {
    const cells: ConflictCell[] = [];
    const width = patternWidth(pattern);
    for (let col = 0; col < width; col++) {
        const week = offset + col;
        for (let weekday = 0; weekday < DAYS; weekday++) {
            if (pattern[weekday]?.[col]) continue;
            const day = calendar.weeks[week]?.[weekday];
            if (day && day.count > 0) cells.push({ week, weekday, date: day.date, count: day.count });
        }
    }
    return { cells, count: cells.length };
}

// Last column with a day in it and no day after today.
function lastPastColumn(calendar: Calendar, today: string): number {
    for (let week = calendar.weeks.length - 1; week >= 0; week--) {
        const days = (calendar.weeks[week] ?? []).filter((day) => day !== null);
        if (days.length > 0 && days.every((day) => day.date <= today)) return week;
    }
    return calendar.weeks.length - 1;
}

export function defaultOffset(calendar: Calendar, pattern: Pattern, mode: PlacementMode, today: string): number {
    if (mode === 'year') return centerOffset(calendar, pattern);

    // Latest spot where every lit pixel lands on a real, non-future day. The
    // current week counts when the pattern's last column only lights days so far.
    for (let offset = maxOffset(calendar, pattern); offset >= 0; offset--) {
        if (fits(calendar, pattern, offset, today)) return offset;
    }
    const width = patternWidth(pattern);
    return Math.min(maxOffset(calendar, pattern), Math.max(0, lastPastColumn(calendar, today) - width + 1));
}

// Offset with the fewest conflicts among spots where every lit pixel is paintable.
// Ties: rolling takes the latest spot, year the one closest to center (left first).
export function bestOffset(
    calendar: Calendar,
    pattern: Pattern,
    mode: PlacementMode,
    today: string,
): BestPlacement | null {
    const width = patternWidth(pattern);
    if (width === 0 || width > calendar.weeks.length) return null;

    const center = centerOffset(calendar, pattern);
    let best: BestPlacement | null = null;
    let bestDistance = Infinity;

    for (let offset = 0; offset + width <= calendar.weeks.length; offset++) {
        if (!fits(calendar, pattern, offset, today)) continue;
        const count = conflicts(calendar, pattern, offset).count;
        const distance = Math.abs(offset - center);
        const better =
            best === null ||
            count < best.conflicts ||
            (count === best.conflicts && (mode === 'rolling' || distance < bestDistance));
        if (better) {
            best = { offset, conflicts: count };
            bestDistance = distance;
        }
    }
    return best;
}

import type { Calendar, Level } from '../types';
import type { CellStatus } from './placement';

// How GitHub picks shades is not documented, so this is a quartile model: take every
// day with count > 0 in the displayed calendar, compute the 25th/50th/75th percentiles of those counts
// (linear interpolation between ranks), and give a day
//   level 1 if count < q1, 2 if q1 <= count < q2, 3 if q2 <= count < q3, 4 if count >= q3.
// So ties at the top (a lone day, or every day equal) show as the darkest shade.
// It is a heuristic; swap the threshold function if it proves off.
export type Thresholds = readonly [number, number, number];
export type ThresholdFn = (nonZeroCounts: number[]) => Thresholds;

function quantile(sorted: number[], p: number): number {
    const h = (sorted.length - 1) * p;
    const lo = Math.floor(h);
    const a = sorted[lo] ?? 0;
    const b = sorted[lo + 1] ?? a;
    return a + (h - lo) * (b - a);
}

export const quartileThresholds: ThresholdFn = (nonZeroCounts) => {
    const sorted = [...nonZeroCounts].sort((a, b) => a - b);
    return [quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75)];
};

export function levelFor(count: number, thresholds: Thresholds): Level {
    if (count <= 0) return 0;
    const [q1, q2, q3] = thresholds;
    if (count >= q3) return 4;
    if (count >= q2) return 3;
    if (count >= q1) return 2;
    return 1;
}

export function levelsFor(counts: number[], thresholdsFn: ThresholdFn = quartileThresholds): Level[] {
    const nonZero = counts.filter((count) => count > 0);
    if (nonZero.length === 0) return counts.map(() => 0);
    const thresholds = thresholdsFn(nonZero);
    return counts.map((count) => levelFor(count, thresholds));
}

// Anything with a date; status (from cellsFor) filters out cells we cannot paint.
export interface PaintCell {
    date: string | null;
    status?: CellStatus;
}

export interface Calibration {
    perCell: number; // commits to create on each painted day
    totalCommits: number; // perCell * dates.length
    dates: string[]; // painted days, in the order achieved[] refers to
    achieved: Level[]; // simulated level of each painted day afterwards
    exact: boolean; // every painted day lands on the target
    capped: boolean; // missed the target and stopped at the cap; more commits might help
    realDaysShifted: number; // unpainted days with commits whose shade changes
}

function paintableDates(cells: readonly PaintCell[]): string[] {
    const dates = new Set<string>();
    for (const cell of cells) {
        if (cell.date && (cell.status === undefined || cell.status === 'ok')) dates.add(cell.date);
    }
    return [...dates];
}

// Smallest per-day commit count N that makes every painted day show at the
// target level once the painting is added to the calendar. The painted days'
// own commits add to N. If no N up to cap hits the target exactly, returns the
// N whose levels are closest (on ties, more commits when still undershooting).
export function calibrate(
    calendar: Calendar,
    cells: readonly PaintCell[],
    targetLevel: Level,
    cap = 100,
): Calibration {
    const dates = paintableDates(cells);
    if (dates.length === 0 || targetLevel === 0) {
        const achieved = dates.map((): Level => 0);
        return { perCell: 0, totalCommits: 0, dates, achieved, exact: targetLevel === 0, capped: false, realDaysShifted: 0 };
    }

    const days = calendar.weeks.flat().filter((day) => day !== null);
    const baseCounts = days.map((day) => day.count);
    const painted = new Set(dates);
    const paintedIndex = new Map<string, number>();
    days.forEach((day, i) => {
        if (painted.has(day.date)) paintedIndex.set(day.date, i);
    });
    // Painted dates missing from the calendar still count toward the distribution.
    const extra = dates.filter((date) => !paintedIndex.has(date));

    const simulate = (n: number): { achieved: Level[]; levels: Level[] } => {
        const counts = baseCounts.map((count, i) => (painted.has(days[i]!.date) ? count + n : count));
        const levels = levelsFor([...counts, ...extra.map(() => n)]);
        const achieved = dates.map((date) => {
            const i = paintedIndex.get(date);
            return levels[i ?? days.length + extra.indexOf(date)]!;
        });
        return { achieved, levels };
    };

    let best: { n: number; achieved: Level[]; distance: number } | null = null;
    for (let n = 1; n <= cap; n++) {
        const { achieved } = simulate(n);
        const distance = achieved.reduce<number>((sum, level) => sum + Math.abs(level - targetLevel), 0);
        if (distance === 0) {
            best = { n, achieved, distance };
            break;
        }
        const undershooting = achieved.every((level) => level <= targetLevel);
        if (!best || distance < best.distance || (distance === best.distance && undershooting)) {
            best = { n, achieved, distance };
        }
    }

    const chosen = best!;
    const before = levelsFor(baseCounts);
    const after = simulate(chosen.n).levels;
    let realDaysShifted = 0;
    days.forEach((day, i) => {
        if (day.count > 0 && !painted.has(day.date) && before[i] !== after[i]) realDaysShifted++;
    });

    const exact = chosen.distance === 0;
    return {
        perCell: chosen.n,
        totalCommits: chosen.n * dates.length,
        dates,
        achieved: chosen.achieved,
        exact,
        capped: !exact && chosen.n === cap,
        realDaysShifted,
    };
}

export interface CommitDay {
    date: string;
    count: number;
}

// One entry per paintable day, sorted by date. The backend stamps each commit
// at noon UTC on its date.
export function commitPlan(cells: readonly PaintCell[], perCell: number): CommitDay[] {
    if (perCell <= 0) return [];
    return paintableDates(cells)
        .sort()
        .map((date) => ({ date, count: perCell }));
}

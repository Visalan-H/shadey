import { describe, expect, it } from 'vitest';
import type { Calendar } from '../types';
import { textToPattern } from './pattern';
import { cellsFor } from './placement';
import { calibrate, commitPlan, levelFor, levelsFor, quartileThresholds } from './shade';
import { makeCalendar } from './testCalendar';

const FROM = '2025-09-28';
const TO = '2026-09-26';

// Simulated levels of the given dates once perCell commits are added to each.
function levelsAfter(calendar: Calendar, dates: string[], perCell: number): Map<string, number> {
    const painted = new Set(dates);
    const days = calendar.weeks.flat().filter((day) => day !== null);
    const counts = days.map((day) => day.count + (painted.has(day.date) ? perCell : 0));
    const levels = levelsFor(counts);
    return new Map(days.map((day, i) => [day.date, levels[i]!]));
}

describe('quartile model', () => {
    it('computes interpolated quartiles of the non-zero counts', () => {
        expect(quartileThresholds([1, 2, 3, 4])).toEqual([1.75, 2.5, 3.25]);
        expect(quartileThresholds([4, 1, 3, 2])).toEqual([1.75, 2.5, 3.25]);
        expect(quartileThresholds([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([2.75, 4.5, 6.25]);
        expect(quartileThresholds([5])).toEqual([5, 5, 5]);
    });

    it('buckets counts by the quartile they fall in, 0 stays 0', () => {
        expect(levelsFor([0, 1, 2, 3, 4])).toEqual([0, 1, 2, 3, 4]);
        expect(levelsFor([1, 2, 3, 4, 5, 6, 7, 8, 0])).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 0]);
    });

    it('treats a count equal to a threshold as the upper bucket', () => {
        expect(levelFor(3, [2, 3, 4])).toBe(3);
        expect(levelFor(2.99, [2, 3, 4])).toBe(2);
        expect(levelFor(0, [2, 3, 4])).toBe(0);
    });

    it('shows a lone or uniform day as the darkest shade', () => {
        expect(levelsFor([0, 0, 7, 0])).toEqual([0, 0, 4, 0]);
        expect(levelsFor([5, 5, 5])).toEqual([4, 4, 4]);
    });

    it('lets one heavy day push the rest down', () => {
        expect(levelsFor([1, 1, 1, 50])).toEqual([3, 3, 3, 4]);
        expect(levelsFor([1, 2, 2, 3, 3, 3, 50, 60])).toEqual([1, 2, 2, 3, 3, 3, 4, 4]);
    });

    it('accepts a different threshold rule', () => {
        const fixed = () => [1, 5, 10] as [number, number, number];
        expect(levelsFor([0, 1, 4, 5, 9, 10], fixed)).toEqual([0, 2, 2, 3, 3, 4]);
    });

    it('handles no contributions at all', () => {
        expect(levelsFor([])).toEqual([]);
        expect(levelsFor([0, 0])).toEqual([0, 0]);
    });
});

describe('calibrate', () => {
    // A few stray commits, painting goes in an empty stretch.
    const quiet = makeCalendar(FROM, TO, (_date, week, weekday) => (week % 13 === 0 && weekday === 3 ? 1 : 0));
    // Every day has 1..10 commits.
    const busy = makeCalendar(FROM, TO, (_date, week, weekday) => ((week * 7 + weekday) % 10) + 1);

    it('reaches level 4 with a small count on a quiet calendar', () => {
        const cells = cellsFor(quiet, textToPattern('HI'), 2, TO);
        const result = calibrate(quiet, cells, 4);
        expect(result.perCell).toBeLessThanOrEqual(2);
        expect(result.achieved).toHaveLength(20);
        expect(result.achieved.every((level) => level === 4)).toBe(true);
        expect(result.exact).toBe(true);
        expect(result.capped).toBe(false);
        expect(result.totalCommits).toBe(result.perCell * 20);
        expect(result.realDaysShifted).toBe(0);
    });

    it('needs a larger count on a busy calendar and warns about shifted days', () => {
        const cells = cellsFor(busy, textToPattern('HI'), 20, TO);
        const quietResult = calibrate(quiet, cellsFor(quiet, textToPattern('HI'), 2, TO), 4);
        const result = calibrate(busy, cells, 4);
        expect(result.perCell).toBeGreaterThan(quietResult.perCell);
        expect(result.achieved.every((level) => level === 4)).toBe(true);
        expect(result.capped).toBe(false);

        // smallest: one fewer commit leaves some painted cell below 4
        const dates = result.dates;
        const after = levelsAfter(busy, dates, result.perCell);
        expect(dates.every((date) => after.get(date) === 4)).toBe(true);
        const fewer = levelsAfter(busy, dates, result.perCell - 1);
        expect(dates.some((date) => fewer.get(date) !== 4)).toBe(true);
        expect(result.realDaysShifted).toBeGreaterThan(0);
    });

    it('flags when the cap is not enough', () => {
        const heavy = makeCalendar(FROM, TO, (_date, week) => (week < 40 ? 500 : 0));
        const cells = cellsFor(heavy, textToPattern('HI'), 42, TO);
        const result = calibrate(heavy, cells, 4, 20);
        expect(result.capped).toBe(true);
        expect(result.exact).toBe(false);
        expect(result.perCell).toBe(20);
        expect(result.achieved.some((level) => level < 4)).toBe(true);
    });

    it('hits a middle level exactly when the distribution allows it', () => {
        // real days cycle 1..8; paint over an empty stretch
        const calendar = makeCalendar(FROM, TO, (_date, week, weekday) => (week < 10 ? 0 : ((week * 7 + weekday) % 8) + 1));
        const cells = cellsFor(calendar, textToPattern('HI'), 1, TO);
        for (const target of [1, 2, 3] as const) {
            const result = calibrate(calendar, cells, target);
            expect(result.exact, `level ${target}`).toBe(true);
            expect(result.achieved.every((level) => level === target)).toBe(true);
            const after = levelsAfter(calendar, result.dates, result.perCell);
            expect(result.dates.every((date) => after.get(date) === target)).toBe(true);
        }
    });

    it('reports the closest level when the target is impossible', () => {
        // painting alone on an empty calendar is always uniform, so always darkest
        const empty = makeCalendar(FROM, TO);
        const result = calibrate(empty, cellsFor(empty, textToPattern('HI'), 2, TO), 1);
        expect(result.exact).toBe(false);
        expect(result.capped).toBe(false);
        expect(result.perCell).toBe(1);
        expect(result.achieved.every((level) => level === 4)).toBe(true);
    });

    it('ignores cells that cannot be painted and handles nothing to paint', () => {
        const calendar = makeCalendar('2026-01-01', '2026-12-31');
        const cells = cellsFor(calendar, textToPattern('I'), calendar.weeks.length - 5, '2026-09-25');
        const result = calibrate(calendar, cells, 4);
        expect(result).toMatchObject({ perCell: 0, totalCommits: 0, achieved: [], dates: [], capped: false });
    });

    it('is fast enough to run on every edit', () => {
        const cells = cellsFor(busy, textToPattern('HIRE ME'), 10, TO);
        const start = performance.now();
        calibrate(busy, cells, 4, 100);
        expect(performance.now() - start).toBeLessThan(500);
    });
});

describe('commitPlan', () => {
    it('lists paintable dates in order with the per-cell count', () => {
        const plan = commitPlan(
            [
                { date: '2026-03-02', status: 'ok' },
                { date: '2026-01-05', status: 'ok' },
                { date: null, status: 'outOfBounds' },
                { date: '2026-12-01', status: 'future' },
                { date: '2026-02-10', status: 'ok' },
                { date: '2026-01-05', status: 'ok' },
            ],
            3,
        );
        expect(plan).toEqual([
            { date: '2026-01-05', count: 3 },
            { date: '2026-02-10', count: 3 },
            { date: '2026-03-02', count: 3 },
        ]);
    });

    it('is empty for a zero count', () => {
        expect(commitPlan([{ date: '2026-01-05', status: 'ok' }], 0)).toEqual([]);
    });
});

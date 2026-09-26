import { describe, expect, it } from 'vitest';
import { emptyPattern, togglePixel } from './pattern';
import { bestOffset, cellsFor, conflicts, defaultOffset, maxOffset } from './placement';
import { makeCalendar } from './testCalendar';
import { bar, HI, I } from './testPatterns';

// 52 whole weeks, Sunday 2025-09-28 .. Saturday 2026-09-26.
const FULL_FROM = '2025-09-28';
const FULL_TO = '2026-09-26';

describe('cellsFor', () => {
    it('maps lit pixels to calendar days in date order', () => {
        const calendar = makeCalendar(FULL_FROM, FULL_TO);
        const pattern = I;
        const cells = cellsFor(calendar, pattern, 1, FULL_TO);
        expect(cells).toHaveLength(9);
        expect(cells.every((cell) => cell.status === 'ok')).toBe(true);
        // I's top-left pixel sits on Monday of week 1
        expect(cells[0]).toEqual({ week: 1, weekday: 1, date: '2025-10-06', status: 'ok' });
        const dates = cells.map((cell) => cell.date!);
        expect([...dates].sort()).toEqual(dates);
    });

    it('marks pixels on the null slots of partial first/last weeks as outOfBounds', () => {
        // Thursday .. Wednesday: first week lacks Sun-Wed, last week lacks Thu-Sat
        const calendar = makeCalendar('2025-09-25', '2026-09-23');
        const pattern = I;

        const first = cellsFor(calendar, pattern, 0, '2026-09-23');
        const bad = first.filter((cell) => cell.status === 'outOfBounds');
        // column 0 of I is lit on Mon and Fri; Monday is before the range starts
        expect(bad).toEqual([{ week: 0, weekday: 1, date: null, status: 'outOfBounds' }]);

        const lastOffset = calendar.weeks.length - 3;
        const last = cellsFor(calendar, pattern, lastOffset, '2026-09-23');
        expect(last.some((cell) => cell.status === 'outOfBounds' && cell.week === calendar.weeks.length - 1)).toBe(true);
    });

    it('marks pixels past the last week as outOfBounds', () => {
        const calendar = makeCalendar(FULL_FROM, FULL_TO);
        const cells = cellsFor(calendar, I, calendar.weeks.length - 1, FULL_TO);
        expect(cells.filter((cell) => cell.status === 'outOfBounds')).toHaveLength(7);
        expect(cellsFor(calendar, I, -1, FULL_TO)[0]!.status).toBe('outOfBounds');
    });

    it('marks dates after today as future', () => {
        const calendar = makeCalendar('2026-01-01', '2026-12-31');
        const cells = cellsFor(calendar, I, calendar.weeks.length - 4, '2026-09-25');
        expect(cells.every((cell) => cell.status === 'future')).toBe(true);
    });
});

describe('defaultOffset', () => {
    it('rolling: ends at the current week when it is complete', () => {
        const calendar = makeCalendar(FULL_FROM, FULL_TO);
        const pattern = HI;
        expect(defaultOffset(calendar, pattern, 'rolling', FULL_TO)).toBe(52 - 7);
    });

    it('rolling: backs off when the current week would put pixels on missing days', () => {
        const calendar = makeCalendar('2025-09-25', '2026-09-23');
        const pattern = HI;
        const offset = defaultOffset(calendar, pattern, 'rolling', '2026-09-23');
        expect(offset).toBe(calendar.weeks.length - 1 - 7);
        expect(cellsFor(calendar, pattern, offset, '2026-09-23').every((cell) => cell.status === 'ok')).toBe(true);
    });

    it('rolling: never lands on future dates', () => {
        const calendar = makeCalendar('2026-01-01', '2026-12-31');
        const pattern = HI;
        const offset = defaultOffset(calendar, pattern, 'rolling', '2026-09-25');
        const cells = cellsFor(calendar, pattern, offset, '2026-09-25');
        expect(cells.every((cell) => cell.status === 'ok')).toBe(true);
        // and it is as late as possible: one more week would hit the future
        expect(cellsFor(calendar, pattern, offset + 1, '2026-09-25').some((cell) => cell.status !== 'ok')).toBe(true);
    });

    it('year: centers the pattern', () => {
        const calendar = makeCalendar(FULL_FROM, FULL_TO);
        expect(defaultOffset(calendar, HI, 'year', FULL_TO)).toBe(Math.floor((52 - 7) / 2));
        expect(defaultOffset(calendar, bar(11), 'year', FULL_TO)).toBe(Math.floor((52 - 11) / 2));
    });

    it('clamps to 0 for patterns wider than the calendar', () => {
        const calendar = makeCalendar('2026-09-06', '2026-09-26');
        expect(defaultOffset(calendar, bar(19), 'year', '2026-09-26')).toBe(0);
        expect(defaultOffset(calendar, bar(19), 'rolling', '2026-09-26')).toBe(0);
        expect(maxOffset(calendar, bar(19))).toBe(0);
    });
});

describe('conflicts', () => {
    it('counts real contributions in the pattern columns that are not lit', () => {
        const busy = new Map([
            ['2 0', 4], // week 2 Sunday: unlit row -> conflict
            ['2 1', 2], // Monday: I's top bar is lit -> fine
            ['2 2', 1], // Tuesday: column 0 of I is unlit here -> conflict
            ['5 3', 9], // outside the pattern's columns -> ignored
        ]);
        const calendar = makeCalendar(FULL_FROM, FULL_TO, (_date, week, weekday) => busy.get(`${week} ${weekday}`) ?? 0);
        const result = conflicts(calendar, I, 2);
        expect(result.count).toBe(2);
        expect(result.cells.map((cell) => [cell.week, cell.weekday, cell.count])).toEqual([
            [2, 0, 4],
            [2, 2, 1],
        ]);
    });

    it('ignores columns that fall off the calendar', () => {
        const calendar = makeCalendar(FULL_FROM, FULL_TO, () => 1);
        const pattern = togglePixel(emptyPattern(2), 0, 0, true);
        expect(conflicts(calendar, pattern, calendar.weeks.length - 1).count).toBe(6);
    });
});

describe('bestOffset', () => {
    // Weeks 0..25 are empty, 26..51 have a commit every day.
    const halfBusy = makeCalendar(FULL_FROM, FULL_TO, (_date, week) => (week >= 26 ? 3 : 0));

    it('finds the empty region (rolling prefers the latest spot)', () => {
        const best = bestOffset(halfBusy, HI, 'rolling', FULL_TO);
        expect(best).toEqual({ offset: 26 - 7, conflicts: 0 });
    });

    it('finds the empty region (year prefers the spot closest to center)', () => {
        const calendar = makeCalendar(FULL_FROM, FULL_TO, (_date, week) => (week < 26 ? 3 : 0));
        const best = bestOffset(calendar, HI, 'year', FULL_TO);
        expect(best).toEqual({ offset: 26, conflicts: 0 });
    });

    it('breaks ties by mode on an empty calendar', () => {
        const calendar = makeCalendar(FULL_FROM, FULL_TO);
        const pattern = HI;
        expect(bestOffset(calendar, pattern, 'rolling', FULL_TO)?.offset).toBe(45);
        expect(bestOffset(calendar, pattern, 'year', FULL_TO)?.offset).toBe(22);
    });

    it('takes the least-bad spot when nothing is clean', () => {
        const calendar = makeCalendar(FULL_FROM, FULL_TO, (_date, week) => (week === 10 ? 0 : 1));
        const pattern = I;
        const best = bestOffset(calendar, pattern, 'rolling', FULL_TO);
        // I leaves 12 cells unlit; parking an outer column (5 unlit) on week 10 saves 5.
        // Offsets 8 and 10 both do that, rolling takes the later one.
        expect(best).toEqual({ offset: 10, conflicts: 7 });
    });

    it('skips spots with future or missing days', () => {
        const calendar = makeCalendar('2026-01-01', '2026-12-31');
        const pattern = HI;
        const best = bestOffset(calendar, pattern, 'rolling', '2026-09-25');
        expect(best).not.toBeNull();
        expect(best!.offset).toBe(defaultOffset(calendar, pattern, 'rolling', '2026-09-25'));
    });

    it('returns null when the pattern cannot fit', () => {
        const small = makeCalendar('2026-09-06', '2026-09-26');
        expect(bestOffset(small, bar(19), 'rolling', '2026-09-26')).toBeNull();
        expect(bestOffset(halfBusy, emptyPattern(0), 'rolling', FULL_TO)).toBeNull();
        const future = makeCalendar('2026-10-04', '2026-12-26');
        expect(bestOffset(future, I, 'year', '2026-09-25')).toBeNull();
    });
});

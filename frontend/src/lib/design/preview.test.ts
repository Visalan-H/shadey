import { describe, expect, it } from 'vitest';
import { textToPattern } from './pattern';
import { buildPreview, cellKey, todayUtc } from './preview';
import { makeCalendar } from './testCalendar';

const I = textToPattern('I'); // 3 columns, rows 1-5

describe('buildPreview', () => {
    it('places every lit pixel and plans one commit day per pixel', () => {
        const calendar = makeCalendar('2024-01-07', '2024-03-30', () => 0);
        const preview = buildPreview(calendar, I, 2, 4, '2025-01-01');

        expect(preview.misfits).toBe(0);
        expect(preview.plan).toHaveLength(preview.cells.length);
        expect(preview.plan.every((d) => d.count === preview.calibration.perCell)).toBe(true);
        // "I" top bar: Monday of all three columns.
        for (const week of [2, 3, 4]) expect(preview.overlay.get(cellKey(week, 1))?.level).toBe(4);
        expect(preview.overlay.get(cellKey(2, 0))).toBeUndefined();
    });

    it('flags pixels past today or off the graph', () => {
        const calendar = makeCalendar('2024-01-07', '2024-01-27');
        const preview = buildPreview(calendar, I, 1, 4, '2024-01-20');

        // Week 2 (Jan 21-27) is in the future; column 2 would be week 3, which does not exist.
        expect(preview.misfits).toBeGreaterThan(0);
        expect(preview.overlay.get(cellKey(3, 1))).toMatchObject({ highlight: 'outOfBounds' });
        expect(preview.plan.every((d) => d.date <= '2024-01-20')).toBe(true);
    });

    it('highlights real commits in the gaps and totals them', () => {
        // "I" leaves Tuesday of its first column dark.
        const calendar = makeCalendar('2024-01-07', '2024-03-30', (_d, week, weekday) => (week === 2 && weekday === 2 ? 5 : 0));
        const preview = buildPreview(calendar, I, 2, 4, '2025-01-01');

        expect(preview.conflicts).toHaveLength(1);
        expect(preview.conflictCommits).toBe(5);
        expect(preview.overlay.get(cellKey(2, 2))).toEqual({ highlight: 'conflict' });
    });
});

describe('todayUtc', () => {
    it('formats the UTC date', () => {
        expect(todayUtc(new Date('2025-03-04T23:30:00-05:00'))).toBe('2025-03-05');
    });
});

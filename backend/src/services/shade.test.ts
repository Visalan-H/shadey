import { describe, expect, it } from 'vitest';
import type { Calendar, CalendarDay, Level } from '../types.js';
import { levelsFor, planTopUp } from './shade.js';

// One week column per day is enough here; planTopUp only looks at dates, counts and levels.
function calendar(days: [date: string, count: number, level: Level][]): Calendar {
    const weeks = days.map(([date, count, level]): (CalendarDay | null)[] => [{ date, count, level }]);
    return { login: 'octo', from: days[0]![0], to: days.at(-1)![0], weeks };
}

describe('levelsFor', () => {
    it('splits non-zero days into quartiles', () => {
        expect(levelsFor([0, 1, 2, 3, 4])).toEqual([0, 1, 2, 3, 4]);
        expect(levelsFor([0, 0])).toEqual([0, 0]);
    });
});

describe('planTopUp', () => {
    const busy = Array.from({ length: 8 }, (_, i): [string, number, Level] => [`2024-02-0${i + 1}`, 10, 4]);

    it('finds nothing to do when every painted day is at the target', () => {
        const cal = calendar([...busy, ['2024-03-01', 10, 4]]);
        expect(planTopUp(cal, ['2024-03-01'], 4, 100)).toEqual({ dates: [], perCell: 0, capped: false });
    });

    it('adds the fewest commits that lift the light days to the target', () => {
        const cal = calendar([...busy, ['2024-03-01', 2, 1], ['2024-03-02', 2, 1], ['2024-03-03', 10, 4]]);
        // 2 + 8 = 10 matches the busiest days, the lowest count that reaches the top quartile.
        expect(planTopUp(cal, ['2024-03-01', '2024-03-02', '2024-03-03'], 4, 100)).toEqual({
            dates: ['2024-03-01', '2024-03-02'],
            perCell: 8,
            capped: false,
        });
    });

    it('ignores light days that are not part of the painting', () => {
        const cal = calendar([...busy, ['2024-03-01', 1, 1], ['2024-03-02', 10, 4]]);
        expect(planTopUp(cal, ['2024-03-02'], 4, 100).dates).toEqual([]);
    });

    it('stops at the cap and says so', () => {
        const cal = calendar([...busy, ['2024-03-01', 2, 1]]);
        expect(planTopUp(cal, ['2024-03-01'], 4, 3)).toEqual({ dates: ['2024-03-01'], perCell: 3, capped: true });
    });
});

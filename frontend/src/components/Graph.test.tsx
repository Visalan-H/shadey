import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Calendar, CalendarDay, Level } from '../lib/types';
import { Graph } from './Graph';

function day(date: string, count: number, level: Level): CalendarDay {
    return { date, count, level };
}

// 2025-03-01 is a Saturday, so the first week has one day and the last week three.
const calendar: Calendar = {
    login: 'octocat',
    from: '2025-03-01',
    to: '2025-03-11',
    weeks: [
        [null, null, null, null, null, null, day('2025-03-01', 0, 0)],
        [
            day('2025-03-02', 3, 2),
            day('2025-03-03', 1, 1),
            day('2025-03-04', 0, 0),
            day('2025-03-05', 7, 3),
            day('2025-03-06', 12, 4),
            day('2025-03-07', 0, 0),
            day('2025-03-08', 0, 0),
        ],
        [day('2025-03-09', 2, 1), day('2025-03-10', 0, 0), day('2025-03-11', 5, 3), null, null, null, null],
    ],
};

function cells(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLElement>('[data-level]'));
}

afterEach(cleanup);

describe('Graph', () => {
    it('renders one cell per day with its level', () => {
        const { container } = render(<Graph calendar={calendar} />);
        expect(cells(container)).toHaveLength(11);
        const levels = cells(container).map((c) => c.dataset.level);
        expect(levels.filter((l) => l === '0')).toHaveLength(5);
        expect(levels.filter((l) => l === '4')).toHaveLength(1);

        const cell = screen.getByRole('img', { name: '3 contributions on 2025-03-02' });
        expect(cell).toHaveAttribute('data-level', '2');
        expect(cell).toHaveAttribute('title', '3 contributions on 2025-03-02');
        expect(screen.getByRole('img', { name: '1 contribution on 2025-03-03' })).toBeInTheDocument();
        expect(cells(container).some((c) => c.className.includes('opacity'))).toBe(false);
    });

    it('labels weekdays and months', () => {
        render(<Graph calendar={calendar} />);
        expect(screen.getByText('Mon')).toBeInTheDocument();
        expect(screen.getByText('Wed')).toBeInTheDocument();
        expect(screen.getByText('Fri')).toBeInTheDocument();
        expect(screen.getByText('Mar')).toBeInTheDocument();
    });

    it('draws overlay levels over the real graph and highlights cells', () => {
        const { container } = render(
            <Graph
                calendar={calendar}
                overlay={(week, weekday, d) => {
                    if (week === 1 && weekday === 0) return { level: 4, highlight: 'conflict' };
                    if (week === 1 && weekday === 1) return { level: 4 };
                    if (week === 2 && weekday === 6 && d === null) return { highlight: 'outOfBounds' };
                    return undefined;
                }}
            />,
        );

        const painted = screen.getByRole('img', { name: '3 contributions on 2025-03-02' });
        expect(painted).toHaveAttribute('data-level', '4');
        expect(painted).toHaveAttribute('data-highlight', 'conflict');
        expect(painted.className).toContain('ring-amber-400');
        expect(painted.className).not.toContain('opacity');

        // Real cells not covered by the overlay are dimmed.
        const real = screen.getByRole('img', { name: '12 contributions on 2025-03-06' });
        expect(real).toHaveAttribute('data-level', '4');
        expect(real.className).toContain('opacity-60');

        // A cell outside the calendar still shows the out-of-bounds ring.
        const outside = container.querySelector('[data-highlight="outOfBounds"]');
        expect(outside?.className).toContain('ring-red-500');
        expect(outside).not.toHaveAttribute('data-level');
    });
});

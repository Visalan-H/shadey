import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { makeCalendar } from '../../lib/design/testCalendar';
import type { Calendar } from '../../lib/types';
import { DesignPanel } from './DesignPanel';

// A past year, so no pixel is ever in the future.
function calendar(countFor?: (date: string, week: number, weekday: number) => number): Calendar {
    return { ...makeCalendar('2024-01-01', '2024-12-31', countFor), login: 'octo' };
}

function renderPanel(cal = calendar(), { rolling = false } = {}) {
    render(<DesignPanel calendar={cal} year={rolling ? undefined : 2024} />);
}

function paintedCells() {
    return document.querySelectorAll('[data-level]:not([data-level="0"])');
}

afterEach(cleanup);

describe('DesignPanel', () => {
    it('draws typed text over the graph', async () => {
        renderPanel();
        expect(paintedCells()).toHaveLength(0);
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        // H = 11 pixels, I = 9.
        expect(paintedCells()).toHaveLength(20);
    });

    it('warns about real commits inside the painting and finds a clear spot', async () => {
        // Commits all over the middle of the year, where a year-mode painting starts.
        renderPanel(calendar((_d, week) => (week >= 20 && week <= 32 ? 3 : 0)));
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        expect(screen.getByText(/of your commits on .* overlap here/)).toBeInTheDocument();
        expect(document.querySelectorAll('[data-highlight="conflict"]').length).toBeGreaterThan(0);

        await userEvent.click(screen.getByRole('button', { name: 'Find best spot' }));
        expect(screen.getByText('Moved to a spot with no overlapping commits.')).toBeInTheDocument();
        expect(screen.queryByText(/overlap here/)).not.toBeInTheDocument();
    });

    it('limits the slider to spots inside the graph', async () => {
        renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        const slider = screen.getByLabelText('Position');
        expect(slider).toHaveAttribute('max', String(53 - 7));
        expect(screen.queryByText(/outside the graph/)).not.toBeInTheDocument();
    });

    it('warns that the last-12-months painting slides off', async () => {
        renderPanel(calendar(), { rolling: true });
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        expect(screen.getByText(/slides left every week/)).toBeInTheDocument();
    });

    it('starts the pixel editor from the text', async () => {
        renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'I');
        await userEvent.click(screen.getByRole('tab', { name: 'Draw' }));
        const editor = screen.getByRole('group', { name: 'Pixel editor' });
        // "I" plus a blank column either side.
        expect(within(editor).getAllByRole('button', { pressed: true })).toHaveLength(9);
        expect(within(editor).getAllByRole('button')).toHaveLength(7 * 5);
    });

    it('updates the graph live while drawing', async () => {
        renderPanel();
        await userEvent.click(screen.getByRole('tab', { name: 'Draw' }));
        expect(paintedCells()).toHaveLength(0);
        await userEvent.click(screen.getByRole('button', { name: 'Monday, column 3' }));
        await userEvent.click(screen.getByRole('button', { name: 'Tuesday, column 4' }));
        expect(paintedCells()).toHaveLength(2);
    });
});

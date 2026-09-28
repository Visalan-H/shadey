import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyPattern } from '../../lib/design';
import type { Pattern } from '../../lib/types';
import { PixelEditor } from './PixelEditor';

function Harness({ start = emptyPattern(4) }: { start?: Pattern }) {
    const [pattern, setPattern] = useState(start);
    return <PixelEditor pattern={pattern} onChange={setPattern} />;
}

const cell = (weekday: string, col: number) => screen.getByRole('button', { name: `${weekday}, column ${col}` });
const lit = () => within(screen.getByRole('group', { name: 'Pixel editor' })).queryAllByRole('button', { pressed: true });

afterEach(cleanup);

describe('PixelEditor', () => {
    it('paints and unpaints a cell with a click', async () => {
        render(<Harness />);
        await userEvent.click(cell('Monday', 2));
        expect(cell('Monday', 2)).toHaveAttribute('aria-pressed', 'true');
        await userEvent.click(cell('Monday', 2));
        expect(cell('Monday', 2)).toHaveAttribute('aria-pressed', 'false');
    });

    it('paints along a drag with one pointer', () => {
        render(<Harness />);
        const grid = screen.getByRole('group', { name: 'Pixel editor' });
        fireEvent.pointerDown(cell('Sunday', 1), { pointerId: 1, button: 0 });
        fireEvent.pointerMove(cell('Sunday', 2), { pointerId: 1 });
        fireEvent.pointerMove(cell('Monday', 3), { pointerId: 1 });
        // A second finger doesn't join the stroke.
        fireEvent.pointerMove(cell('Tuesday', 4), { pointerId: 2 });
        fireEvent.pointerUp(grid, { pointerId: 1 });
        fireEvent.pointerMove(cell('Wednesday', 4), { pointerId: 1 });
        expect(lit()).toHaveLength(3);
    });

    it('scrolls instead of drawing when a second finger lands', () => {
        render(<Harness />);
        const grid = screen.getByRole('group', { name: 'Pixel editor' });
        const scroller = grid.parentElement!;
        scroller.scrollBy = vi.fn();
        const pageScroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});

        fireEvent.pointerDown(cell('Sunday', 1), { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
        expect(lit()).toHaveLength(1);
        fireEvent.pointerDown(cell('Sunday', 3), { pointerId: 2, button: 0, clientX: 140, clientY: 100 });
        // The first finger's pixel is taken back and leaves nothing to undo.
        expect(lit()).toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

        fireEvent.pointerMove(cell('Monday', 1), { pointerId: 1, clientX: 60, clientY: 90 });
        expect(scroller.scrollBy).toHaveBeenCalledWith(20, 0);
        expect(pageScroll).toHaveBeenCalledWith(0, 5);
        expect(lit()).toHaveLength(0);
        pageScroll.mockRestore();
    });

    it('erases in erase mode, and undo brings the stroke back', async () => {
        const start = emptyPattern(3).map((row) => row.map(() => true));
        render(<Harness start={start} />);
        await userEvent.click(screen.getByRole('button', { name: 'Erase' }));
        await userEvent.click(cell('Friday', 1));
        expect(lit()).toHaveLength(20);
        await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(lit()).toHaveLength(21);
    });

    it('toggles from the keyboard', async () => {
        render(<Harness />);
        cell('Saturday', 4).focus();
        await userEvent.keyboard('{Enter}');
        expect(cell('Saturday', 4)).toHaveAttribute('aria-pressed', 'true');
    });

    it('clears and resizes the canvas', async () => {
        const start = emptyPattern(2);
        start[0] = [true, false];
        render(<Harness start={start} />);
        await userEvent.click(screen.getByRole('button', { name: 'Add column' }));
        expect(cell('Sunday', 3)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Remove column' }));
        await userEvent.click(screen.getByRole('button', { name: 'Remove column' }));
        expect(screen.queryByRole('button', { name: 'Sunday, column 2' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove column' })).toBeDisabled();
        await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
        expect(lit()).toHaveLength(0);
    });
});

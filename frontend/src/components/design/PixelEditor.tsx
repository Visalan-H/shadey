import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { emptyPattern, litCount, patternWidth, togglePixel } from '../../lib/design';
import type { Pattern } from '../../lib/types';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_COLUMNS = 53;
const HISTORY_LIMIT = 100;

interface Props {
    pattern: Pattern;
    onChange: (pattern: Pattern) => void;
}

interface Stroke {
    pointerId: number;
    value: boolean;
    pattern: Pattern;
}

function cellAt(target: EventTarget | null, x: number, y: number): { row: number; col: number } | null {
    // With pointer capture every move is targeted at the grid, so find the cell under the finger.
    const hit = Number.isFinite(x) && Number.isFinite(y) && document.elementFromPoint ? document.elementFromPoint(x, y) : null;
    const el = (hit ?? (target instanceof Element ? target : null))?.closest<HTMLElement>('[data-cell]');
    if (!el) return null;
    const row = Number(el.dataset.row);
    const col = Number(el.dataset.col);
    return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
}

export function PixelEditor({ pattern, onChange }: Props) {
    const [mode, setMode] = useState<'paint' | 'erase'>('paint');
    const [history, setHistory] = useState<Pattern[]>([]);
    const stroke = useRef<Stroke | null>(null);
    const width = patternWidth(pattern);

    function remember(previous: Pattern) {
        setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), previous]);
    }

    function change(next: Pattern) {
        if (next === pattern) return;
        remember(pattern);
        onChange(next);
    }

    function onPointerDown(e: PointerEvent<HTMLDivElement>) {
        if (e.button !== undefined && e.button > 0) return;
        const cell = cellAt(e.target, e.clientX, e.clientY);
        if (!cell) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        // Paint mode toggles the first cell and keeps drawing that value, so dragging from a
        // lit cell erases; erase mode always clears.
        const value = mode === 'erase' ? false : !pattern[cell.row]?.[cell.col];
        const next = togglePixel(pattern, cell.row, cell.col, value);
        stroke.current = { pointerId: e.pointerId, value, pattern: next };
        remember(pattern);
        if (next !== pattern) onChange(next);
    }

    function onPointerMove(e: PointerEvent<HTMLDivElement>) {
        const current = stroke.current;
        if (!current || current.pointerId !== e.pointerId) return;
        const cell = cellAt(e.target, e.clientX, e.clientY);
        if (!cell) return;
        // Moves can arrive faster than re-renders, so build on the stroke's own copy.
        const next = togglePixel(current.pattern, cell.row, cell.col, current.value);
        if (next === current.pattern) return;
        current.pattern = next;
        onChange(next);
    }

    function endStroke() {
        stroke.current = null;
    }

    // Keyboard activation (Enter/Space) arrives as a click with detail 0; pointer clicks are
    // already handled on pointerdown.
    function onCellClick(e: MouseEvent<HTMLButtonElement>, row: number, col: number) {
        if (e.detail !== 0) return;
        change(togglePixel(pattern, row, col, mode === 'erase' ? false : undefined));
    }

    function undo() {
        const previous = history.at(-1);
        if (!previous) return;
        setHistory((h) => h.slice(0, -1));
        onChange(previous);
    }

    function addColumn() {
        if (width >= MAX_COLUMNS) return;
        change(pattern.map((row) => [...row, false]));
    }

    function removeColumn() {
        if (width <= 1) return;
        change(pattern.map((row) => row.slice(0, -1)));
    }

    const toolClass =
        'rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:hover:bg-neutral-800';
    const pressedClass = 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Pixel editor tools">
                <div className="flex">
                    <button
                        type="button"
                        aria-pressed={mode === 'paint'}
                        onClick={() => setMode('paint')}
                        className={`${toolClass} rounded-r-none ${mode === 'paint' ? pressedClass : ''}`}
                    >
                        Paint
                    </button>
                    <button
                        type="button"
                        aria-pressed={mode === 'erase'}
                        onClick={() => setMode('erase')}
                        className={`${toolClass} -ml-px rounded-l-none ${mode === 'erase' ? pressedClass : ''}`}
                    >
                        Erase
                    </button>
                </div>
                <button type="button" onClick={undo} disabled={history.length === 0} className={toolClass}>
                    Undo
                </button>
                <button type="button" onClick={() => change(emptyPattern(width))} disabled={litCount(pattern) === 0} className={toolClass}>
                    Clear
                </button>
                <span className="ml-auto flex items-center gap-1 text-sm text-neutral-500">
                    Columns
                    <button type="button" onClick={removeColumn} disabled={width <= 1} className={toolClass} aria-label="Remove column">
                        −
                    </button>
                    <span className="w-6 text-center tabular-nums">{width}</span>
                    <button type="button" onClick={addColumn} disabled={width >= MAX_COLUMNS} className={toolClass} aria-label="Add column">
                        +
                    </button>
                </span>
            </div>
            <div className="max-w-full overflow-x-auto p-1">
                <div
                    role="group"
                    aria-label="Pixel editor"
                    className="inline-grid touch-none select-none gap-0.5"
                    style={{ gridTemplateColumns: `repeat(${width}, 1.5rem)`, gridTemplateRows: 'repeat(7, 1.5rem)', touchAction: 'none' }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endStroke}
                    onPointerCancel={endStroke}
                    onLostPointerCapture={endStroke}
                >
                    {pattern.map((row, r) =>
                        row.map((on, c) => (
                            <button
                                key={`${r}-${c}`}
                                type="button"
                                data-cell=""
                                data-row={r}
                                data-col={c}
                                aria-pressed={on}
                                aria-label={`${WEEKDAYS[r]}, column ${c + 1}`}
                                onClick={(e) => onCellClick(e, r, c)}
                                className={`rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-green-600 ${
                                    on ? 'bg-[#216e39] dark:bg-[#39d353]' : 'bg-[#ebedf0] hover:bg-neutral-300 dark:bg-[#161b22] dark:hover:bg-neutral-700'
                                }`}
                                style={{ gridRow: r + 1, gridColumn: c + 1 }}
                            />
                        )),
                    )}
                </div>
            </div>
        </div>
    );
}

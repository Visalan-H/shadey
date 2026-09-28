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
    // The pattern before the stroke, restored if a second finger turns it into a scroll.
    before: Pattern;
}

interface Point {
    x: number;
    y: number;
}

function midpoint(points: Iterable<Point>): Point {
    const all = [...points];
    return { x: all.reduce((n, p) => n + p.x, 0) / all.length, y: all.reduce((n, p) => n + p.y, 0) / all.length };
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
    // One finger draws; two fingers scroll the grid and the page, like drawing apps.
    const pointers = useRef(new Map<number, Point>());
    const pan = useRef<Point | null>(null);
    const scroller = useRef<HTMLDivElement>(null);
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
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size > 1) {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            const current = stroke.current;
            if (current) {
                // The first finger landed a moment earlier and already drew; take that back.
                stroke.current = null;
                setHistory((h) => h.slice(0, -1));
                onChange(current.before);
            }
            pan.current = midpoint(pointers.current.values());
            return;
        }
        const cell = cellAt(e.target, e.clientX, e.clientY);
        if (!cell) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        // Paint mode toggles the first cell and keeps drawing that value, so dragging from a
        // lit cell erases; erase mode always clears.
        const value = mode === 'erase' ? false : !pattern[cell.row]?.[cell.col];
        const next = togglePixel(pattern, cell.row, cell.col, value);
        stroke.current = { pointerId: e.pointerId, value, pattern: next, before: pattern };
        remember(pattern);
        if (next !== pattern) onChange(next);
    }

    function onPointerMove(e: PointerEvent<HTMLDivElement>) {
        if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pan.current) {
            const mid = midpoint(pointers.current.values());
            scroller.current?.scrollBy(pan.current.x - mid.x, 0);
            window.scrollBy(0, pan.current.y - mid.y);
            pan.current = mid;
            return;
        }
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

    function endPointer(e: PointerEvent<HTMLDivElement>) {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pan.current = null;
        if (stroke.current?.pointerId === e.pointerId) stroke.current = null;
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

    // Same look as the Text/Draw switch above, so both read as "pick one".
    const toolClass = (on: boolean) =>
        `rounded-[5px] border px-3 py-[3px] text-sm ${on ? 'border-line bg-canvas font-semibold' : 'border-transparent hover:text-fg text-muted'}`;
    const stepClass = 'btn w-8 px-0';

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Pixel editor tools">
                <div role="group" aria-label="Tool" className="flex rounded-md bg-btn-hover p-0.5">
                    <button type="button" aria-pressed={mode === 'paint'} onClick={() => setMode('paint')} className={toolClass(mode === 'paint')}>
                        Paint
                    </button>
                    <button type="button" aria-pressed={mode === 'erase'} onClick={() => setMode('erase')} className={toolClass(mode === 'erase')}>
                        Erase
                    </button>
                </div>
                <button type="button" onClick={undo} disabled={history.length === 0} className="btn">
                    Undo
                </button>
                <button type="button" onClick={() => change(emptyPattern(width))} disabled={litCount(pattern) === 0} className="btn">
                    Clear
                </button>
            </div>
            <div ref={scroller} className="max-w-full overflow-x-auto p-1">
                <div
                    role="group"
                    aria-label="Pixel editor"
                    className="inline-grid touch-none select-none gap-0.5"
                    style={{ gridTemplateColumns: `repeat(${width}, 1.5rem)`, gridTemplateRows: 'repeat(7, 1.5rem)', touchAction: 'none' }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endPointer}
                    onPointerCancel={endPointer}
                    onLostPointerCapture={endPointer}
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
                                className={`rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
                                    on ? 'bg-lvl-4' : 'bg-lvl-0 outline outline-1 -outline-offset-1 outline-cell-line hover:bg-btn-hover'
                                }`}
                                style={{ gridRow: r + 1, gridColumn: c + 1 }}
                            />
                        )),
                    )}
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2 text-sm">
                    <button type="button" onClick={removeColumn} disabled={width <= 1} className={stepClass} aria-label="Remove column">
                        −
                    </button>
                    <span className="tabular-nums">
                        {width} column{width === 1 ? '' : 's'}
                    </span>
                    <button type="button" onClick={addColumn} disabled={width >= MAX_COLUMNS} className={stepClass} aria-label="Add column">
                        +
                    </button>
                </div>
                <p className="hidden text-sm text-muted pointer-coarse:block">Two fingers to scroll</p>
            </div>
        </div>
    );
}

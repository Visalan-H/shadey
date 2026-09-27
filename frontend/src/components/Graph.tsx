import { useEffect, useRef, type ReactNode } from 'react';
import type { Calendar, CalendarDay, Level } from '../lib/types';

export interface GraphOverlayCell {
    level?: Level;
    highlight?: 'conflict' | 'outOfBounds';
}

export type GraphOverlay = (week: number, weekday: number, day: CalendarDay | null) => GraphOverlayCell | undefined;

export interface GraphProps {
    calendar: Calendar;
    overlay?: GraphOverlay;
    // Week column to keep in view when the graph is wider than the screen (phones).
    focusWeek?: number;
}

// GitHub's own palette, light and dark, from the theme tokens in index.css.
const LEVEL_CLASSES: Record<Level, string> = {
    0: 'bg-lvl-0',
    1: 'bg-lvl-1',
    2: 'bg-lvl-2',
    3: 'bg-lvl-3',
    4: 'bg-lvl-4',
};

const HIGHLIGHT_CLASSES = {
    conflict: 'ring-2 ring-amber-400',
    outOfBounds: 'ring-2 ring-red-500',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const CELL = 12;
const GAP = 3;

export function describeDay(day: CalendarDay) {
    return `${day.count} contribution${day.count === 1 ? '' : 's'} on ${day.date}`;
}

// A label goes on the first week column of each month, skipped when the previous label
// is too close (the partial first month would otherwise collide with the next one).
function monthLabels(weeks: Calendar['weeks']) {
    const labels: { week: number; text: string }[] = [];
    let last = -1;
    weeks.forEach((week, i) => {
        const first = week.find((d) => d !== null);
        if (!first) return;
        const month = Number(first.date.slice(5, 7)) - 1;
        if (month === last) return;
        last = month;
        const prev = labels.at(-1);
        if (prev && i - prev.week < 3) labels.pop();
        labels.push({ week: i, text: MONTHS[month]! });
    });
    return labels;
}

export function Graph({ calendar, overlay, focusWeek }: GraphProps) {
    const scroller = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = scroller.current;
        if (!el || focusWeek === undefined || el.scrollWidth <= el.clientWidth) return;
        // Roughly: day labels take ~28px, then one CELL + GAP per week.
        const x = 28 + focusWeek * (CELL + GAP);
        el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
    }, [focusWeek]);

    const cells = calendar.weeks.map((week, w) =>
        Array.from({ length: 7 }, (_, d) => {
            const day = week[d] ?? null;
            return { day, over: overlay?.(w, d, day) };
        }),
    );
    // Only dim the real graph when something is actually drawn over it.
    const dimReal = cells.some((week) => week.some((c) => c.over?.level !== undefined));

    return (
        <div ref={scroller} className="max-w-full overflow-x-auto p-1">
            <div
                className="inline-grid text-xs leading-none text-fg"
                style={{
                    gridTemplateColumns: `auto repeat(${calendar.weeks.length}, ${CELL}px)`,
                    gridTemplateRows: `auto repeat(7, ${CELL}px)`,
                    gap: GAP,
                }}
            >
                {monthLabels(calendar.weeks).map((m) => (
                    <span
                        key={m.week}
                        className="whitespace-nowrap pb-1"
                        style={{ gridRow: 1, gridColumn: m.week + 2 }}
                        aria-hidden="true"
                    >
                        {m.text}
                    </span>
                ))}
                {DAY_LABELS.map((label, d) => (
                    <span key={d} className="pr-1 self-center" style={{ gridRow: d + 2, gridColumn: 1 }} aria-hidden="true">
                        {label}
                    </span>
                ))}
                {cells.map((week, w) =>
                    week.map(({ day, over }, d) => {
                        if (!day && !over) return null;
                        const drawn = over?.level ?? day?.level;
                        const classes = [
                            'rounded-[2px] outline outline-1 -outline-offset-1 outline-cell-line',
                            drawn === undefined ? '' : LEVEL_CLASSES[drawn],
                            dimReal && over?.level === undefined ? 'opacity-60' : '',
                            over?.highlight ? HIGHLIGHT_CLASSES[over.highlight] : '',
                        ];
                        return (
                            <div
                                key={`${w}-${d}`}
                                role={day ? 'img' : undefined}
                                title={day ? describeDay(day) : undefined}
                                aria-label={day ? describeDay(day) : undefined}
                                data-level={drawn}
                                data-highlight={over?.highlight}
                                className={classes.filter(Boolean).join(' ')}
                                style={{ gridRow: d + 2, gridColumn: w + 2 }}
                            />
                        );
                    }),
                )}
            </div>
        </div>
    );
}

// GitHub's "Less ... More" key under the graph.
export function GraphLegend({ children }: { children?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
            <span>{children}</span>
            <span className="flex items-center gap-[3px]" aria-hidden="true">
                <span className="mr-1">Less</span>
                {([0, 1, 2, 3, 4] as const).map((level) => (
                    <i key={level} className={`h-2.5 w-2.5 rounded-[2px] outline outline-1 -outline-offset-1 outline-cell-line ${LEVEL_CLASSES[level]}`} />
                ))}
                <span className="ml-1">More</span>
            </span>
        </div>
    );
}

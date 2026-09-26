import type { Calendar, CalendarDay, Level } from '../lib/types';

export interface GraphOverlayCell {
    level?: Level;
    highlight?: 'conflict' | 'outOfBounds';
}

export type GraphOverlay = (week: number, weekday: number, day: CalendarDay | null) => GraphOverlayCell | undefined;

export interface GraphProps {
    calendar: Calendar;
    overlay?: GraphOverlay;
}

// GitHub's own palette, light and dark.
const LEVEL_CLASSES: Record<Level, string> = {
    0: 'bg-[#ebedf0] dark:bg-[#161b22]',
    1: 'bg-[#9be9a8] dark:bg-[#0e4429]',
    2: 'bg-[#40c463] dark:bg-[#006d32]',
    3: 'bg-[#30a14e] dark:bg-[#26a641]',
    4: 'bg-[#216e39] dark:bg-[#39d353]',
};

const HIGHLIGHT_CLASSES = {
    conflict: 'ring-2 ring-amber-400',
    outOfBounds: 'ring-2 ring-red-500',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const CELL = 10;
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

export function Graph({ calendar, overlay }: GraphProps) {
    const cells = calendar.weeks.map((week, w) =>
        Array.from({ length: 7 }, (_, d) => {
            const day = week[d] ?? null;
            return { day, over: overlay?.(w, d, day) };
        }),
    );
    // Only dim the real graph when something is actually drawn over it.
    const dimReal = cells.some((week) => week.some((c) => c.over?.level !== undefined));

    return (
        <div className="max-w-full overflow-x-auto p-1">
            <div
                className="inline-grid text-[10px] leading-none text-neutral-500 dark:text-neutral-400"
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
                            'rounded-[2px]',
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

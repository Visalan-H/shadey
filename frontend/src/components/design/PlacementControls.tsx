import type { Calendar } from '../../lib/types';

interface Props {
    calendar: Calendar;
    offset: number;
    maxOffset: number;
    onOffsetChange: (offset: number) => void;
    onFindBest: () => void;
    bestNote: string | null;
    rolling: boolean;
    misfits: number;
    conflictDays: number;
    conflictCommits: number;
    tooWide: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekLabel(calendar: Calendar, week: number) {
    const day = calendar.weeks[week]?.find((d) => d !== null);
    if (!day) return '';
    const [y, m, d] = day.date.split('-').map(Number);
    return `${MONTHS[m! - 1]} ${d}, ${y}`;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

export function PlacementControls(props: Props) {
    const { calendar, offset, maxOffset, rolling, misfits, conflictDays, conflictCommits, tooWide } = props;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="offset" className="text-sm font-medium">
                    Position
                </label>
                <input
                    id="offset"
                    type="range"
                    min={0}
                    max={maxOffset}
                    step={1}
                    value={offset}
                    disabled={maxOffset === 0}
                    onChange={(e) => props.onOffsetChange(Number(e.target.value))}
                    aria-valuetext={`Starts the week of ${weekLabel(calendar, offset)}`}
                    className="min-w-0 flex-1 basis-40 accent-green-700"
                />
                <button
                    type="button"
                    onClick={props.onFindBest}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                    Find best spot
                </button>
            </div>
            <p className="text-sm text-neutral-500">Starts the week of {weekLabel(calendar, offset)}.</p>
            <div className="flex flex-col gap-1 text-sm" aria-live="polite">
                {props.bestNote && <p>{props.bestNote}</p>}
                {tooWide ? (
                    <p className="text-red-700 dark:text-red-400">This painting is wider than the graph. Shorten the text or remove columns.</p>
                ) : (
                    misfits > 0 && (
                        <p className="text-red-700 dark:text-red-400">
                            {plural(misfits, 'pixel')} {misfits === 1 ? 'falls' : 'fall'} outside the graph or on a future day (outlined in
                            red). Move the painting so every pixel fits.
                        </p>
                    )
                )}
                {conflictDays > 0 && (
                    <p className="text-amber-700 dark:text-amber-400">
                        {conflictCommits.toLocaleString()} of your commit{conflictCommits === 1 ? '' : 's'} on {plural(conflictDays, 'day')}{' '}
                        {conflictCommits === 1 ? 'overlaps' : 'overlap'} here (outlined in amber). They will show as stray green inside the
                        painting. You can still paint.
                    </p>
                )}
                {rolling && (
                    <p className="text-neutral-600 dark:text-neutral-400">
                        On the last-12-months graph the painting slides left every week and is gone in about a year. Pick a past year
                        above to keep it for good.
                    </p>
                )}
            </div>
        </div>
    );
}

import type { Calendar } from '../../lib/types';
import { Row } from './Row';

interface Props {
    calendar: Calendar;
    offset: number;
    maxOffset: number;
    onOffsetChange: (offset: number) => void;
    onFindBest: () => void;
    misfits: number;
    conflictDays: number;
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

// One line under the slider: the worst problem, or where the painting starts.
function status({ calendar, offset, misfits, conflictDays, tooWide }: Props): { text: string; className: string } {
    if (tooWide) return { text: 'Too wide for the graph. Shorten it.', className: 'text-danger' };
    if (misfits > 0) return { text: `${plural(misfits, 'pixel')} off the graph, outlined in red.`, className: 'text-danger' };
    if (conflictDays > 0) return { text: `Overlaps your commits on ${plural(conflictDays, 'day')}, outlined in amber.`, className: 'text-attention' };
    return { text: `Starts the week of ${weekLabel(calendar, offset)}.`, className: 'text-muted' };
}

export function PlacementControls(props: Props) {
    const { calendar, offset, maxOffset } = props;
    const line = status(props);

    return (
        <Row label={<label htmlFor="offset">Position</label>}>
            <div className="flex flex-wrap items-center gap-3">
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
                    className="min-w-0 flex-1 basis-40 accent-accent"
                />
                <button type="button" onClick={props.onFindBest} className="btn">
                    Find best spot
                </button>
            </div>
            <p className={`text-sm ${line.className}`} aria-live="polite">
                {line.text}
            </p>
        </Row>
    );
}

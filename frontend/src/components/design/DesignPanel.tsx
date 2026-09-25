import { useMemo, useState } from 'react';
import {
    bestOffset,
    buildPreview,
    cellKey,
    defaultOffset,
    maxOffset as maxOffsetFor,
    patternWidth,
    textToPattern,
    todayUtc,
    trimPattern,
} from '../../lib/design';
import type { Calendar } from '../../lib/types';
import { Graph } from '../Graph';
import { PlacementControls } from './PlacementControls';

interface Props {
    calendar: Calendar;
    year?: number;
}

const MAX_TEXT = 30;
// Drawn in the darkest shade until the shade picker lands.
const SHADE = 4;

const inputClass =
    'min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900 aria-[invalid=true]:border-red-500';

export function DesignPanel({ calendar, year }: Props) {
    const [text, setText] = useState('');
    const [userOffset, setUserOffset] = useState<number | null>(null);
    const [bestNote, setBestNote] = useState<string | null>(null);

    const mode = year ? 'year' : 'rolling';
    const today = todayUtc();
    const placed = useMemo(() => trimPattern(textToPattern(text)), [text]);
    const width = patternWidth(placed);
    const tooWide = width > calendar.weeks.length;
    const maxOffset = maxOffsetFor(calendar, placed);
    const offset = Math.min(maxOffset, Math.max(0, userOffset ?? defaultOffset(calendar, placed, mode, today)));

    const preview = useMemo(() => buildPreview(calendar, placed, offset, SHADE, today), [calendar, placed, offset, today]);

    function findBest() {
        const best = bestOffset(calendar, placed, mode, today);
        if (!best) {
            setBestNote('No spot on this graph fits the whole painting.');
            return;
        }
        setUserOffset(best.offset);
        setBestNote(
            best.conflicts === 0
                ? 'Moved to a spot with no overlapping commits.'
                : `Moved to the spot with the least overlap (${best.conflicts} day${best.conflicts === 1 ? '' : 's'}).`,
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="rounded-md border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
                <Graph
                    calendar={calendar}
                    focusWeek={width > 0 ? offset + Math.floor(width / 2) : undefined}
                    overlay={(w, d) => preview.overlay.get(cellKey(w, d))}
                />
            </div>

            <div className="flex flex-col gap-6">
                <section className="flex flex-col gap-1">
                    <label htmlFor="paint-text" className="text-sm font-medium">
                        Text
                    </label>
                    <input
                        id="paint-text"
                        value={text}
                        maxLength={MAX_TEXT}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="HIRE ME"
                        autoComplete="off"
                        className={inputClass}
                    />
                    <p className="text-sm text-neutral-500">Letters, numbers and a little punctuation.</p>
                </section>

                {width > 0 && (
                    <PlacementControls
                        calendar={calendar}
                        offset={offset}
                        maxOffset={maxOffset}
                        onOffsetChange={(o) => {
                            setBestNote(null);
                            setUserOffset(o);
                        }}
                        onFindBest={findBest}
                        bestNote={bestNote}
                        rolling={mode === 'rolling'}
                        misfits={preview.misfits}
                        conflictDays={preview.conflicts.length}
                        conflictCommits={preview.conflictCommits}
                        tooWide={tooWide}
                    />
                )}
            </div>
        </div>
    );
}

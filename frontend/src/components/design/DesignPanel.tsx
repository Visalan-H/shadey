import { useEffect, useMemo, useRef, useState } from 'react';
import {
    bestOffset,
    buildPreview,
    cellKey,
    defaultOffset,
    emptyPattern,
    maxOffset as maxOffsetFor,
    patternWidth,
    textToPattern,
    todayUtc,
    trimPattern,
} from '../../lib/design';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../../lib/draft';
import { defaultRepoName, repoNameError, type PaintRequest, type PaintResult } from '../../lib/paint';
import { signInUrl, useMe } from '../../lib/auth';
import type { Calendar, Pattern, Shade } from '../../lib/types';
import { Graph } from '../Graph';
import { PaintAction } from './PaintAction';
import { PaintDone } from './PaintDone';
import { PixelEditor } from './PixelEditor';
import { PlacementControls } from './PlacementControls';
import { ShadePicker } from './ShadePicker';
import { ShareButtons } from '../share/ShareButtons';

interface Props {
    calendar: Calendar;
    year?: number;
    onShowMine: (login: string) => void;
}

// Letters are 5 columns plus a gap and the graph is 53 wide, so only about 8 fit.
// A little slack lets people type and then see the "too wide" warning.
const MAX_TEXT = 12;
const BLANK_WIDTH = 20;

// Text gets a blank column either side in the editor, so it can be touched up at the edges.
function editorStart(text: string): Pattern {
    const pattern = textToPattern(text);
    const width = patternWidth(pattern);
    if (width === 0) return emptyPattern(BLANK_WIDTH);
    return pattern.map((row) => [false, ...row, false]);
}

function fresh(login: string, year: number | undefined): Draft {
    return { login, year, source: 'text', text: '', drawn: null, offset: null, shade: 4, repoName: null, isPrivate: false };
}

const inputClass =
    'min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900 aria-[invalid=true]:border-red-500';

export function DesignPanel({ calendar, year, onShowMine }: Props) {
    const [draft, setDraft] = useState<Draft>(() => loadDraft(calendar.login, year) ?? fresh(calendar.login, year));
    const [bestNote, setBestNote] = useState<string | null>(null);
    const [serverRepoError, setServerRepoError] = useState<string | null>(null);
    const [done, setDone] = useState<PaintResult | null>(null);
    const { data: me } = useMe();
    const graphRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!done) saveDraft(draft);
    }, [draft, done]);

    const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

    const mode = year ? 'year' : 'rolling';
    const today = todayUtc();
    const placed = useMemo(
        () => trimPattern(draft.source === 'draw' && draft.drawn ? draft.drawn : textToPattern(draft.text)),
        [draft.source, draft.drawn, draft.text],
    );
    const width = patternWidth(placed);
    const tooWide = width > calendar.weeks.length;
    const maxOffset = maxOffsetFor(calendar, placed);
    const offset = Math.min(maxOffset, Math.max(0, draft.offset ?? defaultOffset(calendar, placed, mode, today)));

    const preview = useMemo(() => buildPreview(calendar, placed, offset, draft.shade, today), [calendar, placed, offset, draft.shade, today]);

    const repoName = draft.repoName ?? defaultRepoName(draft.text || (draft.source === 'draw' ? 'pixels' : ''));
    const repoError = repoNameError(repoName) ?? serverRepoError;
    const hasRepoScope = Boolean(me?.scopes.includes('repo'));

    let blocked: string | null = null;
    if (width === 0) blocked = draft.source === 'text' ? 'Type some text to paint.' : 'Draw something to paint.';
    else if (tooWide || preview.misfits > 0) blocked = 'Every pixel has to fit on the graph first.';
    else if (repoError) blocked = 'Fix the repo name first.';
    else if (draft.isPrivate && !hasRepoScope) blocked = 'Grant the private repo permission first, or turn off "Private repo".';

    const request: PaintRequest | null =
        blocked || preview.plan.length === 0
            ? null
            : {
                  text: draft.text.trim() || undefined,
                  pattern: placed,
                  placement: { mode, ...(year ? { year } : {}), offset },
                  shade: draft.shade,
                  perCell: preview.calibration.perCell,
                  plan: preview.plan,
                  repoName,
                  isPrivate: draft.isPrivate,
              };

    function findBest() {
        const best = bestOffset(calendar, placed, mode, today);
        if (!best) {
            setBestNote('No spot on this graph fits the whole painting.');
            return;
        }
        update({ offset: best.offset });
        setBestNote(
            best.conflicts === 0
                ? 'Moved to a spot with no overlapping commits.'
                : `Moved to the spot with the least overlap (${best.conflicts} day${best.conflicts === 1 ? '' : 's'}).`,
        );
    }

    function painted(result: PaintResult) {
        clearDraft();
        setDone(result);
    }

    function paintAnother() {
        setDone(null);
        setDraft(fresh(calendar.login, year));
        setBestNote(null);
        setServerRepoError(null);
    }

    return (
        <div className="flex flex-col gap-6">
            <div ref={graphRef} className="rounded-md border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
                <Graph
                    calendar={calendar}
                    focusWeek={width > 0 ? offset + Math.floor(width / 2) : undefined}
                    overlay={(w, d) => {
                        const cell = preview.overlay.get(cellKey(w, d));
                        // Once painted, show just the painting: the warnings no longer apply.
                        return done && cell ? (cell.level === undefined ? undefined : { level: cell.level }) : cell;
                    }}
                />
            </div>

            {done ? (
                <PaintDone result={done} onPaintAnother={paintAnother}>
                    <ShareButtons shareId={done.shareId} text={draft.text} captureRef={graphRef} />
                </PaintDone>
            ) : (
                <div className="flex flex-col gap-6">
                    <section className="flex flex-col gap-3">
                        <div role="tablist" aria-label="Design with" className="flex">
                            {(['text', 'draw'] as const).map((tab, i) => (
                                <button
                                    key={tab}
                                    type="button"
                                    role="tab"
                                    aria-selected={draft.source === tab}
                                    onClick={() =>
                                        update(
                                            tab === 'draw' && !draft.drawn
                                                ? { source: tab, drawn: editorStart(draft.text) }
                                                : { source: tab },
                                        )
                                    }
                                    className={`border border-neutral-300 px-4 py-1.5 text-sm dark:border-neutral-700 ${
                                        i === 0 ? 'rounded-l-md' : '-ml-px rounded-r-md'
                                    } ${
                                        draft.source === tab
                                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                                            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                                    }`}
                                >
                                    {tab === 'text' ? 'Text' : 'Draw'}
                                </button>
                            ))}
                        </div>
                        {draft.source === 'text' ? (
                            <div className="flex flex-col gap-1">
                                <label htmlFor="paint-text" className="text-sm font-medium">
                                    Text
                                </label>
                                <input
                                    id="paint-text"
                                    value={draft.text}
                                    maxLength={MAX_TEXT}
                                    onChange={(e) => update({ text: e.target.value })}
                                    placeholder="HIRE ME"
                                    autoComplete="off"
                                    className={inputClass}
                                />
                                <p className="text-sm text-neutral-500">
                                    About 8 letters fit on the graph. Switch to Draw to touch it up by hand.
                                </p>
                            </div>
                        ) : (
                            <PixelEditor pattern={draft.drawn ?? emptyPattern(BLANK_WIDTH)} onChange={(drawn) => update({ drawn })} />
                        )}
                    </section>

                    {width > 0 && (
                        <PlacementControls
                            calendar={calendar}
                            offset={offset}
                            maxOffset={maxOffset}
                            onOffsetChange={(o) => {
                                setBestNote(null);
                                update({ offset: o });
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

                    <ShadePicker
                        shade={draft.shade}
                        onChange={(shade: Shade) => update({ shade })}
                        calibration={width > 0 && !tooWide ? preview.calibration : null}
                    />

                    <section className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                            <label htmlFor="repo-name" className="text-sm font-medium">
                                Repo name
                            </label>
                            <input
                                id="repo-name"
                                value={repoName}
                                maxLength={100}
                                onChange={(e) => {
                                    setServerRepoError(null);
                                    update({ repoName: e.target.value });
                                }}
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                aria-invalid={repoError ? true : undefined}
                                aria-describedby="repo-name-help"
                                className={`${inputClass} font-mono sm:max-w-sm`}
                            />
                            <p id="repo-name-help" className={`text-sm ${repoError ? 'text-red-600 dark:text-red-400' : 'text-neutral-500'}`}>
                                {repoError ?? 'A new repo is created for this painting. Delete it any time to undo.'}
                            </p>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="flex items-center gap-2 text-sm font-medium">
                                <input
                                    type="checkbox"
                                    checked={draft.isPrivate}
                                    onChange={(e) => update({ isPrivate: e.target.checked })}
                                    className="h-4 w-4 accent-green-700"
                                />
                                Private repo
                            </label>
                            {draft.isPrivate && (
                                <div className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-400">
                                    <p>
                                        A private painting only shows on your graph if "Private contributions" is turned on in your GitHub
                                        profile settings.
                                    </p>
                                    {me && !hasRepoScope && (
                                        <p>
                                            GitHub needs to give Graph Painter permission to create private repos.{' '}
                                            <a href={signInUrl(undefined, 'repo')} className="font-medium text-green-800 underline underline-offset-2 dark:text-green-400">
                                                Grant permission on GitHub
                                            </a>
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    <PaintAction
                        graphLogin={calendar.login}
                        request={request}
                        blocked={blocked}
                        totalCommits={preview.calibration.totalCommits}
                        onPainted={painted}
                        onShowMine={onShowMine}
                        onRepoNameError={setServerRepoError}
                    />
                </div>
            )}
        </div>
    );
}

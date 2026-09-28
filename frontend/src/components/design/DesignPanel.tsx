import { useEffect, useMemo, useRef, useState } from 'react';
import {
    bestOffset,
    buildPreview,
    cellKey,
    composeInk,
    defaultOffset,
    inkWidth,
    maxOffset as maxOffsetFor,
    patternWidth,
    textLayer,
    todayUtc,
    trimPattern,
} from '../../lib/design';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../../lib/draft';
import { defaultRepoName, repoNameError, type PaintRequest, type PaintResult } from '../../lib/paint';
import { signInUrl, useMe } from '../../lib/auth';
import type { Calendar, Shade } from '../../lib/types';
import { Graph, GraphLegend } from '../Graph';
import { PaintAction } from './PaintAction';
import { Row } from './Row';
import { PaintDone } from './PaintDone';
import { PixelEditor } from './PixelEditor';
import { PlacementControls } from './PlacementControls';
import { ShadePicker } from './ShadePicker';
import { StickerPicker } from './StickerPicker';
import { ShareButtons } from '../share/ShareButtons';

interface Props {
    calendar: Calendar;
    year?: number;
    onShowMine: (login: string) => void;
}

// Letters are 5 columns plus a gap and the graph is 53 wide, so only about 8 fit.
// A little slack lets people type and then see the "too wide" warning.
const MAX_TEXT = 12;
// Room to draw in before anything is typed.
const BLANK_WIDTH = 20;

// Counts characters, not UTF-16 units, so a sticker costs one like a letter.
function clip(text: string) {
    return Array.from(text).slice(0, MAX_TEXT).join('');
}

function fresh(login: string, year: number | undefined): Draft {
    return { login, year, text: '', ink: null, offset: null, shade: 4, repoName: null, isPrivate: false };
}

export function DesignPanel({ calendar, year, onShowMine }: Props) {
    const [draft, setDraft] = useState<Draft>(() => loadDraft(calendar.login, year) ?? fresh(calendar.login, year));
    const [serverRepoError, setServerRepoError] = useState<string | null>(null);
    const [done, setDone] = useState<PaintResult | null>(null);
    const { data: me } = useMe();
    const graphRef = useRef<HTMLDivElement>(null);
    // Where stickers go: the caret's last spot, or the end if the box was never touched.
    const caret = useRef<number | null>(null);

    useEffect(() => {
        if (!done) saveDraft(draft);
    }, [draft, done]);

    const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

    const mode = year ? 'year' : 'rolling';
    const today = todayUtc();
    const base = useMemo(() => textLayer(draft.text), [draft.text]);
    const placed = useMemo(() => trimPattern(composeInk(base, draft.ink)), [base, draft.ink]);
    const minColumns = Math.max(1, patternWidth(base));
    const columns = Math.max(minColumns, draft.ink ? inkWidth(draft.ink) : BLANK_WIDTH);
    const width = patternWidth(placed);
    const tooWide = width > calendar.weeks.length;
    const maxOffset = maxOffsetFor(calendar, placed);
    const offset = Math.min(maxOffset, Math.max(0, draft.offset ?? defaultOffset(calendar, placed, mode, today)));

    const preview = useMemo(() => buildPreview(calendar, placed, offset, draft.shade, today), [calendar, placed, offset, draft.shade, today]);

    const repoName = draft.repoName ?? defaultRepoName(draft.text);
    const repoError = repoNameError(repoName) ?? serverRepoError;
    const hasRepoScope = Boolean(me?.scopes.includes('repo'));

    // The rows above already explain fit, repo name and permission problems in place.
    const blocked = width === 0 || tooWide || preview.misfits > 0 || Boolean(repoError) || (draft.isPrivate && !hasRepoScope);
    let note: string | null = null;
    if (width === 0) note = 'Type or draw something to paint.';
    else if (!blocked && mode === 'rolling') note = 'Slides off this graph within a year. Pick a year to keep it.';

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

    function addSticker(char: string) {
        const at = Math.min(caret.current ?? draft.text.length, draft.text.length);
        const text = clip(draft.text.slice(0, at) + char + draft.text.slice(at));
        caret.current = at + char.length;
        update({ text });
    }

    function findBest() {
        const best = bestOffset(calendar, placed, mode, today);
        // The position line reports what's left; with no spot at all, the painting is too wide.
        if (best) update({ offset: best.offset });
    }

    function painted(result: PaintResult) {
        clearDraft();
        setDone(result);
    }

    function paintAnother() {
        setDone(null);
        setDraft(fresh(calendar.login, year));
        setServerRepoError(null);
    }

    return (
        <div className="flex flex-col gap-6">
            <div ref={graphRef} className="box flex flex-col gap-2 p-4">
                <Graph
                    calendar={calendar}
                    focusWeek={width > 0 ? offset + Math.floor(width / 2) : undefined}
                    overlay={(w, d) => {
                        const cell = preview.overlay.get(cellKey(w, d));
                        // Once painted, show just the painting: the warnings no longer apply.
                        return done && cell ? (cell.level === undefined ? undefined : { level: cell.level }) : cell;
                    }}
                />
                <GraphLegend />
            </div>

            {done ? (
                <PaintDone result={done} onPaintAnother={paintAnother}>
                    <ShareButtons shareId={done.shareId} text={draft.text} captureRef={graphRef} />
                </PaintDone>
            ) : (
                <div className="box">
                    <div className="rounded-t-md border-b border-line bg-subtle px-4 py-3">
                        <h3 className="text-sm font-semibold">Design</h3>
                    </div>

                    <Row label={<label htmlFor="paint-text">Text</label>}>
                        <input
                            id="paint-text"
                            value={draft.text}
                            onChange={(e) => {
                                caret.current = e.target.selectionStart;
                                update({ text: clip(e.target.value) });
                            }}
                            onSelect={(e) => {
                                caret.current = e.currentTarget.selectionStart;
                            }}
                            placeholder="HIRE ME"
                            autoComplete="off"
                            className="input w-full font-mono tracking-[0.2em] uppercase sm:max-w-xs"
                        />
                        <p className="text-sm text-muted">About 8 letters fit. Tap a sticker to add it at the cursor.</p>
                        <StickerPicker onPick={addSticker} />
                    </Row>

                    <Row label="Draw">
                        <PixelEditor base={base} ink={draft.ink} columns={columns} minColumns={minColumns} onChange={(ink) => update({ ink })} />
                    </Row>

                    {width > 0 && (
                        <PlacementControls
                            calendar={calendar}
                            offset={offset}
                            maxOffset={maxOffset}
                            onOffsetChange={(o) => update({ offset: o })}
                            onFindBest={findBest}
                            misfits={preview.misfits}
                            conflictDays={preview.conflicts.length}
                            tooWide={tooWide}
                        />
                    )}

                    <ShadePicker
                        shade={draft.shade}
                        onChange={(shade: Shade) => update({ shade })}
                        calibration={width > 0 && !tooWide ? preview.calibration : null}
                    />

                    <Row label={<label htmlFor="repo-name">Repo name</label>}>
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
                            className="input w-full font-mono sm:max-w-xs"
                        />
                        <p id="repo-name-help" className={`text-sm ${repoError ? 'text-danger' : 'text-muted'}`}>
                            {repoError ?? 'Delete the repo any time to undo.'}
                        </p>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={draft.isPrivate}
                                onChange={(e) => update({ isPrivate: e.target.checked })}
                                className="h-4 w-4 accent-accent"
                            />
                            Private repo
                        </label>
                        {draft.isPrivate && (
                            <p className="text-sm text-muted">
                                {me && !hasRepoScope ? (
                                    <>
                                        Needs one more permission.{' '}
                                        <a href={signInUrl(undefined, 'repo')} className="link font-medium">
                                            Grant permission on GitHub
                                        </a>
                                    </>
                                ) : (
                                    'Shows only if "Private contributions" is on in your GitHub profile.'
                                )}
                            </p>
                        )}
                    </Row>

                    <div className="rounded-b-md border-t border-line bg-subtle px-4 py-3">
                        <PaintAction
                            graphLogin={calendar.login}
                            request={request}
                            blocked={blocked}
                            note={note}
                            onPainted={painted}
                            onShowMine={onShowMine}
                            onRepoNameError={setServerRepoError}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

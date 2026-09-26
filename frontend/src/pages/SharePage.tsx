import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { Graph } from '../components/Graph';
import { ShareButtons } from '../components/share/ShareButtons';
import { ApiError } from '../lib/api';
import { paintingCalendar, useSharedPainting, type SharedPainting } from '../lib/share';
import type { Calendar } from '../lib/types';

const ctaClass = 'inline-flex rounded-md bg-green-700 px-4 py-2 font-medium text-white hover:bg-green-800';

// Public share page for one painting.
export function SharePage() {
    const { id = '' } = useParams();
    const { data, error, isPending } = useSharedPainting(id);

    if (isPending) {
        return (
            <div className="mx-auto max-w-5xl p-4" aria-busy="true">
                <div className="h-[118px] w-full animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800" />
                <span className="sr-only">Loading painting…</span>
            </div>
        );
    }

    if (error || data.status === 'deleted') {
        const notFound = error instanceof ApiError && error.status === 404;
        let message = 'Something went wrong loading this painting.';
        if (data?.status === 'deleted') message = `@${data.login} removed this painting.`;
        else if (notFound) message = "This painting doesn't exist.";
        return (
            <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 p-4">
                <p className="text-lg">{message}</p>
                <Link to="/" className={ctaClass}>
                    Paint yours
                </Link>
            </div>
        );
    }

    return <Painting painting={data} />;
}

// Middle of the painted weeks, so phones scroll straight to the painting.
function paintedCenter(calendar: Calendar) {
    const painted = calendar.weeks.flatMap((week, i) => (week.some((d) => d && d.level > 0) ? [i] : []));
    if (painted.length === 0) return undefined;
    return Math.floor((painted[0]! + painted.at(-1)!) / 2);
}

function titleFor(painting: SharedPainting) {
    const text = painting.text?.trim();
    return text ? `@${painting.login} painted "${text}"` : `@${painting.login} painted their graph`;
}

function Painting({ painting }: { painting: SharedPainting }) {
    const calendar = useMemo(() => paintingCalendar(painting), [painting]);
    const graphRef = useRef<HTMLDivElement>(null);
    const title = titleFor(painting);
    const where = painting.placement.mode === 'year' ? `on ${painting.placement.year}` : 'on the last 12 months';

    useEffect(() => {
        const previous = document.title;
        document.title = `${title} · Graph Painter`;
        return () => {
            document.title = previous;
        };
    }, [title]);

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
            <div className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold break-words">{title}</h1>
                <p className="text-sm text-neutral-500">
                    Painted {where} of{' '}
                    <a href={`https://github.com/${painting.login}`} target="_blank" rel="noreferrer" className="hover:underline">
                        their GitHub graph
                    </a>
                    {painting.repoUrl && (
                        <>
                            {' '}
                            with{' '}
                            <a href={painting.repoUrl} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                                {painting.repoName}
                            </a>
                        </>
                    )}
                    .
                </p>
            </div>
            <div ref={graphRef} className="rounded-md border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
                <Graph calendar={calendar} focusWeek={paintedCenter(calendar)} />
            </div>
            <ShareButtons shareId={painting.shareId} message={`${title} on their GitHub graph`} captureRef={graphRef} />
            <div>
                <Link to="/" className={ctaClass}>
                    Paint yours
                </Link>
            </div>
        </div>
    );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { PaintResult } from '../../lib/paint';

interface Props {
    result: PaintResult;
    onPaintAnother: () => void;
    // Share buttons.
    children?: ReactNode;
}

export function sharePath(shareId: string) {
    return `/p/${encodeURIComponent(shareId)}`;
}

const linkClass =
    'inline-flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800';

export function PaintDone({ result, onPaintAnother, children }: Props) {
    return (
        <section className="flex flex-col gap-4 rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
            <h3 className="text-xl font-semibold">Done!</h3>
            <p className="text-sm">
                Created <span className="font-mono">{result.repoName}</span> with {result.commitCount.toLocaleString()} commit
                {result.commitCount === 1 ? '' : 's'}.
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <a href={result.repoUrl} target="_blank" rel="noreferrer" className={linkClass}>
                    View repo on GitHub
                </a>
                <Link to={sharePath(result.shareId)} className={linkClass}>
                    Open share page
                </Link>
                <Link to="/me" className={linkClass}>
                    My paintings
                </Link>
            </div>
            {children}
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                GitHub can take a few minutes, sometimes up to a day, to show it on your graph. To undo, delete the repo from My
                paintings.
            </p>
            <div>
                <button
                    type="button"
                    onClick={onPaintAnother}
                    className="rounded-md bg-green-700 px-4 py-2 font-medium text-white hover:bg-green-800"
                >
                    Paint another
                </button>
            </div>
        </section>
    );
}

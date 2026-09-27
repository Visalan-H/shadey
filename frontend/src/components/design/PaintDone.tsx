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

export function PaintDone({ result, onPaintAnother, children }: Props) {
    return (
        <section className="box">
            <div className="flex flex-col gap-1 rounded-t-md border-b border-success-line bg-success-subtle px-4 py-3">
                <h3 className="font-semibold">Painted</h3>
                <p className="text-sm">
                    Created <span className="font-mono">{result.repoName}</span> with {result.commitCount.toLocaleString()} commit
                    {result.commitCount === 1 ? '' : 's'}. GitHub can take a few minutes, sometimes up to a day, to show it on your graph.
                </p>
            </div>
            <div className="flex flex-col gap-3 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                    <a href={result.repoUrl} target="_blank" rel="noreferrer" className="btn">
                        View repo on GitHub
                    </a>
                    <Link to={sharePath(result.shareId)} className="btn">
                        Open share page
                    </Link>
                    <Link to="/me" className="btn">
                        My paintings
                    </Link>
                </div>
                {children}
            </div>
            <div className="flex flex-wrap-reverse items-center justify-between gap-3 rounded-b-md border-t border-line bg-subtle px-4 py-3">
                <p className="text-sm text-muted">To undo, delete the repo from My paintings.</p>
                <button type="button" onClick={onPaintAnother} className="btn btn-primary">
                    Paint another
                </button>
            </div>
        </section>
    );
}

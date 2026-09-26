import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { sharePath } from '../components/design/PaintDone';
import { ApiError } from '../lib/api';
import { signInUrl, useMe } from '../lib/auth';
import { deleteForMeUrl, repoSettingsUrl, useMarkDeleted, useMyPaintings, type PaintingSummary } from '../lib/myPaintings';

const buttonClass =
    'inline-flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800';

// The signed-in user's paintings, with both ways to undo one.
export function MyPaintingsPage() {
    const { data: me, isPending: meLoading } = useMe();
    const paintings = useMyPaintings(Boolean(me));
    const [params] = useSearchParams();

    if (meLoading) return null;

    if (!me) {
        return (
            <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 p-4">
                <h1 className="text-xl font-semibold">My paintings</h1>
                <p className="text-neutral-600 dark:text-neutral-400">Sign in to see and delete your paintings.</p>
                <a href={signInUrl('/me')} className="rounded-md bg-green-700 px-4 py-2 font-medium text-white hover:bg-green-800">
                    Sign in with GitHub
                </a>
            </div>
        );
    }

    const deleted = params.get('deleted');
    const deleteError = params.get('delete_error');

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">My paintings</h1>
            {deleted && (
                <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950/40">
                    Deleted. The painting disappears from your graph once GitHub catches up, usually within minutes.
                </p>
            )}
            {deleteError && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                    The repo wasn't deleted. GitHub didn't grant the delete permission, or you signed in as a different account. Try
                    again, or delete it yourself from the repo's settings.
                </p>
            )}
            {paintings.isPending ? (
                <p className="text-neutral-500">Loading…</p>
            ) : paintings.error ? (
                <p role="alert" className="text-red-700 dark:text-red-400">
                    Couldn't load your paintings. Try again in a moment.
                </p>
            ) : paintings.data.length === 0 ? (
                <p className="text-neutral-600 dark:text-neutral-400">
                    Nothing painted yet.{' '}
                    <Link to={`/?u=${encodeURIComponent(me.login)}`} className="font-medium underline underline-offset-2">
                        Paint your graph
                    </Link>
                </p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {paintings.data.map((p) => (
                        <PaintingRow key={p.shareId} painting={p} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function PaintingRow({ painting: p }: { painting: PaintingSummary }) {
    const [selfDelete, setSelfDelete] = useState(false);
    const markDeleted = useMarkDeleted();
    const created = new Date(p.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const title = p.text?.trim() || p.repoName;

    let markError: string | null = null;
    if (markDeleted.error) {
        markError =
            markDeleted.error instanceof ApiError && markDeleted.error.status === 409
                ? 'GitHub still shows the repo. Delete it there first, then try again.'
                : 'Something went wrong. Try again.';
    }

    return (
        <li className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold break-all">{title}</h2>
                <span className="text-sm text-neutral-500">
                    {created} · {p.totalCommits.toLocaleString()} commits{p.isPrivate ? ' · private' : ''}
                </span>
            </div>
            {p.status === 'deleted' ? (
                <p className="text-sm text-neutral-500">
                    Deleted. <span className="font-mono">{p.repoName}</span> is gone and the share page says so.
                </p>
            ) : (
                <>
                    <div className="flex flex-wrap gap-2">
                        <a href={p.repoUrl} target="_blank" rel="noreferrer" className={buttonClass}>
                            <span className="font-mono">{p.repoName}</span>
                        </a>
                        <Link to={sharePath(p.shareId)} className={buttonClass}>
                            Share page
                        </Link>
                        <a href={deleteForMeUrl(p.shareId)} className={buttonClass}>
                            Delete for me
                        </a>
                        <button type="button" onClick={() => setSelfDelete((s) => !s)} aria-expanded={selfDelete} className={buttonClass}>
                            Delete it myself
                        </button>
                    </div>
                    <p className="text-xs text-neutral-500">
                        "Delete for me" asks GitHub for permission to delete repos once. We use it for this repo and throw it away.
                    </p>
                    {selfDelete && (
                        <div className="flex flex-col gap-2 rounded-md bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
                            <p>
                                Open the{' '}
                                <a href={repoSettingsUrl(p.repoUrl)} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                                    repo's settings
                                </a>
                                , scroll to the Danger Zone and click "Delete this repository". Then come back here.
                            </p>
                            <div>
                                <button type="button" onClick={() => markDeleted.mutate(p.shareId)} disabled={markDeleted.isPending} className={buttonClass}>
                                    {markDeleted.isPending ? 'Checking…' : "I've deleted it"}
                                </button>
                            </div>
                            {markError && <p className="text-red-700 dark:text-red-400">{markError}</p>}
                        </div>
                    )}
                </>
            )}
        </li>
    );
}

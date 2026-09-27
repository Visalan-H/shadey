import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { sharePath } from '../components/design/PaintDone';
import { ApiError } from '../lib/api';
import { signInUrl, useMe } from '../lib/auth';
import {
    deleteForMeUrl,
    repoSettingsUrl,
    useCheckShades,
    useMarkDeleted,
    useMyPaintings,
    type PaintingSummary,
    type ShadeCheck,
} from '../lib/myPaintings';

const buttonClass =
    'btn';

// The signed-in user's paintings, with both ways to undo one.
export function MyPaintingsPage() {
    const { data: me, isPending: meLoading } = useMe();
    const paintings = useMyPaintings(Boolean(me));
    const [params] = useSearchParams();

    if (meLoading) return null;

    if (!me) {
        return (
            <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 px-4 py-8">
                <h1 className="text-xl font-semibold">My paintings</h1>
                <p className="text-muted">Sign in to see and delete your paintings.</p>
                <a href={signInUrl('/me')} className="btn btn-primary">
                    Sign in with GitHub
                </a>
            </div>
        );
    }

    const deleted = params.get('deleted');
    const deleteError = params.get('delete_error');

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
            <h1 className="text-xl font-semibold">My paintings</h1>
            {deleted && (
                <p role="status" className="flash flash-success">
                    Deleted. The painting disappears from your graph once GitHub catches up, usually within minutes.
                </p>
            )}
            {deleteError && (
                <p role="alert" className="flash flash-danger">
                    The repo wasn't deleted. GitHub didn't grant the delete permission, or you signed in as a different account. Try
                    again, or delete it yourself from the repo's settings.
                </p>
            )}
            {paintings.isPending ? (
                <p className="text-muted">Loading…</p>
            ) : paintings.error ? (
                <p role="alert" className="text-danger">
                    Couldn't load your paintings. Try again in a moment.
                </p>
            ) : paintings.data.length === 0 ? (
                <p className="text-muted">
                    Nothing painted yet.{' '}
                    <Link to={`/?u=${encodeURIComponent(me.login)}`} className="link font-medium">
                        Paint your graph
                    </Link>
                </p>
            ) : (
                <ul className="box divide-y divide-line">
                    {paintings.data.map((p) => (
                        <PaintingRow key={p.shareId} painting={p} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function days(n: number) {
    return `${n} day${n === 1 ? '' : 's'}`;
}

function shadeCheckMessage(check: ShadeCheck): string {
    switch (check.result) {
        case 'pending':
            return "GitHub hasn't counted all the commits yet. Try again in a few minutes.";
        case 'ok':
            return 'Every day shows the shade you picked.';
        case 'limit':
            return `${days(check.lightDays)} still look lighter than you picked, but this painting has used all its top-ups.`;
        case 'toppedUp':
            return (
                `${days(check.lightDays)} came out lighter than you picked, so we added ${check.added.toLocaleString()} commits. ` +
                (check.capped ? 'They may still look a little light. ' : '') +
                'GitHub takes a few minutes to show them.'
            );
    }
}

function PaintingRow({ painting: p }: { painting: PaintingSummary }) {
    const [selfDelete, setSelfDelete] = useState(false);
    const markDeleted = useMarkDeleted();
    const checkShades = useCheckShades();
    const shadeMessage = checkShades.error
        ? checkShades.error instanceof ApiError && checkShades.error.status === 502
            ? checkShades.error.message
            : "Couldn't check the shades. Try again in a moment."
        : checkShades.data && shadeCheckMessage(checkShades.data);
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
        <li className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold break-all">{title}</h2>
                <span className="text-sm text-muted">
                    {created} · {p.totalCommits.toLocaleString()} commits{p.isPrivate ? ' · private' : ''}
                </span>
            </div>
            {p.status === 'deleted' ? (
                <p className="text-sm text-muted">
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
                        <button type="button" onClick={() => checkShades.mutate(p.shareId)} disabled={checkShades.isPending} className={buttonClass}>
                            {checkShades.isPending ? 'Checking…' : 'Check shades'}
                        </button>
                        <a href={deleteForMeUrl(p.shareId)} className={buttonClass}>
                            Delete for me
                        </a>
                        <button type="button" onClick={() => setSelfDelete((s) => !s)} aria-expanded={selfDelete} className={buttonClass}>
                            Delete it myself
                        </button>
                    </div>
                    {shadeMessage && (
                        <p role="status" className="text-sm">
                            {shadeMessage}
                        </p>
                    )}
                    <p className="text-xs text-muted">
                        "Delete for me" asks GitHub for permission to delete repos once. We use it for this repo and throw it away.
                    </p>
                    {selfDelete && (
                        <div className="flex flex-col gap-2 rounded-md border border-line bg-subtle p-3 text-sm">
                            <p>
                                Open the{' '}
                                <a href={repoSettingsUrl(p.repoUrl)} target="_blank" rel="noreferrer" className="link font-medium">
                                    repo's settings
                                </a>
                                , scroll to the Danger Zone and click "Delete this repository". Then come back here.
                            </p>
                            <div>
                                <button type="button" onClick={() => markDeleted.mutate(p.shareId)} disabled={markDeleted.isPending} className={buttonClass}>
                                    {markDeleted.isPending ? 'Checking…' : "I've deleted it"}
                                </button>
                            </div>
                            {markError && <p className="text-danger">{markError}</p>}
                        </div>
                    )}
                </>
            )}
        </li>
    );
}

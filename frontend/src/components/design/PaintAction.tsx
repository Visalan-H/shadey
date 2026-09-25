import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { signInUrl, useMe } from '../../lib/auth';
import { hoursUntil, usePaint, type PaintError, type PaintRequest, type PaintResult } from '../../lib/paint';

interface Props {
    // Canonical login of the graph on screen.
    graphLogin: string;
    // null when there is nothing valid to paint yet.
    request: PaintRequest | null;
    // Why painting is blocked, shown next to the disabled button.
    blocked: string | null;
    totalCommits: number;
    onPainted: (result: PaintResult) => void;
    onShowMine: (login: string) => void;
    onRepoNameError: (message: string) => void;
}

const buttonClass =
    'inline-flex items-center justify-center rounded-md bg-green-700 px-5 py-2.5 font-medium text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-green-700';
const linkClass = 'font-medium underline underline-offset-2';

export function PaintAction({ graphLogin, request, blocked, totalCommits, onPainted, onShowMine, onRepoNameError }: Props) {
    const { data: me, isPending: meLoading } = useMe();
    const paint = usePaint();
    const queryClient = useQueryClient();

    if (meLoading) return <div className="h-11" aria-hidden="true" />;

    if (!me) {
        return (
            <div className="flex flex-col gap-2">
                <a href={signInUrl()} className={`${buttonClass} self-start`}>
                    Sign in with GitHub to paint
                </a>
                <p className="text-sm text-neutral-500">Your design is kept while you sign in.</p>
            </div>
        );
    }

    if (me.login.toLowerCase() !== graphLogin.toLowerCase()) {
        return (
            <div className="flex flex-col gap-2 text-sm">
                <p>
                    This is @{graphLogin}'s graph. You can only paint your own, signed in as @{me.login}.
                </p>
                <button type="button" onClick={() => onShowMine(me.login)} className={`${buttonClass} self-start`}>
                    Design on my graph
                </button>
            </div>
        );
    }

    function submit() {
        if (!request) return;
        paint.mutate(request, {
            onSuccess: (result) => {
                void queryClient.invalidateQueries({ queryKey: ['my-paintings'] });
                onPainted(result);
            },
            onError: (err) => {
                if (err.body.field === 'repoName') onRepoNameError(err.body.error);
            },
        });
    }

    const disabled = !request || Boolean(blocked) || paint.isPending;
    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={submit} disabled={disabled} className={buttonClass}>
                    {paint.isPending ? 'Painting…' : 'Paint'}
                </button>
                {!blocked && totalCommits > 0 && (
                    <span className="text-sm text-neutral-500">
                        Creates a new repo with {totalCommits.toLocaleString()} empty commit{totalCommits === 1 ? '' : 's'}.
                    </span>
                )}
            </div>
            {blocked && <p className="text-sm text-neutral-600 dark:text-neutral-400">{blocked}</p>}
            {paint.isPending && (
                <p className="text-sm text-neutral-500" aria-live="polite">
                    Creating the repo and pushing commits. This can take up to a minute.
                </p>
            )}
            {paint.error && !paint.isPending && <PaintErrorMessage error={paint.error} />}
        </div>
    );
}

function PaintErrorMessage({ error }: { error: PaintError }) {
    const { status, body } = error;
    let message: ReactNode = body.error;
    if (status === 401) {
        message = (
            <>
                Your GitHub sign-in expired.{' '}
                <a href={signInUrl()} className={linkClass}>
                    Sign in again
                </a>
                .
            </>
        );
    } else if (status === 429) {
        const hours = hoursUntil(body.retryAfterSeconds);
        message = `You've reached today's limit of 5 paintings. Try again in about ${hours} hour${hours === 1 ? '' : 's'}.`;
    } else if (body.repoUrl) {
        message = (
            <>
                {body.error}{' '}
                <a href={body.repoUrl} target="_blank" rel="noreferrer" className={linkClass}>
                    Open the repo
                </a>
            </>
        );
    }
    return (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {message}
        </p>
    );
}

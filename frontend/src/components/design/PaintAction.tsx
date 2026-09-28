import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { signInUrl, useMe } from '../../lib/auth';
import { hoursUntil, usePaint, type PaintError, type PaintRequest, type PaintResult } from '../../lib/paint';

interface Props {
    // Canonical login of the graph on screen.
    graphLogin: string;
    // null when there is nothing valid to paint yet.
    request: PaintRequest | null;
    blocked: boolean;
    // Shown next to the button: why it's disabled, or what to know before painting.
    note: string | null;
    onPainted: (result: PaintResult) => void;
    onShowMine: (login: string) => void;
    onRepoNameError: (message: string) => void;
}

const buttonClass = 'btn btn-primary btn-lg';
const linkClass = 'font-medium underline underline-offset-2';
// Note on the left, button on the right; the button goes on top when they wrap on phones.
const rowClass = 'flex flex-wrap-reverse items-center justify-between gap-3';

export function PaintAction({ graphLogin, request, blocked, note, onPainted, onShowMine, onRepoNameError }: Props) {
    const { data: me, isPending: meLoading } = useMe();
    const paint = usePaint();
    const queryClient = useQueryClient();

    if (meLoading) return <div className="h-9" aria-hidden="true" />;

    if (!me) {
        return (
            <div className={rowClass}>
                <p className="text-sm text-muted">Your design is kept while you sign in.</p>
                <a href={signInUrl()} className={buttonClass}>
                    Sign in with GitHub to paint
                </a>
            </div>
        );
    }

    if (me.login.toLowerCase() !== graphLogin.toLowerCase()) {
        return (
            <div className={rowClass}>
                <p className="text-sm text-muted">You can only paint your own graph.</p>
                <button type="button" onClick={() => onShowMine(me.login)} className={buttonClass}>
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
                void queryClient.invalidateQueries({ queryKey: ['calendar'] });
                onPainted(result);
            },
            onError: (err) => {
                if (err.body.field === 'repoName') onRepoNameError(err.body.error);
            },
        });
    }

    const disabled = !request || blocked || paint.isPending;
    return (
        <div className="flex flex-col gap-3">
            <div className={rowClass}>
                <p className="text-sm text-muted" aria-live="polite">
                    {paint.isPending ? 'This can take up to a minute.' : note}
                </p>
                <button type="button" onClick={submit} disabled={disabled} className={buttonClass}>
                    {paint.isPending ? 'Painting…' : 'Paint'}
                </button>
            </div>
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
    } else if (body.needScope === 'repo') {
        message = (
            <>
                Private repos need one more GitHub permission.{' '}
                <a href={signInUrl(undefined, 'repo')} className={linkClass}>
                    Grant it
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
        <p role="alert" className="flash flash-danger">
            {message}
        </p>
    );
}

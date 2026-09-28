import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { DesignPanel } from '../components/design/DesignPanel';
import { UsernameForm } from '../components/UsernameForm';
import { loginHint, useMe } from '../lib/auth';
import { calendarErrorMessage, isValidLogin, parseYear, totalContributions, useCalendar } from '../lib/calendar';

// Preview + design + paint.
export function HomePage() {
    const [params, setParams] = useSearchParams();
    const { data: me, isPending: meLoading } = useMe();
    const rawLogin = params.get('u') ?? '';
    // Without ?u= in the URL, show the signed-in user's own graph.
    const ownLogin = me?.login ?? (meLoading ? loginHint() : null) ?? '';
    const login = isValidLogin(rawLogin) ? rawLogin : ownLogin;
    const year = parseYear(params.get('y'));

    // Username and year live in the URL so the preview is shareable and survives reload.
    function update(nextLogin: string, nextYear: number | undefined) {
        const next = new URLSearchParams(params);
        if (nextLogin) next.set('u', nextLogin);
        else next.delete('u');
        if (nextYear) next.set('y', String(nextYear));
        else next.delete('y');
        setParams(next);
    }

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
                <div className="flex min-w-0 items-center gap-4">
                    {login && <Avatar key={login} login={login} />}
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <h1 className="text-2xl font-semibold text-balance break-words">{login || 'Paint your GitHub graph'}</h1>
                        <p className="text-muted">
                            {login
                                ? 'Preview a painting here. Nothing is pushed until you paint.'
                                : 'Look up any username to try it. Sign in to paint your own.'}
                        </p>
                    </div>
                </div>
                {/* Keyed so back/forward navigation resets the input to the URL's username. */}
                <UsernameForm
                    key={login}
                    login={login}
                    year={year}
                    onSubmit={(l) => update(l, year)}
                    onYearChange={(y) => update(login, y)}
                />
            </div>
            {login && <GraphSection login={login} year={year} onShowMine={(l) => update(l, year)} />}
        </div>
    );
}

// GitHub serves every user's avatar at /<login>.png. Hide it when there's no such user.
function Avatar({ login }: { login: string }) {
    const [failed, setFailed] = useState(false);
    if (failed) return null;
    return (
        <img
            src={`https://github.com/${encodeURIComponent(login)}.png?size=128`}
            alt=""
            width={64}
            height={64}
            onError={() => setFailed(true)}
            className="h-16 w-16 shrink-0 rounded-full border border-line"
        />
    );
}

interface GraphSectionProps {
    login: string;
    year?: number;
    onShowMine: (login: string) => void;
}

export function GraphSection({ login, year, onShowMine }: GraphSectionProps) {
    const { data, error, isPending } = useCalendar(login, year);

    if (isPending) {
        return (
            <section aria-busy="true" className="flex flex-col gap-3">
                <div className="h-6 w-64 animate-pulse rounded bg-subtle" />
                <div className="h-[150px] w-full animate-pulse rounded-md border border-line bg-subtle" />
                <span className="sr-only">Loading graph…</span>
            </section>
        );
    }

    if (error) {
        return (
            <section role="alert" className="flash flash-danger">
                {calendarErrorMessage(error, login)}
            </section>
        );
    }

    const total = totalContributions(data);
    return (
        <section className="flex min-w-0 flex-col gap-3">
            <h2 className="text-base">
                {total.toLocaleString()} contribution{total === 1 ? '' : 's'} {year ? `in ${year}` : 'in the last year'}
                <span className="sr-only"> by {data.login}</span>
            </h2>
            {/* Keyed so switching graphs starts a fresh design, or the draft saved for that graph. */}
            <DesignPanel key={`${data.login}-${year ?? 'rolling'}`} calendar={data} year={year} onShowMine={onShowMine} />
        </section>
    );
}

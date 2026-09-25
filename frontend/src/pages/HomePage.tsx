import { useSearchParams } from 'react-router';
import { Graph } from '../components/Graph';
import { UsernameForm } from '../components/UsernameForm';
import { calendarErrorMessage, isValidLogin, parseYear, totalContributions, useCalendar } from '../lib/calendar';

// Preview + design + paint. The design panel goes below GraphSection.
export function HomePage() {
    const [params, setParams] = useSearchParams();
    const rawLogin = params.get('u') ?? '';
    const login = isValidLogin(rawLogin) ? rawLogin : '';
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
        <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
            <div className="flex flex-col gap-3">
                <p className="text-neutral-500">Paint your GitHub contribution graph. Start by looking one up.</p>
                {/* Keyed so back/forward navigation resets the input to the URL's username. */}
                <UsernameForm
                    key={login}
                    login={login}
                    year={year}
                    onSubmit={(l) => update(l, year)}
                    onYearChange={(y) => update(login, y)}
                />
            </div>
            {login && <GraphSection login={login} year={year} />}
        </div>
    );
}

export function GraphSection({ login, year }: { login: string; year?: number }) {
    const { data, error, isPending } = useCalendar(login, year);

    if (isPending) {
        return (
            <section aria-busy="true" className="flex flex-col gap-2">
                <div className="h-5 w-56 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-[118px] w-full animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800" />
                <span className="sr-only">Loading graph…</span>
            </section>
        );
    }

    if (error) {
        return (
            <section
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
                {calendarErrorMessage(error, login)}
            </section>
        );
    }

    const total = totalContributions(data);
    return (
        <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm">
                <a href={`https://github.com/${data.login}`} className="font-semibold hover:underline" target="_blank" rel="noreferrer">
                    {data.login}
                </a>{' '}
                <span className="text-neutral-500">
                    · {total.toLocaleString()} contribution{total === 1 ? '' : 's'} {year ? `in ${year}` : 'in the last year'}
                </span>
            </h2>
            <div className="rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
                <Graph calendar={data} />
            </div>
        </section>
    );
}

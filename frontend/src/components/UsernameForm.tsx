import { useState, type FormEvent } from 'react';
import { cleanLogin, isValidLogin, selectableYears } from '../lib/calendar';

interface Props {
    login: string;
    year?: number;
    onSubmit: (login: string) => void;
    onYearChange: (year: number | undefined) => void;
}

export function UsernameForm({ login, year, onSubmit, onYearChange }: Props) {
    const [value, setValue] = useState(login);
    const [error, setError] = useState('');

    function submit(e: FormEvent) {
        e.preventDefault();
        const next = cleanLogin(value);
        if (!isValidLogin(next)) {
            setError(next ? `"${next}" doesn't look like a GitHub username.` : 'Enter a GitHub username.');
            return;
        }
        setError('');
        setValue(next);
        onSubmit(next);
    }

    return (
        <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
            <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="login" className="sr-only">
                    GitHub username
                </label>
                <input
                    id="login"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="GitHub username"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    className="min-w-0 flex-1 basis-48 rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                />
                <label htmlFor="year" className="sr-only">
                    Year
                </label>
                <select
                    id="year"
                    value={year ?? ''}
                    onChange={(e) => onYearChange(e.target.value ? Number(e.target.value) : undefined)}
                    className="rounded-md border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                >
                    <option value="">Last 12 months</option>
                    {selectableYears().map((y) => (
                        <option key={y} value={y}>
                            {y}
                        </option>
                    ))}
                </select>
                <button
                    type="submit"
                    className="rounded-md bg-green-700 px-4 py-2 font-medium text-white hover:bg-green-800"
                >
                    Show graph
                </button>
            </div>
            {error && (
                <p id="login-error" className="text-sm text-red-600 dark:text-red-400">
                    {error}
                </p>
            )}
        </form>
    );
}

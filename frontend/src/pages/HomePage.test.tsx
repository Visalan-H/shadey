import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Calendar } from '../lib/types';
import { HomePage } from './HomePage';

const calendar: Calendar = {
    login: 'Octocat',
    from: '2025-01-01',
    to: '2025-01-04',
    weeks: [
        [
            null,
            null,
            null,
            { date: '2025-01-01', count: 2, level: 1 },
            { date: '2025-01-02', count: 0, level: 0 },
            { date: '2025-01-03', count: 9, level: 4 },
            { date: '2025-01-04', count: 1, level: 1 },
        ],
    ],
};

function mockFetch(status: number, body: unknown) {
    const fetch = vi.fn(async (url: string) =>
        url === '/api/auth/me' ? new Response(JSON.stringify({ user: null })) : new Response(JSON.stringify(body), { status }),
    );
    vi.stubGlobal('fetch', fetch);
    return fetch;
}

function Location() {
    return <output data-testid="location">{useLocation().search}</output>;
}

function renderAt(url: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[url]}>
                <HomePage />
                <Location />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('HomePage', () => {
    it("shows the signed-in user's own graph when the URL names nobody", async () => {
        const fetch = vi.fn(async (url: string) =>
            url === '/api/auth/me'
                ? new Response(JSON.stringify({ user: { login: 'Octocat', name: null, avatarUrl: '', githubId: 1, scopes: [] } }))
                : new Response(JSON.stringify(calendar)),
        );
        vi.stubGlobal('fetch', fetch);
        renderAt('/');

        expect(await screen.findByText(/12 contributions in the last year/)).toBeInTheDocument();
        expect(screen.getByLabelText('GitHub username')).toHaveValue('Octocat');
        expect(fetch).toHaveBeenCalledWith('/api/calendar/Octocat', expect.anything());
    });

    it('looks up a username and shows the graph', async () => {
        const fetch = mockFetch(200, calendar);
        renderAt('/');
        await userEvent.type(screen.getByLabelText('GitHub username'), '@octocat');
        await userEvent.click(screen.getByRole('button', { name: 'Show graph' }));

        expect(await screen.findByRole('img', { name: '9 contributions on 2025-01-03' })).toBeInTheDocument();
        expect(screen.getByText(/12 contributions in the last year/)).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith('/api/calendar/octocat', expect.anything());
        expect(screen.getByTestId('location')).toHaveTextContent('?u=octocat');
    });

    it('loads the username and year from the URL', async () => {
        const fetch = mockFetch(200, calendar);
        renderAt('/?u=octocat&y=2023');
        expect(screen.getByLabelText('GitHub username')).toHaveValue('octocat');
        expect(screen.getByLabelText('Year')).toHaveValue('2023');
        expect(await screen.findByText(/in 2023/)).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith('/api/calendar/octocat?year=2023', expect.anything());
    });

    it('refetches when the year changes', async () => {
        const fetch = mockFetch(200, calendar);
        renderAt('/?u=octocat');
        await screen.findByText(/in the last year/);
        await userEvent.selectOptions(screen.getByLabelText('Year'), '2020');
        expect(await screen.findByText(/in 2020/)).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith('/api/calendar/octocat?year=2020', expect.anything());
        expect(screen.getByTestId('location')).toHaveTextContent('?u=octocat&y=2020');
    });

    it('shows a friendly error for an unknown user', async () => {
        mockFetch(404, { error: 'User not found' });
        renderAt('/?u=nobody-here');
        expect(await screen.findByRole('alert')).toHaveTextContent('No GitHub user named "nobody-here".');
    });

    it('explains rate limiting', async () => {
        mockFetch(502, { error: 'GitHub rate limit reached, try again in a few minutes' });
        renderAt('/?u=octocat');
        expect(await screen.findByRole('alert')).toHaveTextContent(/rate limiting/);
    });

    it('rejects an invalid username without fetching', async () => {
        const fetch = mockFetch(200, calendar);
        renderAt('/');
        await userEvent.type(screen.getByLabelText('GitHub username'), 'bad_name');
        await userEvent.click(screen.getByRole('button', { name: 'Show graph' }));
        expect(screen.getByText(/doesn't look like a GitHub username/)).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/calendar'), expect.anything());
    });
});

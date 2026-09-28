import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from './AdminPage';

const me = { login: 'boss', name: null, avatarUrl: '', githubId: 1, scopes: [] };
const reported = { shareId: 'abc', login: 'octo', text: 'HI', status: 'painted', count: 2, lastAt: '2026-09-01T00:00:00Z', reasons: ['rude'] };

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockApi(user: object | null) {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/me') return json({ user });
        if (url === '/api/admin/reports') return json({ reports: [reported] });
        if (init?.method === 'POST') return json({ status: 'hidden' });
        return json({ error: 'Not found' }, 404);
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
}

function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('AdminPage', () => {
    it('shows nothing to non-admins', async () => {
        const fetch = mockApi(me);
        renderPage();
        expect(await screen.findByText("This page doesn't exist.")).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalledWith('/api/admin/reports', expect.anything());
    });

    it('lists reports and takes a painting down', async () => {
        const fetch = mockApi({ ...me, admin: true });
        renderPage();
        expect(await screen.findByRole('link', { name: '@octo "HI"' })).toHaveAttribute('href', '/p/abc');
        expect(screen.getByText('rude')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Take down' }));
        expect(fetch).toHaveBeenCalledWith('/api/admin/paintings/abc/hide', expect.objectContaining({ method: 'POST' }));
    });
});

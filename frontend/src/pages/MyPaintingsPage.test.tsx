import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaintingSummary } from '../lib/myPaintings';
import { MyPaintingsPage } from './MyPaintingsPage';

const me = { login: 'octo', name: null, avatarUrl: '', githubId: 1, scopes: ['public_repo'] };

function painting(overrides: Partial<PaintingSummary> = {}): PaintingSummary {
    return {
        shareId: 'abc',
        text: 'HI',
        repoName: 'paint-hi',
        repoUrl: 'https://github.com/octo/paint-hi',
        isPrivate: false,
        status: 'painted',
        createdAt: '2025-06-01T10:00:00Z',
        totalCommits: 42,
        ...overrides,
    };
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockApi({ user = me as typeof me | null, paintings = [painting()], markStatus = 200, shadeCheck = {} as unknown } = {}) {
    let list = paintings;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/me' && init?.method === 'DELETE') return new Response(null, { status: 204 });
        if (url === '/api/auth/me') return json({ user });
        if (url === '/api/me/paintings') return json({ paintings: list });
        if (url.endsWith('/check-shades') && init?.method === 'POST') return json(shadeCheck);
        if (url.endsWith('/deleted') && init?.method === 'POST') {
            if (markStatus !== 200) return json({ error: 'The repo still exists on GitHub' }, markStatus);
            list = list.map((p) => ({ ...p, status: 'deleted' as const }));
            return json({ painting: list[0] });
        }
        return json({ error: 'Not found' }, 404);
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
}

function renderAt(url = '/me') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[url]}>
                <MyPaintingsPage />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('MyPaintingsPage', () => {
    it('deletes the account after a confirmation', async () => {
        const fetch = mockApi();
        renderAt();
        await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
        expect(fetch).not.toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ method: 'DELETE' }));
        await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
        expect(await screen.findByText(/Your account is deleted/)).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ method: 'DELETE' }));
        expect(screen.getByRole('link', { name: 'Sign in with GitHub' })).toBeInTheDocument();
    });

    it('explains a taken-down share page', async () => {
        mockApi({ paintings: [painting({ status: 'hidden' })] });
        renderAt();
        expect(await screen.findByText(/taken down after a report/)).toBeInTheDocument();
    });

    it('asks signed-out visitors to sign in', async () => {
        mockApi({ user: null });
        renderAt();
        expect(await screen.findByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute('href', '/api/auth/login?returnTo=%2Fme');
    });

    it('lists paintings with both ways to delete', async () => {
        mockApi();
        renderAt();
        const row = (await screen.findByRole('heading', { name: 'HI' })).closest('li')!;
        expect(within(row).getByText(/42 commits/)).toBeInTheDocument();
        const deleteForMe = within(row).getByRole('button', { name: 'Delete for me' });
        expect(deleteForMe.closest('form')).toHaveAttribute('action', '/api/auth/delete?painting=abc');
        expect(deleteForMe.closest('form')).toHaveAttribute('method', 'post');
        expect(within(row).getByRole('link', { name: 'Share page' })).toHaveAttribute('href', '/p/abc');

        await userEvent.click(within(row).getByRole('button', { name: 'Delete it myself' }));
        expect(within(row).getByRole('link', { name: "repo's settings" })).toHaveAttribute('href', 'https://github.com/octo/paint-hi/settings');
    });

    it('marks a painting deleted after the user removed the repo', async () => {
        mockApi();
        renderAt();
        await userEvent.click(await screen.findByRole('button', { name: 'Delete it myself' }));
        await userEvent.click(screen.getByRole('button', { name: "I've deleted it" }));
        expect(await screen.findByText(/is gone and the share page says so/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete for me' })).not.toBeInTheDocument();
    });

    it('explains when GitHub still has the repo', async () => {
        mockApi({ markStatus: 409 });
        renderAt();
        await userEvent.click(await screen.findByRole('button', { name: 'Delete it myself' }));
        await userEvent.click(screen.getByRole('button', { name: "I've deleted it" }));
        expect(await screen.findByText(/GitHub still shows the repo/)).toBeInTheDocument();
    });

    it('shows the result of "Delete for me"', async () => {
        mockApi();
        renderAt('/me?deleted=abc');
        expect(await screen.findByRole('status')).toHaveTextContent('Deleted.');
        cleanup();
        renderAt('/me?delete_error=abc');
        expect(await screen.findByRole('alert')).toHaveTextContent("The repo wasn't deleted.");
    });

    it('checks shades and reports a top-up', async () => {
        const fetch = mockApi({ shadeCheck: { result: 'toppedUp', lightDays: 3, added: 24, capped: false } });
        renderAt();
        await userEvent.click(await screen.findByRole('button', { name: 'Check shades' }));
        expect(await screen.findByRole('status')).toHaveTextContent('3 days came out lighter than you picked, so we added 24 commits.');
        expect(fetch).toHaveBeenCalledWith('/api/me/paintings/abc/check-shades', expect.objectContaining({ method: 'POST' }));
    });

    it('asks to wait while GitHub catches up', async () => {
        mockApi({ shadeCheck: { result: 'pending' } });
        renderAt();
        await userEvent.click(await screen.findByRole('button', { name: 'Check shades' }));
        expect(await screen.findByRole('status')).toHaveTextContent("GitHub hasn't counted all the commits yet.");
    });

    it('invites a first painting when the list is empty', async () => {
        mockApi({ paintings: [] });
        renderAt();
        expect(await screen.findByRole('link', { name: 'Paint your graph' })).toHaveAttribute('href', '/?u=octo');
    });
});

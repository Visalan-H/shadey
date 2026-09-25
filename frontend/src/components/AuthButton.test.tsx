import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthButton } from './AuthButton';

const mona = { login: 'mona', name: 'Mona', avatarUrl: 'https://avatars.test/1', githubId: 1, scopes: ['public_repo'] };

function json(body: unknown, status = 200) {
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderAt(path: string) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[path]}>
                <AuthButton />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('AuthButton', () => {
    it('links signed-out visitors to GitHub sign-in, returning to the current page', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ user: null })));
        renderAt('/draw?text=hi');
        const link = await screen.findByRole('link', { name: /sign in with github/i });
        expect(link).toHaveAttribute('href', '/api/auth/login?returnTo=%2Fdraw%3Ftext%3Dhi');
    });

    it('shows the signed-in user and signs out', async () => {
        let signedIn = true;
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (url === '/api/auth/logout' && init?.method === 'POST') {
                signedIn = false;
                return json(null, 204);
            }
            return json({ user: signedIn ? mona : null });
        });
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();
        renderAt('/');

        const trigger = await screen.findByRole('button', { name: /account menu for mona/i });
        expect(trigger).toHaveTextContent('mona');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');

        await user.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menuitem', { name: 'My paintings' })).toHaveAttribute('href', '/me');
        await waitFor(() => expect(screen.getByRole('menuitem', { name: 'My paintings' })).toHaveFocus());

        await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
        expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
        expect(await screen.findByRole('link', { name: /sign in with github/i })).toBeInTheDocument();
        expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/me')).toHaveLength(2);
    });

    it('opens with the keyboard and closes on Escape', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ user: mona })));
        const user = userEvent.setup();
        renderAt('/');

        const trigger = await screen.findByRole('button', { name: /account menu/i });
        trigger.focus();
        await user.keyboard('{ArrowDown}');
        await waitFor(() => expect(screen.getByRole('menuitem', { name: 'My paintings' })).toHaveFocus());
        await user.keyboard('{ArrowDown}');
        expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });
});

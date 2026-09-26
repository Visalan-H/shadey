import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCalendar } from '../../lib/design/testCalendar';
import type { Calendar } from '../../lib/types';
import { DesignPanel } from './DesignPanel';

const octo = { login: 'octo', name: 'Octo', avatarUrl: 'https://avatars.test/1', githubId: 1, scopes: ['public_repo'] };

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// A past year, so no pixel is ever in the future.
function calendar(countFor?: (date: string, week: number, weekday: number) => number): Calendar {
    return { ...makeCalendar('2024-01-01', '2024-12-31', countFor), login: 'octo' };
}

interface Api {
    me?: typeof octo | null;
    paint?: (body: Record<string, unknown>) => Response;
}

function mockApi({ me = octo, paint }: Api = {}) {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/auth/me') return json({ user: me });
        if (url === '/api/paintings' && init?.method === 'POST') {
            const body = JSON.parse(String(init.body)) as Record<string, unknown>;
            return paint ? paint(body) : json({ shareId: 'abc123', repoUrl: 'https://github.com/octo/paint-hi', repoName: 'paint-hi', commitCount: 42 }, 201);
        }
        return json({ error: 'Not found' }, 404);
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
}

function renderPanel(cal = calendar(), { rolling = false, onShowMine = vi.fn() } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <DesignPanel calendar={cal} year={rolling ? undefined : 2024} onShowMine={onShowMine} />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { onShowMine };
}

function paintedCells() {
    return document.querySelectorAll('[data-level]:not([data-level="0"])');
}

beforeEach(() => sessionStorage.clear());
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('DesignPanel', () => {
    it('draws typed text over the graph', async () => {
        mockApi();
        renderPanel();
        expect(paintedCells()).toHaveLength(0);
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        // H = 17 pixels, I = 15.
        expect(paintedCells()).toHaveLength(32);
        expect(screen.getByTestId('commit-estimate')).toHaveTextContent(/32 commits \(1 per day\)/);
        expect(screen.getByLabelText('Repo name')).toHaveValue('paint-hi');
    });

    it('warns about real commits inside the painting and finds a clear spot', async () => {
        // Commits all over the middle of the year, where a year-mode painting starts.
        mockApi();
        renderPanel(calendar((_d, week) => (week >= 20 && week <= 32 ? 3 : 0)));
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        expect(screen.getByText(/of your commits on .* overlap here/)).toBeInTheDocument();
        expect(document.querySelectorAll('[data-highlight="conflict"]').length).toBeGreaterThan(0);

        await userEvent.click(screen.getByRole('button', { name: 'Find best spot' }));
        expect(screen.getByText('Moved to a spot with no overlapping commits.')).toBeInTheDocument();
        expect(screen.queryByText(/overlap here/)).not.toBeInTheDocument();
    });

    it('paints and shows the done screen', async () => {
        const fetch = mockApi();
        renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        await userEvent.click(await screen.findByRole('button', { name: 'Paint' }));

        expect(await screen.findByRole('heading', { name: 'Done!' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View repo on GitHub' })).toHaveAttribute('href', 'https://github.com/octo/paint-hi');

        const [, init] = fetch.mock.calls.find(([url]) => url === '/api/paintings')!;
        const body = JSON.parse(String(init!.body));
        expect(body).toMatchObject({
            text: 'Hi',
            placement: { mode: 'year', year: 2024 },
            shade: 4,
            perCell: 1,
            repoName: 'paint-hi',
            isPrivate: false,
        });
        expect(body.pattern).toHaveLength(7);
        expect(body.plan).toHaveLength(32);
        expect(sessionStorage.getItem('gp:draft')).toBeNull();
    });

    it('asks signed-out visitors to sign in and keeps the draft', async () => {
        mockApi({ me: null });
        renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'Yo');
        expect(await screen.findByRole('link', { name: 'Sign in with GitHub to paint' })).toHaveAttribute(
            'href',
            expect.stringContaining('/api/auth/login?returnTo='),
        );
        expect(JSON.parse(sessionStorage.getItem('gp:draft')!)).toMatchObject({ login: 'octo', year: 2024, text: 'Yo' });
    });

    it('restores a saved draft for the same graph', async () => {
        sessionStorage.setItem(
            'gp:draft',
            JSON.stringify({ login: 'OCTO', year: 2024, source: 'text', text: 'Back', drawn: null, offset: 5, shade: 2, repoName: 'mine', isPrivate: false }),
        );
        mockApi();
        renderPanel();
        expect(screen.getByLabelText('Text')).toHaveValue('Back');
        expect(screen.getByLabelText('Repo name')).toHaveValue('mine');
        expect(screen.getByLabelText('Position')).toHaveValue('5');
    });

    it("won't paint someone else's graph", async () => {
        mockApi({ me: { ...octo, login: 'mona' } });
        const { onShowMine } = renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        expect(screen.queryByRole('button', { name: 'Paint' })).not.toBeInTheDocument();
        await userEvent.click(await screen.findByRole('button', { name: 'Design on my graph' }));
        expect(onShowMine).toHaveBeenCalledWith('mona');
    });

    it('needs the repo permission before painting privately', async () => {
        mockApi();
        renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        await userEvent.click(screen.getByLabelText('Private repo'));
        expect(screen.getByText(/Private contributions/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Grant permission on GitHub' })).toHaveAttribute('href', expect.stringContaining('scope=repo'));
        expect(await screen.findByRole('button', { name: 'Paint' })).toBeDisabled();
    });

    it('shows the daily limit in hours', async () => {
        mockApi({ paint: () => json({ error: 'limit', retryAfterSeconds: 7200 }, 429) });
        renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        await userEvent.click(await screen.findByRole('button', { name: 'Paint' }));
        expect(await screen.findByRole('alert')).toHaveTextContent("today's limit of 5 paintings. Try again in about 2 hours.");
    });

    it('puts a taken repo name error on the field', async () => {
        mockApi({ paint: () => json({ error: 'No free repository name near "paint-hi"', field: 'repoName' }, 409) });
        renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        await userEvent.click(await screen.findByRole('button', { name: 'Paint' }));
        await screen.findByRole('alert');
        expect(screen.getByLabelText('Repo name')).toHaveAttribute('aria-invalid', 'true');
        await userEvent.type(screen.getByLabelText('Repo name'), '-2');
        expect(screen.getByLabelText('Repo name')).not.toHaveAttribute('aria-invalid');
    });

    it('starts the pixel editor from the text', async () => {
        mockApi();
        renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'I');
        await userEvent.click(screen.getByRole('tab', { name: 'Draw' }));
        const editor = screen.getByRole('group', { name: 'Pixel editor' });
        // "I" plus a blank column either side.
        expect(within(editor).getAllByRole('button', { pressed: true })).toHaveLength(15);
        expect(within(editor).getAllByRole('button')).toHaveLength(7 * 7);
    });

    it('updates the graph live while drawing', async () => {
        mockApi();
        renderPanel();
        await userEvent.click(screen.getByRole('tab', { name: 'Draw' }));
        expect(paintedCells()).toHaveLength(0);
        await userEvent.click(screen.getByRole('button', { name: 'Monday, column 3' }));
        await userEvent.click(screen.getByRole('button', { name: 'Tuesday, column 4' }));
        expect(paintedCells()).toHaveLength(2);
    });

    it('limits the slider to spots inside the graph', async () => {
        mockApi();
        renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        expect(screen.getByLabelText('Position')).toHaveAttribute('max', String(53 - 11));
    });

    it('warns that the last-12-months painting slides off', async () => {
        mockApi();
        renderPanel(calendar(), { rolling: true });
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        expect(screen.getByText(/slides left every week/)).toBeInTheDocument();
    });

    it('calibrates the commit count to the chosen shade', async () => {
        mockApi();
        // Twenty busy weeks at 8 a day: the darkest shade needs as many, the lightest just one.
        renderPanel(calendar((_d, week) => (week < 20 ? 8 : 0)));
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        expect(screen.getByTestId('commit-estimate')).toHaveTextContent('~256 commits (8 per day)');

        await userEvent.click(screen.getByRole('button', { name: 'Shade 1' }));
        expect(screen.getByRole('button', { name: 'Shade 1' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('commit-estimate')).toHaveTextContent('~32 commits (1 per day)');
        expect(document.querySelectorAll('[data-level="1"]')).toHaveLength(32);
    });

    it('offers share buttons after painting', async () => {
        mockApi();
        renderPanel();
        await userEvent.type(screen.getByLabelText('Text'), 'Hi');
        await userEvent.click(await screen.findByRole('button', { name: 'Paint' }));
        expect(await screen.findByRole('link', { name: 'Share on X' })).toHaveAttribute('href', expect.stringContaining('%2Fp%2Fabc123'));
        expect(screen.getByRole('button', { name: 'Download image' })).toBeInTheDocument();
    });
});

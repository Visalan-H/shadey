import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paintingCalendar, type SharedPainting } from '../lib/share';
import { SharePage } from './SharePage';

function painting(overrides: Partial<SharedPainting> = {}): SharedPainting {
    return {
        shareId: 'abc',
        login: 'octo',
        text: 'HI',
        repoUrl: 'https://github.com/octo/paint-hi',
        repoName: 'paint-hi',
        isPrivate: false,
        status: 'painted',
        createdAt: '2025-01-01T00:00:00Z',
        placement: { mode: 'year', year: 2024, offset: 0 },
        shade: 4,
        pattern: [],
        cells: [
            { date: '2024-03-04', level: 4, count: 2 },
            { date: '2024-03-05', level: 3, count: 2 },
        ],
        ...overrides,
    };
}

function mockApi(status: number, body: unknown) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })),
    );
}

function renderAt(id = 'abc') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[`/p/${id}`]}>
                <Routes>
                    <Route path="/p/:id" element={<SharePage />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('reports and takedowns', () => {
    it('says when a painting was taken down', async () => {
        mockApi(410, { error: 'This painting was taken down' });
        renderAt();
        expect(await screen.findByText('This painting was taken down.')).toBeInTheDocument();
    });

    it('sends a report with the reason', async () => {
        const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
            init?.method === 'POST'
                ? new Response(null, { status: 204 })
                : new Response(JSON.stringify(painting()), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        );
        vi.stubGlobal('fetch', fetch);
        renderAt();
        await userEvent.click(await screen.findByRole('button', { name: 'Report this painting' }));
        await userEvent.type(screen.getByLabelText(/What's wrong with it/), 'Offensive');
        await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
        expect(await screen.findByText("Thanks. We'll take a look.")).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledWith('/api/paintings/abc/report', expect.objectContaining({ method: 'POST', body: '{"reason":"Offensive"}' }));
    });
});

describe('paintingCalendar', () => {
    it('spans the painted year with only the painting lit', () => {
        const cal = paintingCalendar(painting());
        expect(cal.from).toBe('2024-01-01');
        expect(cal.to).toBe('2024-12-31');
        expect(cal.weeks).toHaveLength(53);
        const lit = cal.weeks.flat().filter((d) => d && d.level > 0);
        expect(lit.map((d) => [d!.date, d!.level])).toEqual([
            ['2024-03-04', 4],
            ['2024-03-05', 3],
        ]);
    });

    it('ends a rolling painting on the Saturday of its latest week', () => {
        const cal = paintingCalendar(painting({ placement: { mode: 'rolling', offset: 0 }, cells: [{ date: '2025-03-05', level: 2, count: 1 }] }));
        expect(cal.to).toBe('2025-03-08');
        expect(cal.weeks).toHaveLength(53);
        expect(cal.weeks.at(-1)![3]).toMatchObject({ date: '2025-03-05', level: 2 });
    });
});

describe('SharePage', () => {
    it('shows the painting with share buttons and a call to action', async () => {
        mockApi(200, painting());
        renderAt();
        expect(await screen.findByRole('heading', { name: '@octo painted "HI"' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: '2 contributions on 2024-03-04' })).toHaveAttribute('data-level', '4');
        expect(screen.getByRole('link', { name: 'paint-hi' })).toHaveAttribute('href', 'https://github.com/octo/paint-hi');
        expect(screen.getByRole('link', { name: 'Share on X' })).toHaveAttribute('href', expect.stringContaining('on%20their%20GitHub%20graph'));
        expect(screen.getByRole('button', { name: 'Download image' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Paint yours' })).toHaveAttribute('href', '/');
        expect(document.title).toBe('@octo painted "HI" · Shadey');
    });

    it('hides the repo link for private paintings', async () => {
        mockApi(200, painting({ isPrivate: true, repoUrl: undefined }));
        renderAt();
        await screen.findByRole('heading');
        expect(screen.queryByRole('link', { name: 'paint-hi' })).not.toBeInTheDocument();
    });

    it('says when the painting was removed', async () => {
        mockApi(200, painting({ status: 'deleted' }));
        renderAt();
        expect(await screen.findByText('@octo removed this painting.')).toBeInTheDocument();
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('says when the painting does not exist', async () => {
        mockApi(404, { error: 'Painting not found' });
        renderAt('nope');
        expect(await screen.findByText("This painting doesn't exist.")).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Paint yours' })).toBeInTheDocument();
    });
});

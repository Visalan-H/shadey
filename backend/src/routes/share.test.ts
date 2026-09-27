import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { PaintingModel } from '../models/Painting.js';
import { setAuthEnv } from '../test/authEnv.js';
import { useTestDb } from '../test/mongo.js';
import { escapeHtml, resetShellCache, shareWeeks } from './share.js';

// useTestDb already connected mongoose to the in-memory server.
vi.mock('../db.js', () => ({ connectDb: async () => undefined }));

setAuthEnv();
useTestDb();

const SHELL = '<!doctype html><html><head><meta charset="UTF-8" /><title>Shadey</title></head><body><div id="root"></div></body></html>';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let shellRequests = 0;
const api = setupServer();
beforeAll(() => api.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => api.resetHandlers());
afterAll(() => api.close());
beforeEach(async () => {
    await PaintingModel.deleteMany({});
    resetShellCache();
    shellRequests = 0;
    api.use(
        http.get('https://shadey.test/index.html', () => {
            shellRequests++;
            return new HttpResponse(SHELL, { headers: { 'content-type': 'text/html' } });
        }),
    );
});

const app = createApp();

function makePainting(overrides: Record<string, unknown> = {}) {
    return PaintingModel.create({
        shareId: 'abc123',
        userId: new mongoose.Types.ObjectId(),
        login: 'octo',
        repoOwner: 'octo',
        repoName: 'paint-hi',
        repoUrl: 'https://github.com/octo/paint-hi',
        isPrivate: false,
        text: 'HI',
        pattern: Array.from({ length: 7 }, () => [true]),
        placement: { mode: 'year', year: 2024, offset: 0 },
        shade: 4,
        perCell: 1,
        totalCommits: 3,
        cells: [
            { date: '2024-01-01', level: 4, count: 1 },
            { date: '2024-06-15', level: 3, count: 1 },
        ],
        ...overrides,
    });
}

describe('shareWeeks', () => {
    it('lays a year painting on that whole calendar year', () => {
        const weeks = shareWeeks({
            login: 'octo',
            placement: { mode: 'year', year: 2024, offset: 0 },
            cells: [
                { date: '2024-01-01', level: 4, count: 1 },
                { date: '2024-12-31', level: 2, count: 1 },
            ],
            createdAt: new Date(),
        });
        // 2024 starts on a Monday and ends on a Tuesday: 53 Sunday-first weeks.
        expect(weeks).toHaveLength(53);
        expect(weeks[0]![1]).toBe(4);
        expect(weeks[52]![2]).toBe(2);
    });

    it('ends a rolling painting at its latest week', () => {
        const weeks = shareWeeks({
            login: 'octo',
            placement: { mode: 'rolling', offset: 0 },
            cells: [{ date: '2025-03-05', level: 1, count: 1 }],
            createdAt: new Date('2025-03-06T00:00:00Z'),
        });
        expect(weeks).toHaveLength(53);
        expect(weeks[52]![3]).toBe(1);
    });
});

describe('GET /og/:shareId.png', () => {
    it('renders the share image with long caching', async () => {
        await makePainting();
        const res = await request(app).get('/og/abc123.png').buffer(true).parse((r, cb) => {
            const chunks: Buffer[] = [];
            r.on('data', (c: Buffer) => chunks.push(c));
            r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/png');
        expect(res.headers['cache-control']).toContain('s-maxage=');
        const png = res.body as Buffer;
        expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
        expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width: 1200, height: 630 });
    }, 30_000);

    it('404s unknown and deleted paintings', async () => {
        await makePainting({ status: 'deleted' });
        expect((await request(app).get('/og/abc123.png')).status).toBe(404);
        expect((await request(app).get('/og/nope.png')).status).toBe(404);
    });
});

describe('GET /p/:shareId', () => {
    it("serves the app with the painting's preview tags", async () => {
        await makePainting();
        const res = await request(app).get('/p/abc123');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/html/);
        expect(res.text).toContain('<div id="root"></div>');
        expect(res.text).toContain('<title>@octo painted &#34;HI&#34; · Shadey</title>');
        expect(res.text).not.toContain('<title>Shadey</title>');
        expect(res.text).toContain('<meta property="og:image" content="https://shadey.test/og/abc123.png" />');
        expect(res.text).toContain('<meta property="og:url" content="https://shadey.test/p/abc123" />');
        expect(res.text).toContain('<meta name="twitter:card" content="summary_large_image" />');
    });

    it('escapes painting text', async () => {
        await makePainting({ text: '</title><script>alert(1)</script>$&' });
        const res = await request(app).get('/p/abc123');
        expect(res.text).not.toContain('<script>alert(1)</script>');
        expect(res.text).toContain('&#60;script&#62;');
        expect(res.text).toContain('$&#38;');
    });

    it('fetches the app shell once per instance', async () => {
        await makePainting();
        await request(app).get('/p/abc123');
        await request(app).get('/p/abc123');
        expect(shellRequests).toBe(1);
    });

    it('serves the plain app for unknown or deleted paintings', async () => {
        await makePainting({ status: 'deleted' });
        const res = await request(app).get('/p/abc123');
        expect(res.status).toBe(200);
        expect(res.text).toContain('<div id="root"></div>');
        expect(res.text).not.toContain('og:image');
    });

    it('falls back to a minimal page when the shell cannot be fetched', async () => {
        await makePainting();
        api.use(http.get('https://shadey.test/index.html', () => new HttpResponse('down', { status: 503 })));
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await request(app).get('/p/abc123');
        errors.mockRestore();
        expect(res.status).toBe(200);
        expect(res.text).toContain('og:image');
        expect(res.text).toContain('href="https://shadey.test/?from=share"');
    });
});

describe('escapeHtml', () => {
    it('escapes the five HTML-special characters', () => {
        expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&#60;a href=&#34;x&#34;&#62;&#39;&#38;&#39;&#60;/a&#62;');
    });
});

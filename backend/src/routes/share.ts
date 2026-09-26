import { Router } from 'express';
import { connectDb } from '../db.js';
import { env } from '../env.js';
import { PaintingModel, type Painting } from '../models/Painting.js';
// Importing the renderer from here is what makes Vercel's tracer bundle its font and wasm files.
import { renderShareImage } from '../services/shareImage.js';
import type { Level } from '../types.js';

export const router = Router();

const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 53;
const SHARE_ID = /^[\w-]{1,32}$/;
const DESCRIPTION = 'Paint your GitHub contribution graph';
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

type SharedPainting = Pick<Painting, 'login' | 'text' | 'placement' | 'cells' | 'createdAt'>;

function utcDate(date: string) {
    return new Date(`${date}T00:00:00Z`);
}

function sundayOf(date: Date) {
    return new Date(date.getTime() - date.getUTCDay() * DAY);
}

// Same window the share page draws: a whole calendar year for year mode, otherwise the
// 53 weeks ending with the week of the latest painted day. Only the painting is shown.
export function shareWeeks(painting: SharedPainting): Level[][] {
    let first: Date;
    let columns: number;
    if (painting.placement.mode === 'year' && painting.placement.year) {
        const year = painting.placement.year;
        first = sundayOf(new Date(Date.UTC(year, 0, 1)));
        const last = sundayOf(new Date(Date.UTC(year, 11, 31)));
        columns = Math.round((last.getTime() - first.getTime()) / (7 * DAY)) + 1;
    } else {
        const latest = painting.cells.reduce((max, c) => (c.date > max ? c.date : max), '');
        const end = latest ? utcDate(latest) : painting.createdAt;
        first = new Date(sundayOf(end).getTime() - (WEEKS - 1) * 7 * DAY);
        columns = WEEKS;
    }

    const weeks: Level[][] = Array.from({ length: columns }, () => Array<Level>(7).fill(0));
    for (const cell of painting.cells) {
        const days = Math.round((utcDate(cell.date).getTime() - first.getTime()) / DAY);
        const week = weeks[Math.floor(days / 7)];
        if (days >= 0 && week) week[days % 7] = cell.level;
    }
    return weeks;
}

async function findPainting(shareId: string) {
    if (!SHARE_ID.test(shareId)) return null;
    await connectDb();
    return PaintingModel.findOne({ shareId, status: 'painted' }).lean();
}

function appUrl() {
    return env().APP_URL.replace(/\/+$/, '');
}

router.get('/og/:shareId.png', async (req, res) => {
    const painting = await findPainting(req.params.shareId);
    if (!painting) {
        res.status(404).type('text/plain').send('Not found');
        return;
    }
    const png = await renderShareImage({
        login: painting.login,
        title: painting.text ?? '',
        weeks: shareWeeks(painting),
        domain: new URL(appUrl()).host,
    });
    // A painting never changes once made (deleting it just stops the page from linking here).
    res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable',
    });
    res.send(png);
});

// The built index.html lives on the frontend's CDN, not in this function, so fetch it once
// per warm instance. A failed fetch isn't cached so the next request tries again.
let shell: Promise<string> | undefined;

async function fetchShell(): Promise<string> {
    const res = await fetch(`${appUrl()}/index.html`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Fetching the app shell failed with ${res.status}`);
    const html = await res.text();
    if (!html.includes('</head>')) throw new Error('The app shell has no </head>');
    return html;
}

function loadShell() {
    shell ??= fetchShell().catch((err: unknown) => {
        shell = undefined;
        throw err;
    });
    return shell;
}

// Tests only: forget the cached shell.
export function resetShellCache() {
    shell = undefined;
}

export function escapeHtml(text: string) {
    return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function shareTitle(painting: SharedPainting) {
    const text = painting.text?.trim();
    return text ? `@${painting.login} painted "${text}"` : `@${painting.login} painted their graph`;
}

function metaTags(shareId: string, painting: SharedPainting) {
    const title = escapeHtml(shareTitle(painting));
    const url = escapeHtml(`${appUrl()}/p/${shareId}`);
    const image = escapeHtml(`${appUrl()}/og/${shareId}.png`);
    return [
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${title}" />`,
        `<meta property="og:description" content="${DESCRIPTION}" />`,
        `<meta property="og:url" content="${url}" />`,
        `<meta property="og:image" content="${image}" />`,
        `<meta property="og:image:width" content="${IMAGE_WIDTH}" />`,
        `<meta property="og:image:height" content="${IMAGE_HEIGHT}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${title}" />`,
        `<meta name="twitter:description" content="${DESCRIPTION}" />`,
        `<meta name="twitter:image" content="${image}" />`,
    ].join('\n');
}

function injectTags(html: string, title: string, tags: string) {
    const titled = html.replace(/<title>[\s\S]*?<\/title>/, '');
    // Use a function so "$" in user text isn't read as a replacement pattern.
    return titled.replace('</head>', () => `<title>${title}</title>\n${tags}\n</head>`);
}

function fallbackPage(title: string, tags: string) {
    const home = escapeHtml(`${appUrl()}/?from=share`);
    return [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        `<title>${title}</title>`,
        tags,
        '</head>',
        '<body>',
        `<p>${title}</p>`,
        `<p><a href="${home}">Open Graph Painter</a></p>`,
        '</body>',
        '</html>',
    ].join('\n');
}

router.get('/p/:shareId', async (req, res) => {
    const { shareId } = req.params;
    const painting = await findPainting(shareId);
    const title = painting ? escapeHtml(`${shareTitle(painting)} · Graph Painter`) : 'Graph Painter';
    const tags = painting ? metaTags(shareId, painting) : '';

    let html: string;
    try {
        // Unknown paintings still get the app; it shows its own "not found" message.
        html = injectTags(await loadShell(), title, tags);
    } catch (err) {
        console.error(err);
        html = fallbackPage(title, tags);
    }
    res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
    res.type('html').send(html);
});

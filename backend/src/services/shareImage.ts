import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import satori, { type Font } from 'satori';
import type { Level } from '../types.js';

export interface ShareImageInput {
    login: string;
    title: string;
    weeks: Level[][]; // columns of 7 (Sunday..Saturday)
    domain?: string;
}

const WIDTH = 1200;
const HEIGHT = 630;
const PADDING = 60;
const MAX_TITLE = 32;
const DEFAULT_DOMAIN = 'shadey.vercel.app';

// GitHub's light theme contribution shades, indexed by Level.
const PALETTE = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];

let fonts: Font[] | undefined;

// Paths are static and relative to this file so Vercel's file tracer ships the assets.
function loadAssets(): Font[] {
    if (fonts) return fonts;
    // satori loads hb.wasm through a dynamic path the tracer can't follow; this static
    // reference makes sure it is bundled with the function.
    readFileSync(new URL('../../node_modules/harfbuzzjs/hb.wasm', import.meta.url));
    const regular = readFileSync(new URL('../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff', import.meta.url));
    const bold = readFileSync(new URL('../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff', import.meta.url));
    fonts = [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: bold, weight: 700, style: 'normal' },
    ];
    return fonts;
}

// Plain object trees in the shape satori expects from JSX.
interface Node {
    type: string;
    props: { style?: Record<string, unknown>; children?: Node | Node[] | string };
}

function el(style: Record<string, unknown>, children?: Node | Node[] | string): Node {
    return { type: 'div', props: { style: { display: 'flex', ...style }, children } };
}

function truncate(text: string, max: number) {
    const chars = Array.from(text.trim());
    return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}

// The bundled font only covers Latin, so stickers would render as empty boxes. The grid
// below already shows them.
function latinOnly(text: string) {
    return text.replace(/[^\x20-\x7E\u00A0-\u024F]/g, '').replace(/\s+/g, ' ');
}

export function headline(login: string, title: string) {
    const name = `@${truncate(login, 39)}`;
    const clean = truncate(latinOnly(title), MAX_TITLE);
    return clean ? `${name} painted "${clean}"` : `${name} painted their graph`;
}

function grid(weeks: Level[][]): Node {
    // Always size for a full year so every share image has the same scale.
    const columns = Math.max(weeks.length, 53);
    const pitch = Math.floor((WIDTH - PADDING * 2) / columns);
    const gap = Math.max(2, Math.round(pitch * 0.15));
    const cell = pitch - gap;
    const radius = Math.max(2, Math.round(cell * 0.2));

    return el(
        { gap },
        weeks.map((week) =>
            el(
                { flexDirection: 'column', gap },
                Array.from({ length: 7 }, (_, day) =>
                    el({
                        width: cell,
                        height: cell,
                        borderRadius: radius,
                        backgroundColor: PALETTE[week[day] ?? 0],
                    }),
                ),
            ),
        ),
    );
}

export async function renderShareImage(input: ShareImageInput): Promise<Buffer> {
    const root = el(
        {
            width: WIDTH,
            height: HEIGHT,
            padding: PADDING,
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#ffffff',
            fontFamily: 'Inter',
            color: '#1f2328',
        },
        [
            el({ fontSize: 48, fontWeight: 700, textAlign: 'center' }, headline(input.login, input.title)),
            grid(input.weeks),
            el({ fontSize: 26, color: '#59636e' }, `Paint yours at ${input.domain ?? DEFAULT_DOMAIN}`),
        ],
    );

    // satori's types expect React elements; plain objects of the same shape work at runtime.
    const svg = await satori(root as unknown as Parameters<typeof satori>[0], {
        width: WIDTH,
        height: HEIGHT,
        fonts: loadAssets(),
    });
    return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
}

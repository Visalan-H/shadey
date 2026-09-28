import { describe, expect, it } from 'vitest';
import type { Level } from '../types.js';
import { headline, renderShareImage } from './shareImage.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// IHDR is always the first chunk: width and height are big-endian at bytes 16 and 20.
function pngSize(png: Buffer) {
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function fullGrid(): Level[][] {
    return Array.from({ length: 53 }, (_, w) =>
        Array.from({ length: 7 }, (_, d) => ((w + d) % 5) as Level),
    );
}

describe('renderShareImage', () => {
    it('renders a 1200x630 PNG for a full year', async () => {
        const start = Date.now();
        const png = await renderShareImage({ login: 'octocat', title: 'HIRE ME', weeks: fullGrid() });
        expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
        expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
        expect(Date.now() - start).toBeLessThan(10_000);
    }, 20_000);

    it('leaves stickers out of the headline, since the font has no glyphs for them', () => {
        expect(headline('octo', 'I ♥ CODE 👾')).toBe('@octo painted "I CODE"');
        expect(headline('octo', '♥')).toBe('@octo painted their graph');
    });

    it('renders an empty grid', async () => {
        const png = await renderShareImage({ login: 'octocat', title: '', weeks: [] });
        expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
        expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
    });

    it('handles long titles, short grids and a custom domain', async () => {
        const png = await renderShareImage({
            login: 'someone-with-a-long-name',
            title: 'A VERY LONG TITLE THAT GOES ON AND ON AND ON FOREVER AND EVER',
            weeks: fullGrid().slice(0, 10),
            domain: 'example.com',
        });
        expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
    });

    it('is fast once warm', async () => {
        await renderShareImage({ login: 'a', title: 'HI', weeks: fullGrid() });
        const start = Date.now();
        await renderShareImage({ login: 'a', title: 'HI', weeks: fullGrid() });
        expect(Date.now() - start).toBeLessThan(3_000);
    });
});

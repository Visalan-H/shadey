import { describe, expect, it } from 'vitest';
import { GLYPH_HEIGHT, GLYPHS, glyphFor, renderText } from './pixelFont';

describe('pixel font', () => {
    it('has every glyph at 5 rows by at most 3 columns, rows of equal width', () => {
        for (const [ch, glyph] of Object.entries(GLYPHS)) {
            expect(glyph, ch).toHaveLength(GLYPH_HEIGHT);
            const width = glyph[0]!.length;
            expect(width, ch).toBeGreaterThanOrEqual(1);
            expect(width, ch).toBeLessThanOrEqual(3);
            for (const row of glyph) {
                expect(row, ch).toMatch(/^[01]+$/);
                expect(row.length, ch).toBe(width);
            }
        }
    });

    it('covers letters, digits and common punctuation', () => {
        const wanted = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 !?.,-\':+=<>/#&♥';
        for (const ch of wanted) expect(GLYPHS[ch], ch).toBeDefined();
    });

    it('draws every letter and digit with at least one pixel', () => {
        for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
            expect(GLYPHS[ch]!.join('')).toContain('1');
        }
    });

    it('renders unknown characters as a blank', () => {
        expect(glyphFor('~')).toEqual(GLYPHS[' ']);
        expect(renderText('~').flat().some(Boolean)).toBe(false);
    });

    it('is case-insensitive', () => {
        expect(renderText('hi')).toEqual(renderText('HI'));
    });

    it('separates glyphs with one blank column and none at the ends', () => {
        // H (3) + gap (1) + I (3)
        const rows = renderText('HI');
        expect(rows).toHaveLength(5);
        for (const row of rows) expect(row).toHaveLength(7);
        expect(rows.every((row) => row[3] === false)).toBe(true);
    });

    it('gives a word break three blank columns', () => {
        // A (3) + gap + space (1) + gap + B (3)
        const rows = renderText('A B');
        expect(rows[0]).toHaveLength(9);
        for (const col of [3, 4, 5]) expect(rows.every((row) => row[col] === false)).toBe(true);
    });

    it('returns 5 empty rows for empty text', () => {
        expect(renderText('')).toEqual([[], [], [], [], []]);
    });
});

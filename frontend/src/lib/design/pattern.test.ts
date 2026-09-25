import { describe, expect, it } from 'vitest';
import { emptyPattern, litCount, patternWidth, textToPattern, togglePixel, trimPattern } from './pattern';
import { renderText } from './pixelFont';

describe('textToPattern', () => {
    it('is 7 rows tall with the glyphs in rows 1..5', () => {
        const pattern = textToPattern('HI');
        expect(pattern).toHaveLength(7);
        expect(pattern[0]!.some(Boolean)).toBe(false);
        expect(pattern[6]!.some(Boolean)).toBe(false);
        expect(pattern.slice(1, 6)).toEqual(renderText('HI'));
    });

    it('is as wide as the glyphs plus one column between each', () => {
        expect(patternWidth(textToPattern('A'))).toBe(3);
        expect(patternWidth(textToPattern('HI'))).toBe(7);
        expect(patternWidth(textToPattern('HIRE ME'))).toBe(4 * 3 + 1 + 2 * 3 + 6);
        expect(patternWidth(textToPattern('!'))).toBe(1);
    });

    it('handles empty text', () => {
        const pattern = textToPattern('');
        expect(pattern).toHaveLength(7);
        expect(patternWidth(pattern)).toBe(0);
    });
});

describe('pattern helpers', () => {
    it('makes an empty pattern of a given width', () => {
        const pattern = emptyPattern(4);
        expect(pattern).toHaveLength(7);
        expect(pattern.every((row) => row.length === 4 && !row.some(Boolean))).toBe(true);
        expect(patternWidth(emptyPattern(0))).toBe(0);
    });

    it('toggles pixels without mutating the input', () => {
        const before = emptyPattern(3);
        const after = togglePixel(before, 2, 1, true);
        expect(before[2]![1]).toBe(false);
        expect(after[2]![1]).toBe(true);
        expect(togglePixel(after, 2, 1)[2]![1]).toBe(false);
        expect(togglePixel(after, 2, 1, true)[2]![1]).toBe(true);
        // untouched rows are shared, the changed row is new
        expect(after[0]).toBe(before[0]);
        expect(after[2]).not.toBe(before[2]);
    });

    it('ignores out-of-range toggles', () => {
        const pattern = emptyPattern(2);
        expect(togglePixel(pattern, 7, 0, true)).toBe(pattern);
        expect(togglePixel(pattern, 0, 2, true)).toBe(pattern);
        expect(togglePixel(pattern, -1, 0, true)).toBe(pattern);
    });

    it('trims empty columns on both ends only', () => {
        let pattern = emptyPattern(6);
        pattern = togglePixel(pattern, 1, 1, true);
        pattern = togglePixel(pattern, 5, 3, true);
        const trimmed = trimPattern(pattern);
        expect(patternWidth(trimmed)).toBe(3);
        expect(trimmed[1]).toEqual([true, false, false]);
        expect(trimmed[5]).toEqual([false, false, true]);
        expect(patternWidth(trimPattern(emptyPattern(5)))).toBe(0);
        expect(trimPattern(emptyPattern(5))).toHaveLength(7);
    });

    it('counts lit pixels', () => {
        expect(litCount(emptyPattern(5))).toBe(0);
        expect(litCount(textToPattern('I'))).toBe(9);
        expect(litCount(textToPattern('HI'))).toBe(11 + 9);
    });
});

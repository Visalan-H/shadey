import type { Pattern } from '../types';
import { GLYPH_HEIGHT, renderText } from './pixelFont';

export const DAYS = 7;
// Glyphs sit in rows 1..5, leaving Sunday and Saturday as a margin.
const TEXT_TOP = Math.floor((DAYS - GLYPH_HEIGHT) / 2);

export function patternWidth(pattern: Pattern): number {
    return pattern[0]?.length ?? 0;
}

export function emptyPattern(width: number): Pattern {
    return Array.from({ length: DAYS }, () => Array<boolean>(Math.max(0, width)).fill(false));
}

export function textToPattern(text: string): Pattern {
    const bitmap = renderText(text);
    const pattern = emptyPattern(bitmap[0]?.length ?? 0);
    bitmap.forEach((row, r) => {
        pattern[r + TEXT_TOP] = [...row];
    });
    return pattern;
}

// Immutable: returns a new pattern (only the touched row is copied). Omit value
// to flip the pixel. Out-of-range coordinates return the input unchanged.
export function togglePixel(pattern: Pattern, row: number, col: number, value?: boolean): Pattern {
    const current = pattern[row]?.[col];
    if (current === undefined) return pattern;
    const next = value ?? !current;
    if (next === current) return pattern;
    return pattern.map((cells, r) => (r === row ? cells.map((cell, c) => (c === col ? next : cell)) : cells));
}

function columnLit(pattern: Pattern, col: number): boolean {
    return pattern.some((row) => row[col] === true);
}

// Drops empty columns at both ends; an all-empty pattern becomes width 0.
export function trimPattern(pattern: Pattern): Pattern {
    const width = patternWidth(pattern);
    let start = 0;
    while (start < width && !columnLit(pattern, start)) start++;
    let end = width;
    while (end > start && !columnLit(pattern, end - 1)) end--;
    return Array.from({ length: DAYS }, (_, r) => (pattern[r] ?? []).slice(start, end));
}

export function litCount(pattern: Pattern): number {
    return pattern.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
}

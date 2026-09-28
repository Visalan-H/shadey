import type { Pattern } from '../types';
import { GLYPH_HEIGHT, renderText } from './pixelFont';

export const DAYS = 7;
// Centres the glyphs vertically; the current font fills all 7 rows, so this is 0.
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

// The drawing sits on top of the text. true paints a cell, false rubs out a text cell and
// null lets the text show through, so editing the text later keeps the drawing.
export type Ink = (boolean | null)[][];

export function inkWidth(ink: Ink | null): number {
    return ink?.[0]?.length ?? 0;
}

// Pads with null or cuts to exactly `width` columns.
export function resizeInk(ink: Ink | null, width: number): Ink {
    return Array.from({ length: DAYS }, (_, r) => Array.from({ length: Math.max(0, width) }, (_, c) => ink?.[r]?.[c] ?? null));
}

export function hasInk(ink: Ink | null): boolean {
    return Boolean(ink?.some((row) => row.some((cell) => cell !== null)));
}

// What the editor shows: the drawing where it has marks, the text everywhere else.
export function composeInk(base: Pattern, ink: Ink | null): Pattern {
    const width = Math.max(patternWidth(base), inkWidth(ink));
    return Array.from({ length: DAYS }, (_, r) => Array.from({ length: width }, (_, c) => ink?.[r]?.[c] ?? base[r]?.[c] ?? false));
}

// Immutable, like togglePixel. A mark that matches the text underneath is dropped, so the
// cell follows the text again.
export function setInk(ink: Ink, base: Pattern, row: number, col: number, value: boolean): Ink {
    const current = ink[row]?.[col];
    if (current === undefined) return ink;
    const under = base[row]?.[col] ?? false;
    if ((current ?? under) === value) return ink;
    const next = value === under ? null : value;
    return ink.map((cells, r) => (r === row ? cells.map((cell, c) => (c === col ? next : cell)) : cells));
}

// Text with a blank column either side, so the drawing can touch up its edges.
export function textLayer(text: string): Pattern {
    const pattern = textToPattern(text);
    if (patternWidth(pattern) === 0) return pattern;
    return pattern.map((row) => [false, ...row, false]);
}

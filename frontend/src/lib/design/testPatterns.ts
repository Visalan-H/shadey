import type { Pattern } from '../types';

// Test helper: a 7-row pattern from '0'/'1' strings, so placement and shade tests
// don't change every time the font does.
export function patternFrom(rows: readonly string[]): Pattern {
    return rows.map((row) => Array.from(row, (bit) => bit === '1'));
}

// A 3-wide "I" on Monday..Friday: top and bottom bars plus a stem, 9 lit cells.
export const I = patternFrom(['000', '111', '010', '010', '010', '111', '000']);

// "HI": a 3-wide H, one blank column, then I. 7 wide, 20 lit cells.
export const HI = patternFrom(['0000000', '1010111', '1010010', '1110010', '1010010', '1010111', '0000000']);

// A single lit row, for tests that only care about width.
export function bar(width: number): Pattern {
    return patternFrom(['', '', '', '1'.repeat(width), '', '', ''].map((row) => row.padEnd(width, '0')));
}

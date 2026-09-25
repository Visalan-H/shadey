import type { Calendar, Level, Pattern } from '../types';
import { cellsFor, conflicts, type ConflictCell, type PlacedCell } from './placement';
import { calibrate, commitPlan, type Calibration, type CommitDay } from './shade';

export interface PreviewCell {
    level?: Level;
    highlight?: 'conflict' | 'outOfBounds';
}

export interface Preview {
    cells: PlacedCell[];
    // Lit pixels that land outside the graph or on a future day.
    misfits: number;
    conflicts: ConflictCell[];
    // Real commits sitting on the conflicting days.
    conflictCommits: number;
    calibration: Calibration;
    plan: CommitDay[];
    // Keyed by `${week}-${weekday}`, ready for Graph's overlay.
    overlay: Map<string, PreviewCell>;
}

export function cellKey(week: number, weekday: number) {
    return `${week}-${weekday}`;
}

// Everything the design panel shows for one placement: where each pixel lands,
// what it overlaps, the calibrated shade and the commits to push.
export function buildPreview(calendar: Calendar, pattern: Pattern, offset: number, shade: Level, today: string): Preview {
    const cells = cellsFor(calendar, pattern, offset, today);
    const overlap = conflicts(calendar, pattern, offset);
    const calibration = calibrate(calendar, cells, shade);
    const achieved = new Map(calibration.dates.map((date, i) => [date, calibration.achieved[i]]));

    const overlay = new Map<string, PreviewCell>();
    let misfits = 0;
    for (const cell of cells) {
        if (cell.status === 'ok' && cell.date) {
            overlay.set(cellKey(cell.week, cell.weekday), { level: achieved.get(cell.date) ?? shade });
        } else {
            misfits++;
            overlay.set(cellKey(cell.week, cell.weekday), { level: shade, highlight: 'outOfBounds' });
        }
    }
    for (const cell of overlap.cells) overlay.set(cellKey(cell.week, cell.weekday), { highlight: 'conflict' });

    return {
        cells,
        misfits,
        conflicts: overlap.cells,
        conflictCommits: overlap.cells.reduce((sum, c) => sum + c.count, 0),
        calibration,
        plan: commitPlan(cells, calibration.perCell),
        overlay,
    };
}

// The backend only accepts dates up to today in UTC, so "future" is judged the same way.
export function todayUtc(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

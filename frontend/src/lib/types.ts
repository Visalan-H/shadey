// Shared shapes. Keep in sync with backend/src/types.ts.

// 0 = no contributions, 1-4 = GitHub's quartile shades.
export type Level = 0 | 1 | 2 | 3 | 4;

export interface CalendarDay {
    date: string; // YYYY-MM-DD
    count: number;
    level: Level;
}

// Columns are weeks (Sunday first). Each week has 7 slots; null pads days outside the range.
export interface Calendar {
    login: string;
    from: string; // YYYY-MM-DD
    to: string; // YYYY-MM-DD
    weeks: (CalendarDay | null)[][];
}

// A pattern is 7 rows (Sunday..Saturday) by N week-columns; true = paint this cell.
export type Pattern = boolean[][];

// A painted cell's target shade: GitHub's levels 1-4.
export type Shade = Exclude<Level, 0>;

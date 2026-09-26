import type { Calendar, Level } from '../types.js';

// Same quartile model as frontend/src/lib/design/shade.ts: GitHub doesn't document how it
// picks shades, so we take the 25th/50th/75th percentiles of the non-zero days' counts.
type Thresholds = readonly [number, number, number];

function quantile(sorted: number[], p: number): number {
    const h = (sorted.length - 1) * p;
    const lo = Math.floor(h);
    const a = sorted[lo] ?? 0;
    const b = sorted[lo + 1] ?? a;
    return a + (h - lo) * (b - a);
}

function levelFor(count: number, [q1, q2, q3]: Thresholds): Level {
    if (count <= 0) return 0;
    if (count >= q3) return 4;
    if (count >= q2) return 3;
    if (count >= q1) return 2;
    return 1;
}

export function levelsFor(counts: number[]): Level[] {
    const sorted = counts.filter((c) => c > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return counts.map(() => 0);
    const thresholds: Thresholds = [quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75)];
    return counts.map((c) => levelFor(c, thresholds));
}

export interface TopUp {
    dates: string[]; // painted days GitHub shows lighter than the target
    perCell: number; // extra commits for each of those days; 0 when nothing is light
    capped: boolean; // even perCell didn't reach the target in the model
}

// GitHub's real levels decide which painted days came out light. The model then picks the
// fewest extra commits per light day that lifts them all to the target.
export function planTopUp(calendar: Calendar, paintedDates: string[], target: Level, cap: number): TopUp {
    const days = calendar.weeks.flat().filter((d) => d !== null);
    const painted = new Set(paintedDates);
    const light = new Set(days.filter((d) => painted.has(d.date) && d.level < target).map((d) => d.date));
    if (light.size === 0 || cap < 1) return { dates: [...light], perCell: 0, capped: light.size > 0 };

    const base = days.map((d) => d.count);
    const reaches = (n: number) => {
        const levels = levelsFor(days.map((d, i) => base[i]! + (light.has(d.date) ? n : 0)));
        return days.every((d, i) => !light.has(d.date) || levels[i]! >= target);
    };
    for (let n = 1; n <= cap; n++) {
        if (reaches(n)) return { dates: [...light].sort(), perCell: n, capped: false };
    }
    return { dates: [...light].sort(), perCell: cap, capped: true };
}

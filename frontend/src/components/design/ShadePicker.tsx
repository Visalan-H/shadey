import type { Calibration } from '../../lib/design';
import type { Shade } from '../../lib/types';

// GitHub's palette, matching Graph.
const SWATCHES: Record<Shade, string> = {
    1: 'bg-[#9be9a8] dark:bg-[#0e4429]',
    2: 'bg-[#40c463] dark:bg-[#006d32]',
    3: 'bg-[#30a14e] dark:bg-[#26a641]',
    4: 'bg-[#216e39] dark:bg-[#39d353]',
};

const SHADES: Shade[] = [1, 2, 3, 4];

interface Props {
    shade: Shade;
    onChange: (shade: Shade) => void;
    calibration: Calibration | null;
}

export function ShadePicker({ shade, onChange, calibration }: Props) {
    const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
    return (
        <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Shade</legend>
            <div className="flex items-center gap-2">
                {SHADES.map((level) => (
                    <button
                        key={level}
                        type="button"
                        aria-pressed={shade === level}
                        aria-label={`Shade ${level}`}
                        onClick={() => onChange(level)}
                        className={`h-8 w-8 rounded-md ${SWATCHES[level]} ${
                            shade === level
                                ? 'ring-2 ring-neutral-900 ring-offset-2 dark:ring-white dark:ring-offset-neutral-950'
                                : 'hover:ring-2 hover:ring-neutral-300 dark:hover:ring-neutral-700'
                        }`}
                    />
                ))}
            </div>
            {calibration && calibration.dates.length > 0 && (
                <div className="flex flex-col gap-1 text-sm" aria-live="polite">
                    <p data-testid="commit-estimate">
                        ~{plural(calibration.totalCommits, 'commit')} ({calibration.perCell.toLocaleString()} per day)
                    </p>
                    {(!calibration.exact || calibration.capped) && (
                        <p className="text-amber-700 dark:text-amber-400">
                            Some painted days may not land exactly on this shade, because GitHub shades days relative to your
                            busiest ones. It will still be close.
                        </p>
                    )}
                    {calibration.realDaysShifted > 0 && (
                        <p className="text-neutral-600 dark:text-neutral-400">
                            {calibration.realDaysShifted.toLocaleString()} of your real days will look a shade lighter.
                        </p>
                    )}
                </div>
            )}
        </fieldset>
    );
}

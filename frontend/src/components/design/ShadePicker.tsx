import type { Calibration } from '../../lib/design';
import type { Shade } from '../../lib/types';
import { Row } from './Row';

// GitHub's palette, matching Graph.
const SWATCHES: Record<Shade, string> = {
    1: 'bg-lvl-1',
    2: 'bg-lvl-2',
    3: 'bg-lvl-3',
    4: 'bg-lvl-4',
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
        <Row label="Shade" legend="Shade">
            <div className="flex items-center gap-2">
                {SHADES.map((level) => (
                    <button
                        key={level}
                        type="button"
                        aria-pressed={shade === level}
                        aria-label={`Shade ${level}`}
                        onClick={() => onChange(level)}
                        className={`h-7 w-7 rounded-md outline outline-1 -outline-offset-1 outline-cell-line ${SWATCHES[level]} ${
                            shade === level ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas' : 'hover:ring-2 hover:ring-line'
                        }`}
                    />
                ))}
            </div>
            {calibration && calibration.dates.length > 0 && (
                <p className="text-sm text-muted" aria-live="polite">
                    <span data-testid="commit-estimate">
                        About {plural(calibration.totalCommits, 'commit')}, {calibration.perCell.toLocaleString()} per day.
                    </span>
                    {/* GitHub shades each day relative to your busiest ones, so exact isn't always possible. */}
                    {(!calibration.exact || calibration.capped) && ' Some days may land a shade off.'}
                    {calibration.realDaysShifted > 0 && ` ${plural(calibration.realDaysShifted, 'real day')} will look lighter.`}
                </p>
            )}
        </Row>
    );
}

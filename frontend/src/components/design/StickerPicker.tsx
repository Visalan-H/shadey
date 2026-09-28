import { STICKERS, type Sticker } from '../../lib/design';

interface Props {
    onPick: (char: string) => void;
}

const CELL = 3;

// Each button shows the sticker's actual pixels, so what you tap is what gets painted.
function StickerImage({ sticker }: { sticker: Sticker }) {
    const width = sticker.rows[0]!.length;
    return (
        <svg width={width * CELL} height={7 * CELL} viewBox={`0 0 ${width * CELL} ${7 * CELL}`} aria-hidden="true" className="fill-lvl-4">
            {sticker.rows.flatMap((row, r) =>
                [...row].map((bit, c) =>
                    bit === '1' ? <rect key={`${r}-${c}`} x={c * CELL} y={r * CELL} width={CELL - 0.5} height={CELL - 0.5} rx={0.5} /> : null,
                ),
            )}
        </svg>
    );
}

export function StickerPicker({ onPick }: Props) {
    return (
        <div role="group" aria-label="Stickers" className="flex flex-wrap gap-1.5">
            {STICKERS.map((sticker) => (
                <button
                    key={sticker.char}
                    type="button"
                    title={sticker.name}
                    aria-label={`Add ${sticker.name.toLowerCase()}`}
                    onClick={() => onPick(sticker.char)}
                    className="btn h-9 min-w-9 px-2"
                >
                    <StickerImage sticker={sticker} />
                </button>
            ))}
        </div>
    );
}

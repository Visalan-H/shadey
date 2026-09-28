// Ready-made drawings. Each one is a character, so it drops into the text like a letter
// and can sit next to words: "I ♥ CODE". Glyphs are 7 rows like the font; '1' = filled.
export interface Sticker {
    char: string;
    name: string;
    rows: readonly string[];
}

export const STICKERS: readonly Sticker[] = [
    { char: '♥', name: 'Heart', rows: ['0110110', '1111111', '1111111', '1111111', '0111110', '0011100', '0001000'] },
    { char: '★', name: 'Star', rows: ['000010000', '000111000', '111111111', '011111110', '001111100', '011101110', '110000011'] },
    { char: '☺', name: 'Smiley', rows: ['0000000', '0100010', '0100010', '0000000', '1000001', '0100010', '0011100'] },
    { char: '💀', name: 'Skull', rows: ['0111110', '1111111', '1001001', '1001001', '1110111', '0111110', '0101010'] },
    { char: '⚡', name: 'Lightning', rows: ['00011', '00110', '01100', '11111', '00110', '01100', '11000'] },
    { char: '👑', name: 'Crown', rows: ['0000000', '1001001', '1101011', '1111111', '1111111', '1111111', '0000000'] },
    { char: '🌲', name: 'Tree', rows: ['0001000', '0011100', '0111110', '0011100', '0111110', '1111111', '0001000'] },
    { char: '♫', name: 'Music', rows: ['0011111', '0010001', '0010001', '0010001', '0110011', '1110111', '1100110'] },
    { char: '◆', name: 'Diamond', rows: ['0001000', '0011100', '0111110', '1111111', '0111110', '0011100', '0001000'] },
    { char: '✓', name: 'Check mark', rows: ['0000000', '0000001', '0000011', '1000110', '1101100', '0111000', '0010000'] },
    { char: '→', name: 'Arrow', rows: ['0001000', '0001100', '1111110', '1111111', '1111110', '0001100', '0001000'] },
];

// Emoji keyboards offer several versions of the same thing; draw them all the same way.
export const STICKER_ALIASES: Readonly<Record<string, string>> = {
    '❤': '♥',
    '♡': '♥',
    '💚': '♥',
    '💙': '♥',
    '💜': '♥',
    '🧡': '♥',
    '💛': '♥',
    '🖤': '♥',
    '🤍': '♥',
    '⭐': '★',
    '☆': '★',
    '🌟': '★',
    '☻': '☺',
    '🙂': '☺',
    '😊': '☺',
    '😀': '☺',
    '😃': '☺',
    '♪': '♫',
    '🎵': '♫',
    '🎶': '♫',
    '♦': '◆',
    '💎': '◆',
    '✔': '✓',
    '✅': '✓',
    '➡': '→',
    '🌳': '🌲',
    '🎄': '🌲',
};

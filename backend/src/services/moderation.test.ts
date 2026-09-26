import { describe, expect, it } from 'vitest';
import { checkText } from './moderation.js';

describe('checkText', () => {
    it.each(['HIRE ME', 'HELLO WORLD', 'I ♥ CODE', 'CLASSIC', 'ASSESS', 'A B C', 'U S A', ''])('allows %j', (text) => {
        expect(checkText(text)).toEqual({ ok: true });
    });

    it.each(['FUCK', 'shit happens', 'f u c k', 'S.H.I.T', 'SH1T', 'fuuuck you', 'n1gger'])('rejects %j', (text) => {
        const result = checkText(text);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toMatch(/.+/);
    });
});

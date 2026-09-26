import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { setAuthEnv } from '../test/authEnv.js';
import { decrypt, encrypt } from './crypto.js';

beforeAll(setAuthEnv);

describe('token encryption', () => {
    it('round-trips and never contains the plaintext', () => {
        const payload = encrypt('gho_secret123');
        expect(payload).not.toContain('gho_secret123');
        expect(decrypt(payload)).toBe('gho_secret123');
    });

    it('uses a fresh IV every time', () => {
        expect(encrypt('same')).not.toBe(encrypt('same'));
    });

    it('rejects a tampered payload', () => {
        const buf = Buffer.from(encrypt('gho_secret123'), 'base64');
        buf[buf.length - 1]! ^= 1;
        expect(() => decrypt(buf.toString('base64'))).toThrow();
    });

    it('rejects a truncated payload', () => {
        expect(() => decrypt(randomBytes(10).toString('base64'))).toThrow();
    });
});

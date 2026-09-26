import { describe, expect, it } from 'vitest';
import { useTestDb } from '../test/mongo.js';
import { consumePaint, refundPaint } from './rateLimit.js';

useTestDb();

describe('paint rate limit', () => {
    it('allows 5 paints per day, then blocks', async () => {
        const remaining: number[] = [];
        for (let i = 0; i < 5; i++) {
            const res = await consumePaint('user-a');
            expect(res.ok).toBe(true);
            if (res.ok) remaining.push(res.remaining);
        }
        expect(remaining).toEqual([4, 3, 2, 1, 0]);

        const blocked = await consumePaint('user-a');
        expect(blocked.ok).toBe(false);
        if (!blocked.ok) {
            expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
            expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(86400);
        }
    });

    it('keeps users separate', async () => {
        expect(await consumePaint('user-b')).toEqual({ ok: true, remaining: 4 });
    });

    it('refund gives a point back', async () => {
        for (let i = 0; i < 5; i++) await consumePaint('user-c');
        expect((await consumePaint('user-c')).ok).toBe(false);

        await refundPaint('user-c');
        expect(await consumePaint('user-c')).toEqual({ ok: true, remaining: 0 });
        expect((await consumePaint('user-c')).ok).toBe(false);
    });
});

import mongoose from 'mongoose';
import { RateLimiterMongo, RateLimiterRes } from 'rate-limiter-flexible';
import { connectDb } from '../db.js';

const PAINTS_PER_DAY = 5;
const DAY_SECONDS = 24 * 60 * 60;

let limiter: RateLimiterMongo | undefined;

// Built on first use: the limiter grabs its collection in the constructor, so the
// connection has to be open by then.
async function getLimiter() {
    if (limiter) return limiter;
    if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) await connectDb();
    limiter ??= new RateLimiterMongo({
        storeClient: mongoose.connection,
        keyPrefix: 'paint',
        points: PAINTS_PER_DAY,
        duration: DAY_SECONDS,
    });
    return limiter;
}

export type ConsumeResult = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

export async function consumePaint(userId: string): Promise<ConsumeResult> {
    const rl = await getLimiter();
    try {
        const res = await rl.consume(userId);
        return { ok: true, remaining: res.remainingPoints };
    } catch (err) {
        // A RateLimiterRes rejection means the quota is used up; anything else is a store error.
        if (err instanceof RateLimiterRes) {
            // Rejected attempts still increment the counter; undo that so a later refund
            // actually frees a slot instead of cancelling out a blocked retry.
            if (err.consumedPoints > PAINTS_PER_DAY) await rl.reward(userId, err.consumedPoints - PAINTS_PER_DAY);
            return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(err.msBeforeNext / 1000)) };
        }
        throw err;
    }
}

// Gives back a point when a paint was counted but then failed.
export async function refundPaint(userId: string): Promise<void> {
    const rl = await getLimiter();
    await rl.reward(userId, 1);
}

import mongoose from 'mongoose';
import { env } from './env.js';

// Reused across warm invocations on Vercel so each request doesn't open a new connection.
let connecting: Promise<typeof mongoose> | undefined;

export function connectDb(uri?: string) {
    // Already connected (warm instance, or tests that connected to an in-memory server).
    if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
    connecting ??= mongoose.connect(uri ?? env().MONGODB_URI, { maxPoolSize: 5 }).catch((err) => {
        connecting = undefined;
        throw err;
    });
    return connecting;
}

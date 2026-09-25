import mongoose from 'mongoose';
import { env } from './env.js';

// Reused across warm invocations on Vercel so each request doesn't open a new connection.
let connecting: Promise<typeof mongoose> | undefined;

export function connectDb(uri = env().MONGODB_URI) {
    connecting ??= mongoose.connect(uri, { maxPoolSize: 5 }).catch((err) => {
        connecting = undefined;
        throw err;
    });
    return connecting;
}

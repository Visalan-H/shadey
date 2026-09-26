// Test helper: an in-memory MongoDB per test file.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll } from 'vitest';

export function useTestDb() {
    let server: MongoMemoryServer;
    beforeAll(async () => {
        server = await MongoMemoryServer.create();
        await mongoose.connect(server.getUri());
    });
    afterAll(async () => {
        await mongoose.disconnect();
        await server.stop();
    });
}

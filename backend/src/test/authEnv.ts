// Test helper: dummy values for everything sign-in needs. Call before the first request.
import { randomBytes } from 'node:crypto';

export function setAuthEnv() {
    Object.assign(process.env, {
        MONGODB_URI: 'mongodb://unused.test/db',
        GITHUB_TOKEN: 'server-token',
        GITHUB_CLIENT_ID: 'test-client-id',
        GITHUB_CLIENT_SECRET: 'test-client-secret',
        SESSION_SECRET: 'x'.repeat(48),
        TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
        APP_URL: 'https://painter.test',
    });
}

// One cookie's raw Set-Cookie line from a supertest response.
export function setCookie(headers: Record<string, unknown>, name: string): string | undefined {
    const raw = headers['set-cookie'];
    const list = Array.isArray(raw) ? (raw as string[]) : [];
    return list.find((c) => c.startsWith(`${name}=`));
}

// "name=value" part of a Set-Cookie line, ready to send back in a Cookie header.
export function cookiePair(line: string | undefined): string {
    return line?.split(';')[0] ?? '';
}

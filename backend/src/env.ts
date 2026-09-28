import { z } from 'zod';

const schema = z.object({
    MONGODB_URI: z.string().min(1),
    // Server-side token used only to read public contribution calendars (no scopes needed).
    GITHUB_TOKEN: z.string().min(1),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    // Signs session cookies (jose HS256). 32+ random bytes, base64.
    SESSION_SECRET: z.string().min(32),
    // AES-256-GCM key for stored GitHub tokens. 32 random bytes, base64.
    TOKEN_ENCRYPTION_KEY: z.string().min(1),
    // Public frontend origin, e.g. https://shadey.vercel.app (OAuth callbacks, share links).
    APP_URL: z.string().url(),
    // Comma-separated GitHub account ids (api.github.com/users/<login>) that can review reports and take paintings down.
    ADMIN_GITHUB_IDS: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Parsed lazily so tests and routes that don't need a variable don't require it to be set.
export function env(): Env {
    cached ??= schema.parse(process.env);
    return cached;
}

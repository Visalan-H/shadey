import { GitHub } from 'arctic';
import { Octokit } from 'octokit';
import { env } from '../env.js';

export const BASE_SCOPES = ['read:user', 'public_repo'];
// Extra scopes a caller may ask for; anything else is rejected. `repo` allows private paintings.
export const EXTRA_SCOPES = ['repo'] as const;
export type ExtraScope = (typeof EXTRA_SCOPES)[number];

export function isExtraScope(value: unknown): value is ExtraScope {
    return EXTRA_SCOPES.includes(value as ExtraScope);
}

export function githubClient() {
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL } = env();
    return new GitHub(GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, new URL('/api/auth/callback', APP_URL).toString());
}

export interface GitHubProfile {
    githubId: number;
    login: string;
    name: string | null;
    avatarUrl: string;
    scopes: string[];
}

export async function fetchProfile(accessToken: string): Promise<GitHubProfile> {
    const octokit = new Octokit({ auth: accessToken });
    const { data, headers } = await octokit.request('GET /user');
    // Users can uncheck scopes on the consent screen, so trust what GitHub reports, not what we asked for.
    const scopes = String(headers['x-oauth-scopes'] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return { githubId: Number(data.id), login: data.login, name: data.name ?? null, avatarUrl: data.avatar_url, scopes };
}

// Removes the app from the user's authorized OAuth apps on GitHub, which also kills every token
// it holds. Best effort: a failure leaves a token GitHub expires on its own after a year unused.
export async function revokeGrant(accessToken: string): Promise<boolean> {
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env();
    try {
        const res = await fetch(`https://api.github.com/applications/${GITHUB_CLIENT_ID}/grant`, {
            method: 'DELETE',
            headers: {
                accept: 'application/vnd.github+json',
                authorization: `Basic ${Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString('base64')}`,
                'content-type': 'application/json',
                'user-agent': 'shadey',
            },
            body: JSON.stringify({ access_token: accessToken }),
            signal: AbortSignal.timeout(5000),
        });
        // 404: the user already revoked it on GitHub.
        return res.status === 204 || res.status === 404;
    } catch {
        return false;
    }
}

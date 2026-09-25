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

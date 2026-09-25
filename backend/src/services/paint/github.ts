import type { Octokit } from 'octokit';

export const MAX_NAME_ATTEMPTS = 10;
const MAX_NAME_LENGTH = 100;

export interface PaintRepo {
    owner: string;
    name: string;
    htmlUrl: string;
    cloneUrl: string;
    defaultBranch: string;
}

export class RepoNameTakenError extends Error {
    constructor(readonly baseName: string) {
        super(`No free repository name near "${baseName}"`);
        this.name = 'RepoNameTakenError';
    }
}

export class InvalidRepoNameError extends Error {
    constructor(
        readonly repoName: string,
        reason: string,
    ) {
        super(reason);
        this.name = 'InvalidRepoNameError';
    }
}

// "Hire me!" -> "paint-hire-me".
export function repoNameFromText(text: string): string {
    const slug = text
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!slug) return 'paint';
    return `paint-${slug}`.slice(0, MAX_NAME_LENGTH).replace(/-+$/, '');
}

// Returns why GitHub would refuse the name, or null if it is fine.
export function validateRepoName(name: string): string | null {
    if (name.length === 0) return 'Repository name is required';
    if (name.length > MAX_NAME_LENGTH) return `Repository name must be at most ${MAX_NAME_LENGTH} characters`;
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return 'Use only letters, numbers, hyphens, underscores and periods';
    if (name === '.' || name === '..') return 'Repository name cannot be "." or ".."';
    if (name.toLowerCase().endsWith('.git')) return 'Repository name cannot end with ".git"';
    return null;
}

function withSuffix(base: string, n: number): string {
    if (n === 1) return base;
    const suffix = `-${n}`;
    return base.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix;
}

function isNameTaken(err: unknown): boolean {
    const e = err as { status?: number; response?: { data?: unknown } };
    if (e?.status !== 422) return false;
    return /already exists/i.test(JSON.stringify(e.response?.data ?? '') + String((err as Error).message));
}

export async function createPaintRepo(
    octokit: Octokit,
    opts: { name: string; isPrivate: boolean; description?: string; homepage?: string },
): Promise<PaintRepo> {
    const invalid = validateRepoName(opts.name);
    if (invalid) throw new InvalidRepoNameError(opts.name, invalid);

    for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) {
        try {
            const { data } = await octokit.request('POST /user/repos', {
                name: withSuffix(opts.name, n),
                private: opts.isPrivate,
                description: opts.description,
                homepage: opts.homepage,
                // An empty repo, so our pushed history is the only history.
                auto_init: false,
                has_issues: false,
                has_projects: false,
                has_wiki: false,
            });
            return {
                owner: data.owner.login,
                name: data.name,
                htmlUrl: data.html_url,
                cloneUrl: data.clone_url,
                defaultBranch: data.default_branch ?? 'main',
            };
        } catch (err) {
            if (!isNameTaken(err)) throw err;
        }
    }
    throw new RepoNameTakenError(opts.name);
}

// Returns false if the repo was already gone.
export async function deleteRepo(octokit: Octokit, owner: string, name: string): Promise<boolean> {
    try {
        await octokit.request('DELETE /repos/{owner}/{repo}', { owner, repo: name });
        return true;
    } catch (err) {
        if ((err as { status?: number }).status === 404) return false;
        throw err;
    }
}

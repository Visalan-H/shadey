import { Octokit } from 'octokit';
import { buildCommits, type PlanDay } from './buildCommits.js';
import { createPaintRepo, deleteRepo, type PaintRepo } from './github.js';
import { pushCommits, PushError, type PushResult } from './pushRepo.js';
import { paintReadme } from './readme.js';

export { buildCommits, MAX_PER_DAY, MAX_TOTAL, PlanError } from './buildCommits.js';
export type { CommitAuthor, CommitSpec, PlanDay, PlanErrorCode } from './buildCommits.js';
export {
    createPaintRepo,
    deleteRepo,
    InvalidRepoNameError,
    repoNameFromText,
    RepoNameTakenError,
    validateRepoName,
} from './github.js';
export type { PaintRepo } from './github.js';
export { pushCommits, PushError } from './pushRepo.js';
export type { PushResult } from './pushRepo.js';
export { paintReadme } from './readme.js';

export interface PaintInput {
    token: string;
    user: { login: string; githubId: number; name?: string | null };
    repoName: string;
    isPrivate: boolean;
    text?: string;
    plan: PlanDay[];
    appUrl: string;
    shareUrl: string;
    // Overridable for tests.
    octokit?: Octokit;
    gitBaseUrl?: string;
    // Waits before each push retry; its length is the number of retries.
    pushRetryDelaysMs?: number[];
}

// GitHub sometimes refuses pushes for a few seconds right after a repo is created.
export const PUSH_RETRY_DELAYS_MS = [1000, 2000];

// A rejected token will not start working on its own, so don't wait around for it.
function isAuthFailure(err: unknown): boolean {
    const cause = (err as { cause?: { code?: string; data?: { statusCode?: number } } }).cause;
    return cause?.code === 'HttpError' && cause.data?.statusCode === 401;
}

async function pushWithRetry(push: () => Promise<PushResult>, delays: number[]): Promise<PushResult> {
    for (let attempt = 0; ; attempt++) {
        try {
            return await push();
        } catch (err) {
            if (!(err instanceof PushError) || attempt >= delays.length || isAuthFailure(err)) throw err;
            await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        }
    }
}

export interface PaintResult {
    repo: PaintRepo;
    headOid: string;
    commitCount: number;
    pushMs: number;
}

// The id+login noreply address is always attributed to the account, whatever its email settings.
export function noreplyEmail(user: { login: string; githubId: number }): string {
    return `${user.githubId}+${user.login}@users.noreply.github.com`;
}

function repoDescription(text: string | undefined): string {
    const clean = (text ?? '').replace(/[\s\p{Cc}]+/gu, ' ').trim();
    if (!clean) return 'A contribution graph painting made with Graph Painter';
    const shown = clean.length > 200 ? `${clean.slice(0, 200)}...` : clean;
    return `"${shown}" painted on my contribution graph with Graph Painter`;
}

export async function paint(input: PaintInput): Promise<PaintResult> {
    const { token, user, text, appUrl, shareUrl } = input;
    const author = { name: user.name || user.login, email: noreplyEmail(user) };
    // Validate everything before touching GitHub so a bad request never leaves a stray repo.
    const commits = buildCommits({ plan: input.plan, author });
    const octokit = input.octokit ?? new Octokit({ auth: token });

    const repo = await createPaintRepo(octokit, {
        name: input.repoName,
        isPrivate: input.isPrivate,
        description: repoDescription(text),
        homepage: shareUrl,
    });

    const gitBaseUrl = (input.gitBaseUrl ?? 'https://github.com').replace(/\/+$/, '');
    const readme = paintReadme({ login: user.login, text, appUrl, shareUrl });
    try {
        const pushed = await pushWithRetry(
            () =>
                pushCommits({
                    url: `${gitBaseUrl}/${repo.owner}/${repo.name}.git`,
                    token,
                    commits,
                    readme,
                    branch: repo.defaultBranch,
                }),
            input.pushRetryDelaysMs ?? PUSH_RETRY_DELAYS_MS,
        );
        return { repo, ...pushed };
    } catch (err) {
        // Try not to leave a half-made repo behind. We never ask for delete_repo, so this
        // usually fails (403/404); the push error is what matters, plus where the leftover is.
        const deleted = await deleteRepo(octokit, repo.owner, repo.name).catch(() => false);
        if (err instanceof PushError) {
            err.repoUrl = repo.htmlUrl;
            err.repoLeftBehind = !deleted;
        }
        throw err;
    }
}

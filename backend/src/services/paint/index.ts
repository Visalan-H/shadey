import { Octokit } from 'octokit';
import { buildCommits, type PlanDay } from './buildCommits.js';
import { createPaintRepo, deleteRepo, type PaintRepo } from './github.js';
import { pushCommits } from './pushRepo.js';
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
    try {
        const pushed = await pushCommits({
            url: `${gitBaseUrl}/${repo.owner}/${repo.name}.git`,
            token,
            commits,
            readme: paintReadme({ login: user.login, text, appUrl, shareUrl }),
            branch: repo.defaultBranch,
        });
        return { repo, ...pushed };
    } catch (err) {
        // Don't leave a half-made repo behind; the original error is what matters.
        await deleteRepo(octokit, repo.owner, repo.name).catch(() => undefined);
        throw err;
    }
}

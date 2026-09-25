import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { createFsFromVolume, Volume } from 'memfs';
import type { CommitSpec } from './buildCommits.js';

export interface PushResult {
    headOid: string;
    commitCount: number;
    pushMs: number;
}

export class PushError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'PushError';
    }
}

// Builds the whole history in memory (no git binary or writable disk on Vercel) and pushes it once.
export async function pushCommits(opts: {
    url: string;
    token?: string;
    commits: CommitSpec[];
    readme: string;
    branch?: string;
}): Promise<PushResult> {
    const { url, token, commits, readme, branch = 'main' } = opts;
    if (commits.length === 0) throw new PushError('No commits to push');

    const started = Date.now();
    const fs = createFsFromVolume(new Volume());
    const dir = '/repo';
    await git.init({ fs, dir, defaultBranch: branch });

    // Every commit shares one tree, so only the first one changes anything; the rest are empty.
    const blob = await git.writeBlob({ fs, dir, blob: new TextEncoder().encode(readme) });
    const tree = await git.writeTree({ fs, dir, tree: [{ mode: '100644', path: 'README.md', oid: blob, type: 'blob' }] });

    let head: string | undefined;
    for (const c of commits) {
        head = await git.writeCommit({
            fs,
            dir,
            commit: { message: `${c.message}\n`, tree, parent: head ? [head] : [], author: c.author, committer: c.author },
        });
    }
    const headOid = head as string;
    await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: headOid, force: true });

    let result;
    try {
        result = await git.push({
            fs,
            http,
            dir,
            url,
            ref: branch,
            remoteRef: branch,
            onAuth: token ? () => ({ username: 'x-access-token', password: token }) : undefined,
        });
    } catch (err) {
        throw new PushError(`Push failed: ${(err as Error).message}`, { cause: err });
    }
    const refResult = result.refs[`refs/heads/${branch}`];
    if (!result.ok || (refResult && !refResult.ok)) {
        throw new PushError(`Push rejected: ${result.error ?? refResult?.error ?? 'unknown error'}`);
    }
    return { headOid, commitCount: commits.length, pushMs: Date.now() - started };
}

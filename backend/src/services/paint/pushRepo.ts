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
    // Set by paint() when the repo was created but the push failed and cleanup did not delete it.
    repoUrl?: string;
    repoLeftBehind = false;

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

// Adds commits on top of an existing branch: fetches only its tip, reuses its tree, and
// pushes a fast-forward. Used to top up a painting whose shades came out too light.
// Without a branch it follows the remote's default branch.
export async function appendCommits(opts: { url: string; token?: string; commits: CommitSpec[]; branch?: string }): Promise<PushResult> {
    const { url, token, commits } = opts;
    if (commits.length === 0) throw new PushError('No commits to push');

    const started = Date.now();
    const fs = createFsFromVolume(new Volume());
    const dir = '/repo';
    const onAuth = token ? () => ({ username: 'x-access-token', password: token }) : undefined;
    await git.init({ fs, dir });
    await git.addRemote({ fs, dir, remote: 'origin', url });

    let tip: string;
    let branch: string;
    try {
        const fetched = await git.fetch({ fs, http, dir, remote: 'origin', ref: opts.branch, singleBranch: true, depth: 1, tags: false, onAuth });
        branch = opts.branch ?? fetched.defaultBranch?.replace(/^refs\/heads\//, '') ?? '';
        if (!fetched.fetchHead || !branch) throw new Error('Branch not found');
        tip = fetched.fetchHead;
    } catch (err) {
        throw new PushError(`Fetch failed: ${(err as Error).message}`, { cause: err });
    }
    const { tree } = (await git.readCommit({ fs, dir, oid: tip })).commit;

    let head = tip;
    for (const c of commits) {
        head = await git.writeCommit({
            fs,
            dir,
            commit: { message: `${c.message}\n`, tree, parent: [head], author: c.author, committer: c.author },
        });
    }
    await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: head, force: true });

    let result;
    try {
        result = await git.push({ fs, http, dir, url, ref: branch, remoteRef: branch, onAuth });
    } catch (err) {
        throw new PushError(`Push failed: ${(err as Error).message}`, { cause: err });
    }
    const refResult = result.refs[`refs/heads/${branch}`];
    if (!result.ok || (refResult && !refResult.ok)) {
        throw new PushError(`Push rejected: ${result.error ?? refResult?.error ?? 'unknown error'}`);
    }
    return { headOid: head, commitCount: commits.length, pushMs: Date.now() - started };
}

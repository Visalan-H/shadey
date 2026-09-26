import { useMutation } from '@tanstack/react-query';
import type { CommitDay, PlacementMode } from './design';
import type { Pattern, Shade } from './types';

export interface PaintRequest {
    text?: string;
    pattern: Pattern;
    placement: { mode: PlacementMode; year?: number; offset: number };
    shade: Shade;
    perCell: number;
    plan: CommitDay[];
    repoName: string;
    isPrivate: boolean;
}

export interface PaintResult {
    shareId: string;
    repoUrl: string;
    repoName: string;
    commitCount: number;
}

export interface PaintErrorBody {
    error: string;
    needScope?: 'repo';
    retryAfterSeconds?: number;
    field?: 'repoName';
    // A failed push can leave a partial repo behind; the server says where.
    repoUrl?: string;
}

// Keeps the whole error body (needScope, retryAfterSeconds, field), which ApiError drops.
export class PaintError extends Error {
    constructor(
        public status: number,
        public body: PaintErrorBody,
    ) {
        super(body.error);
    }
}

export async function createPainting(request: PaintRequest): Promise<PaintResult> {
    let res: Response;
    try {
        res = await fetch('/api/paintings', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
    } catch {
        throw new PaintError(0, { error: 'Could not reach the server. Check your connection and try again.' });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const error = typeof body?.error === 'string' && body.error ? body.error : res.statusText || 'Something went wrong';
        throw new PaintError(res.status, { ...body, error });
    }
    return body as PaintResult;
}

export function usePaint() {
    return useMutation<PaintResult, PaintError, PaintRequest>({ mutationFn: createPainting });
}

// GitHub repo names: letters, digits, '.', '-', '_', at most 100 chars; '.' and '..' are reserved.
const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;

export function repoNameError(name: string): string | null {
    if (name.length === 0) return 'Enter a repo name.';
    if (name.length > 100) return 'Repo names can be at most 100 characters.';
    if (!REPO_NAME.test(name)) return 'Use only letters, numbers, dots, hyphens and underscores.';
    if (name === '.' || name === '..') return 'Pick a different repo name.';
    return null;
}

export function defaultRepoName(text: string): string {
    const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    // Leave room for the prefix within GitHub's 100-char limit.
    const trimmed = slug.slice(0, 90).replace(/-+$/, '');
    return trimmed ? `paint-${trimmed}` : 'paint';
}

export function hoursUntil(seconds: number | undefined): number {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return 24;
    return Math.max(1, Math.ceil(seconds / 3600));
}

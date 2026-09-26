import type { Pattern, Shade } from './types';

// The design in progress. Signing in and granting the private-repo permission both leave
// the page for GitHub, so the draft is parked in sessionStorage and picked up on return.
export interface Draft {
    login: string;
    year?: number;
    source: 'text' | 'draw';
    text: string;
    drawn: Pattern | null;
    offset: number | null;
    shade: Shade;
    repoName: string | null;
    isPrivate: boolean;
}

const KEY = 'gp:draft';

function sameGraph(draft: Draft, login: string, year: number | undefined) {
    return draft.login.toLowerCase() === login.toLowerCase() && draft.year === year;
}

function isPattern(value: unknown): value is Pattern {
    return Array.isArray(value) && value.length === 7 && value.every((row) => Array.isArray(row) && row.every((c) => typeof c === 'boolean'));
}

export function loadDraft(login: string, year: number | undefined): Draft | null {
    let draft: Draft;
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        draft = JSON.parse(raw) as Draft;
    } catch {
        return null;
    }
    if (typeof draft?.login !== 'string' || !sameGraph(draft, login, year)) return null;
    if (draft.drawn !== null && !isPattern(draft.drawn)) return null;
    return draft;
}

export function saveDraft(draft: Draft) {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
        // Private mode or full storage: the draft just won't survive a redirect.
    }
}

export function clearDraft() {
    try {
        sessionStorage.removeItem(KEY);
    } catch {
        // Nothing to clear.
    }
}

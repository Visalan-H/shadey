import type { Ink } from './design';
import type { Shade } from './types';

// The design in progress. Signing in and granting the private-repo permission both leave
// the page for GitHub, so the draft is parked in sessionStorage and picked up on return.
export interface Draft {
    login: string;
    year?: number;
    text: string;
    // The drawing on top of the text; null until the first stroke.
    ink: Ink | null;
    offset: number | null;
    shade: Shade;
    repoName: string | null;
    isPrivate: boolean;
}

const KEY = 'gp:draft';

function sameGraph(draft: Draft, login: string, year: number | undefined) {
    return draft.login.toLowerCase() === login.toLowerCase() && draft.year === year;
}

function isInk(value: unknown): value is Ink {
    return (
        Array.isArray(value) &&
        value.length === 7 &&
        value.every((row) => Array.isArray(row) && row.every((c) => c === null || typeof c === 'boolean'))
    );
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
    // Drafts saved before text and drawing were combined have no ink; start them blank.
    const ink: unknown = draft.ink ?? null;
    if (ink !== null && !isInk(ink)) return null;
    return { ...draft, ink };
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

import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity';

export type CheckResult = { ok: true } | { ok: false; reason: string };

// The recommended transformers fold leetspeak, confusable unicode and repeated letters,
// so "sh1t" and "fuuuck" are caught while "classic" is not.
const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
});

// Three or more single characters split by separators, e.g. "f u c k" or "f.u.c.k".
// Obscenity keeps spaces significant (skipping them all would flag innocent word pairs),
// so these runs are joined up and checked as well.
const SPACED_OUT = /(?<![\p{L}\p{N}])(?:[\p{L}\p{N}][^\p{L}\p{N}]+){2,}[\p{L}\p{N}](?![\p{L}\p{N}])/gu;

function joinSpacedLetters(text: string) {
    return text.replace(SPACED_OUT, (run) => run.replace(/[^\p{L}\p{N}]+/gu, ''));
}

export function checkText(text: string): CheckResult {
    if (matcher.hasMatch(text) || matcher.hasMatch(joinSpacedLetters(text))) {
        return { ok: false, reason: 'Text contains language that is not allowed' };
    }
    return { ok: true };
}

import { expect, it } from 'vitest';
import { signInUrl } from './auth';

it('builds the sign-in URL with an optional extra scope', () => {
    expect(signInUrl('/me')).toBe('/api/auth/login?returnTo=%2Fme');
    expect(signInUrl('/draw?x=1', 'repo')).toBe('/api/auth/login?returnTo=%2Fdraw%3Fx%3D1&scope=repo');
});

it('defaults returnTo to the current page', () => {
    window.history.replaceState(null, '', '/p/abc?ref=1');
    expect(signInUrl()).toBe('/api/auth/login?returnTo=%2Fp%2Fabc%3Fref%3D1');
});

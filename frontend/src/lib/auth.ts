import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface Me {
    login: string;
    name: string | null;
    avatarUrl: string;
    githubId: number;
    scopes: string[];
}

export const meQueryKey = ['me'] as const;

// The login from the last visit. /api/auth/me can take seconds on a cold backend, so the
// page uses this guess to fill the username and pick what the header shows in the meantime.
const HINT_KEY = 'shadey:login';

export function loginHint(): string | null {
    try {
        return localStorage.getItem(HINT_KEY);
    } catch {
        return null;
    }
}

function saveLoginHint(login: string | null) {
    try {
        if (login) localStorage.setItem(HINT_KEY, login);
        else localStorage.removeItem(HINT_KEY);
    } catch {
        // Storage blocked: every visit waits for /api/auth/me instead.
    }
}

// The signed-in user, or null when signed out. `data` is undefined while loading.
export function useMe() {
    return useQuery({
        queryKey: meQueryKey,
        queryFn: async () => {
            const { user } = await api<{ user: Me | null }>('/api/auth/me');
            saveLoginHint(user?.login ?? null);
            return user;
        },
        staleTime: 5 * 60 * 1000,
    });
}

// Full-page navigation target (not a fetch): the server redirects to GitHub and back to returnTo.
export function signInUrl(returnTo?: string, extraScope?: 'repo'): string {
    const params = new URLSearchParams({ returnTo: returnTo ?? window.location.pathname + window.location.search });
    if (extraScope) params.set('scope', extraScope);
    return `/api/auth/login?${params}`;
}

export function useSignOut() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => api<unknown>('/api/auth/logout', { method: 'POST' }),
        onSuccess: () => {
            saveLoginHint(null);
            return queryClient.invalidateQueries({ queryKey: meQueryKey });
        },
    });
}

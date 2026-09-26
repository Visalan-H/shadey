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

// The signed-in user, or null when signed out. `data` is undefined while loading.
export function useMe() {
    return useQuery({
        queryKey: meQueryKey,
        queryFn: async () => (await api<{ user: Me | null }>('/api/auth/me')).user,
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
        onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey }),
    });
}

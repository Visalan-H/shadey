import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface PaintingSummary {
    shareId: string;
    text: string | null;
    repoName: string;
    repoUrl: string;
    isPrivate: boolean;
    // hidden: the share page was taken down after a report.
    status: 'painted' | 'deleted' | 'hidden';
    createdAt: string;
    totalCommits: number;
}

export const myPaintingsKey = ['my-paintings'] as const;

export function useMyPaintings(enabled: boolean) {
    return useQuery({
        queryKey: myPaintingsKey,
        queryFn: async () => (await api<{ paintings: PaintingSummary[] }>('/api/me/paintings')).paintings,
        enabled,
    });
}

// "Delete for me" posts here, leaves for GitHub (a one-off delete_repo grant) and comes back to /me.
export function deleteForMeUrl(shareId: string) {
    return `/api/auth/delete?${new URLSearchParams({ painting: shareId })}`;
}

// GitHub's delete button lives at the bottom of the repo's settings page.
export function repoSettingsUrl(repoUrl: string) {
    return `${repoUrl.replace(/\/+$/, '')}/settings`;
}

export type ShadeCheck =
    | { result: 'pending' }
    | { result: 'ok' }
    | { result: 'limit'; lightDays: number }
    | { result: 'toppedUp'; lightDays: number; added: number; capped: boolean };

// Compares the painting with what GitHub shows now; the server tops up days that came out light.
export function useCheckShades() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (shareId: string) => api<ShadeCheck>(`/api/me/paintings/${encodeURIComponent(shareId)}/check-shades`, { method: 'POST' }),
        onSuccess: (check) => {
            if (check.result !== 'toppedUp') return;
            void queryClient.invalidateQueries({ queryKey: myPaintingsKey });
            void queryClient.invalidateQueries({ queryKey: ['calendar'] });
        },
    });
}

// "Delete it myself": the user says the repo is gone; the server checks before marking it.
export function useMarkDeleted() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (shareId: string) => api<{ painting: PaintingSummary }>(`/api/me/paintings/${encodeURIComponent(shareId)}/deleted`, { method: 'POST' }),
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: myPaintingsKey }),
                queryClient.invalidateQueries({ queryKey: ['calendar'] }),
            ]),
    });
}

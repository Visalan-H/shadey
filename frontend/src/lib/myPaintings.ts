import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface PaintingSummary {
    shareId: string;
    text: string | null;
    repoName: string;
    repoUrl: string;
    isPrivate: boolean;
    status: 'painted' | 'deleted';
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

// "Delete for me" leaves for GitHub (a one-off delete_repo grant) and comes back to /me.
export function deleteForMeUrl(shareId: string) {
    return `/api/auth/delete?${new URLSearchParams({ painting: shareId })}`;
}

// GitHub's delete button lives at the bottom of the repo's settings page.
export function repoSettingsUrl(repoUrl: string) {
    return `${repoUrl.replace(/\/+$/, '')}/settings`;
}

// "Delete it myself": the user says the repo is gone; the server checks before marking it.
export function useMarkDeleted() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (shareId: string) => api<{ painting: PaintingSummary }>(`/api/me/paintings/${encodeURIComponent(shareId)}/deleted`, { method: 'POST' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: myPaintingsKey }),
    });
}

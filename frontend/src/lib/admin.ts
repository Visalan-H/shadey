import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface ReportedPainting {
    shareId: string;
    login: string;
    text: string | null;
    status: 'painted' | 'deleted' | 'hidden';
    count: number;
    lastAt: string;
    reasons: string[];
}

const reportsKey = ['admin', 'reports'] as const;

export function useReports(enabled: boolean) {
    return useQuery({
        queryKey: reportsKey,
        queryFn: async () => (await api<{ reports: ReportedPainting[] }>('/api/admin/reports')).reports,
        enabled,
    });
}

export type AdminAction = 'hide' | 'restore' | 'dismiss';

export function useAdminAction() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ shareId, action }: { shareId: string; action: AdminAction }) => {
            const id = encodeURIComponent(shareId);
            return action === 'dismiss'
                ? api<unknown>(`/api/admin/reports/${id}`, { method: 'DELETE' })
                : api<unknown>(`/api/admin/paintings/${id}/${action}`, { method: 'POST' });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: reportsKey }),
    });
}

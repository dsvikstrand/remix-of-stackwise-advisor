import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  listActiveMyIngestionJobs,
  type ActiveIngestionJob,
  type ActiveIngestionJobsResponse,
} from '@/lib/subscriptionsApi';

function toTimeMs(value: string | null | undefined, fallback: number) {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sortActiveIngestionJobs(items: ActiveIngestionJob[]) {
  return [...items].sort((a, b) => {
    const statusRank = (value: ActiveIngestionJob['status']) => (value === 'running' ? 0 : 1);
    const statusDelta = statusRank(a.status) - statusRank(b.status);
    if (statusDelta !== 0) return statusDelta;

    if (a.status === 'queued' && b.status === 'queued') {
      const aPos = Number.isFinite(a.queue_position) ? Number(a.queue_position) : Number.POSITIVE_INFINITY;
      const bPos = Number.isFinite(b.queue_position) ? Number(b.queue_position) : Number.POSITIVE_INFINITY;
      if (aPos !== bPos) return aPos - bPos;
    }

    const aCreated = toTimeMs(a.created_at, 0);
    const bCreated = toTimeMs(b.created_at, 0);
    return bCreated - aCreated;
  });
}

type UseGenerationQueueInput = {
  scopes?: string[];
  limit?: number;
  pollMs?: number;
  idlePollMs?: number | false;
  enabled?: boolean;
};

export function useGenerationQueue(input?: UseGenerationQueueInput) {
  const { user } = useAuth();
  const scopes = Array.isArray(input?.scopes)
    ? input?.scopes.map((scope) => String(scope || '').trim()).filter(Boolean)
    : [];
  const limit = Math.max(1, Math.min(50, Math.floor(Number(input?.limit || 20))));
  const pollMs = Math.max(2_000, Math.floor(Number(input?.pollMs || 10_000)));
  const idlePollMs = input?.idlePollMs === false
    ? false
    : Math.max(pollMs, Math.floor(Number(input?.idlePollMs || 60_000)));
  const enabled = Boolean(input?.enabled ?? true) && Boolean(user?.id);

  const query = useQuery({
    queryKey: ['generation-queue-active-jobs', user?.id, scopes.join(','), limit],
    enabled,
    queryFn: () => listActiveMyIngestionJobs({ scopes, limit }),
    staleTime: Math.max(1_000, Math.floor(pollMs / 2)),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: (state) => {
      const activeCount = Number(state.state.data?.summary?.active_count || 0);
      return activeCount > 0 ? pollMs : idlePollMs;
    },
  });

  const data: ActiveIngestionJobsResponse = query.data || {
    items: [],
    summary: {
      active_count: 0,
      queued_count: 0,
      running_count: 0,
    },
  };

  const items = useMemo(() => sortActiveIngestionJobs(data.items || []), [data.items]);

  return {
    isEnabled: enabled,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    items,
    summary: data.summary,
    refetch: query.refetch,
  };
}

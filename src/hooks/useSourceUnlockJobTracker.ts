import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getIngestionJob,
  getLatestMyIngestionJob,
  type IngestionJob,
  type IngestionJobStatus,
} from '@/lib/subscriptionsApi';

export type SourceUnlockJobView = {
  jobId: string | null;
  status: 'idle' | IngestionJobStatus;
  insertedCount: number;
  skippedCount: number;
  failedCount: number;
  processedCount: number;
  errorMessage: string | null;
  label: string | null;
  isActive: boolean;
  visible: boolean;
};

type UseSourceUnlockJobTrackerInput = {
  userId?: string | null;
  enabled?: boolean;
  scope?: string;
  pollMs?: number;
  onTerminal?: (job: IngestionJob) => void;
};

function toLabel(status: SourceUnlockJobView['status']) {
  if (status === 'queued') return 'Queued';
  if (status === 'running') return 'Running';
  if (status === 'succeeded') return 'Complete';
  if (status === 'failed') return 'Failed';
  return null;
}

function toFailedCount(job: Pick<IngestionJob, 'processed_count' | 'inserted_count' | 'skipped_count'> | null) {
  if (!job) return 0;
  return Math.max(0, job.processed_count - job.inserted_count - job.skipped_count);
}

function isTerminal(status: IngestionJobStatus) {
  return status === 'succeeded' || status === 'failed';
}

export function useSourceUnlockJobTracker({
  userId,
  enabled = true,
  scope = 'source_item_unlock_generation',
  pollMs = 5000,
  onTerminal,
}: UseSourceUnlockJobTrackerInput) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [lastTerminalJob, setLastTerminalJob] = useState<IngestionJob | null>(null);
  const [handledTerminalJobId, setHandledTerminalJobId] = useState<string | null>(null);
  const [dismissedTerminalJobId, setDismissedTerminalJobId] = useState<string | null>(null);

  const canRun = Boolean(enabled && userId);

  const latestMineQuery = useQuery({
    queryKey: ['source-unlock-latest-mine', userId, scope],
    enabled: canRun && !activeJobId,
    queryFn: () => getLatestMyIngestionJob(scope),
    staleTime: 1_800_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  useEffect(() => {
    if (!canRun || activeJobId) return;
    const latest = latestMineQuery.data;
    if (!latest?.job_id) return;

    if (latest.status === 'queued' || latest.status === 'running') {
      setActiveJobId(latest.job_id);
      return;
    }

    if (isTerminal(latest.status) && dismissedTerminalJobId !== latest.job_id) {
      setLastTerminalJob(latest);
    }
  }, [activeJobId, canRun, dismissedTerminalJobId, latestMineQuery.data]);

  const activeJobQuery = useQuery({
    queryKey: ['source-unlock-job', userId, activeJobId],
    enabled: canRun && Boolean(activeJobId),
    queryFn: () => getIngestionJob(activeJobId as string),
    staleTime: Math.max(1_000, Math.floor(pollMs / 2)),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status as IngestionJobStatus | undefined;
      if (!status) return pollMs;
      return isTerminal(status) ? false : pollMs;
    },
    retry: false,
  });

  useEffect(() => {
    const job = activeJobQuery.data;
    if (!job?.job_id) return;
    if (!isTerminal(job.status)) return;
    if (handledTerminalJobId === job.job_id) return;

    setHandledTerminalJobId(job.job_id);
    setActiveJobId(null);
    setLastTerminalJob(job);
    setDismissedTerminalJobId(null);
    onTerminal?.(job);
  }, [activeJobQuery.data, handledTerminalJobId, onTerminal]);

  const start = useCallback((jobId: string | null) => {
    if (!jobId) return;
    setDismissedTerminalJobId(null);
    setLastTerminalJob(null);
    setActiveJobId(jobId);
  }, []);

  const resume = useCallback(async () => {
    if (!canRun) return;
    const latest = await latestMineQuery.refetch();
    const job = latest.data;
    if (!job?.job_id) return;
    if (job.status === 'queued' || job.status === 'running') {
      setActiveJobId(job.job_id);
      return;
    }
    if (isTerminal(job.status) && dismissedTerminalJobId !== job.job_id) {
      setLastTerminalJob(job);
    }
  }, [canRun, dismissedTerminalJobId, latestMineQuery]);

  const clear = useCallback(() => {
    if (!lastTerminalJob?.job_id) return;
    setDismissedTerminalJobId(lastTerminalJob.job_id);
    setLastTerminalJob(null);
  }, [lastTerminalJob]);

  const activity = useMemo<SourceUnlockJobView>(() => {
    const activeStatus = activeJobQuery.data?.status;
    if (activeJobId) {
      const status: SourceUnlockJobView['status'] = activeStatus || 'queued';
      const insertedCount = activeJobQuery.data?.inserted_count || 0;
      const skippedCount = activeJobQuery.data?.skipped_count || 0;
      const processedCount = activeJobQuery.data?.processed_count || 0;
      const failedCount = toFailedCount(activeJobQuery.data || null);
      return {
        jobId: activeJobId,
        status,
        insertedCount,
        skippedCount,
        failedCount,
        processedCount,
        errorMessage: activeJobQuery.data?.error_message || null,
        label: toLabel(status),
        isActive: status === 'queued' || status === 'running',
        visible: true,
      };
    }

    if (lastTerminalJob && dismissedTerminalJobId !== lastTerminalJob.job_id) {
      const status: SourceUnlockJobView['status'] = lastTerminalJob.status;
      return {
        jobId: lastTerminalJob.job_id,
        status,
        insertedCount: lastTerminalJob.inserted_count || 0,
        skippedCount: lastTerminalJob.skipped_count || 0,
        failedCount: toFailedCount(lastTerminalJob),
        processedCount: lastTerminalJob.processed_count || 0,
        errorMessage: lastTerminalJob.error_message || null,
        label: toLabel(status),
        isActive: false,
        visible: true,
      };
    }

    return {
      jobId: null,
      status: 'idle',
      insertedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      processedCount: 0,
      errorMessage: null,
      label: null,
      isActive: false,
      visible: false,
    };
  }, [activeJobId, activeJobQuery.data, dismissedTerminalJobId, lastTerminalJob]);

  return {
    activity,
    activeJobId,
    isPolling: activeJobQuery.isFetching,
    start,
    resume,
    clear,
  };
}

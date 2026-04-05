import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { config } from '@/config/runtime';
import {
  ApiRequestError,
  deactivateSourceSubscription,
  getIngestionJob,
  getLatestMyIngestionJob,
  listSourceSubscriptionsPage,
  type IngestionJobStatus,
  type SourceSubscription,
  updateSourceSubscription,
} from '@/lib/subscriptionsApi';
import {
  disconnectYouTubeConnection,
  getYouTubeConnectionStatus,
  importYouTubeSubscriptions,
  previewYouTubeSubscriptionsImport,
  startYouTubeConnection,
  type YouTubeImportPreviewItem,
  type YouTubeImportResult,
} from '@/lib/youtubeConnectionApi';

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    switch (error.errorCode) {
      case 'NOT_FOUND':
        return 'Subscription not found. Refresh and try again.';
      case 'WRITE_FAILED':
        return 'Could not update subscription. Please try again.';
      default:
        return error.message || fallback;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function getYouTubeConnectionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    switch (error.errorCode) {
      case 'YT_OAUTH_NOT_CONFIGURED':
        return 'YouTube connect is not configured yet.';
      case 'YT_CONNECTION_NOT_FOUND':
        return 'Connect YouTube first.';
      case 'YT_REAUTH_REQUIRED':
        return 'YouTube authorization expired. Reconnect required.';
      case 'YT_IMPORT_EMPTY_SELECTION':
        return 'Select at least one channel to import.';
      case 'YT_RETURN_TO_INVALID':
        return 'Invalid return URL. Open Subscriptions directly and retry.';
      case 'RATE_LIMITED':
        return error.message || 'Please wait a moment before trying again.';
      default:
        return error.message || fallback;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

function sanitizeRefreshReturnPath(value: string | null) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;
  if (!raw.startsWith('/u/')) return null;
  return raw;
}

function normalizeSubscriptionFilterQuery(value: string) {
  return value.trim().toLowerCase();
}

function getSubscriptionFilterRank(subscription: SourceSubscription, normalizedQuery: string) {
  if (!normalizedQuery) return 0;
  const values = [
    subscription.source_channel_title || '',
    subscription.source_channel_id || '',
    subscription.source_channel_url || '',
  ]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  let bestRank = Number.POSITIVE_INFINITY;
  for (const value of values) {
    if (value === normalizedQuery) {
      bestRank = Math.min(bestRank, 0);
      continue;
    }
    if (value.startsWith(normalizedQuery)) {
      bestRank = Math.min(bestRank, 1);
      continue;
    }
    if (
      value.includes(` ${normalizedQuery}`)
      || value.includes(`-${normalizedQuery}`)
      || value.includes(`_${normalizedQuery}`)
    ) {
      bestRank = Math.min(bestRank, 2);
      continue;
    }
    if (value.includes(normalizedQuery)) {
      bestRank = Math.min(bestRank, 3);
    }
  }
  return bestRank;
}

function normalizeYouTubeImportFilterQuery(value: string) {
  return value.trim().toLowerCase();
}

function getYouTubeImportFilterRank(item: YouTubeImportPreviewItem, normalizedQuery: string) {
  if (!normalizedQuery) return 0;
  const values = [
    item.channel_title || '',
    item.channel_id || '',
    item.channel_url || '',
  ]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  let bestRank = Number.POSITIVE_INFINITY;
  for (const value of values) {
    if (value === normalizedQuery) {
      bestRank = Math.min(bestRank, 0);
      continue;
    }
    if (value.startsWith(normalizedQuery)) {
      bestRank = Math.min(bestRank, 1);
      continue;
    }
    if (
      value.includes(` ${normalizedQuery}`)
      || value.includes(`-${normalizedQuery}`)
      || value.includes(`_${normalizedQuery}`)
    ) {
      bestRank = Math.min(bestRank, 2);
      continue;
    }
    if (value.includes(normalizedQuery)) {
      bestRank = Math.min(bestRank, 3);
    }
  }
  return bestRank;
}

const SUBSCRIPTIONS_PAGE_SIZE = 50;

export function useSubscriptionsPageController() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const subscriptionsEnabled = Boolean(config.agenticBackendUrl);
  const [searchParams, setSearchParams] = useSearchParams();

  const [pendingRows, setPendingRows] = useState<Record<string, boolean>>({});
  const [subscriptionFilterQuery, setSubscriptionFilterQuery] = useState('');
  const [isYouTubeImportOpen, setIsYouTubeImportOpen] = useState(false);
  const [youTubeImportFilterQuery, setYouTubeImportFilterQuery] = useState('');
  const [youTubeImportResults, setYouTubeImportResults] = useState<YouTubeImportPreviewItem[]>([]);
  const [youTubeImportSelected, setYouTubeImportSelected] = useState<Record<string, boolean>>({});
  const [youTubeImportTruncated, setYouTubeImportTruncated] = useState(false);
  const [youTubeImportError, setYouTubeImportError] = useState<string | null>(null);
  const [youTubeImportSummary, setYouTubeImportSummary] = useState<YouTubeImportResult | null>(null);
  const [isRefreshDialogOpen, setIsRefreshDialogOpen] = useState(false);
  const [activeRefreshJobId, setActiveRefreshJobId] = useState<string | null>(null);
  const [queuedRefreshCount, setQueuedRefreshCount] = useState<number>(0);
  const [terminalHandledJobId, setTerminalHandledJobId] = useState<string | null>(null);
  const [refreshReturnTo, setRefreshReturnTo] = useState<string | null>(null);

  const invalidateSubscriptionViews = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['source-subscriptions', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['my-feed-items', user?.id] });
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (searchParams.get('refresh') !== '1') return;
    setIsRefreshDialogOpen(true);
    setRefreshReturnTo(sanitizeRefreshReturnPath(searchParams.get('return_to')));
    const next = new URLSearchParams(searchParams);
    next.delete('refresh');
    next.delete('return_to');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const connectStatus = String(searchParams.get('yt_connect') || '').trim();
    if (!connectStatus) return;

    const code = String(searchParams.get('yt_code') || '').trim();
    const next = new URLSearchParams(searchParams);
    next.delete('yt_connect');
    next.delete('yt_code');
    setSearchParams(next, { replace: true });
    queryClient.invalidateQueries({ queryKey: ['youtube-connection-status', user?.id] });

    if (connectStatus === 'success') {
      return;
    }

    toast({
      title: 'YouTube connect failed',
      description: code ? `OAuth returned: ${code}` : 'Could not connect YouTube.',
      variant: 'destructive',
    });
  }, [queryClient, searchParams, setSearchParams, toast, user?.id]);

  const isRowPending = useCallback((subscriptionId: string) => Boolean(pendingRows[subscriptionId]), [pendingRows]);

  const markRowPending = useCallback((subscriptionId: string, isPending: boolean) => {
    setPendingRows((previous) => {
      if (isPending) return { ...previous, [subscriptionId]: true };
      if (!previous[subscriptionId]) return previous;
      const next = { ...previous };
      delete next[subscriptionId];
      return next;
    });
  }, []);

  const withRowPending = useCallback(async <T,>(subscriptionId: string, operation: () => Promise<T>) => {
    if (isRowPending(subscriptionId)) return null;
    markRowPending(subscriptionId, true);
    try {
      return await operation();
    } catch {
      return null;
    } finally {
      markRowPending(subscriptionId, false);
    }
  }, [isRowPending, markRowPending]);

  const subscriptionsQuery = useInfiniteQuery({
    queryKey: ['source-subscriptions', user?.id, 'page', SUBSCRIPTIONS_PAGE_SIZE],
    enabled: Boolean(user) && subscriptionsEnabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listSourceSubscriptionsPage({
      limit: SUBSCRIPTIONS_PAGE_SIZE,
      offset: Number(pageParam || 0),
    }),
    getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
  });

  const youtubeConnectionQuery = useQuery({
    queryKey: ['youtube-connection-status', user?.id],
    enabled: Boolean(user) && subscriptionsEnabled,
    queryFn: getYouTubeConnectionStatus,
    retry: false,
  });

  const startYouTubeConnectMutation = useMutation({
    mutationFn: async () => {
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      return startYouTubeConnection({ returnTo: window.location.href });
    },
    onSuccess: (payload) => {
      window.location.assign(payload.auth_url);
    },
    onError: (error) => {
      toast({
        title: 'Connect failed',
        description: getYouTubeConnectionErrorMessage(error, 'Could not start YouTube connect flow.'),
        variant: 'destructive',
      });
    },
  });

  const youtubeImportPreviewMutation = useMutation({
    mutationFn: async () => {
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      return previewYouTubeSubscriptionsImport();
    },
    onSuccess: (payload) => {
      setYouTubeImportError(null);
      setYouTubeImportResults(payload.results || []);
      setYouTubeImportTruncated(Boolean(payload.truncated));
      const nextSelected: Record<string, boolean> = {};
      for (const item of payload.results || []) {
        nextSelected[item.channel_id] = false;
      }
      setYouTubeImportSelected(nextSelected);
    },
    onError: (error) => {
      setYouTubeImportResults([]);
      setYouTubeImportSelected({});
      setYouTubeImportTruncated(false);
      setYouTubeImportError(getYouTubeConnectionErrorMessage(error, 'Could not load YouTube subscriptions.'));
    },
  });

  const youtubeImportMutation = useMutation({
    mutationFn: async (channels: Array<{ channel_id: string; channel_url?: string; channel_title?: string | null }>) => {
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      return importYouTubeSubscriptions({ channels });
    },
    onSuccess: (result) => {
      setYouTubeImportSummary(result);
      invalidateSubscriptionViews();
      queryClient.invalidateQueries({ queryKey: ['youtube-connection-status', user?.id] });
    },
    onError: (error) => {
      toast({
        title: 'Import failed',
        description: getYouTubeConnectionErrorMessage(error, 'Could not import YouTube subscriptions.'),
        variant: 'destructive',
      });
    },
  });

  const youtubeDisconnectMutation = useMutation({
    mutationFn: async () => {
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      return disconnectYouTubeConnection();
    },
    onSuccess: () => {
      setYouTubeImportSummary(null);
      setYouTubeImportResults([]);
      setYouTubeImportSelected({});
      setYouTubeImportTruncated(false);
      setYouTubeImportError(null);
      queryClient.invalidateQueries({ queryKey: ['youtube-connection-status', user?.id] });
    },
    onError: (error) => {
      toast({
        title: 'Disconnect failed',
        description: getYouTubeConnectionErrorMessage(error, 'Could not disconnect YouTube.'),
        variant: 'destructive',
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateSourceSubscription(id),
    onSuccess: () => {
      invalidateSubscriptionViews();
    },
    onError: (error) => {
      toast({
        title: 'Unsubscribe failed',
        description: getActionErrorMessage(error, 'Could not unsubscribe from this channel.'),
        variant: 'destructive',
      });
    },
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: (input: { id: string; autoUnlockEnabled?: boolean }) => updateSourceSubscription(input),
    onSuccess: () => {
      invalidateSubscriptionViews();
    },
    onError: (error) => {
      toast({
        title: 'Update failed',
        description: getActionErrorMessage(error, 'Could not update subscription settings.'),
        variant: 'destructive',
      });
    },
  });

  const refreshJobQuery = useQuery({
    queryKey: ['ingestion-job', activeRefreshJobId, user?.id],
    enabled: Boolean(activeRefreshJobId) && Boolean(user) && subscriptionsEnabled,
    queryFn: () => getIngestionJob(activeRefreshJobId as string),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      const status = query.state.data?.status as IngestionJobStatus | undefined;
      if (!status || status === 'queued' || status === 'running') return 60000;
      return false;
    },
  });

  const handleUnsubscribe = useCallback((subscription: SourceSubscription) => {
    void withRowPending(subscription.id, () => deactivateMutation.mutateAsync(subscription.id));
  }, [deactivateMutation, withRowPending]);

  const handleAutoUnlockToggle = useCallback((subscription: SourceSubscription, nextChecked: boolean) => {
    void withRowPending(subscription.id, async () => {
      const current = Boolean(subscription.auto_unlock_enabled);
      if (current === nextChecked) return;
      await updateSubscriptionMutation.mutateAsync({
        id: subscription.id,
        autoUnlockEnabled: nextChecked,
      });
    });
  }, [updateSubscriptionMutation, withRowPending]);

  const handleOpenYouTubeImport = useCallback(() => {
    setIsYouTubeImportOpen(true);
    setYouTubeImportSummary(null);
    setYouTubeImportError(null);
    setYouTubeImportFilterQuery('');
    setYouTubeImportResults([]);
    setYouTubeImportSelected({});
    youtubeImportPreviewMutation.mutate();
  }, [youtubeImportPreviewMutation]);

  const handleYouTubeImportDialogChange = useCallback((nextOpen: boolean) => {
    setIsYouTubeImportOpen(nextOpen);
    if (!nextOpen) {
      setYouTubeImportError(null);
      setYouTubeImportFilterQuery('');
      setYouTubeImportResults([]);
      setYouTubeImportSelected({});
      setYouTubeImportTruncated(false);
      youtubeImportPreviewMutation.reset();
      youtubeImportMutation.reset();
    }
  }, [youtubeImportMutation, youtubeImportPreviewMutation]);

  const toggleYouTubeImportChannel = useCallback((channelId: string, checked: boolean) => {
    setYouTubeImportSelected((previous) => ({
      ...previous,
      [channelId]: checked,
    }));
  }, []);

  const handleYouTubeImportSelectAll = useCallback(() => {
    setYouTubeImportSelected((previous) => {
      const next = { ...previous };
      for (const row of youTubeImportResults) {
        next[row.channel_id] = true;
      }
      return next;
    });
  }, [youTubeImportResults]);

  const handleYouTubeImportClearSelection = useCallback(() => {
    setYouTubeImportSelected({});
  }, []);

  const handleDisconnectYouTube = useCallback(() => {
    if (!window.confirm('Disconnect YouTube? Imported app subscriptions will remain active.')) return;
    youtubeDisconnectMutation.mutate();
  }, [youtubeDisconnectMutation]);

  const handleStartYouTubeConnect = useCallback(() => {
    startYouTubeConnectMutation.mutate();
  }, [startYouTubeConnectMutation]);

  const subscriptions = useMemo(
    () => subscriptionsQuery.data?.pages.flatMap((page) => page.items) || [],
    [subscriptionsQuery.data],
  );
  const youtubeConnection = youtubeConnectionQuery.data;
  const activeSubscriptions = useMemo(
    () => subscriptions.filter((subscription) => subscription.is_active),
    [subscriptions],
  );
  const normalizedSubscriptionFilterQuery = useMemo(
    () => normalizeSubscriptionFilterQuery(subscriptionFilterQuery),
    [subscriptionFilterQuery],
  );
  const filteredActiveSubscriptions = useMemo(() => {
    if (!normalizedSubscriptionFilterQuery) return activeSubscriptions;
    return activeSubscriptions
      .map((subscription, index) => ({
        subscription,
        index,
        rank: getSubscriptionFilterRank(subscription, normalizedSubscriptionFilterQuery),
      }))
      .filter((entry) => Number.isFinite(entry.rank))
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank;
        return left.index - right.index;
      })
      .map((entry) => entry.subscription);
  }, [activeSubscriptions, normalizedSubscriptionFilterQuery]);
  const selectedYouTubeImportChannels = useMemo(
    () =>
      youTubeImportResults
        .filter((item) => youTubeImportSelected[item.channel_id])
        .map((item) => ({
          channel_id: item.channel_id,
          channel_url: item.channel_url,
          channel_title: item.channel_title,
        })),
    [youTubeImportResults, youTubeImportSelected],
  );
  const normalizedYouTubeImportFilterQuery = useMemo(
    () => normalizeYouTubeImportFilterQuery(youTubeImportFilterQuery),
    [youTubeImportFilterQuery],
  );
  const filteredYouTubeImportResults = useMemo(() => {
    if (!normalizedYouTubeImportFilterQuery) return youTubeImportResults;
    return youTubeImportResults
      .map((item, index) => ({
        item,
        index,
        rank: getYouTubeImportFilterRank(item, normalizedYouTubeImportFilterQuery),
      }))
      .filter((entry) => Number.isFinite(entry.rank))
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank;
        return left.index - right.index;
      })
      .map((entry) => entry.item);
  }, [youTubeImportResults, normalizedYouTubeImportFilterQuery]);

  const refreshJobStatus = (refreshJobQuery.data?.status || (activeRefreshJobId ? 'queued' : null)) as IngestionJobStatus | null;
  const refreshJobProcessed = refreshJobQuery.data?.processed_count || 0;
  const refreshJobInserted = refreshJobQuery.data?.inserted_count || 0;
  const refreshJobSkipped = refreshJobQuery.data?.skipped_count || 0;
  const refreshJobFailed = Math.max(0, refreshJobProcessed - refreshJobInserted - refreshJobSkipped);
  const refreshJobRunning = refreshJobStatus === 'queued' || refreshJobStatus === 'running';
  const refreshJobLabel = refreshJobStatus === 'succeeded'
    ? 'Succeeded'
    : refreshJobStatus === 'failed'
      ? 'Failed'
      : refreshJobStatus === 'running'
        ? 'Running'
        : refreshJobStatus === 'queued'
          ? 'Queued'
          : null;

  const handleImportSelectedChannels = useCallback(() => {
    if (selectedYouTubeImportChannels.length === 0) {
      toast({
        title: 'No channels selected',
        description: 'Select one or more channels to import.',
        variant: 'destructive',
      });
      return;
    }
    youtubeImportMutation.mutate(selectedYouTubeImportChannels);
  }, [selectedYouTubeImportChannels, toast, youtubeImportMutation]);

  useEffect(() => {
    const job = refreshJobQuery.data;
    if (!job?.job_id) return;
    if (job.status !== 'succeeded' && job.status !== 'failed') return;
    if (terminalHandledJobId === job.job_id) return;

    setTerminalHandledJobId(job.job_id);
    invalidateSubscriptionViews();

    if (refreshReturnTo) {
      navigate(refreshReturnTo, { replace: true });
      setRefreshReturnTo(null);
    }
  }, [invalidateSubscriptionViews, navigate, refreshJobQuery.data, refreshReturnTo, terminalHandledJobId, toast]);

  useEffect(() => {
    if (!isRefreshDialogOpen) return;
    if (activeRefreshJobId) return;
    if (!user || !subscriptionsEnabled) return;

    let cancelled = false;
    void getLatestMyIngestionJob('manual_refresh_selection')
      .then((latestJob) => {
        if (cancelled || !latestJob?.job_id) return;
        if (latestJob.status !== 'queued' && latestJob.status !== 'running') return;

        setActiveRefreshJobId(latestJob.job_id);
        setTerminalHandledJobId(null);
        const queuedEstimate = Math.max(
          0,
          Number(latestJob.processed_count || 0) + Number(latestJob.inserted_count || 0) + Number(latestJob.skipped_count || 0),
        );
        if (queuedEstimate > 0) {
          setQueuedRefreshCount(queuedEstimate);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeRefreshJobId, isRefreshDialogOpen, subscriptionsEnabled, user]);

  const handleRefreshDialogChange = useCallback((nextOpen: boolean) => {
    const shouldReturnToProfile = !nextOpen && Boolean(refreshReturnTo);
    setIsRefreshDialogOpen(nextOpen);
    if (shouldReturnToProfile && refreshReturnTo) {
      navigate(refreshReturnTo, { replace: true });
      setRefreshReturnTo(null);
    }
  }, [navigate, refreshReturnTo]);

  const handleRefreshQueued = useCallback(({ jobId, queuedCount }: { jobId: string; queuedCount: number }) => {
    setActiveRefreshJobId(jobId);
    setQueuedRefreshCount(queuedCount);
    setTerminalHandledJobId(null);
  }, []);

  const youtubeConnectionErrorMessage = youtubeConnectionQuery.error
    ? getYouTubeConnectionErrorMessage(youtubeConnectionQuery.error, 'Could not load YouTube connection status.')
    : null;

  return {
    user,
    subscriptionsEnabled,
    subscriptionFilterQuery,
    isYouTubeImportOpen,
    youTubeImportFilterQuery,
    youTubeImportResults,
    youTubeImportSelected,
    youTubeImportTruncated,
    youTubeImportError,
    youTubeImportSummary,
    isRefreshDialogOpen,
    activeRefreshJobId,
    queuedRefreshCount,
    subscriptionsQuery,
    youtubeConnectionQuery,
    youtubeConnection,
    youtubeConnectionErrorMessage,
    startYouTubeConnectMutation,
    youtubeImportPreviewMutation,
    youtubeImportMutation,
    youtubeDisconnectMutation,
    refreshJobQuery,
    filteredActiveSubscriptions,
    hasMoreSubscriptions: Boolean(subscriptionsQuery.hasNextPage),
    isLoadingMoreSubscriptions: subscriptionsQuery.isFetchingNextPage,
    filteredYouTubeImportResults,
    selectedYouTubeImportChannels,
    refreshJobStatus,
    refreshJobInserted,
    refreshJobSkipped,
    refreshJobFailed,
    refreshJobRunning,
    refreshJobLabel,
    isRowPending,
    setSubscriptionFilterQuery,
    setYouTubeImportFilterQuery,
    handleOpenYouTubeImport,
    handleYouTubeImportDialogChange,
    toggleYouTubeImportChannel,
    handleYouTubeImportSelectAll,
    handleYouTubeImportClearSelection,
    handleDisconnectYouTube,
    handleStartYouTubeConnect,
    handleImportSelectedChannels,
    handleRefreshDialogChange,
    handleRefreshQueued,
    handleUnsubscribe,
    handleAutoUnlockToggle,
    handleLoadMoreSubscriptions: () => subscriptionsQuery.fetchNextPage(),
  };
}

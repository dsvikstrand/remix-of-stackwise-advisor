import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  ApiRequestError,
  createSourceSubscription,
  deactivateSourceSubscription,
  getIngestionJob,
  getLatestMyIngestionJob,
  listSourceSubscriptions,
  type IngestionJobStatus,
  type SourceSubscription,
  updateSourceSubscription,
} from '@/lib/subscriptionsApi';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { config } from '@/config/runtime';
import {
  ApiRequestError as ChannelSearchApiRequestError,
  searchYouTubeChannels,
  type YouTubeChannelSearchResult,
} from '@/lib/youtubeChannelSearchApi';
import {
  disconnectYouTubeConnection,
  getYouTubeConnectionStatus,
  importYouTubeSubscriptions,
  previewYouTubeSubscriptionsImport,
  startYouTubeConnection,
  type YouTubeImportPreviewItem,
  type YouTubeImportResult,
} from '@/lib/youtubeConnectionApi';
import { buildSourcePagePath } from '@/lib/sourcePagesApi';
import { RefreshSubscriptionsDialog } from '@/components/subscriptions/RefreshSubscriptionsDialog';

function getChannelUrl(subscription: SourceSubscription) {
  if (subscription.source_channel_url) return subscription.source_channel_url;
  return `https://www.youtube.com/channel/${subscription.source_channel_id}`;
}

function getChannelInitials(subscription: SourceSubscription) {
  const raw = (subscription.source_channel_title || subscription.source_channel_id || '').trim();
  if (!raw) return 'YT';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function getSourcePagePath(subscription: SourceSubscription) {
  if (subscription.source_page_path) return subscription.source_page_path;
  const channelId = String(subscription.source_channel_id || '').trim();
  if (!channelId) return null;
  return buildSourcePagePath('youtube', channelId);
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

function formatDateTime(value: string | null) {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString();
}

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

function getChannelSearchErrorMessage(error: unknown) {
  if (error instanceof ChannelSearchApiRequestError) {
    switch (error.errorCode) {
      case 'INVALID_QUERY':
        return 'Enter at least 2 characters to search for channels.';
      case 'SEARCH_DISABLED':
        return 'Channel search is currently unavailable.';
      case 'RATE_LIMITED':
        return 'Search quota is currently limited. Please try again shortly.';
      case 'API_NOT_CONFIGURED':
        return 'Search requires VITE_AGENTIC_BACKEND_URL.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Channel search failed.';
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

export default function Subscriptions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const subscriptionsEnabled = Boolean(config.agenticBackendUrl);

  const [searchParams, setSearchParams] = useSearchParams();
  const [isAddSubscriptionOpen, setIsAddSubscriptionOpen] = useState(false);
  const [channelSearchQuery, setChannelSearchQuery] = useState('');
  const [channelSearchSubmittedQuery, setChannelSearchSubmittedQuery] = useState('');
  const [channelSearchResults, setChannelSearchResults] = useState<YouTubeChannelSearchResult[]>([]);
  const [channelSearchNextToken, setChannelSearchNextToken] = useState<string | null>(null);
  const [channelSearchError, setChannelSearchError] = useState<string | null>(null);
  const [subscribingChannelIds, setSubscribingChannelIds] = useState<Record<string, boolean>>({});
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

  const resetSearchDialogState = () => {
    setChannelSearchQuery('');
    setChannelSearchSubmittedQuery('');
    setChannelSearchResults([]);
    setChannelSearchNextToken(null);
    setChannelSearchError(null);
  };

  const handleAddSubscriptionDialogChange = (nextOpen: boolean) => {
    setIsAddSubscriptionOpen(nextOpen);
    if (!nextOpen) {
      resetSearchDialogState();
    }
  };

  useEffect(() => {
    if (searchParams.get('add') !== '1') return;
    setIsAddSubscriptionOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('add');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
      toast({
        title: 'YouTube connected',
        description: 'You can now import subscriptions from your YouTube account.',
      });
      return;
    }

    toast({
      title: 'YouTube connect failed',
      description: code ? `OAuth returned: ${code}` : 'Could not connect YouTube.',
      variant: 'destructive',
    });
  }, [queryClient, searchParams, setSearchParams, toast, user?.id]);

  const isRowPending = (subscriptionId: string) => Boolean(pendingRows[subscriptionId]);
  const markRowPending = (subscriptionId: string, isPending: boolean) => {
    setPendingRows((previous) => {
      if (isPending) return { ...previous, [subscriptionId]: true };
      if (!previous[subscriptionId]) return previous;
      const next = { ...previous };
      delete next[subscriptionId];
      return next;
    });
  };

  const withRowPending = async <T,>(subscriptionId: string, operation: () => Promise<T>) => {
    if (isRowPending(subscriptionId)) return null;
    markRowPending(subscriptionId, true);
    try {
      return await operation();
    } catch {
      return null;
    } finally {
      markRowPending(subscriptionId, false);
    }
  };

  const subscriptionsQuery = useQuery({
    queryKey: ['source-subscriptions', user?.id],
    enabled: Boolean(user) && subscriptionsEnabled,
    queryFn: listSourceSubscriptions,
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
      toast({
        title: 'Import complete',
        description: `Imported ${result.imported_count}, reactivated ${result.reactivated_count}, already active ${result.already_active_count}, failed ${result.failed_count}.`,
      });
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
      toast({
        title: 'YouTube disconnected',
        description: 'Your existing app subscriptions were kept.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Disconnect failed',
        description: getYouTubeConnectionErrorMessage(error, 'Could not disconnect YouTube.'),
        variant: 'destructive',
      });
    },
  });

  const channelSearchMutation = useMutation({
    mutationFn: async (input: { query: string; pageToken?: string | null; append?: boolean }) => {
      const data = await searchYouTubeChannels({
        q: input.query,
        limit: 10,
        pageToken: input.pageToken || undefined,
      });
      return {
        query: input.query,
        append: Boolean(input.append),
        ...data,
      };
    },
    onSuccess: (payload) => {
      setChannelSearchSubmittedQuery(payload.query);
      setChannelSearchError(null);
      setChannelSearchResults((previous) => (payload.append ? [...previous, ...payload.results] : payload.results));
      setChannelSearchNextToken(payload.next_page_token);
    },
    onError: (error) => {
      setChannelSearchError(getChannelSearchErrorMessage(error));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (inputRaw: string) => {
      const input = inputRaw.trim();
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      if (!input) throw new Error('Enter a channel to subscribe.');
      return createSourceSubscription({ channelInput: input });
    },
    onSuccess: () => {
      invalidateSubscriptionViews();
    },
    onError: (error) => {
      const description = error instanceof ApiRequestError && error.errorCode === 'INVALID_CHANNEL'
        ? 'Could not resolve that YouTube channel. Try another result.'
        : error instanceof Error
          ? error.message
          : 'Could not create subscription.';
      toast({ title: 'Subscribe failed', description, variant: 'destructive' });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateSourceSubscription(id),
    onSuccess: () => {
      invalidateSubscriptionViews();
      toast({ title: 'Unsubscribed', description: 'You will no longer receive new uploads from this channel.' });
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
    refetchInterval: (query) => {
      const status = query.state.data?.status as IngestionJobStatus | undefined;
      if (!status || status === 'queued' || status === 'running') return 4000;
      return false;
    },
  });

  const latestManualRefreshJobQuery = useQuery({
    queryKey: ['ingestion-job-latest-mine', user?.id],
    enabled: Boolean(user) && subscriptionsEnabled && !activeRefreshJobId,
    queryFn: () => getLatestMyIngestionJob('manual_refresh_selection'),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const handleUnsubscribe = (subscription: SourceSubscription) => {
    void withRowPending(subscription.id, () => deactivateMutation.mutateAsync(subscription.id));
  };

  const handleAutoUnlockToggle = (subscription: SourceSubscription, nextChecked: boolean) => {
    void withRowPending(subscription.id, async () => {
      const current = Boolean(subscription.auto_unlock_enabled);
      if (current === nextChecked) return;
      await updateSubscriptionMutation.mutateAsync({
        id: subscription.id,
        autoUnlockEnabled: nextChecked,
      });
    });
  };

  const handleOpenYouTubeImport = () => {
    setIsYouTubeImportOpen(true);
    setYouTubeImportSummary(null);
    setYouTubeImportError(null);
    setYouTubeImportFilterQuery('');
    setYouTubeImportResults([]);
    setYouTubeImportSelected({});
    youtubeImportPreviewMutation.mutate();
  };

  const handleYouTubeImportDialogChange = (nextOpen: boolean) => {
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
  };

  const toggleYouTubeImportChannel = (channelId: string, checked: boolean) => {
    setYouTubeImportSelected((previous) => ({
      ...previous,
      [channelId]: checked,
    }));
  };

  const handleYouTubeImportSelectVisible = () => {
    setYouTubeImportSelected((previous) => {
      const next = { ...previous };
      for (const row of filteredYouTubeImportResults) {
        next[row.channel_id] = true;
      }
      return next;
    });
  };

  const handleYouTubeImportClearSelection = () => {
    setYouTubeImportSelected({});
  };

  const handleDisconnectYouTube = () => {
    if (!window.confirm('Disconnect YouTube? Imported app subscriptions will remain active.')) return;
    youtubeDisconnectMutation.mutate();
  };

  const handleStartYouTubeConnect = () => {
    startYouTubeConnectMutation.mutate();
  };

  const setSubscribing = (channelId: string, value: boolean) => {
    setSubscribingChannelIds((previous) => {
      if (value) return { ...previous, [channelId]: true };
      if (!previous[channelId]) return previous;
      const next = { ...previous };
      delete next[channelId];
      return next;
    });
  };

  const handleChannelSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = channelSearchQuery.trim();
    if (!query) {
      setChannelSearchError('Enter a channel query.');
      return;
    }
    channelSearchMutation.mutate({ query, append: false });
  };

  const handleChannelSearchLoadMore = () => {
    if (!channelSearchNextToken || channelSearchMutation.isPending) return;
    channelSearchMutation.mutate({
      query: channelSearchSubmittedQuery || channelSearchQuery.trim(),
      pageToken: channelSearchNextToken,
      append: true,
    });
  };

  const runSubscribe = async (input: string, successTitle = 'Subscription saved') => {
    await createMutation.mutateAsync(input);
    toast({
      title: successTitle,
      description: 'You are now subscribed. New uploads will appear in your feed.',
    });
  };

  const handleSubscribeFromSearch = async (result: YouTubeChannelSearchResult) => {
    if (!subscriptionsEnabled) return;
    if (subscribingChannelIds[result.channel_id]) return;
    setSubscribing(result.channel_id, true);
    try {
      await runSubscribe(result.channel_url || result.channel_id, 'Subscribed');
      handleAddSubscriptionDialogChange(false);
    } catch {
      // error toast handled in mutation
    } finally {
      setSubscribing(result.channel_id, false);
    }
  };

  const subscriptions = subscriptionsQuery.data || [];
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

  const handleImportSelectedChannels = () => {
    if (selectedYouTubeImportChannels.length === 0) {
      toast({
        title: 'No channels selected',
        description: 'Select one or more channels to import.',
        variant: 'destructive',
      });
      return;
    }
    youtubeImportMutation.mutate(selectedYouTubeImportChannels);
  };

  useEffect(() => {
    const job = refreshJobQuery.data;
    if (!job?.job_id) return;
    if (job.status !== 'succeeded' && job.status !== 'failed') return;
    if (terminalHandledJobId === job.job_id) return;

    setTerminalHandledJobId(job.job_id);
    invalidateSubscriptionViews();

    if (job.status === 'succeeded') {
      const failedCount = Math.max(0, Number(job.processed_count || 0) - Number(job.inserted_count || 0) - Number(job.skipped_count || 0));
      toast({
        title: 'Background generation finished',
        description: `Inserted ${job.inserted_count}, skipped ${job.skipped_count}, failed ${failedCount}.`,
      });
      if (refreshReturnTo) {
        navigate(refreshReturnTo, { replace: true });
        setRefreshReturnTo(null);
      }
      return;
    }

    toast({
      title: 'Background generation failed',
      description: job.error_message || 'Could not complete background generation.',
      variant: 'destructive',
    });
    if (refreshReturnTo) {
      navigate(refreshReturnTo, { replace: true });
      setRefreshReturnTo(null);
    }
  }, [invalidateSubscriptionViews, navigate, refreshJobQuery.data, refreshReturnTo, terminalHandledJobId, toast]);

  useEffect(() => {
    if (activeRefreshJobId) return;
    const latestJob = latestManualRefreshJobQuery.data;
    if (!latestJob?.job_id) return;
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
  }, [activeRefreshJobId, latestManualRefreshJobQuery.data]);

  const handleRefreshDialogChange = (nextOpen: boolean) => {
    const shouldReturnToProfile = !nextOpen && Boolean(refreshReturnTo);
    setIsRefreshDialogOpen(nextOpen);
    if (shouldReturnToProfile && refreshReturnTo) {
      navigate(refreshReturnTo, { replace: true });
      setRefreshReturnTo(null);
    }
  };

  const handleRefreshQueued = ({ jobId, queuedCount }: { jobId: string; queuedCount: number }) => {
    setActiveRefreshJobId(jobId);
    setQueuedRefreshCount(queuedCount);
    setTerminalHandledJobId(null);
  };

  return (
    <PageRoot>
      <AppHeader />

      <PageMain className="space-y-6">
        <PageSection>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Subscriptions</p>
            <h1 className="text-2xl font-semibold">Manage YouTube source subscriptions</h1>
            <p className="text-sm text-muted-foreground">
              Add channels here. New uploads from active subscriptions will land in My Feed automatically.
            </p>
            {!subscriptionsEnabled ? (
              <p className="text-xs text-muted-foreground">
                Subscription APIs require `VITE_AGENTIC_BACKEND_URL`.
              </p>
            ) : null}
          </div>
        </PageSection>

        <Card className="border-border/40">
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => handleAddSubscriptionDialogChange(true)}
                disabled={!subscriptionsEnabled}
              >
                Add Subscription
              </Button>
            </div>
            {!subscriptionsEnabled ? (
              <p className="text-sm text-muted-foreground">Connect requires `VITE_AGENTIC_BACKEND_URL`.</p>
            ) : youtubeConnectionQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-9 w-40" />
              </div>
            ) : youtubeConnectionQuery.error ? (
              <p className="text-sm text-destructive">
                {getYouTubeConnectionErrorMessage(youtubeConnectionQuery.error, 'Could not load YouTube connection status.')}
              </p>
            ) : youtubeConnection?.connected ? (
              <>
                <div className="flex items-center gap-3">
                  {youtubeConnection.channel_avatar_url ? (
                    <img
                      src={youtubeConnection.channel_avatar_url}
                      alt={youtubeConnection.channel_title || 'YouTube channel'}
                      className="h-10 w-10 rounded-full border border-border/40 object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full border border-border/40 bg-muted text-xs font-semibold flex items-center justify-center">
                      YT
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {youtubeConnection.channel_title || 'Connected YouTube account'}
                    </p>
                    {youtubeConnection.last_import_at ? (
                      <p className="text-xs text-muted-foreground">
                        Last import: {formatDateTime(youtubeConnection.last_import_at)}
                      </p>
                    ) : null}
                  </div>
                </div>

                {youtubeConnection.needs_reauth ? (
                  <p className="text-xs text-destructive">
                    Authorization expired. Reconnect YouTube to continue importing.
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handleOpenYouTubeImport}
                    disabled={youtubeImportPreviewMutation.isPending || youtubeImportMutation.isPending || youtubeConnection.needs_reauth}
                  >
                    Import from YouTube
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDisconnectYouTube}
                    disabled={youtubeDisconnectMutation.isPending}
                  >
                    {youtubeDisconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Connect your YouTube account to import subscriptions in bulk.
                </p>
                <Button
                  size="sm"
                  onClick={handleStartYouTubeConnect}
                  disabled={startYouTubeConnectMutation.isPending}
                >
                  {startYouTubeConnectMutation.isPending ? 'Connecting...' : 'Connect YouTube'}
                </Button>
              </>
            )}

            {youTubeImportSummary ? (
              <p className="text-xs text-muted-foreground">
                Last import: Imported {youTubeImportSummary.imported_count}, reactivated {youTubeImportSummary.reactivated_count}, already active {youTubeImportSummary.already_active_count}, failed {youTubeImportSummary.failed_count}.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {activeRefreshJobId ? (
          <Card className="border-border/40">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Background generation</CardTitle>
                {refreshJobLabel ? (
                  <Badge variant={refreshJobStatus === 'failed' ? 'destructive' : 'secondary'}>
                    {refreshJobLabel}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground break-all">Job: {activeRefreshJobId}</p>
              {refreshJobStatus === 'queued' && !refreshJobQuery.data ? (
                <p className="text-muted-foreground">
                  Queued {queuedRefreshCount} video(s). This can take a bit depending on transcript and model latency.
                </p>
              ) : null}
              {refreshJobQuery.data ? (
                <p className="text-muted-foreground">
                  Inserted {refreshJobInserted}, skipped {refreshJobSkipped}, failed {refreshJobFailed}.
                </p>
              ) : null}
              {refreshJobQuery.data?.error_message ? (
                <p className="text-xs text-destructive">
                  {refreshJobQuery.data.error_code ? `${refreshJobQuery.data.error_code}: ` : ''}{refreshJobQuery.data.error_message}
                </p>
              ) : null}
              {refreshJobQuery.error ? (
                <p className="text-xs text-destructive">
                  Could not fetch latest job status. Try refreshing status.
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refreshJobQuery.refetch()}
                  disabled={refreshJobQuery.isFetching}
                >
                  {refreshJobQuery.isFetching ? 'Refreshing...' : 'Refresh status'}
                </Button>
                {refreshJobRunning ? <p className="text-xs text-muted-foreground">Updates every ~4 seconds.</p> : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Dialog open={isAddSubscriptionOpen} onOpenChange={handleAddSubscriptionDialogChange}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Subscription</DialogTitle>
              <DialogDescription>
                Search YouTube channels and subscribe in one click.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <form onSubmit={handleChannelSearchSubmit} className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={channelSearchQuery}
                  onChange={(event) => setChannelSearchQuery(event.target.value)}
                  placeholder="Try: skincare, fitness, productivity"
                />
                <Button type="submit" size="sm" disabled={channelSearchMutation.isPending || !subscriptionsEnabled}>
                  {channelSearchMutation.isPending ? 'Searching...' : 'Search channels'}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">
                Suggestions are transient. Nothing changes until you click Subscribe.
              </p>
              {channelSearchError ? <p className="text-sm text-destructive">{channelSearchError}</p> : null}

              {channelSearchResults.length === 0 && channelSearchSubmittedQuery ? (
                <p className="text-sm text-muted-foreground">No channels found for your query.</p>
              ) : null}

              {channelSearchResults.length > 0 ? (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {channelSearchResults.map((result) => {
                    const isSubscribing = Boolean(subscribingChannelIds[result.channel_id]);
                    return (
                      <div key={result.channel_id} className="rounded-md border border-border/40 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <p className="text-sm font-medium truncate">{result.channel_title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {result.description || 'No channel description available.'}
                            </p>
                          </div>
                          {result.thumbnail_url ? (
                            <img
                              src={result.thumbnail_url}
                              alt={result.channel_title}
                              className="h-10 w-10 rounded-md object-cover border border-border/40 shrink-0"
                            />
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSubscribeFromSearch(result)}
                            disabled={!subscriptionsEnabled || isSubscribing || createMutation.isPending}
                          >
                            {isSubscribing ? 'Subscribing...' : 'Subscribe'}
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <a href={result.channel_url} target="_blank" rel="noreferrer">
                              Open on YouTube
                            </a>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {channelSearchNextToken ? (
                    <div className="flex justify-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleChannelSearchLoadMore}
                        disabled={channelSearchMutation.isPending}
                      >
                        {channelSearchMutation.isPending ? 'Loading...' : 'Load more'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isYouTubeImportOpen} onOpenChange={handleYouTubeImportDialogChange}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Import YouTube subscriptions</DialogTitle>
              <DialogDescription>
                Select channels to import as blueprint subscriptions. Nothing is selected by default.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => youtubeImportPreviewMutation.mutate()}
                  disabled={youtubeImportPreviewMutation.isPending || youtubeImportMutation.isPending}
                >
                  {youtubeImportPreviewMutation.isPending ? 'Loading...' : 'Reload list'}
                </Button>
                {youTubeImportResults.length > 0 ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleYouTubeImportSelectVisible}
                      disabled={youtubeImportMutation.isPending || filteredYouTubeImportResults.length === 0}
                    >
                      Select visible
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleYouTubeImportClearSelection}
                      disabled={youtubeImportMutation.isPending}
                    >
                      Clear
                    </Button>
                  </>
                ) : null}
              </div>

              {youTubeImportError ? (
                <p className="text-sm text-destructive">{youTubeImportError}</p>
              ) : null}

              {youTubeImportTruncated ? (
                <p className="text-xs text-muted-foreground">
                  Showing the first {youTubeImportResults.length} subscriptions (import cap reached).
                </p>
              ) : null}

              {youTubeImportResults.length > 0 ? (
                <Input
                  value={youTubeImportFilterQuery}
                  onChange={(event) => setYouTubeImportFilterQuery(event.target.value)}
                  placeholder="Filter channels..."
                  className="h-9"
                />
              ) : null}

              {youtubeImportPreviewMutation.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 rounded-md" />
                  <Skeleton className="h-16 rounded-md" />
                </div>
              ) : null}

              {!youtubeImportPreviewMutation.isPending && !youTubeImportError && youTubeImportResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No YouTube subscriptions available to import.
                </p>
              ) : null}

              {youTubeImportResults.length > 0 && filteredYouTubeImportResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No channels match "{youTubeImportFilterQuery.trim()}".
                </p>
              ) : null}

              {filteredYouTubeImportResults.length > 0 ? (
                <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                  {filteredYouTubeImportResults.map((item) => {
                    const checked = Boolean(youTubeImportSelected[item.channel_id]);
                    return (
                      <div key={item.channel_id} className="rounded-md border border-border/40 p-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleYouTubeImportChannel(item.channel_id, value === true)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-sm font-medium line-clamp-1">
                              {item.channel_title || item.channel_id}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <a href={item.channel_url} target="_blank" rel="noreferrer" className="underline">
                                Open channel
                              </a>
                              {item.already_active ? (
                                <Badge variant="secondary" className="h-5 px-2 text-[10px]">Already active</Badge>
                              ) : null}
                              {!item.already_active && item.already_exists_inactive ? (
                                <Badge variant="outline" className="h-5 px-2 text-[10px]">Will reactivate</Badge>
                              ) : null}
                            </div>
                          </div>
                          {item.thumbnail_url ? (
                            <img
                              src={item.thumbnail_url}
                              alt={item.channel_title || item.channel_id}
                              className="h-10 w-10 rounded-md border border-border/40 object-cover shrink-0"
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2 pt-2">
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedYouTubeImportChannels.length} / {youTubeImportResults.length}
                </p>
                <Button
                  size="sm"
                  onClick={handleImportSelectedChannels}
                  disabled={selectedYouTubeImportChannels.length === 0 || youtubeImportMutation.isPending || youtubeImportPreviewMutation.isPending}
                >
                  {youtubeImportMutation.isPending ? 'Importing...' : 'Import selected'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <RefreshSubscriptionsDialog
          open={isRefreshDialogOpen}
          onOpenChange={handleRefreshDialogChange}
          subscriptionsEnabled={subscriptionsEnabled}
          userId={user?.id}
          generationRunning={refreshJobRunning}
          onQueued={handleRefreshQueued}
        />

        {subscriptionsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : subscriptionsQuery.error ? (
          <Card className="border-border/40">
            <CardContent className="p-4 text-sm text-destructive">
              Could not load subscriptions. Please refresh and try again.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Your subscriptions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={subscriptionFilterQuery}
                  onChange={(event) => setSubscriptionFilterQuery(event.target.value)}
                  placeholder="Filter subscriptions..."
                  className="h-9"
                />
                {activeSubscriptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
                ) : filteredActiveSubscriptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No subscriptions match "{subscriptionFilterQuery.trim()}".
                  </p>
                ) : (
                  filteredActiveSubscriptions.map((subscription) => {
                    const sourcePagePath = getSourcePagePath(subscription);
                    return (
                      <div key={subscription.id} className="rounded-md border border-border/40 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {sourcePagePath ? (
                              <Link to={sourcePagePath} className="shrink-0">
                                {subscription.source_channel_avatar_url ? (
                                  <img
                                    src={subscription.source_channel_avatar_url}
                                    alt={subscription.source_channel_title || subscription.source_channel_id}
                                    className="h-10 w-10 rounded-full object-cover border border-border/40"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-full border border-border/40 bg-muted text-xs font-semibold flex items-center justify-center">
                                    {getChannelInitials(subscription)}
                                  </div>
                                )}
                              </Link>
                            ) : (
                              <div className="shrink-0">
                                {subscription.source_channel_avatar_url ? (
                                  <img
                                    src={subscription.source_channel_avatar_url}
                                    alt={subscription.source_channel_title || subscription.source_channel_id}
                                    className="h-10 w-10 rounded-full object-cover border border-border/40"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded-full border border-border/40 bg-muted text-xs font-semibold flex items-center justify-center">
                                    {getChannelInitials(subscription)}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="min-w-0">
                              {sourcePagePath ? (
                                <Link to={sourcePagePath} className="text-sm font-medium truncate min-w-0 hover:underline block">
                                  {subscription.source_channel_title || subscription.source_channel_id}
                                </Link>
                              ) : (
                                <p className="text-sm font-medium truncate min-w-0">
                                  {subscription.source_channel_title || subscription.source_channel_id}
                                </p>
                              )}
                              <a
                                href={getChannelUrl(subscription)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-muted-foreground underline underline-offset-2"
                              >
                                Open on YouTube
                              </a>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Auto</span>
                              <Switch
                                checked={Boolean(subscription.auto_unlock_enabled)}
                                onCheckedChange={(checked) => handleAutoUnlockToggle(subscription, checked)}
                                disabled={!subscriptionsEnabled || isRowPending(subscription.id)}
                              />
                            </label>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleUnsubscribe(subscription)}
                              disabled={!subscriptionsEnabled || isRowPending(subscription.id)}
                            >
                              {isRowPending(subscription.id) ? 'Unsubscribing...' : 'Unsubscribe'}
                            </Button>
                          </div>
                        </div>
                        {subscription.last_sync_error ? (
                          <p className="text-xs text-red-600/90">Sync issue: {subscription.last_sync_error}</p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        )}
        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}

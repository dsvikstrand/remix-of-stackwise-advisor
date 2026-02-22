import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { config } from '@/config/runtime';
import { useTagFollows } from '@/hooks/useTagFollows';
import { useTagsBySlugs } from '@/hooks/useTags';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { getChannelIcon } from '@/lib/channelIcons';
import { useYouTubeOnboarding } from '@/hooks/useYouTubeOnboarding';
import {
  disconnectYouTubeConnection,
  getYouTubeConnectionStatus,
  importYouTubeSubscriptions,
  previewYouTubeSubscriptionsImport,
  startYouTubeConnection,
  type YouTubeImportPreviewItem,
  type YouTubeImportResult,
} from '@/lib/youtubeConnectionApi';
import { ApiRequestError } from '@/lib/subscriptionsApi';

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
        return 'Invalid return URL. Open onboarding again and retry.';
      case 'RATE_LIMITED':
        return error.message || 'Please wait a moment before trying again.';
      default:
        return error.message || fallback;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

const ONBOARDING_JOINABLE_CHANNELS = CHANNELS_CATALOG
  .filter((c) => c.isJoinEnabled && c.status === 'active')
  .sort((a, b) => a.priority - b.priority);

const ONBOARDING_TAG_SLUGS = ONBOARDING_JOINABLE_CHANNELS.map((c) => c.tagSlug);

function OnboardingChannelPicker() {
  const { data: tags = [], isLoading: tagsLoading } = useTagsBySlugs(ONBOARDING_TAG_SLUGS);
  const {
    joinChannel,
    leaveChannel,
    getFollowState,
    isLoading: followsLoading,
  } = useTagFollows();

  const tagBySlug = useMemo(
    () => new Map(tags.map((t) => [t.slug, t])),
    [tags],
  );

  const handleToggle = async (tagId: string, tagSlug: string, isJoined: boolean) => {
    try {
      if (isJoined) {
        await leaveChannel({ id: tagId, slug: tagSlug });
      } else {
        await joinChannel({ id: tagId, slug: tagSlug });
      }
    } catch {
      // useTagFollows already handles error state
    }
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Step 3: Join channels (optional)</CardTitle>
        <CardDescription>
          Select channels you'd like to follow. You can change these anytime from Channels.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {tagsLoading || followsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-10 rounded-md" />
          </div>
        ) : (
          <div className="max-h-[40vh] overflow-y-auto space-y-0.5 pr-1">
            {ONBOARDING_JOINABLE_CHANNELS.map((channel) => {
              const tag = tagBySlug.get(channel.tagSlug);
              const tagId = tag?.id ?? null;
              const state = tagId ? getFollowState({ id: tagId }) : null;
              const isJoined = state === 'joined' || state === 'leaving';
              const isPending = state === 'joining' || state === 'leaving';
              const unavailable = !tagId;

              const ChannelIcon = getChannelIcon(channel.icon);

              return (
                <div
                  key={channel.slug}
                  className="flex items-center justify-between gap-3 py-2 px-1"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <ChannelIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{channel.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{channel.description}</p>
                    </div>
                  </div>
                  {unavailable ? (
                    <Button size="sm" variant="outline" disabled className="h-7 px-2 text-xs shrink-0">
                      Unavailable
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={isJoined ? 'outline' : 'default'}
                      disabled={isPending}
                      className="h-7 px-2 text-xs shrink-0"
                      onClick={() => handleToggle(tagId!, channel.tagSlug, isJoined)}
                    >
                      {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      {state === 'joining' ? 'Joining...' : state === 'leaving' ? 'Leaving...' : isJoined ? 'Joined' : 'Join'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function normalizeImportFilterQuery(value: string) {
  return value.trim().toLowerCase();
}

function getImportFilterRank(item: YouTubeImportPreviewItem, normalizedQuery: string) {
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

export default function WelcomeOnboarding() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const onboardingQuery = useYouTubeOnboarding();
  const onboardingRow = onboardingQuery.data;
  const onboardingLoading = onboardingQuery.isLoading || onboardingQuery.isFetching;
  const onboardingError = onboardingQuery.isError;
  const refetchOnboarding = onboardingQuery.refetch;
  const updateOnboarding = onboardingQuery.updateOnboarding;
  const subscriptionsEnabled = Boolean(config.agenticBackendUrl);
  const didMarkPromptRef = useRef(false);
  const didRetryMissingRowRef = useRef(false);

  const [previewRows, setPreviewRows] = useState<YouTubeImportPreviewItem[]>([]);
  const [previewSelected, setPreviewSelected] = useState<Record<string, boolean>>({});
  const [previewFilterQuery, setPreviewFilterQuery] = useState('');
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [importSummary, setImportSummary] = useState<YouTubeImportResult | null>(null);

  const youtubeConnectionQuery = useQuery({
    queryKey: ['youtube-connection-status', user?.id],
    enabled: Boolean(user?.id) && subscriptionsEnabled,
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

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      return previewYouTubeSubscriptionsImport();
    },
    onSuccess: (payload) => {
      setPreviewRows(payload.results || []);
      setPreviewTruncated(Boolean(payload.truncated));
      const nextSelected: Record<string, boolean> = {};
      for (const row of payload.results || []) {
        nextSelected[row.channel_id] = false;
      }
      setPreviewSelected(nextSelected);
    },
    onError: (error) => {
      toast({
        title: 'Could not load subscriptions',
        description: getYouTubeConnectionErrorMessage(error, 'Could not load your YouTube subscriptions.'),
        variant: 'destructive',
      });
      setPreviewRows([]);
      setPreviewSelected({});
      setPreviewTruncated(false);
    },
  });

  const importMutation = useMutation({
    mutationFn: async (channels: Array<{ channel_id: string; channel_url?: string; channel_title?: string | null }>) => {
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      return importYouTubeSubscriptions({ channels });
    },
    onSuccess: async (result) => {
      setImportSummary(result);
      queryClient.invalidateQueries({ queryKey: ['source-subscriptions', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['my-feed-items', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['youtube-connection-status', user?.id] });

      const successfulImports = Number(result.imported_count || 0) + Number(result.reactivated_count || 0);
      if (successfulImports > 0) {
        await updateOnboarding({
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
        toast({
          title: 'Setup complete',
          description: `Imported ${result.imported_count} and reactivated ${result.reactivated_count} subscriptions.`,
        });
        navigate('/wall', { replace: true });
        return;
      }

      toast({
        title: 'No new subscriptions imported',
        description: 'Setup stays open until at least one subscription is imported or reactivated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Import failed',
        description: getYouTubeConnectionErrorMessage(error, 'Could not import selected channels.'),
        variant: 'destructive',
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      return disconnectYouTubeConnection();
    },
    onSuccess: () => {
      setPreviewRows([]);
      setPreviewSelected({});
      setPreviewTruncated(false);
      setImportSummary(null);
      queryClient.invalidateQueries({ queryKey: ['youtube-connection-status', user?.id] });
      toast({
        title: 'YouTube disconnected',
        description: 'You can reconnect anytime.',
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

  const skipMutation = useMutation({
    mutationFn: async () => updateOnboarding({
      status: 'skipped',
      first_prompted_at: onboardingRow?.first_prompted_at || new Date().toISOString(),
    }),
    onSuccess: () => {
      navigate('/wall', { replace: true });
    },
    onError: () => {
      toast({
        title: 'Could not skip right now',
        description: 'Please retry in a moment.',
        variant: 'destructive',
      });
    },
  });

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
        description: 'Now import channels to complete setup.',
      });
      if (subscriptionsEnabled && !previewMutation.isPending && !importMutation.isPending) {
        previewMutation.mutate();
      }
      return;
    }

    toast({
      title: 'YouTube connect failed',
      description: code ? `OAuth returned: ${code}` : 'Could not connect YouTube.',
      variant: 'destructive',
    });
  }, [
    importMutation.isPending,
    previewMutation.isPending,
    previewMutation.mutate,
    queryClient,
    searchParams,
    setSearchParams,
    subscriptionsEnabled,
    toast,
    user?.id,
  ]);

  useEffect(() => {
    if (!user?.id || onboardingLoading) return;
    if (onboardingError) return;
    if (!onboardingRow) {
      if (!didRetryMissingRowRef.current) {
        didRetryMissingRowRef.current = true;
        refetchOnboarding();
        return;
      }
      navigate('/wall', { replace: true });
      return;
    }
    if (onboardingRow.status === 'completed') {
      navigate('/wall', { replace: true });
      return;
    }
    if (!onboardingRow.first_prompted_at && !didMarkPromptRef.current) {
      didMarkPromptRef.current = true;
      updateOnboarding({
        first_prompted_at: new Date().toISOString(),
      }).catch(() => {
        didMarkPromptRef.current = false;
      });
    }
  }, [
    navigate,
    onboardingLoading,
    onboardingError,
    onboardingRow,
    updateOnboarding,
    refetchOnboarding,
    user?.id,
  ]);

  const selectedChannels = useMemo(
    () =>
      previewRows
        .filter((row) => previewSelected[row.channel_id])
        .map((row) => ({
          channel_id: row.channel_id,
          channel_url: row.channel_url,
          channel_title: row.channel_title,
        })),
    [previewRows, previewSelected],
  );
  const normalizedPreviewFilterQuery = useMemo(
    () => normalizeImportFilterQuery(previewFilterQuery),
    [previewFilterQuery],
  );
  const filteredPreviewRows = useMemo(() => {
    if (!normalizedPreviewFilterQuery) return previewRows;
    return previewRows
      .map((row, index) => ({
        row,
        index,
        rank: getImportFilterRank(row, normalizedPreviewFilterQuery),
      }))
      .filter((entry) => Number.isFinite(entry.rank))
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank;
        return left.index - right.index;
      })
      .map((entry) => entry.row);
  }, [previewRows, normalizedPreviewFilterQuery]);

  const toggleRow = (channelId: string, checked: boolean) => {
    setPreviewSelected((previous) => ({ ...previous, [channelId]: checked }));
  };

  const selectAllVisibleRows = () => {
    setPreviewSelected((previous) => {
      const next = { ...previous };
      for (const row of filteredPreviewRows) {
        next[row.channel_id] = true;
      }
      return next;
    });
  };

  const clearAllRows = () => {
    setPreviewSelected({});
  };

  const handleImport = () => {
    if (selectedChannels.length === 0) {
      toast({
        title: 'No channels selected',
        description: 'Select one or more channels to import.',
        variant: 'destructive',
      });
      return;
    }
    importMutation.mutate(selectedChannels);
  };

  if (onboardingQuery.isLoading) {
    return (
      <PageRoot>
        <AppHeader />
        <PageMain className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </PageMain>
      </PageRoot>
    );
  }

  if (onboardingError) {
    return (
      <PageRoot>
        <AppHeader />
        <PageMain className="space-y-6">
          <PageSection>
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle className="text-base">Could not load onboarding state</CardTitle>
                <CardDescription>
                  Retry to continue setup, or continue to Home and return later.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => refetchOnboarding()}>
                  Retry
                </Button>
                <Button size="sm" asChild>
                  <Link to="/wall">Continue to Home</Link>
                </Button>
              </CardContent>
            </Card>
          </PageSection>
          <AppFooter />
        </PageMain>
      </PageRoot>
    );
  }

  return (
    <PageRoot>
      <AppHeader />

      <PageMain className="space-y-6">
        <PageSection>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Welcome</p>
            <h1 className="text-2xl font-semibold">Set up your YouTube subscription import</h1>
            <p className="text-sm text-muted-foreground">
              Connect once, import the channels you follow, and start auto-ingesting new uploads.
            </p>
          </div>
        </PageSection>

        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Step 1: Connect YouTube</CardTitle>
            <CardDescription>
              This is optional. You can skip now and set it up later from Subscriptions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!subscriptionsEnabled ? (
              <p className="text-sm text-muted-foreground">
                YouTube connect requires `VITE_AGENTIC_BACKEND_URL`.
              </p>
            ) : youtubeConnectionQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-9 w-40" />
              </div>
            ) : youtubeConnectionQuery.data?.connected ? (
              <>
                <div className="flex items-center gap-3">
                  {youtubeConnectionQuery.data.channel_avatar_url ? (
                    <img
                      src={youtubeConnectionQuery.data.channel_avatar_url}
                      alt={youtubeConnectionQuery.data.channel_title || 'YouTube channel'}
                      className="h-10 w-10 rounded-full border border-border/40 object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full border border-border/40 bg-muted text-xs font-semibold flex items-center justify-center">
                      YT
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {youtubeConnectionQuery.data.channel_title || 'Connected YouTube account'}
                    </p>
                    <p className="text-xs text-muted-foreground">Connected</p>
                  </div>
                  <Badge variant="secondary">Connected</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                  {youtubeConnectionQuery.data.needs_reauth ? (
                    <p className="text-xs text-destructive">Authorization expired. Reconnect to continue.</p>
                  ) : null}
                </div>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => startYouTubeConnectMutation.mutate()}
                disabled={startYouTubeConnectMutation.isPending}
              >
                {startYouTubeConnectMutation.isPending ? 'Connecting...' : 'Connect YouTube'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Step 2: Import subscriptions</CardTitle>
            <CardDescription>
              Select channels to import. Nothing is selected by default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => previewMutation.mutate()}
                disabled={!youtubeConnectionQuery.data?.connected || previewMutation.isPending || importMutation.isPending}
              >
                {previewMutation.isPending ? 'Loading...' : 'Load subscriptions'}
              </Button>
              {previewRows.length > 0 ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={selectAllVisibleRows}
                    disabled={importMutation.isPending || filteredPreviewRows.length === 0}
                  >
                    Select visible
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearAllRows} disabled={importMutation.isPending}>
                    Clear
                  </Button>
                </>
              ) : null}
            </div>

            {previewRows.length > 0 ? (
              <Input
                value={previewFilterQuery}
                onChange={(event) => setPreviewFilterQuery(event.target.value)}
                placeholder="Filter channels..."
                className="h-9"
              />
            ) : null}

            {previewTruncated ? (
              <p className="text-xs text-muted-foreground">
                Showing the first {previewRows.length} subscriptions (import cap reached).
              </p>
            ) : null}

            {previewMutation.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-16 rounded-md" />
                <Skeleton className="h-16 rounded-md" />
              </div>
            ) : null}

            {!previewMutation.isPending && previewRows.length > 0 && filteredPreviewRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No channels match "{previewFilterQuery.trim()}".
              </p>
            ) : null}

            {!previewMutation.isPending && filteredPreviewRows.length > 0 ? (
              <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                {filteredPreviewRows.map((row) => (
                  <div key={row.channel_id} className="rounded-md border border-border/40 p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={Boolean(previewSelected[row.channel_id])}
                        onCheckedChange={(value) => toggleRow(row.channel_id, value === true)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium line-clamp-1">
                          {row.channel_title || row.channel_id}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {row.already_active ? <Badge variant="secondary" className="h-5 px-2 text-[10px]">Already active</Badge> : null}
                          {!row.already_active && row.already_exists_inactive ? (
                            <Badge variant="outline" className="h-5 px-2 text-[10px]">Will reactivate</Badge>
                          ) : null}
                        </div>
                      </div>
                      {row.thumbnail_url ? (
                        <img
                          src={row.thumbnail_url}
                          alt={row.channel_title || row.channel_id}
                          className="h-10 w-10 rounded-md border border-border/40 object-cover shrink-0"
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {importSummary ? (
              <p className="text-xs text-muted-foreground">
                Last import: Imported {importSummary.imported_count}, reactivated {importSummary.reactivated_count}, already active {importSummary.already_active_count}, failed {importSummary.failed_count}.
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Selected: {selectedChannels.length} / {previewRows.length}
              </p>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={
                  !youtubeConnectionQuery.data?.connected
                  || previewMutation.isPending
                  || importMutation.isPending
                  || selectedChannels.length === 0
                }
              >
                {importMutation.isPending ? 'Importing...' : 'Import selected'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <OnboardingChannelPicker />

        <Card className="border-border/40">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              You can skip this now and use <Link to="/subscriptions" className="underline">Subscriptions</Link> later.
            </p>
            <Button
              variant="ghost"
              onClick={() => skipMutation.mutate()}
              disabled={skipMutation.isPending || onboardingQuery.isUpdating}
            >
              {skipMutation.isPending ? 'Skipping...' : 'Skip for now'}
            </Button>
          </CardContent>
        </Card>

        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}

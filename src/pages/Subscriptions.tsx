import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import type { SourceSubscription } from '@/lib/subscriptionsApi';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { buildSourcePagePath } from '@/lib/sourcePagesApi';
import { CreatorSetupSection } from '@/components/subscriptions/CreatorSetupSection';
import { RefreshSubscriptionsDialog } from '@/components/subscriptions/RefreshSubscriptionsDialog';
import { useCreatorSetupController } from '@/hooks/useCreatorSetupController';
import { useSubscriptionsPageController } from '@/hooks/useSubscriptionsPageController';

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

export default function Subscriptions() {
  const creatorSetup = useCreatorSetupController();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    user,
    subscriptionsEnabled,
    subscriptionFilterQuery,
    isYouTubeImportOpen,
    youTubeImportFilterQuery,
    youTubeImportResults,
    youTubeImportSelected,
    youTubeImportTruncated,
    youTubeImportError,
    isRefreshDialogOpen,
    activeRefreshJobId,
    queuedRefreshCount,
    subscriptionsQuery,
    youtubeImportPreviewMutation,
    youtubeImportMutation,
    refreshJobQuery,
    filteredActiveSubscriptions,
    hasMoreSubscriptions,
    isLoadingMoreSubscriptions,
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
    handleYouTubeImportDialogChange,
    toggleYouTubeImportChannel,
    handleYouTubeImportSelectAll,
    handleYouTubeImportClearSelection,
    handleImportSelectedChannels,
    handleRefreshDialogChange,
    handleRefreshQueued,
    handleUnsubscribe,
    handleAutoUnlockToggle,
    handleLoadMoreSubscriptions,
  } = useSubscriptionsPageController();

  useEffect(() => {
    if (searchParams.get('add') !== '1') return;
    creatorSetup.handleAddSubscriptionDialogChange(true);
    const next = new URLSearchParams(searchParams);
    next.delete('add');
    setSearchParams(next, { replace: true });
  }, [creatorSetup.handleAddSubscriptionDialogChange, searchParams, setSearchParams]);

  return (
    <PageRoot>
      <AppHeader />

      <PageMain className="space-y-6">
        <PageSection>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Subscriptions</p>
            <h1 className="text-2xl font-semibold">Follow YouTube creators and shape your Home feed.</h1>
            <p className="text-sm text-muted-foreground">
              Subscriptions follow creators you like. Their videos shape your 'For You' Home feed.
            </p>
            <p className="text-sm text-muted-foreground">
              'Manual' lets you choose which videos to turn into blueprints. 'Auto' generates them automatically when new videos arrive.
            </p>
            {!subscriptionsEnabled ? (
              <p className="text-xs text-muted-foreground">
                Subscription APIs require `VITE_AGENTIC_BACKEND_URL`.
              </p>
            ) : null}
          </div>
        </PageSection>

        <Card className="border-border/40">
          <CardContent className="space-y-4">
            <CreatorSetupSection controller={creatorSetup} />
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

        <Dialog open={isYouTubeImportOpen} onOpenChange={handleYouTubeImportDialogChange}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Import YouTube subscriptions</DialogTitle>
              <DialogDescription>
                Select channels to import as blueprint subscriptions. Nothing is selected by default.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {youTubeImportResults.length > 0 ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleYouTubeImportSelectAll}
                    disabled={youtubeImportMutation.isPending || youTubeImportResults.length === 0}
                  >
                    Select all
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleYouTubeImportClearSelection}
                    disabled={youtubeImportMutation.isPending}
                  >
                    Clear
                  </Button>
                </div>
              ) : null}

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
                <span />
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
                {filteredActiveSubscriptions.length === 0 && !subscriptionFilterQuery.trim() ? (
                  <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
                ) : filteredActiveSubscriptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No subscriptions match "{subscriptionFilterQuery.trim()}".
                  </p>
                ) : (
                  <>
                    {filteredActiveSubscriptions.map((subscription) => {
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
                                <span>{Boolean(subscription.auto_unlock_enabled) ? 'Auto generate' : 'Manual only'}</span>
                                <Switch
                                  checked={Boolean(subscription.auto_unlock_enabled)}
                                  onCheckedChange={(checked) => handleAutoUnlockToggle(subscription, checked)}
                                  disabled={!subscriptionsEnabled || isRowPending(subscription.id)}
                                />
                              </label>
                              <p className="max-w-[12rem] text-right text-[11px] text-muted-foreground">
                                {Boolean(subscription.auto_unlock_enabled)
                                  ? 'New videos can use credits automatically.'
                                  : 'You choose which videos become blueprints.'}
                              </p>
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
                    })}
                    {hasMoreSubscriptions ? (
                      <div className="flex justify-center pt-1">
                        <Button
                          variant="outline"
                          onClick={handleLoadMoreSubscriptions}
                          disabled={isLoadingMoreSubscriptions}
                        >
                          {isLoadingMoreSubscriptions ? 'Loading...' : 'Load more'}
                        </Button>
                      </div>
                    ) : null}
                  </>
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

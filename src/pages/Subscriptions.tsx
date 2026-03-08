import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { SourceSubscription } from '@/lib/subscriptionsApi';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { buildSourcePagePath } from '@/lib/sourcePagesApi';
import { RefreshSubscriptionsDialog } from '@/components/subscriptions/RefreshSubscriptionsDialog';
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

function PublicYouTubePrivacyGuide(props: { intro: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-border/50 bg-background/80 p-4">
      <p className="text-sm text-muted-foreground">{props.intro}</p>
      <div className="space-y-3 text-sm text-muted-foreground">
        <div className="flex gap-3">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">1</span>
          <p>Visit <a href="https://www.youtube.com/account" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">youtube.com/account</a>.</p>
        </div>
        <div className="flex gap-3">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">2</span>
          <p>Press &quot;Privacy&quot;.</p>
        </div>
        <div className="flex gap-3">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">3</span>
          <p>Flip the &quot;Keep all my subscriptions private&quot; switch.</p>
        </div>
        <div className="flex gap-3">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">4</span>
          <p>Return here and import your subscriptions.</p>
        </div>
      </div>
    </div>
  );
}

export default function Subscriptions() {
  const {
    user,
    subscriptionsEnabled,
    isAddSubscriptionOpen,
    channelSearchQuery,
    channelSearchResults,
    channelSearchSubmittedQuery,
    channelSearchNextToken,
    channelSearchError,
    subscriptionFilterQuery,
    publicYouTubeChannelInput,
    publicYouTubePreview,
    publicYouTubePreviewFilterQuery,
    publicYouTubePreviewSelected,
    publicYouTubePreviewError,
    publicYouTubePreviewErrorCode,
    publicYouTubeImportSummary,
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
    publicYouTubePreviewMutation,
    publicYouTubeImportMutation,
    youtubeImportPreviewMutation,
    youtubeImportMutation,
    channelSearchMutation,
    createMutation,
    refreshJobQuery,
    filteredActiveSubscriptions,
    filteredPublicYouTubePreviewCreators,
    filteredYouTubeImportResults,
    selectedPublicYouTubeCreators,
    selectedYouTubeImportChannels,
    refreshJobStatus,
    refreshJobInserted,
    refreshJobSkipped,
    refreshJobFailed,
    refreshJobRunning,
    refreshJobLabel,
    isRowPending,
    setChannelSearchQuery,
    setSubscriptionFilterQuery,
    setPublicYouTubeChannelInput,
    setPublicYouTubePreviewFilterQuery,
    setYouTubeImportFilterQuery,
    handleAddSubscriptionDialogChange,
    handlePublicYouTubePreviewSubmit,
    togglePublicYouTubePreviewCreator,
    handlePublicYouTubePreviewSelectAll,
    handlePublicYouTubePreviewClearSelection,
    handleYouTubeImportDialogChange,
    toggleYouTubeImportChannel,
    handleYouTubeImportSelectAll,
    handleYouTubeImportClearSelection,
    handleChannelSearchSubmit,
    handleChannelSearchLoadMore,
    handleSubscribeFromSearch,
    handleImportSelectedPublicYouTubeCreators,
    handleImportSelectedChannels,
    handleRefreshDialogChange,
    handleRefreshQueued,
    handleUnsubscribe,
    handleAutoUnlockToggle,
  } = useSubscriptionsPageController();
  const [isPublicYouTubeImportOpen, setIsPublicYouTubeImportOpen] = useState(false);

  useEffect(() => {
    if (publicYouTubePreview || publicYouTubePreviewError || publicYouTubePreviewMutation.isPending) {
      setIsPublicYouTubeImportOpen(true);
    }
  }, [publicYouTubePreview, publicYouTubePreviewError, publicYouTubePreviewMutation.isPending]);

  return (
    <PageRoot>
      <AppHeader />

      <PageMain className="space-y-6">
        <PageSection>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Subscriptions</p>
            <h1 className="text-2xl font-semibold">Follow creators and build your feed</h1>
            <p className="text-sm text-muted-foreground">
              Add creators manually first, or optionally import your YouTube subscriptions and review them before importing.
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
            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-foreground">Add creators manually</p>
                    <Badge variant="secondary" className="h-5 px-2 text-[10px]">Main path</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Search YouTube creators and subscribe one by one.
                  </p>
                </div>
                <Button
                  onClick={() => handleAddSubscriptionDialogChange(true)}
                  disabled={!subscriptionsEnabled}
                >
                  Add creators manually
                </Button>
              </div>
            </div>

            <Collapsible open={isPublicYouTubeImportOpen} onOpenChange={setIsPublicYouTubeImportOpen}>
              <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">Import From YouTube</p>
                      <Badge variant="outline" className="h-5 px-2 text-[10px]">Optional</Badge>
                    </div>
                    {!isPublicYouTubeImportOpen ? (
                      <p className="text-xs text-muted-foreground">
                        Import your YouTube subscriptions by handle.
                      </p>
                    ) : null}
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button size="sm" variant="ghost">
                      {isPublicYouTubeImportOpen ? 'Hide' : 'Import From YouTube'}
                    </Button>
                  </CollapsibleTrigger>
                </div>

                <CollapsibleContent className="mt-4 space-y-4">
                  <form onSubmit={handlePublicYouTubePreviewSubmit} className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="space-y-2 md:flex-1">
                      <p className="text-sm font-medium text-foreground">Fill in your handle</p>
                      <Input
                        value={publicYouTubeChannelInput}
                        onChange={(event) => setPublicYouTubeChannelInput(event.target.value)}
                        placeholder="madameglome"
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={!subscriptionsEnabled || publicYouTubePreviewMutation.isPending}>
                      {publicYouTubePreviewMutation.isPending ? 'Finding...' : 'Find subscriptions'}
                    </Button>
                  </form>

                  {publicYouTubePreviewError && publicYouTubePreviewErrorCode !== 'PUBLIC_SUBSCRIPTIONS_PRIVATE' ? (
                    <p className="text-sm text-destructive">{publicYouTubePreviewError}</p>
                  ) : null}

                  {publicYouTubePreviewMutation.isPending ? (
                    <div className="space-y-2">
                      <Skeleton className="h-16 rounded-md" />
                      <Skeleton className="h-16 rounded-md" />
                    </div>
                  ) : null}

                  {publicYouTubePreviewErrorCode === 'PUBLIC_SUBSCRIPTIONS_PRIVATE' ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">{publicYouTubePreviewError}</p>
                      <PublicYouTubePrivacyGuide intro="To import from this account, we first need you to make your subscriptions public." />
                    </div>
                  ) : null}

                  {publicYouTubePreview ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-border/50 bg-background/80 p-3">
                        <p className="text-sm font-medium text-foreground">
                          We found {publicYouTubePreview.creators_total} subscription{publicYouTubePreview.creators_total === 1 ? '' : 's'} to review.
                        </p>
                        {publicYouTubePreview.truncated ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Showing the first {publicYouTubePreview.creators_total} subscriptions (preview cap reached).
                          </p>
                        ) : null}
                        {publicYouTubeImportSummary ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Imported {publicYouTubeImportSummary.imported_count}, reactivated {publicYouTubeImportSummary.reactivated_count}, already active {publicYouTubeImportSummary.already_active_count}, failed {publicYouTubeImportSummary.failed_count}.
                          </p>
                        ) : null}
                      </div>

                      {publicYouTubePreview.creators.length === 0 ? (
                        <div className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            We found the account, but there are no public subscriptions available to import.
                          </p>
                          <PublicYouTubePrivacyGuide intro="If you expected subscriptions here, they may still be private. To import from this account, we first need you to make your subscriptions public." />
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handlePublicYouTubePreviewSelectAll}
                              disabled={publicYouTubeImportMutation.isPending}
                            >
                              Select importable
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={handlePublicYouTubePreviewClearSelection}
                              disabled={publicYouTubeImportMutation.isPending}
                            >
                              Clear
                            </Button>
                          </div>

                          <Input
                            value={publicYouTubePreviewFilterQuery}
                            onChange={(event) => setPublicYouTubePreviewFilterQuery(event.target.value)}
                            placeholder="Filter creators..."
                            className="h-9"
                          />

                          {filteredPublicYouTubePreviewCreators.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No creators match "{publicYouTubePreviewFilterQuery.trim()}".
                            </p>
                          ) : (
                            <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                              {filteredPublicYouTubePreviewCreators.map((creator) => {
                                const checked = Boolean(publicYouTubePreviewSelected[creator.channel_id]);
                                return (
                                  <div key={creator.channel_id} className="rounded-md border border-border/40 p-3">
                                    <div className="flex items-start gap-3">
                                      <Checkbox
                                        checked={checked}
                                        disabled={creator.already_active || publicYouTubeImportMutation.isPending}
                                        onCheckedChange={(value) => togglePublicYouTubePreviewCreator(creator.channel_id, value === true)}
                                        className="mt-0.5"
                                      />
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <p className="text-sm font-medium line-clamp-1">
                                          {creator.channel_title || creator.channel_id}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                          {creator.already_active ? (
                                            <Badge variant="secondary" className="h-5 px-2 text-[10px]">Already active</Badge>
                                          ) : null}
                                          {!creator.already_active && creator.already_exists_inactive ? (
                                            <Badge variant="outline" className="h-5 px-2 text-[10px]">Will reactivate</Badge>
                                          ) : null}
                                        </div>
                                      </div>
                                      {creator.thumbnail_url ? (
                                        <img
                                          src={creator.thumbnail_url}
                                          alt={creator.channel_title || creator.channel_id}
                                          className="h-10 w-10 rounded-md border border-border/40 object-cover shrink-0"
                                        />
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-2">
                            <p className="text-xs text-muted-foreground">
                              {selectedPublicYouTubeCreators.length} selected
                            </p>
                            <Button
                              size="sm"
                              onClick={handleImportSelectedPublicYouTubeCreators}
                              disabled={selectedPublicYouTubeCreators.length === 0 || publicYouTubeImportMutation.isPending}
                            >
                              {publicYouTubeImportMutation.isPending ? 'Importing...' : 'Import selected'}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </CollapsibleContent>
              </div>
            </Collapsible>
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

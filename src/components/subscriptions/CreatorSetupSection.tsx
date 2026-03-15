import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { CreatorSetupController } from '@/hooks/useCreatorSetupController';

function PublicYouTubePrivacyGuide(props: { intro: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-border/50 bg-background/80 p-4">
      <p className="text-sm text-muted-foreground">{props.intro}</p>
      <div className="space-y-3 text-sm text-muted-foreground">
        <div className="flex gap-3">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">1</span>
          <p>Visit <a href="https://www.youtube.com/account_privacy" target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">youtube.com/account_privacy</a>.</p>
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

type CreatorSetupSectionProps = {
  controller: CreatorSetupController;
  showBackendDisabledHint?: boolean;
};

export function CreatorSetupSection({
  controller,
  showBackendDisabledHint = false,
}: CreatorSetupSectionProps) {
  return (
    <div className="space-y-4">
      {showBackendDisabledHint && !controller.subscriptionsEnabled ? (
        <p className="text-xs text-muted-foreground">
          Creator setup requires `VITE_AGENTIC_BACKEND_URL`.
        </p>
      ) : null}

      <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">Add creators manually</p>
            <p className="text-sm text-muted-foreground">
              Find the creator you already have in mind and subscribe in one click.
            </p>
          </div>
          <Button
            onClick={() => controller.handleAddSubscriptionDialogChange(true)}
            disabled={!controller.subscriptionsEnabled}
          >
            Add creators manually
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Import From YouTube</p>
          <p className="text-xs text-muted-foreground">
            Import your YouTube subscriptions by handle.
          </p>
        </div>

        <div className="mt-4 space-y-4">
          <form onSubmit={controller.handlePublicYouTubePreviewSubmit} className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="space-y-2 md:flex-1">
                <p className="text-sm font-medium text-foreground">Fill in your handle</p>
                <Input
                  value={controller.publicYouTubeChannelInput}
                  onChange={(event) => controller.setPublicYouTubeChannelInput(event.target.value)}
                  placeholder="Your YouTube Name"
                />
              </div>
              <Button type="submit" size="sm" disabled={!controller.subscriptionsEnabled || controller.publicYouTubePreviewMutation.isPending}>
                {controller.publicYouTubePreviewMutation.isPending ? 'Finding...' : 'Find subscriptions'}
              </Button>
          </form>

          {controller.publicYouTubePreviewError && controller.publicYouTubePreviewErrorCode !== 'PUBLIC_SUBSCRIPTIONS_PRIVATE' ? (
            <p className="text-sm text-destructive">{controller.publicYouTubePreviewError}</p>
          ) : null}

          {controller.publicYouTubePreviewMutation.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
            </div>
          ) : null}

          {controller.publicYouTubePreviewErrorCode === 'PUBLIC_SUBSCRIPTIONS_PRIVATE' ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">{controller.publicYouTubePreviewError}</p>
              <PublicYouTubePrivacyGuide intro="To import from this account, we first need you to make your subscriptions public." />
            </div>
          ) : null}

          {controller.publicYouTubePreview ? (
            <div className="space-y-3">
                <div className="rounded-xl border border-border/50 bg-background/80 p-3">
                  <p className="text-sm font-medium text-foreground">
                    We found {controller.publicYouTubePreview.creators_total} subscription{controller.publicYouTubePreview.creators_total === 1 ? '' : 's'} to review.
                  </p>
                  {controller.publicYouTubeImportSummary ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Imported {controller.publicYouTubeImportSummary.imported_count}, reactivated {controller.publicYouTubeImportSummary.reactivated_count}, already active {controller.publicYouTubeImportSummary.already_active_count}, failed {controller.publicYouTubeImportSummary.failed_count}.
                    </p>
                  ) : null}
                </div>

                {controller.publicYouTubePreview.creators.length === 0 ? (
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
                        onClick={controller.handlePublicYouTubePreviewSelectAll}
                        disabled={controller.publicYouTubeImportMutation.isPending}
                      >
                        Select importable
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={controller.handlePublicYouTubePreviewClearSelection}
                        disabled={controller.publicYouTubeImportMutation.isPending}
                      >
                        Clear
                      </Button>
                    </div>

                    <Input
                      value={controller.publicYouTubePreviewFilterQuery}
                      onChange={(event) => controller.setPublicYouTubePreviewFilterQuery(event.target.value)}
                      placeholder="Filter creators..."
                      className="h-9"
                    />

                    {controller.filteredPublicYouTubePreviewCreators.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No creators match "{controller.publicYouTubePreviewFilterQuery.trim()}".
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                        {controller.filteredPublicYouTubePreviewCreators.map((creator) => {
                          const checked = Boolean(controller.publicYouTubePreviewSelected[creator.channel_id]);
                          return (
                            <div key={creator.channel_id} className="rounded-md border border-border/40 p-3">
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={checked}
                                  disabled={creator.already_active || controller.publicYouTubeImportMutation.isPending}
                                  onCheckedChange={(value) => controller.togglePublicYouTubePreviewCreator(creator.channel_id, value === true)}
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
                        {controller.selectedPublicYouTubeCreators.length} selected
                      </p>
                      <div className="flex items-center gap-2">
                        {controller.publicYouTubePreview.has_more ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={controller.handlePublicYouTubePreviewLoadMore}
                            disabled={controller.publicYouTubePreviewLoadingMore || controller.publicYouTubeImportMutation.isPending}
                          >
                            {controller.publicYouTubePreviewLoadingMore ? 'Loading...' : 'Load more'}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          onClick={controller.handleImportSelectedPublicYouTubeCreators}
                          disabled={controller.selectedPublicYouTubeCreators.length === 0 || controller.publicYouTubeImportMutation.isPending}
                        >
                          {controller.publicYouTubeImportMutation.isPending ? 'Importing...' : 'Import selected'}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={controller.isAddSubscriptionOpen} onOpenChange={controller.handleAddSubscriptionDialogChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Subscription</DialogTitle>
            <DialogDescription>
              Add a creator by channel link, handle, channel id, or creator name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <form onSubmit={controller.handleChannelSearchSubmit} className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={controller.channelSearchQuery}
                onChange={(event) => controller.setChannelSearchQuery(event.target.value)}
                placeholder="Paste a channel link, handle, channel id, or creator name"
              />
              <Button type="submit" size="sm" disabled={controller.channelSearchMutation.isPending || !controller.subscriptionsEnabled}>
                {controller.channelSearchMutation.isPending ? 'Finding...' : 'Find creator'}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              Nothing changes until you click Subscribe.
            </p>
            {controller.channelSearchError ? <p className="text-sm text-destructive">{controller.channelSearchError}</p> : null}

            {controller.channelSearchResults.length === 0 && controller.channelSearchSubmittedQuery ? (
              <p className="text-sm text-muted-foreground">We couldn&apos;t find that creator.</p>
            ) : null}

            {controller.channelSearchResults.length > 0 ? (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {controller.channelSearchResults.map((result) => {
                  const isSubscribing = controller.isChannelSubscribing(result.channel_id);
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
                          onClick={() => controller.handleSubscribeFromSearch(result)}
                          disabled={!controller.subscriptionsEnabled || isSubscribing || controller.createMutation.isPending}
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
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

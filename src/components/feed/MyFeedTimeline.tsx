import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { resolvePrimaryChannelFromTags } from '@/lib/channelMapping';
import { buildBlueprintPreviewText, buildFeedSummary } from '@/lib/feedPreview';
import { getMyFeedStateLabel, type MyFeedItemState } from '@/lib/myFeedState';
import { publishCandidate, rejectCandidate, submitCandidateAndEvaluate } from '@/lib/myFeedApi';
import { ForYouLockedSourceCard } from '@/components/wall/ForYouLockedSourceCard';
import {
  ApiRequestError,
  acceptMyFeedPendingItem,
  deactivateSourceSubscriptionByChannelId,
  skipMyFeedPendingItem,
} from '@/lib/subscriptionsApi';
import { unlockSourcePageVideos } from '@/lib/sourcePagesApi';
import { extractYouTubeVideoId } from '@/lib/sourceIdentity';
import { logMvpEvent } from '@/lib/logEvent';
import { formatRelativeShort } from '@/lib/timeFormat';
import { config } from '@/config/runtime';
import type { MyFeedItemView } from '@/hooks/useMyFeed';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { useSourceUnlockJobTracker } from '@/hooks/useSourceUnlockJobTracker';
import { UnlockActivityCard } from '@/components/shared/UnlockActivityCard';
import { resolveEffectiveBanner } from '@/lib/bannerResolver';
import { getLaunchErrorCopy } from '@/lib/launchErrorCopy';

const CHANNEL_OPTIONS = CHANNELS_CATALOG.filter((channel) => channel.status === 'active' && channel.isJoinEnabled);
const CHANNEL_NAME_BY_SLUG = new Map(CHANNELS_CATALOG.map((channel) => [channel.slug, channel.name]));

function getUnlockActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    if (error.errorCode) {
      return getLaunchErrorCopy({
        errorCode: error.errorCode,
        fallback: error.message || fallback,
      });
    }
    return error.message || fallback;
  }
  if (error instanceof Error && /source video id/i.test(error.message)) {
    return 'Could not resolve source video id for this item.';
  }
  return error instanceof Error ? error.message : fallback;
}

type MyFeedTimelineProps = {
  items: MyFeedItemView[] | undefined;
  isLoading: boolean;
  isOwnerView: boolean;
  profileUserId?: string;
  showUnlockActivityPanel?: boolean;
  emptyMessage?: string;
  emptyActionHref?: string;
  emptyActionLabel?: string;
};

export function MyFeedTimeline({
  items,
  isLoading,
  isOwnerView,
  profileUserId,
  showUnlockActivityPanel = true,
  emptyMessage = 'No content yet.',
  emptyActionHref,
  emptyActionLabel,
}: MyFeedTimelineProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const autoChannelPipelineEnabled = config.features.autoChannelPipelineV1;
  const [selectedChannels, setSelectedChannels] = useState<Record<string, string>>({});
  const [submissionDialogItemId, setSubmissionDialogItemId] = useState<string | null>(null);
  const [subscriptionDialogItemId, setSubscriptionDialogItemId] = useState<string | null>(null);
  const [unsubscribeDialogItemId, setUnsubscribeDialogItemId] = useState<string | null>(null);
  const [optimisticUnlockingItemIds, setOptimisticUnlockingItemIds] = useState<Record<string, boolean>>({});

  const canMutate = isOwnerView && !!user;

  const unlockTracker = useSourceUnlockJobTracker({
    userId: user?.id,
    enabled: canMutate,
    scope: 'source_item_unlock_generation',
    onTerminal: (job) => {
      invalidateFeedQueries();
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['source-page-videos'] }),
        queryClient.invalidateQueries({ queryKey: ['source-page-blueprints'] }),
        queryClient.invalidateQueries({ queryKey: ['my-feed-items', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['ai-credits'] }),
      ]);

      setOptimisticUnlockingItemIds({});

      if (job.status === 'succeeded') {
        toast({
          title: 'Unlock finished',
          description: `Inserted ${job.inserted_count}, skipped ${job.skipped_count}, failed ${Math.max(0, job.processed_count - job.inserted_count - job.skipped_count)}.`,
        });
        return;
      }

      toast({
        title: 'Unlock failed',
        description: job.error_message || 'Could not complete unlock generation.',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!canMutate) return;
    void unlockTracker.resume();
  }, [canMutate, unlockTracker.resume]);

  const invalidateFeedQueries = () => {
    if (user?.id) {
      queryClient.invalidateQueries({ queryKey: ['my-feed-items', user.id] });
      queryClient.invalidateQueries({ queryKey: ['source-subscriptions', user.id] });
    }
    if (profileUserId) {
      queryClient.invalidateQueries({ queryKey: ['profile-feed', profileUserId] });
    }
  };

  const defaultChannelForItem = (itemId: string, tags: string[]) => {
    const picked = selectedChannels[itemId];
    if (picked) return picked;
    return resolvePrimaryChannelFromTags(tags);
  };

  const getChannelDisplayName = (channelSlug: string | null | undefined) => {
    if (!channelSlug) return 'channel';
    return CHANNEL_NAME_BY_SLUG.get(channelSlug) || channelSlug;
  };

  const submitMutation = useMutation({
    mutationFn: async (input: {
      itemId: string;
      sourceItemId: string | null;
      blueprintId: string;
      title: string;
      llmReview: string | null;
      tags: string[];
      stepCount: number;
      channelSlug: string;
    }) => {
      if (!user || !canMutate) throw new Error('Sign in required.');
      const result = await submitCandidateAndEvaluate({
        userId: user.id,
        userFeedItemId: input.itemId,
        blueprintId: input.blueprintId,
        channelSlug: input.channelSlug,
        title: input.title,
        llmReview: input.llmReview,
        stepCount: input.stepCount,
        tagSlugs: input.tags,
      });

      await logMvpEvent({
        eventName: 'candidate_submitted',
        userId: user.id,
        blueprintId: input.blueprintId,
        metadata: {
          user_feed_item_id: input.itemId,
          source_item_id: input.sourceItemId,
          candidate_id: result.candidateId,
          channel_slug: input.channelSlug,
          status: result.status,
          reason_code: result.reasonCode,
        },
      });

      await logMvpEvent({
        eventName: 'candidate_gate_result',
        userId: user.id,
        blueprintId: input.blueprintId,
        metadata: {
          user_feed_item_id: input.itemId,
          source_item_id: input.sourceItemId,
          candidate_id: result.candidateId,
          channel_slug: input.channelSlug,
          aggregate: result.status === 'passed' ? 'pass' : result.status === 'pending_manual_review' ? 'warn' : 'block',
          reason_code: result.reasonCode,
        },
      });

      if (result.status === 'pending_manual_review') {
        await logMvpEvent({
          eventName: 'candidate_manual_review_pending',
          userId: user.id,
          blueprintId: input.blueprintId,
          metadata: {
            user_feed_item_id: input.itemId,
            source_item_id: input.sourceItemId,
            candidate_id: result.candidateId,
            channel_slug: input.channelSlug,
            reason_code: result.reasonCode,
          },
        });
      }

      return result;
    },
    onSuccess: (result) => {
      invalidateFeedQueries();
      setSubmissionDialogItemId(null);
      if (result.status === 'passed') {
        toast({ title: 'Candidate passed gates', description: 'You can publish this to channel now.' });
      } else if (result.status === 'pending_manual_review') {
        toast({ title: 'Needs review', description: 'Candidate needs manual review before publish.' });
      } else {
        toast({ title: 'Rejected for channel', description: `Reason: ${result.reasonCode}` });
      }
    },
    onError: (error) => {
      toast({ title: 'Submit failed', description: error instanceof Error ? error.message : 'Could not submit.', variant: 'destructive' });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (input: {
      itemId: string;
      sourceItemId: string | null;
      candidateId: string;
      blueprintId: string;
      channelSlug: string;
    }) => {
      if (!user || !canMutate) throw new Error('Sign in required.');
      await publishCandidate({
        userId: user.id,
        candidateId: input.candidateId,
        userFeedItemId: input.itemId,
        blueprintId: input.blueprintId,
        channelSlug: input.channelSlug,
      });
      await logMvpEvent({
        eventName: 'channel_publish_succeeded',
        userId: user.id,
        blueprintId: input.blueprintId,
        metadata: {
          user_feed_item_id: input.itemId,
          source_item_id: input.sourceItemId,
          candidate_id: input.candidateId,
          channel_slug: input.channelSlug,
          reason_code: 'ALL_GATES_PASS',
        },
      });
    },
    onSuccess: () => {
      invalidateFeedQueries();
      queryClient.invalidateQueries({ queryKey: ['wall-blueprints'] });
      queryClient.invalidateQueries({ queryKey: ['channel-feed-base'] });
      queryClient.invalidateQueries({ queryKey: ['channel-feed-comments'] });
      setSubmissionDialogItemId(null);
      toast({ title: 'Published', description: 'Item is now live in channel feed.' });
    },
    onError: (error) => {
      toast({ title: 'Publish failed', description: error instanceof Error ? error.message : 'Could not publish.', variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (input: {
      itemId: string;
      sourceItemId: string | null;
      candidateId: string;
      reasonCode: string;
      blueprintId: string;
      channelSlug: string;
    }) => {
      if (!user || !canMutate) throw new Error('Sign in required.');
      await rejectCandidate({
        userId: user.id,
        candidateId: input.candidateId,
        userFeedItemId: input.itemId,
        reasonCode: input.reasonCode,
      });
      await logMvpEvent({
        eventName: 'channel_publish_rejected',
        userId: user.id,
        blueprintId: input.blueprintId,
        metadata: {
          user_feed_item_id: input.itemId,
          source_item_id: input.sourceItemId,
          candidate_id: input.candidateId,
          channel_slug: input.channelSlug,
          reason_code: input.reasonCode,
        },
      });
    },
    onSuccess: () => {
      invalidateFeedQueries();
      setSubmissionDialogItemId(null);
      toast({ title: 'Rejected', description: 'Kept in My Feed as personal content.' });
    },
    onError: (error) => {
      toast({ title: 'Reject failed', description: error instanceof Error ? error.message : 'Could not reject.', variant: 'destructive' });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!canMutate) throw new Error('Owner only action.');
      return acceptMyFeedPendingItem(itemId);
    },
    onSuccess: () => {
      invalidateFeedQueries();
      toast({ title: 'Accepted', description: 'Blueprint generated and added to your feed.' });
    },
    onError: (error) => {
      toast({ title: 'Accept failed', description: error instanceof Error ? error.message : 'Could not accept item.', variant: 'destructive' });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!canMutate) throw new Error('Owner only action.');
      return skipMyFeedPendingItem(itemId);
    },
    onSuccess: () => {
      invalidateFeedQueries();
      toast({ title: 'Skipped', description: 'Item remains skipped in My Feed.' });
    },
    onError: (error) => {
      toast({ title: 'Skip failed', description: error instanceof Error ? error.message : 'Could not skip item.', variant: 'destructive' });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (channelId: string) => {
      if (!canMutate) throw new Error('Owner only action.');
      return deactivateSourceSubscriptionByChannelId(channelId);
    },
    onSuccess: () => {
      invalidateFeedQueries();
      setSubscriptionDialogItemId(null);
      setUnsubscribeDialogItemId(null);
      toast({ title: 'Unsubscribed', description: 'Subscription removed from your feed.' });
    },
    onError: (error) => {
      toast({
        title: 'Unsubscribe failed',
        description: error instanceof Error ? error.message : 'Could not unsubscribe.',
        variant: 'destructive',
      });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async (item: MyFeedItemView) => {
      if (!canMutate || !user) throw new Error('Owner only action.');
      const source = item.source;
      if (!source?.sourceChannelId) throw new Error('Source channel is missing.');
      const videoId = extractYouTubeVideoId(source.sourceUrl || '');
      if (!videoId) throw new Error('Could not resolve source video id.');
      const normalizedVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      return unlockSourcePageVideos({
        platform: 'youtube',
        externalId: source.sourceChannelId,
        items: [
          {
            video_id: videoId,
            video_url: normalizedVideoUrl,
            title: source.title || 'Video',
          },
        ],
      });
    },
    onSuccess: (result, item) => {
      invalidateFeedQueries();
      queryClient.invalidateQueries({ queryKey: ['source-page-videos'] });
      queryClient.invalidateQueries({ queryKey: ['source-page-blueprints'] });
      if (result.job_id) {
        unlockTracker.start(result.job_id);
        toast({
          title: 'Unlock queued',
          description: `Queued ${result.queued_count}, ready ${result.ready_count}, in progress ${result.in_progress_count}. This card will update automatically.`,
        });
        return;
      }
      if (item.id) {
        setOptimisticUnlockingItemIds((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }
      toast({
        title: 'Unlock status updated',
        description: result.ready_count > 0
          ? `Ready ${result.ready_count}, in progress ${result.in_progress_count}.`
          : `No new unlock started. Ready ${result.ready_count}, in progress ${result.in_progress_count}.`,
      });
    },
    onError: (error, item) => {
      toast({
        title: 'Unlock failed',
        description: getUnlockActionErrorMessage(error, 'Could not start unlock.'),
        variant: 'destructive',
      });
      if (item?.id) {
        setOptimisticUnlockingItemIds((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }
    },
    onMutate: (item) => {
      setOptimisticUnlockingItemIds((prev) => ({ ...prev, [item.id]: true }));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
    },
  });

  const hasItems = (items || []).length > 0;
  const showUnlockActivity = showUnlockActivityPanel && canMutate && unlockTracker.activity.visible;

  const submissionDialogItem = useMemo(
    () => (items || []).find((item) => item.id === submissionDialogItemId) || null,
    [items, submissionDialogItemId],
  );
  const unsubscribeDialogItem = useMemo(
    () => (items || []).find((item) => item.id === unsubscribeDialogItemId) || null,
    [items, unsubscribeDialogItemId],
  );
  const subscriptionDialogItem = useMemo(
    () => (items || []).find((item) => item.id === subscriptionDialogItemId) || null,
    [items, subscriptionDialogItemId],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!hasItems) {
    return (
      <div className="space-y-3">
        {showUnlockActivity ? (
          <UnlockActivityCard
            title="Unlock activity"
            activity={unlockTracker.activity}
            onClear={!unlockTracker.activity.isActive ? unlockTracker.clear : undefined}
          />
        ) : null}
        <Card className="border-border/40">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            {emptyActionHref && emptyActionLabel ? (
              <Button asChild size="sm" variant="outline">
                <Link to={emptyActionHref}>{emptyActionLabel}</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showUnlockActivity ? (
        <UnlockActivityCard
          title="Unlock activity"
          activity={unlockTracker.activity}
          onClear={!unlockTracker.activity.isActive ? unlockTracker.clear : undefined}
        />
      ) : null}
      {(items || []).map((item) => {
        const blueprint = item.blueprint;
        const source = item.source;
        const isSubscriptionNotice = item.state === 'subscription_notice';
        const effectiveBlueprintBannerUrl = resolveEffectiveBanner({
          bannerUrl: blueprint?.bannerUrl || null,
          sourceThumbnailUrl: source?.thumbnailUrl || null,
        });
        const hasBlueprintBanner = !isSubscriptionNotice && !!effectiveBlueprintBannerUrl;
        const title = isSubscriptionNotice
          ? (source?.title || 'You are now subscribed')
          : (blueprint?.title || source?.title || 'Pending source import');
        const subtitle = isSubscriptionNotice
          ? 'New uploads from this channel will appear automatically.'
          : (source?.sourceChannelTitle || source?.title || 'Imported source');
        const tags = blueprint?.tags || [];
        const canAccept = item.state === 'my_feed_pending_accept' || item.state === 'my_feed_skipped';
        const isUnlockable = item.state === 'my_feed_unlockable' && !blueprint;
        const isUnlocking = Boolean(item.source?.unlockInProgress) || Boolean(optimisticUnlockingItemIds[item.id]);
        const preview = buildFeedSummary({
          sectionsJson: blueprint?.sectionsJson || null,
          primary: blueprint?.llmReview || null,
          secondary: (blueprint?.mixNotes || buildBlueprintPreviewText({ steps: blueprint?.steps })) || null,
          fallback: source?.title || 'Open blueprint to view full details.',
          maxChars: 220,
        });
        const createdLabel = formatRelativeShort(item.createdAt);

        if (!isSubscriptionNotice && isUnlockable) {
          return (
            <ForYouLockedSourceCard
              key={item.id}
              title={title}
              sourceChannelTitle={source?.sourceChannelTitle || null}
              sourceChannelAvatarUrl={source?.thumbnailUrl || null}
              createdAt={item.createdAt}
              unlockCost={Number(source?.unlockCost || 0)}
              isUnlocking={isUnlocking}
              canUnlock={canMutate}
              onUnlock={() => unlockMutation.mutate(item)}
            />
          );
        }

        return (
          <Card
            key={item.id}
            className={`border-border/50 ${isSubscriptionNotice || hasBlueprintBanner ? 'relative overflow-hidden' : ''} ${isSubscriptionNotice ? 'cursor-pointer transition-colors hover:border-border' : ''} ${blueprint ? 'cursor-pointer transition-colors hover:border-border' : ''}`}
            onClick={
              isSubscriptionNotice
                ? () => setSubscriptionDialogItemId(item.id)
                : blueprint
                  ? () => navigate(`/blueprint/${blueprint.id}`)
                  : undefined
            }
            onKeyDown={
              (isSubscriptionNotice || blueprint)
                ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (isSubscriptionNotice) {
                      setSubscriptionDialogItemId(item.id);
                      return;
                    }
                    if (blueprint) {
                      navigate(`/blueprint/${blueprint.id}`);
                    }
                  }
                }
                : undefined
            }
            role={isSubscriptionNotice || blueprint ? 'button' : undefined}
            tabIndex={isSubscriptionNotice || blueprint ? 0 : undefined}
          >
            {isSubscriptionNotice && !!source?.channelBannerUrl && (
              <>
                <img
                  src={source.channelBannerUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full scale-105 object-cover opacity-[0.10] blur-sm"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-background/[0.22] via-background/[0.45] to-background/[0.72]" />
              </>
            )}
            {hasBlueprintBanner && (
              <>
                <img
                  src={effectiveBlueprintBannerUrl || ''}
                  alt=""
                  className="absolute inset-0 h-full w-full scale-105 object-cover opacity-[0.10] blur-sm"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-background/[0.22] via-background/[0.45] to-background/[0.72]" />
              </>
            )}
            <CardContent className={`p-4 space-y-3 ${isSubscriptionNotice || hasBlueprintBanner ? 'relative' : ''}`}>
              {isSubscriptionNotice ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3">
                      {source?.thumbnailUrl ? (
                        <img
                          src={source.thumbnailUrl}
                          alt={source.sourceChannelTitle || 'Channel avatar'}
                          className="h-10 w-10 rounded-full border border-border/40 object-cover shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full border border-border/40 bg-muted shrink-0" />
                      )}
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium leading-tight">{title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{subtitle}</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{createdLabel}</span>
                  </div>
                </>
              ) : !blueprint ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium leading-tight">{title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{subtitle}</p>
                    </div>
                    <Badge variant="secondary">{getMyFeedStateLabel(item.state as MyFeedItemState)}</Badge>
                  </div>
                  {!isSubscriptionNotice && item.lastDecisionCode && (
                    <p className="text-xs text-muted-foreground">Reason: {item.lastDecisionCode}</p>
                  )}
                  {canMutate ? (
                    <div className="flex flex-wrap gap-2">
                      {canAccept ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => acceptMutation.mutate(item.id)}
                            disabled={acceptMutation.isPending || !canAccept}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => skipMutation.mutate(item.id)}
                            disabled={skipMutation.isPending || item.state !== 'my_feed_pending_accept'}
                          >
                            Skip
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold tracking-wide text-foreground/75">{subtitle}</p>
                      <span className="text-[11px] text-muted-foreground">{createdLabel}</span>
                    </div>
                    <p className="text-base font-semibold leading-tight">{title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-3">{preview}</p>
                    {tags.length > 0 && (
                      <OneRowTagChips
                        className="flex flex-nowrap gap-1.5 overflow-hidden"
                        items={tags.map((tag) => ({
                          key: tag,
                          label: tag,
                          variant: 'outline',
                          className:
                            'text-xs transition-colors border bg-muted/40 text-muted-foreground border-border/60',
                        }))}
                      />
                    )}
                  </div>
                </>
              )}

              {!autoChannelPipelineEnabled && !isSubscriptionNotice && blueprint && item.lastDecisionCode && item.state !== 'channel_published' && (
                <p className="text-xs text-muted-foreground">Reason: {item.lastDecisionCode}</p>
              )}

              {!isSubscriptionNotice && !isUnlockable && (
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>
                    {item.state === 'channel_published' ? (
                      `Posted to ${getChannelDisplayName(item.candidate?.channelSlug || null)}`
                    ) : item.state === 'my_feed_unlockable' ? (
                      isUnlocking ? 'Unlocking...' : 'Unlock available'
                    ) : autoChannelPipelineEnabled || !canMutate ? (
                      item.state === 'my_feed_generating' || item.state === 'candidate_submitted'
                        ? 'Publishing...'
                        : 'In My Feed'
                    ) : (
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSubmissionDialogItemId(item.id);
                        }}
                      >
                        {item.state === 'channel_rejected' ? 'In My Feed' : 'Post to Channel'}
                      </button>
                    )}
                  </span>
                  {item.state === 'channel_published' ? (
                    <Badge variant="secondary">Blueprint</Badge>
                  ) : item.state === 'my_feed_published' || (autoChannelPipelineEnabled && item.state === 'channel_rejected') ? (
                    <Badge variant="secondary">Blueprint</Badge>
                  ) : (
                    <span>{getMyFeedStateLabel(item.state as MyFeedItemState)}</span>
                  )}
                </div>
              )}

              {isSubscriptionNotice && (
                <div className="flex justify-end">
                  <Badge variant="secondary">Subscription</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog
        open={!!subscriptionDialogItem}
        onOpenChange={(open) => {
          if (!open) setSubscriptionDialogItemId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Subscription details</DialogTitle>
            <DialogDescription>
              Manage this channel subscription from one place.
            </DialogDescription>
          </DialogHeader>
          {subscriptionDialogItem?.source ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-tight">
                  {subscriptionDialogItem.source.sourceChannelTitle || subscriptionDialogItem.source.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  Status: {getMyFeedStateLabel(subscriptionDialogItem.state as MyFeedItemState)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Added: {formatRelativeShort(subscriptionDialogItem.createdAt)}
                </p>
              </div>
              {canMutate ? (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setUnsubscribeDialogItemId(subscriptionDialogItem.id)}
                    disabled={unsubscribeMutation.isPending}
                  >
                    Unsubscribe
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Subscription details are unavailable.</p>
          )}
        </DialogContent>
      </Dialog>

      {!autoChannelPipelineEnabled && canMutate && (
        <Dialog open={!!submissionDialogItem} onOpenChange={(open) => {
          if (!open) setSubmissionDialogItemId(null);
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Submit to Channel</DialogTitle>
              <DialogDescription>
                Choose a channel for this blueprint and submit it for channel review.
              </DialogDescription>
            </DialogHeader>
            {submissionDialogItem?.blueprint ? (
              <div className="space-y-3">
                <p className="text-sm font-medium leading-tight">{submissionDialogItem.blueprint.title}</p>
                <Select
                  value={defaultChannelForItem(submissionDialogItem.id, submissionDialogItem.blueprint.tags || [])}
                  onValueChange={(value) => setSelectedChannels((prev) => ({ ...prev, [submissionDialogItem.id]: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_OPTIONS.map((channel) => (
                      <SelectItem key={channel.slug} value={channel.slug}>
                        {channel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!submissionDialogItem.candidate ? (
                  <Button
                    className="w-full"
                    onClick={() => {
                      const tags = submissionDialogItem.blueprint?.tags || [];
                      const selected = defaultChannelForItem(submissionDialogItem.id, tags);
                      const stepCount = Array.isArray(submissionDialogItem.blueprint?.steps)
                        ? submissionDialogItem.blueprint.steps.length
                        : 0;
                      submitMutation.mutate({
                        itemId: submissionDialogItem.id,
                        sourceItemId: submissionDialogItem.source?.id || null,
                        blueprintId: submissionDialogItem.blueprint.id,
                        title: submissionDialogItem.blueprint.title,
                        llmReview: submissionDialogItem.blueprint.llmReview,
                        tags,
                        stepCount,
                        channelSlug: selected,
                      });
                    }}
                    disabled={submitMutation.isPending}
                  >
                    Submit to Channel
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          const tags = submissionDialogItem.blueprint?.tags || [];
                          const selected = defaultChannelForItem(submissionDialogItem.id, tags);
                          const stepCount = Array.isArray(submissionDialogItem.blueprint?.steps)
                            ? submissionDialogItem.blueprint.steps.length
                            : 0;
                          submitMutation.mutate({
                            itemId: submissionDialogItem.id,
                            sourceItemId: submissionDialogItem.source?.id || null,
                            blueprintId: submissionDialogItem.blueprint.id,
                            title: submissionDialogItem.blueprint.title,
                            llmReview: submissionDialogItem.blueprint.llmReview,
                            tags,
                            stepCount,
                            channelSlug: selected,
                          });
                        }}
                        disabled={submitMutation.isPending}
                      >
                        Re-evaluate
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() =>
                          publishMutation.mutate({
                            itemId: submissionDialogItem.id,
                            sourceItemId: submissionDialogItem.source?.id || null,
                            candidateId: submissionDialogItem.candidate!.id,
                            blueprintId: submissionDialogItem.blueprint!.id,
                            channelSlug: submissionDialogItem.candidate?.channelSlug || defaultChannelForItem(submissionDialogItem.id, submissionDialogItem.blueprint?.tags || []),
                          })
                        }
                        disabled={publishMutation.isPending || !(submissionDialogItem.candidate?.status === 'passed' || submissionDialogItem.state === 'candidate_pending_manual_review')}
                      >
                        Publish
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full"
                      onClick={() =>
                        rejectMutation.mutate({
                          itemId: submissionDialogItem.id,
                          sourceItemId: submissionDialogItem.source?.id || null,
                          candidateId: submissionDialogItem.candidate!.id,
                          reasonCode: 'MANUAL_REJECT',
                          blueprintId: submissionDialogItem.blueprint!.id,
                          channelSlug: submissionDialogItem.candidate?.channelSlug || defaultChannelForItem(submissionDialogItem.id, submissionDialogItem.blueprint?.tags || []),
                        })
                      }
                      disabled={rejectMutation.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No blueprint available for submission.</p>
            )}
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog
        open={!!unsubscribeDialogItem}
        onOpenChange={(open) => {
          if (!open) setUnsubscribeDialogItemId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsubscribe from this channel?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop new uploads from appearing and remove this subscription notice from My Feed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unsubscribeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                unsubscribeMutation.isPending
                || !unsubscribeDialogItem?.source?.sourceChannelId
                || !canMutate
              }
              onClick={(event) => {
                event.preventDefault();
                const channelId = unsubscribeDialogItem?.source?.sourceChannelId;
                if (!channelId) return;
                unsubscribeMutation.mutate(channelId);
              }}
            >
              {unsubscribeMutation.isPending ? 'Unsubscribing...' : 'Unsubscribe'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

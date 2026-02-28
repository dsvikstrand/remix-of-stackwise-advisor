type DbClient = any;

type SyncSubscriptionResult = {
  processed: number;
  inserted: number;
  skipped: number;
  newestVideoId: string | null;
  newestPublishedAt: string | null;
  channelTitle: string | null;
};

type SubscriptionSyncRow = {
  id: string;
  user_id: string;
  mode: string;
  source_channel_id: string;
  source_page_id?: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
};

type SubscriptionSyncOptions = {
  trigger: 'user_sync' | 'service_cron' | 'subscription_create' | 'debug_simulation' | 'youtube_import';
};

export type SourceSubscriptionSyncDeps = {
  fetchYouTubeFeed: (channelId: string, maxResults: number) => Promise<{
    channelTitle: string | null;
    videos: Array<{
      videoId: string;
      url: string;
      title: string;
      publishedAt: string | null;
    }>;
  }>;
  isNewerThanCheckpoint: (
    video: { videoId: string; publishedAt: string | null },
    lastSeenPublishedAt: string | null,
    lastSeenVideoId: string | null,
  ) => boolean;
  ingestionMaxPerSubscription: number;
  youtubeDataApiKey: string;
  fetchYouTubeVideoStates: (input: {
    apiKey: string;
    videoIds: string[];
  }) => Promise<Map<string, { isUpcoming: boolean; scheduledStartAt: string | null }>>;
  upsertSourceItemFromVideo: (
    db: DbClient,
    input: {
      video: {
        videoId: string;
        url: string;
        title: string;
        publishedAt: string | null;
      };
      channelId: string;
      channelTitle: string | null;
      sourcePageId: string | null;
    },
  ) => Promise<{
    id: string;
    source_page_id: string | null;
    source_channel_id: string;
    source_channel_title: string | null;
  }>;
  getExistingFeedItem: (db: DbClient, userId: string, sourceItemId: string) => Promise<{ id: string } | null>;
  ensureSourceItemUnlock: (
    db: DbClient,
    input: {
      sourceItemId: string;
      sourcePageId: string | null;
      estimatedCost: number;
    },
  ) => Promise<{ status: string }>;
  countActiveSubscribersForSourcePage: (db: DbClient, sourcePageId: string | null) => Promise<number>;
  computeUnlockCost: (activeSubscriberCount: number) => number;
  attemptAutoUnlockForSourceItem: (input: {
    sourceItemId: string;
    sourcePageId: string | null;
    sourceChannelId: string;
    sourceChannelTitle: string | null;
    video: {
      videoId: string;
      url: string;
      title: string;
      publishedAt: string | null;
    };
    unlock: { status: string };
    estimatedUnlockCost: number;
    preferredPayerUserId: string;
    trigger: 'user_sync' | 'service_cron' | 'subscription_create' | 'debug_simulation' | 'youtube_import';
  }) => Promise<{
    queued: boolean;
    reason: string;
    payer_user_id?: string | null;
    job_id?: string | null;
    trace_id?: string | null;
  }>;
  getServiceSupabaseClient: () => DbClient | null;
  enqueueSourceAutoUnlockRetryJob: (
    db: DbClient,
    input: {
      source_item_id: string;
      source_page_id: string | null;
      source_channel_id: string;
      source_channel_title: string | null;
      video_id: string;
      video_url: string;
      title: string;
      trigger: 'user_sync' | 'service_cron' | 'subscription_create' | 'debug_simulation' | 'youtube_import';
      preferred_payer_user_id: string;
    },
  ) => Promise<{ enqueued: boolean; job_id: string | null; next_run_at: string | null }>;
  getSourceItemUnlockBySourceItemId: (db: DbClient, sourceItemId: string) => Promise<unknown>;
  getTranscriptCooldownState: (unlock: unknown) => { active: boolean };
  isConfirmedNoTranscriptUnlock: (unlock: unknown) => boolean;
  suppressUnlockableFeedRowsForSourceItem: (
    db: DbClient,
    input: {
      sourceItemId: string;
      decisionCode: string;
      sourceChannelId: string;
      videoId: string;
    },
  ) => Promise<void>;
  insertFeedItem: (
    db: DbClient,
    input: {
      userId: string;
      sourceItemId: string;
      blueprintId: string | null;
      state: 'my_feed_unlockable' | 'my_feed_generated' | 'subscription_notice';
    },
  ) => Promise<{ id: string } | null>;
};

export function createSourceSubscriptionSyncService(deps: SourceSubscriptionSyncDeps) {
  async function syncSingleSubscription(
    db: DbClient,
    subscription: SubscriptionSyncRow,
    options: SubscriptionSyncOptions,
  ): Promise<SyncSubscriptionResult> {
    const feed = await deps.fetchYouTubeFeed(subscription.source_channel_id, 20);
    const newest = feed.videos[0] || null;

    if (!subscription.last_seen_published_at) {
      await db
        .from('user_source_subscriptions')
        .update({
          source_channel_title: feed.channelTitle,
          last_polled_at: new Date().toISOString(),
          last_seen_published_at: newest?.publishedAt || null,
          last_seen_video_id: newest?.videoId || null,
          last_sync_error: null,
        })
        .eq('id', subscription.id);

      return {
        processed: 0,
        inserted: 0,
        skipped: 0,
        newestVideoId: newest?.videoId || null,
        newestPublishedAt: newest?.publishedAt || null,
        channelTitle: feed.channelTitle,
      };
    }

    let candidates = [];
    candidates = feed.videos.filter((video) =>
      deps.isNewerThanCheckpoint(video, subscription.last_seen_published_at, subscription.last_seen_video_id),
    );

    const toProcess = candidates
      .slice(0, deps.ingestionMaxPerSubscription)
      .sort((a, b) => {
        const aTs = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const bTs = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return aTs - bTs;
      });

    let videoStatesById = new Map<string, { isUpcoming: boolean; scheduledStartAt: string | null }>();
    if (toProcess.length > 0 && deps.youtubeDataApiKey) {
      try {
        const fetchedStates = await deps.fetchYouTubeVideoStates({
          apiKey: deps.youtubeDataApiKey,
          videoIds: toProcess.map((video) => video.videoId),
        });
        videoStatesById = new Map(
          Array.from(fetchedStates.entries()).map(([videoId, state]) => [
            videoId,
            {
              isUpcoming: Boolean(state.isUpcoming),
              scheduledStartAt: state.scheduledStartAt || null,
            },
          ]),
        );
      } catch (videoStateError) {
        console.log('[subscription_video_state_lookup_failed]', JSON.stringify({
          subscription_id: subscription.id,
          source_channel_id: subscription.source_channel_id,
          trigger: options.trigger,
          error: videoStateError instanceof Error ? videoStateError.message : String(videoStateError),
        }));
      }
    }

    let processed = 0;
    let inserted = 0;
    let skipped = 0;
    let skippedUpcoming = 0;
    const activeSubscriberCount = await deps.countActiveSubscribersForSourcePage(db, subscription.source_page_id || null);
    const estimatedUnlockCost = deps.computeUnlockCost(activeSubscriberCount);

    for (const video of toProcess) {
      processed += 1;
      const videoState = videoStatesById.get(video.videoId);
      if (videoState?.isUpcoming) {
        skipped += 1;
        skippedUpcoming += 1;
        console.log('[subscription_skip_upcoming_premiere]', JSON.stringify({
          subscription_id: subscription.id,
          user_id: subscription.user_id,
          source_channel_id: subscription.source_channel_id,
          source_item_video_id: video.videoId,
          scheduled_start_at: videoState.scheduledStartAt,
          trigger: options.trigger,
        }));
        continue;
      }
      const source = await deps.upsertSourceItemFromVideo(db, {
        video,
        channelId: subscription.source_channel_id,
        channelTitle: feed.channelTitle,
        sourcePageId: subscription.source_page_id || null,
      });

      const existingFeedItem = await deps.getExistingFeedItem(db, subscription.user_id, source.id);
      if (existingFeedItem) {
        skipped += 1;
        continue;
      }

      const unlock = await deps.ensureSourceItemUnlock(db, {
        sourceItemId: source.id,
        sourcePageId: subscription.source_page_id || source.source_page_id || null,
        estimatedCost: estimatedUnlockCost,
      });

      let autoAttempt = null;
      let autoAttemptError: unknown = null;
      if (unlock.status === 'available') {
        try {
          autoAttempt = await deps.attemptAutoUnlockForSourceItem({
            sourceItemId: source.id,
            sourcePageId: subscription.source_page_id || source.source_page_id || null,
            sourceChannelId: subscription.source_channel_id || source.source_channel_id || '',
            sourceChannelTitle: feed.channelTitle || source.source_channel_title || null,
            video,
            unlock,
            estimatedUnlockCost,
            preferredPayerUserId: subscription.user_id,
            trigger: options.trigger,
          });

          if (
            !autoAttempt.queued
            && (
              autoAttempt.reason === 'NO_ELIGIBLE_USERS'
              || autoAttempt.reason === 'NO_ELIGIBLE_CREDITS'
              || autoAttempt.reason === 'TRANSCRIPT_COOLDOWN'
              || autoAttempt.reason === 'QUEUE_BACKPRESSURE'
              || autoAttempt.reason === 'QUEUE_DISABLED'
            )
          ) {
            try {
              const retryDb = deps.getServiceSupabaseClient();
              if (!retryDb) throw new Error('Service role client not configured');
              const retry = await deps.enqueueSourceAutoUnlockRetryJob(retryDb, {
                source_item_id: source.id,
                source_page_id: subscription.source_page_id || source.source_page_id || null,
                source_channel_id: subscription.source_channel_id || source.source_channel_id || '',
                source_channel_title: feed.channelTitle || source.source_channel_title || null,
                video_id: video.videoId,
                video_url: video.url,
                title: video.title,
                trigger: options.trigger,
                preferred_payer_user_id: subscription.user_id,
              });

              console.log('[subscription_auto_unlock_retry_scheduled]', JSON.stringify({
                subscription_id: subscription.id,
                user_id: subscription.user_id,
                source_item_id: source.id,
                source_channel_id: subscription.source_channel_id,
                reason: autoAttempt.reason,
                retry_enqueued: retry.enqueued,
                retry_job_id: retry.enqueued ? retry.job_id : null,
                retry_next_run_at: retry.enqueued ? retry.next_run_at : null,
                trigger: options.trigger,
              }));
            } catch (retryError) {
              console.log('[subscription_auto_unlock_retry_schedule_failed]', JSON.stringify({
                subscription_id: subscription.id,
                user_id: subscription.user_id,
                source_item_id: source.id,
                source_channel_id: subscription.source_channel_id,
                reason: autoAttempt.reason,
                trigger: options.trigger,
                error: retryError instanceof Error ? retryError.message : String(retryError),
              }));
            }
          } else if (!autoAttempt.queued) {
            console.log('[subscription_auto_unlock_not_queued]', JSON.stringify({
              subscription_id: subscription.id,
              user_id: subscription.user_id,
              source_item_id: source.id,
              source_channel_id: subscription.source_channel_id,
              reason: autoAttempt.reason,
              trigger: options.trigger,
            }));
          } else {
            console.log('[subscription_auto_unlock_queued]', JSON.stringify({
              subscription_id: subscription.id,
              user_id: subscription.user_id,
              source_item_id: source.id,
              source_channel_id: subscription.source_channel_id,
              payer_user_id: autoAttempt.payer_user_id,
              job_id: autoAttempt.job_id,
              trace_id: autoAttempt.trace_id,
              trigger: options.trigger,
            }));
          }
        } catch (autoUnlockError) {
          autoAttemptError = autoUnlockError;
          console.log('[subscription_auto_unlock_attempt_failed]', JSON.stringify({
            subscription_id: subscription.id,
            user_id: subscription.user_id,
            source_item_id: source.id,
            source_channel_id: subscription.source_channel_id,
            trigger: options.trigger,
            error: autoUnlockError instanceof Error ? autoUnlockError.message : String(autoUnlockError),
          }));
        }
      }

      const latestUnlock = await deps.getSourceItemUnlockBySourceItemId(db, source.id);
      const transcriptCooldown = deps.getTranscriptCooldownState(latestUnlock);
      const isTranscriptBlocked = transcriptCooldown.active || deps.isConfirmedNoTranscriptUnlock(latestUnlock);
      if (isTranscriptBlocked) {
        await deps.suppressUnlockableFeedRowsForSourceItem(db, {
          sourceItemId: source.id,
          decisionCode: deps.isConfirmedNoTranscriptUnlock(latestUnlock)
            ? 'NO_TRANSCRIPT_PERMANENT_AUTO'
            : 'TRANSCRIPT_UNAVAILABLE_AUTO',
          sourceChannelId: subscription.source_channel_id,
          videoId: video.videoId,
        });
      }

      const shouldInsertUnlockable =
        (() => {
          if (unlock.status !== 'available') return false;
          if (isTranscriptBlocked) return false;
          if (autoAttempt?.queued) return false;
          if (autoAttemptError) return true;
          if (!autoAttempt) return true;
          return (
            autoAttempt.reason === 'NO_ELIGIBLE_USERS'
            || autoAttempt.reason === 'NO_ELIGIBLE_CREDITS'
            || autoAttempt.reason === 'QUEUE_BACKPRESSURE'
            || autoAttempt.reason === 'QUEUE_DISABLED'
            || autoAttempt.reason === 'SERVICE_DB_MISSING'
            || autoAttempt.reason === 'INVALID_SOURCE'
          );
        })();

      if (shouldInsertUnlockable) {
        const insertedItem = await deps.insertFeedItem(db, {
          userId: subscription.user_id,
          sourceItemId: source.id,
          blueprintId: null,
          state: 'my_feed_unlockable',
        });
        if (insertedItem) inserted += 1;
        else skipped += 1;

        console.log('[subscription_auto_unlockable]', JSON.stringify({
          subscription_id: subscription.id,
          user_id: subscription.user_id,
          source_item_id: source.id,
          estimated_unlock_cost: estimatedUnlockCost,
          trigger: options.trigger,
        }));
      } else {
        skipped += 1;
      }
    }

    await db
      .from('user_source_subscriptions')
      .update({
        source_channel_title: feed.channelTitle,
        last_polled_at: new Date().toISOString(),
        last_seen_published_at: skippedUpcoming > 0
          ? subscription.last_seen_published_at
          : (newest?.publishedAt || subscription.last_seen_published_at),
        last_seen_video_id: skippedUpcoming > 0
          ? subscription.last_seen_video_id
          : (newest?.videoId || subscription.last_seen_video_id),
        last_sync_error: null,
      })
      .eq('id', subscription.id);

    return {
      processed,
      inserted,
      skipped,
      newestVideoId: newest?.videoId || null,
      newestPublishedAt: newest?.publishedAt || null,
      channelTitle: feed.channelTitle,
    };
  }

  return {
    syncSingleSubscription,
  };
}

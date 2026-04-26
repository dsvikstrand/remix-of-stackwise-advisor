import { classifyVideoDuration, toDurationSeconds } from './videoDurationPolicy';
import {
  toYouTubeFeedFetchError,
  type ResolvedYouTubeChannel,
} from './youtubeSubscriptions';

type DbClient = any;

export function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    const base = {
      message: error.message,
    } as Record<string, unknown>;
    const code = String((error as { code?: unknown } | null)?.code || '').trim();
    const details = String((error as { details?: unknown } | null)?.details || '').trim();
    const hint = String((error as { hint?: unknown } | null)?.hint || '').trim();
    const stack = String(error.stack || '').trim();
    if (code) base.code = code;
    if (details) base.details = details;
    if (hint) base.hint = hint;
    if (stack) base.stack = stack;
    return base;
  }

  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown; stack?: unknown } | null;
    const payload = {
      message: String(e?.message || error),
    } as Record<string, unknown>;
    const code = String(e?.code || '').trim();
    const details = String(e?.details || '').trim();
    const hint = String(e?.hint || '').trim();
    const stack = String(e?.stack || '').trim();
    if (code) payload.code = code;
    if (details) payload.details = details;
    if (hint) payload.hint = hint;
    if (stack) payload.stack = stack;
    return payload;
  }

  return {
    message: String(error),
  };
}

export function summarizeSubscriptionSyncError(error: unknown) {
  const payload = formatUnknownError(error);
  const summary = {
    message: normalizeNullableText(payload.message) || 'Unknown error',
  } as Record<string, string>;
  const code = normalizeNullableText(payload.code);
  const details = normalizeNullableText(payload.details);
  const hint = normalizeNullableText(payload.hint);
  if (code) summary.code = code;
  if (details) summary.details = details;
  if (hint) summary.hint = hint;
  return summary;
}

export function formatSubscriptionSyncErrorMessage(error: unknown) {
  const summary = summarizeSubscriptionSyncError(error);
  const parts = [summary.code ? `${summary.code}: ${summary.message}` : summary.message];
  if (summary.details && summary.details !== summary.message) {
    parts.push(`details=${summary.details}`);
  }
  if (
    summary.hint
    && summary.hint !== summary.message
    && summary.hint !== summary.details
  ) {
    parts.push(`hint=${summary.hint}`);
  }
  return parts.join(' | ').slice(0, 500);
}

type SyncSubscriptionResult = {
  processed: number;
  inserted: number;
  skipped: number;
  newestVideoId: string | null;
  newestPublishedAt: string | null;
  channelTitle: string | null;
  resultCode:
    | 'bootstrap'
    | 'new_items'
    | 'checked_no_insert'
    | 'noop'
    | 'feed_transient_error'
    | 'feed_not_found';
  errorMessage?: string | null;
  sourceChannelId?: string | null;
  sourceChannelTitle?: string | null;
};

type SubscriptionSyncRow = {
  id: string;
  user_id: string;
  mode: string;
  source_channel_id: string;
  source_channel_url?: string | null;
  source_channel_title?: string | null;
  source_page_id?: string | null;
  source_type?: string | null;
  auto_unlock_enabled?: boolean | null;
  last_polled_at?: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
  last_sync_error?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SubscriptionSyncOptions = {
  trigger: 'user_sync' | 'service_cron' | 'subscription_create' | 'debug_simulation' | 'youtube_import';
};

export const SUBSCRIPTION_SYNC_WRITE_HEARTBEAT_MINUTES = 60;
export const SUBSCRIPTION_SYNC_ERROR_WRITE_HEARTBEAT_MINUTES = 120;
const SUBSCRIPTION_SYNC_WRITE_HEARTBEAT_MS = SUBSCRIPTION_SYNC_WRITE_HEARTBEAT_MINUTES * 60_000;
const SUBSCRIPTION_SYNC_ERROR_WRITE_HEARTBEAT_MS = SUBSCRIPTION_SYNC_ERROR_WRITE_HEARTBEAT_MINUTES * 60_000;
const SUBSCRIPTION_FEED_FETCH_MAX_ATTEMPTS = 2;
const SUBSCRIPTION_FEED_FETCH_RETRY_BACKOFF_MS = 750;
const YOUTUBE_FEED_NOT_FOUND_ERROR_PREFIX = 'FEED_FETCH_FAILED:404';

function normalizeNullableText(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function isFeedNotFoundErrorMessage(value: unknown) {
  return normalizeNullableText(value)?.startsWith(YOUTUBE_FEED_NOT_FOUND_ERROR_PREFIX) ?? false;
}

function parseDateMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function shouldRefreshSubscriptionHeartbeat(lastPolledAt: string | null | undefined, nowIso: string, heartbeatMs: number) {
  const lastPolledAtMs = parseDateMs(lastPolledAt);
  const nowMs = parseDateMs(nowIso);
  if (lastPolledAtMs === null || nowMs === null) return true;
  return nowMs - lastPolledAtMs >= heartbeatMs;
}

type SubscriptionWriteSource = {
  source_channel_title?: string | null;
  last_polled_at?: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
  last_sync_error?: string | null;
};

export function buildSubscriptionSyncSuccessUpdate(input: {
  subscription: SubscriptionWriteSource;
  channelTitle: string | null;
  newestPublishedAt: string | null;
  newestVideoId: string | null;
  skippedUpcoming: boolean;
  nowIso: string;
}) {
  const nextLastSeenPublishedAt = input.skippedUpcoming
    ? input.subscription.last_seen_published_at
    : (input.newestPublishedAt || input.subscription.last_seen_published_at);
  const nextLastSeenVideoId = input.skippedUpcoming
    ? input.subscription.last_seen_video_id
    : (input.newestVideoId || input.subscription.last_seen_video_id);

  const checkpointChanged =
    nextLastSeenPublishedAt !== input.subscription.last_seen_published_at
    || nextLastSeenVideoId !== input.subscription.last_seen_video_id;
  const titleChanged =
    normalizeNullableText(input.subscription.source_channel_title) !== normalizeNullableText(input.channelTitle);
  const shouldClearError = normalizeNullableText(input.subscription.last_sync_error) !== null;

  if (!checkpointChanged && !titleChanged && !shouldClearError) {
    return null;
  }

  return {
    source_channel_title: input.channelTitle,
    last_polled_at: input.nowIso,
    last_seen_published_at: nextLastSeenPublishedAt,
    last_seen_video_id: nextLastSeenVideoId,
    last_sync_error: null,
  };
}

export function buildSubscriptionSyncErrorUpdate(input: {
  subscription: { last_polled_at?: string | null; last_sync_error?: string | null } | null | undefined;
  errorMessage: string;
  nowIso: string;
}) {
  const nextError = String(input.errorMessage || '').slice(0, 500);
  const currentError = normalizeNullableText(input.subscription?.last_sync_error);
  const shouldRefreshHeartbeat = shouldRefreshSubscriptionHeartbeat(
    input.subscription?.last_polled_at,
    input.nowIso,
    SUBSCRIPTION_SYNC_ERROR_WRITE_HEARTBEAT_MS,
  );

  if (currentError === nextError && !shouldRefreshHeartbeat) {
    return null;
  }

  return {
    last_polled_at: input.nowIso,
    last_sync_error: nextError,
  };
}

export type SourceSubscriptionSyncDeps = {
  fetchYouTubeFeed: (channelId: string, maxResults: number) => Promise<{
    channelTitle: string | null;
    videos: Array<{
      videoId: string;
      url: string;
      title: string;
      publishedAt: string | null;
      thumbnailUrl: string | null;
      durationSeconds?: number | null;
    }>;
  }>;
  isNewerThanCheckpoint: (
    video: { videoId: string; publishedAt: string | null },
    lastSeenPublishedAt: string | null,
    lastSeenVideoId: string | null,
  ) => boolean;
  ingestionMaxPerSubscription: number;
  youtubeDataApiKey: string;
  generationDurationCapEnabled: boolean;
  generationMaxVideoSeconds: number;
  generationBlockUnknownDuration: boolean;
  generationDurationLookupTimeoutMs: number;
  fetchYouTubeDurationMap: (input: {
    apiKey: string;
    videoIds: string[];
    timeoutMs?: number;
    userAgent?: string;
  }) => Promise<Map<string, number | null>>;
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
        thumbnailUrl: string | null;
        durationSeconds?: number | null;
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
      thumbnailUrl: string | null;
      durationSeconds?: number | null;
    };
    unlock: { status: string };
    trigger: 'user_sync' | 'service_cron' | 'subscription_create' | 'debug_simulation' | 'youtube_import';
  }) => Promise<{
    queued: boolean;
    reason: string;
    auto_intent_id?: string | null;
    owner_user_id?: string | null;
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
      duration_seconds: number | null;
      trigger: 'user_sync' | 'service_cron' | 'subscription_create' | 'debug_simulation' | 'youtube_import';
      auto_intent_id?: string | null;
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
      wallCreatedAt?: string | null;
    },
  ) => Promise<{ id: string } | null>;
  upsertFeedItemWithBlueprint?: (
    db: DbClient,
    input: {
      userId: string;
      sourceItemId: string;
      blueprintId: string;
      state: 'my_feed_published';
    },
  ) => Promise<{ id: string } | null>;
  resolveVariantOrReady?: (input: {
    sourceItemId: string;
    generationTier: 'tier';
    jobId?: string | null;
  }) => Promise<{ state: 'ready'; blueprintId?: string | null } | { state: 'in_progress' } | { state: 'needs_generation' } | null>;
  resolveYouTubeChannel?: (input: string) => Promise<ResolvedYouTubeChannel>;
  resolveYouTubeChannelByCreatorName?: (query: string) => Promise<ResolvedYouTubeChannel | null>;
  syncOracleProductSubscriptions?: (
    rows: Array<Record<string, unknown> | null | undefined>,
    action: string,
  ) => Promise<void>;
  persistSourceSubscriptionPatch?: (
    db: DbClient,
    input: {
      subscription: SubscriptionSyncRow;
      patch: Record<string, unknown>;
      action: string;
    },
  ) => Promise<Record<string, unknown> | null>;
};

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isFeedSoftFailureResultCode(resultCode: SyncSubscriptionResult['resultCode']) {
  return resultCode === 'feed_transient_error' || resultCode === 'feed_not_found';
}

function logSubscriptionWallArrival(input: {
  subscriptionId: string;
  userId: string;
  sourceItemId: string;
  sourceChannelId: string;
  videoId: string;
  trigger: SubscriptionSyncOptions['trigger'];
  publishedAt: string | null;
  detectedAt: string;
  insertedAt: string;
  wallState: 'ready' | 'unlockable';
  source: 'existing_ready_variant' | 'early_unlockable' | 'late_unlockable';
}) {
  const publishedAtMs = parseDateMs(input.publishedAt);
  const insertedAtMs = parseDateMs(input.insertedAt);
  const detectedAtMs = parseDateMs(input.detectedAt);
  console.log('[subscription_wall_arrived]', JSON.stringify({
    subscription_id: input.subscriptionId,
    user_id: input.userId,
    source_item_id: input.sourceItemId,
    source_channel_id: input.sourceChannelId,
    video_id: input.videoId,
    trigger: input.trigger,
    published_at: input.publishedAt,
    detected_at: input.detectedAt,
    inserted_at: input.insertedAt,
    detect_lag_ms: publishedAtMs != null && detectedAtMs != null
      ? Math.max(0, detectedAtMs - publishedAtMs)
      : null,
    wall_lag_ms: publishedAtMs != null && insertedAtMs != null
      ? Math.max(0, insertedAtMs - publishedAtMs)
      : null,
    wall_state: input.wallState,
    source: input.source,
  }));
}

export function createSourceSubscriptionSyncService(deps: SourceSubscriptionSyncDeps) {
  async function updateRecoveredSubscriptionChannel(input: {
    db: DbClient;
    subscription: SubscriptionSyncRow;
    resolved: ResolvedYouTubeChannel;
  }) {
    const nowIso = new Date().toISOString();
    const patch = {
      source_channel_id: input.resolved.channelId,
      source_channel_url: input.resolved.channelUrl,
      source_channel_title: input.resolved.channelTitle || input.subscription.source_channel_title || null,
      updated_at: nowIso,
    };

    if (deps.persistSourceSubscriptionPatch) {
      await deps.persistSourceSubscriptionPatch(input.db, {
        subscription: input.subscription,
        patch,
        action: 'subscription_feed_channel_recovered',
      });
    } else {
      await input.db
        .from('user_source_subscriptions')
        .update(patch)
        .eq('id', input.subscription.id);
    }

    input.subscription.source_channel_id = patch.source_channel_id;
    input.subscription.source_channel_url = patch.source_channel_url;
    input.subscription.source_channel_title = patch.source_channel_title;
    input.subscription.updated_at = nowIso;

    if (!deps.persistSourceSubscriptionPatch) {
      await deps.syncOracleProductSubscriptions?.([{
        id: input.subscription.id,
        user_id: input.subscription.user_id,
        source_type: input.subscription.source_type || 'youtube',
        source_channel_id: input.subscription.source_channel_id,
        source_channel_url: input.subscription.source_channel_url || null,
        source_channel_title: input.subscription.source_channel_title || null,
        source_page_id: input.subscription.source_page_id || null,
        mode: input.subscription.mode || null,
        auto_unlock_enabled: input.subscription.auto_unlock_enabled !== false,
        is_active: input.subscription.is_active !== false,
        last_polled_at: input.subscription.last_polled_at || null,
        last_seen_published_at: input.subscription.last_seen_published_at,
        last_seen_video_id: input.subscription.last_seen_video_id,
        last_sync_error: input.subscription.last_sync_error || null,
        created_at: input.subscription.created_at || nowIso,
        updated_at: nowIso,
      }], 'subscription_feed_channel_recovered');
    }
  }

  async function markSoftFeedFetchFailure(input: {
    db: DbClient;
    subscription: SubscriptionSyncRow;
    errorMessage: string;
  }) {
    const nowIso = new Date().toISOString();
    const update = buildSubscriptionSyncErrorUpdate({
      subscription: input.subscription,
      errorMessage: input.errorMessage,
      nowIso,
    });
    if (!update) return;

    if (deps.persistSourceSubscriptionPatch) {
      await deps.persistSourceSubscriptionPatch(input.db, {
        subscription: input.subscription,
        patch: update,
        action: 'subscription_feed_soft_failure',
      });
    } else {
      await input.db
        .from('user_source_subscriptions')
        .update(update)
        .eq('id', input.subscription.id);
    }

    input.subscription.last_polled_at = update.last_polled_at;
    input.subscription.last_sync_error = update.last_sync_error;
  }

  async function loadFeedWithHardening(
    db: DbClient,
    subscription: SubscriptionSyncRow,
    options: SubscriptionSyncOptions,
  ): Promise<
    | { kind: 'success'; feed: Awaited<ReturnType<SourceSubscriptionSyncDeps['fetchYouTubeFeed']>> }
    | {
      kind: 'soft_failure';
      resultCode: Extract<SyncSubscriptionResult['resultCode'], 'feed_transient_error' | 'feed_not_found'>;
      errorMessage: string;
    }
  > {
    let attempts = 0;
    let attemptedChannelRecovery = false;
    let recoveredChannelChanged = false;
    let confirmedChannelStillExists = false;
    let confirmedChannelStillExistsVia: 'channel_url' | 'creator_name' | null = null;
    while (attempts < SUBSCRIPTION_FEED_FETCH_MAX_ATTEMPTS) {
      attempts += 1;
      try {
        const feed = await deps.fetchYouTubeFeed(subscription.source_channel_id, 20);
        return {
          kind: 'success',
          feed,
        };
      } catch (error) {
        const feedError = toYouTubeFeedFetchError(error, subscription.source_channel_id);
        if (!feedError) {
          throw error;
        }

        if (
          feedError.kind === 'feed_not_found'
          && !attemptedChannelRecovery
          && (deps.resolveYouTubeChannel || deps.resolveYouTubeChannelByCreatorName)
        ) {
          attemptedChannelRecovery = true;
          let recoveredVia: 'channel_url' | 'creator_name' | null = null;
          let resolved: ResolvedYouTubeChannel | null = null;
          try {
            if (deps.resolveYouTubeChannel && subscription.source_channel_url) {
              try {
                const urlResolved = await deps.resolveYouTubeChannel(subscription.source_channel_url);
                if (urlResolved.channelId) {
                  resolved = urlResolved;
                  recoveredVia = 'channel_url';
                }
              } catch (recoveryError) {
                console.log('[subscription_channel_recovery_url_failed]', JSON.stringify({
                  subscription_id: subscription.id,
                  user_id: subscription.user_id,
                  source_channel_id: subscription.source_channel_id,
                  source_channel_url: subscription.source_channel_url || null,
                  source_channel_title: subscription.source_channel_title || null,
                  trigger: options.trigger,
                  error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
                }));
              }
            }

            if (
              !resolved
              && deps.resolveYouTubeChannelByCreatorName
              && normalizeNullableText(subscription.source_channel_title)
            ) {
              try {
                const titleResolved = await deps.resolveYouTubeChannelByCreatorName(
                  normalizeNullableText(subscription.source_channel_title)!,
                );
                if (titleResolved?.channelId) {
                  resolved = titleResolved;
                  recoveredVia = 'creator_name';
                }
              } catch (recoveryError) {
                console.log('[subscription_channel_recovery_name_failed]', JSON.stringify({
                  subscription_id: subscription.id,
                  user_id: subscription.user_id,
                  source_channel_id: subscription.source_channel_id,
                  source_channel_url: subscription.source_channel_url || null,
                  source_channel_title: subscription.source_channel_title || null,
                  trigger: options.trigger,
                  error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
                }));
              }
            }

            if (resolved?.channelId && resolved.channelId !== subscription.source_channel_id) {
              recoveredChannelChanged = true;
              await updateRecoveredSubscriptionChannel({
                db,
                subscription,
                resolved,
              });
              console.log('[subscription_channel_recovered]', JSON.stringify({
                subscription_id: subscription.id,
                user_id: subscription.user_id,
                previous_source_channel_id: feedError.channelId || null,
                source_channel_id: subscription.source_channel_id,
                source_channel_url: subscription.source_channel_url || null,
                source_channel_title: subscription.source_channel_title || null,
                recovery_method: recoveredVia,
                trigger: options.trigger,
              }));
              continue;
            }
            if (resolved?.channelId && resolved.channelId === subscription.source_channel_id) {
              confirmedChannelStillExists = true;
              confirmedChannelStillExistsVia = recoveredVia;
              console.log('[subscription_channel_confirmed_existing]', JSON.stringify({
                subscription_id: subscription.id,
                user_id: subscription.user_id,
                source_channel_id: subscription.source_channel_id,
                source_channel_url: subscription.source_channel_url || null,
                source_channel_title: subscription.source_channel_title || null,
                confirmation_method: recoveredVia,
                trigger: options.trigger,
              }));
            }
          } catch (recoveryError) {
            console.log('[subscription_channel_recovery_failed]', JSON.stringify({
              subscription_id: subscription.id,
              user_id: subscription.user_id,
              source_channel_id: subscription.source_channel_id,
              source_channel_url: subscription.source_channel_url || null,
              source_channel_title: subscription.source_channel_title || null,
              trigger: options.trigger,
              error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
            }));
          }
        }

        const previousFeedNotFoundError = isFeedNotFoundErrorMessage(subscription.last_sync_error);
        const repeatedConfirmedFeedNotFound =
          feedError.kind === 'feed_not_found'
          && confirmedChannelStillExists
          && previousFeedNotFoundError;
        const treatFeedNotFoundAsTransient =
          feedError.kind === 'feed_not_found'
          && confirmedChannelStillExists
          && !previousFeedNotFoundError;
        const effectiveRetryable = feedError.retryable || treatFeedNotFoundAsTransient;
        const effectiveResultCode =
          treatFeedNotFoundAsTransient || feedError.kind !== 'feed_not_found'
            ? 'feed_transient_error'
            : 'feed_not_found';

        if (effectiveRetryable && attempts < SUBSCRIPTION_FEED_FETCH_MAX_ATTEMPTS) {
          console.log('[subscription_feed_fetch_retrying]', JSON.stringify({
            subscription_id: subscription.id,
            user_id: subscription.user_id,
            source_channel_id: subscription.source_channel_id,
            source_channel_title: subscription.source_channel_title || null,
            attempt: attempts,
            max_attempts: SUBSCRIPTION_FEED_FETCH_MAX_ATTEMPTS,
            trigger: options.trigger,
            confirmed_channel_still_exists: confirmedChannelStillExists,
            confirmed_channel_still_exists_via: confirmedChannelStillExistsVia,
            previous_feed_not_found_error: previousFeedNotFoundError,
            repeated_confirmed_feed_not_found: repeatedConfirmedFeedNotFound,
            error: feedError.message,
          }));
          await sleep(SUBSCRIPTION_FEED_FETCH_RETRY_BACKOFF_MS * attempts);
          continue;
        }

        if (options.trigger === 'service_cron') {
          await markSoftFeedFetchFailure({
            db,
            subscription,
            errorMessage: feedError.message,
          });
          console.log('[subscription_feed_fetch_soft_failed]', JSON.stringify({
            subscription_id: subscription.id,
            user_id: subscription.user_id,
            source_channel_id: subscription.source_channel_id,
            source_channel_title: subscription.source_channel_title || null,
            source_channel_url: subscription.source_channel_url || null,
            trigger: options.trigger,
            failure_kind: effectiveResultCode,
            recovery_attempted: attemptedChannelRecovery,
            recovery_changed_channel: recoveredChannelChanged,
            confirmed_channel_still_exists: confirmedChannelStillExists,
            confirmed_channel_still_exists_via: confirmedChannelStillExistsVia,
            previous_feed_not_found_error: previousFeedNotFoundError,
            repeated_confirmed_feed_not_found: repeatedConfirmedFeedNotFound,
            retryable: effectiveRetryable,
            error: feedError.message,
          }));
          return {
            kind: 'soft_failure',
            resultCode: effectiveResultCode,
            errorMessage: feedError.message,
          };
        }

        throw feedError;
      }
    }

    const fallbackError = `FEED_FETCH_FAILED:unknown:${subscription.source_channel_id}`;
    if (options.trigger === 'service_cron') {
      await markSoftFeedFetchFailure({
        db,
        subscription,
        errorMessage: fallbackError,
      });
      return {
        kind: 'soft_failure',
        resultCode: 'feed_transient_error',
        errorMessage: fallbackError,
      };
    }
    throw new Error(fallbackError);
  }

  async function syncSingleSubscription(
    db: DbClient,
    subscription: SubscriptionSyncRow,
    options: SubscriptionSyncOptions,
  ): Promise<SyncSubscriptionResult> {
    const feedLoad = await loadFeedWithHardening(db, subscription, options);
    if (feedLoad.kind === 'soft_failure') {
      return {
        processed: 0,
        inserted: 0,
        skipped: 0,
        newestVideoId: null,
        newestPublishedAt: null,
        channelTitle: subscription.source_channel_title || null,
        resultCode: feedLoad.resultCode,
        errorMessage: feedLoad.errorMessage,
        sourceChannelId: subscription.source_channel_id,
        sourceChannelTitle: subscription.source_channel_title || null,
      };
    }

    const feed = feedLoad.feed;
    const newest = feed.videos[0] || null;
    const bootstrapPolledAt = new Date().toISOString();

    if (!subscription.last_seen_published_at) {
      await db
        .from('user_source_subscriptions')
        .update({
          source_channel_title: feed.channelTitle,
          last_polled_at: bootstrapPolledAt,
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
        resultCode: 'bootstrap',
        sourceChannelId: subscription.source_channel_id,
        sourceChannelTitle: feed.channelTitle,
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
    let skippedByDurationPolicy = 0;
    // Current runtime uses a flat unlock cost, so we do not need to count
    // active subscribers during every subscription sync.
    const estimatedUnlockCost = deps.computeUnlockCost(1);
    const durationByVideoId = new Map<string, number | null>();
    for (const video of toProcess) {
      durationByVideoId.set(video.videoId, toDurationSeconds(video.durationSeconds));
    }
    if (deps.generationDurationCapEnabled && toProcess.length > 0) {
      const missingDurationIds = toProcess
        .map((video) => video.videoId)
        .filter((videoId) => durationByVideoId.get(videoId) == null);
      if (missingDurationIds.length > 0) {
        try {
          const fetchedDurations = await deps.fetchYouTubeDurationMap({
            apiKey: deps.youtubeDataApiKey,
            videoIds: missingDurationIds,
            timeoutMs: deps.generationDurationLookupTimeoutMs,
            userAgent: 'bleuv1-subscription-auto/1.0 (+https://api.bleup.app)',
          });
          for (const videoId of missingDurationIds) {
            durationByVideoId.set(videoId, fetchedDurations.get(videoId) ?? null);
          }
        } catch (durationLookupError) {
          console.log('[subscription_duration_lookup_failed]', JSON.stringify({
            subscription_id: subscription.id,
            source_channel_id: subscription.source_channel_id,
            trigger: options.trigger,
            error: durationLookupError instanceof Error ? durationLookupError.message : String(durationLookupError),
          }));
        }
      }
    }

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
      const durationSeconds = durationByVideoId.get(video.videoId) ?? null;
      if (deps.generationDurationCapEnabled) {
        const durationDecision = classifyVideoDuration({
          durationSeconds,
          maxSeconds: deps.generationMaxVideoSeconds,
          blockUnknown: deps.generationBlockUnknownDuration,
        });
        if (durationDecision !== 'allow') {
          skipped += 1;
          skippedByDurationPolicy += 1;
          console.log('[subscription_skip_duration_policy]', JSON.stringify({
            subscription_id: subscription.id,
            user_id: subscription.user_id,
            source_channel_id: subscription.source_channel_id,
            video_id: video.videoId,
            reason: durationDecision === 'too_long' ? 'VIDEO_TOO_LONG' : 'VIDEO_DURATION_UNAVAILABLE',
            max_duration_seconds: deps.generationMaxVideoSeconds,
            video_duration_seconds: durationSeconds,
            trigger: options.trigger,
          }));
          continue;
        }
      }
      const source = await deps.upsertSourceItemFromVideo(db, {
        video: {
          ...video,
          durationSeconds,
        },
        channelId: subscription.source_channel_id,
        channelTitle: feed.channelTitle,
        sourcePageId: subscription.source_page_id || null,
      });

      const detectedAtIso = new Date().toISOString();
      const publishedAtMs = parseDateMs(video.publishedAt);
      const detectedAtMs = parseDateMs(detectedAtIso);
      console.log('[subscription_new_video_detected]', JSON.stringify({
        subscription_id: subscription.id,
        user_id: subscription.user_id,
        source_item_id: source.id,
        source_channel_id: subscription.source_channel_id,
        video_id: video.videoId,
        trigger: options.trigger,
        published_at: video.publishedAt || null,
        detected_at: detectedAtIso,
        detect_lag_ms: publishedAtMs != null && detectedAtMs != null
          ? Math.max(0, detectedAtMs - publishedAtMs)
          : null,
      }));

      const existingFeedItem = await deps.getExistingFeedItem(db, subscription.user_id, source.id);
      const variantState = deps.resolveVariantOrReady
        ? await deps.resolveVariantOrReady({
          sourceItemId: source.id,
          generationTier: 'tier',
        })
        : null;
      if (
        variantState?.state === 'ready'
        && variantState.blueprintId
        && deps.upsertFeedItemWithBlueprint
      ) {
        const insertedAtIso = new Date().toISOString();
        await deps.upsertFeedItemWithBlueprint(db, {
          userId: subscription.user_id,
          sourceItemId: source.id,
          blueprintId: variantState.blueprintId,
          state: 'my_feed_published',
        });
        if (existingFeedItem) skipped += 1;
        else inserted += 1;
        logSubscriptionWallArrival({
          subscriptionId: subscription.id,
          userId: subscription.user_id,
          sourceItemId: source.id,
          sourceChannelId: subscription.source_channel_id,
          videoId: video.videoId,
          trigger: options.trigger,
          publishedAt: video.publishedAt || null,
          detectedAt: detectedAtIso,
          insertedAt: insertedAtIso,
          wallState: 'ready',
          source: 'existing_ready_variant',
        });
        continue;
      }
      if (existingFeedItem) {
        skipped += 1;
        continue;
      }

      const unlock = await deps.ensureSourceItemUnlock(db, {
        sourceItemId: source.id,
        sourcePageId: subscription.source_page_id || source.source_page_id || null,
        estimatedCost: estimatedUnlockCost,
      });

      const unlockBeforeAutoAttempt = await deps.getSourceItemUnlockBySourceItemId(db, source.id);
      const transcriptCooldownBeforeAutoAttempt = deps.getTranscriptCooldownState(unlockBeforeAutoAttempt);
      const isTranscriptBlockedBeforeAutoAttempt = transcriptCooldownBeforeAutoAttempt.active
        || deps.isConfirmedNoTranscriptUnlock(unlockBeforeAutoAttempt);
      let insertedUnlockableEarly = false;
      if (unlock.status === 'available' && !isTranscriptBlockedBeforeAutoAttempt) {
        const insertedAtIso = new Date().toISOString();
        const insertedItem = await deps.insertFeedItem(db, {
          userId: subscription.user_id,
          sourceItemId: source.id,
          blueprintId: null,
          state: 'my_feed_unlockable',
          wallCreatedAt: insertedAtIso,
        });
        if (insertedItem) {
          inserted += 1;
          insertedUnlockableEarly = true;
          logSubscriptionWallArrival({
            subscriptionId: subscription.id,
            userId: subscription.user_id,
            sourceItemId: source.id,
            sourceChannelId: subscription.source_channel_id,
            videoId: video.videoId,
            trigger: options.trigger,
            publishedAt: video.publishedAt || null,
            detectedAt: detectedAtIso,
            insertedAt: insertedAtIso,
            wallState: 'unlockable',
            source: 'early_unlockable',
          });
        }
      }

      let autoAttempt = null;
      let autoAttemptError: unknown = null;
      if (unlock.status === 'available') {
        try {
          autoAttempt = await deps.attemptAutoUnlockForSourceItem({
            sourceItemId: source.id,
            sourcePageId: subscription.source_page_id || source.source_page_id || null,
            sourceChannelId: subscription.source_channel_id || source.source_channel_id || '',
            sourceChannelTitle: feed.channelTitle || source.source_channel_title || null,
            video: {
              ...video,
              durationSeconds,
            },
            unlock,
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
                duration_seconds: durationSeconds,
                trigger: options.trigger,
                auto_intent_id: autoAttempt?.auto_intent_id || null,
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
              owner_user_id: autoAttempt.owner_user_id,
              auto_intent_id: autoAttempt.auto_intent_id,
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
            error: formatUnknownError(autoUnlockError),
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
        if (!insertedUnlockableEarly) {
          const insertedAtIso = new Date().toISOString();
          const insertedItem = await deps.insertFeedItem(db, {
            userId: subscription.user_id,
            sourceItemId: source.id,
            blueprintId: null,
            state: 'my_feed_unlockable',
            wallCreatedAt: insertedAtIso,
          });
          if (insertedItem) {
            inserted += 1;
            logSubscriptionWallArrival({
              subscriptionId: subscription.id,
              userId: subscription.user_id,
              sourceItemId: source.id,
              sourceChannelId: subscription.source_channel_id,
              videoId: video.videoId,
              trigger: options.trigger,
              publishedAt: video.publishedAt || null,
              detectedAt: detectedAtIso,
              insertedAt: insertedAtIso,
              wallState: 'unlockable',
              source: 'late_unlockable',
            });
          } else {
            skipped += 1;
          }
        }

        console.log('[subscription_auto_unlockable]', JSON.stringify({
          subscription_id: subscription.id,
          user_id: subscription.user_id,
          source_item_id: source.id,
          estimated_unlock_cost: estimatedUnlockCost,
          trigger: options.trigger,
        }));
      } else if (!insertedUnlockableEarly) {
        skipped += 1;
      }
    }

    const finalPolledAt = new Date().toISOString();
    const successUpdate = buildSubscriptionSyncSuccessUpdate({
      subscription,
      channelTitle: feed.channelTitle,
      newestPublishedAt: newest?.publishedAt || null,
      newestVideoId: newest?.videoId || null,
      skippedUpcoming: skippedUpcoming > 0,
      nowIso: finalPolledAt,
    });
    if (successUpdate) {
      if (deps.persistSourceSubscriptionPatch) {
        await deps.persistSourceSubscriptionPatch(db, {
          subscription,
          patch: successUpdate,
          action: 'subscription_sync_success',
        });
      } else {
        await db
          .from('user_source_subscriptions')
          .update(successUpdate)
          .eq('id', subscription.id);
      }
    }
    if (skippedByDurationPolicy > 0) {
      console.log('[subscription_duration_policy_summary]', JSON.stringify({
        subscription_id: subscription.id,
        user_id: subscription.user_id,
        source_channel_id: subscription.source_channel_id,
        skipped_by_duration_policy: skippedByDurationPolicy,
        trigger: options.trigger,
      }));
    }

    return {
      processed,
      inserted,
      skipped,
      newestVideoId: newest?.videoId || null,
      newestPublishedAt: newest?.publishedAt || null,
      channelTitle: feed.channelTitle,
      resultCode: inserted > 0
        ? 'new_items'
        : processed > 0
          ? 'checked_no_insert'
          : 'noop',
      sourceChannelId: subscription.source_channel_id,
      sourceChannelTitle: feed.channelTitle,
    };
  }

  return {
    syncSingleSubscription,
    isFeedSoftFailureResultCode,
  };
}

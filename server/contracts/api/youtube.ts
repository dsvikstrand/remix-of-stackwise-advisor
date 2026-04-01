import type express from 'express';
import type { SafeParser } from './shared';

export type SourcePageVideoExistingState = any;
export type SearchVideoGenerateItem = any;
export type UserYouTubeConnectionRow = any;

export type YouTubeCreditCheck = {
  ok: boolean;
  reason?: 'global' | 'user' | 'service' | string;
  retryAfterSeconds?: number;
  remaining?: number;
  limit?: number;
  resetAt?: string | null;
  errorCode?: string;
  message?: string;
};

export type YouTubeToBlueprintInput = {
  video_url: string;
  generate_review?: boolean;
  generate_banner?: boolean;
  source?: 'youtube_mvp';
  requested_tier?: 'free' | 'tier';
};

export type SearchVideosGenerateInput = {
  items: Array<{
    video_id: string;
    video_url: string;
    title: string;
    channel_id: string;
    channel_title?: string | null;
    channel_url?: string | null;
    published_at?: string | null;
    thumbnail_url?: string | null;
    duration_seconds?: number | null;
  }>;
  requested_tier?: 'free' | 'tier';
};

export type YouTubeConnectionStartInput = {
  return_to?: string;
};

export type YouTubeSubscriptionsImportInput = {
  channels: Array<{
    channel_id: string;
    channel_url?: string;
    channel_title?: string;
  }>;
};

export type YouTubeRouteDeps = {
  yt2bpIpHourlyLimiter: express.RequestHandler;
  yt2bpAnonLimiter: express.RequestHandler;
  yt2bpAuthLimiter: express.RequestHandler;
  yt2bpEnabled: boolean;
  yt2bpCoreTimeoutMs: number;
  searchApiLimiter: express.RequestHandler;
  sourceVideoUnlockBurstLimiter: express.RequestHandler;
  sourceVideoUnlockSustainedLimiter: express.RequestHandler;
  sourceVideoListBurstLimiter: express.RequestHandler;
  sourceVideoListSustainedLimiter: express.RequestHandler;
  youtubeConnectStartLimiter: express.RequestHandler;
  youtubePreviewLimiter: express.RequestHandler;
  youtubeImportLimiter: express.RequestHandler;
  youtubeDisconnectLimiter: express.RequestHandler;
  youtubeDataApiKey: string;
  youtubeSearchCacheEnabled: boolean;
  youtubeSearchCacheTtlSeconds: number;
  youtubeChannelSearchCacheTtlSeconds: number;
  youtubeSearchStaleMaxSeconds: number;
  youtubeSearchDegradeEnabled: boolean;
  youtubeGlobalLiveCallsPerMinute: number;
  youtubeGlobalLiveCallsPerDay: number;
  youtubeGlobalCooldownSeconds: number;
  searchGenerateMaxItems: number;
  sourceUnlockGenerateMaxItems: number;
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
  queueWorkItemsHardLimit: number;
  queueWorkItemsPerUserLimit: number;
  workerConcurrency: number;
  generationDurationCapEnabled: boolean;
  generationMaxVideoSeconds: number;
  generationBlockUnknownDuration: boolean;
  generationDurationLookupTimeoutMs: number;
  youtubeOAuthStateTtlSeconds: number;
  youtubeImportMaxChannels: number;
  tokenEncryptionKey: string;
  YouTubeToBlueprintRequestSchema: SafeParser<YouTubeToBlueprintInput>;
  SearchVideosGenerateSchema: SafeParser<SearchVideosGenerateInput>;
  YouTubeConnectionStartSchema: SafeParser<YouTubeConnectionStartInput>;
  YouTubeSubscriptionsImportSchema: SafeParser<YouTubeSubscriptionsImportInput>;
  getAdapterForUrl: any;
  consumeCredit: (
    userId: string,
    input?: {
      amount?: number;
      reasonCode?: string;
      idempotencyKey?: string;
      context?: Record<string, unknown>;
    },
  ) => Promise<YouTubeCreditCheck>;
  consumeGenerationDailyCap: any;
  getGenerationDailyCapStatus: any;
  getServiceSupabaseClient: any;
  withTimeout: any;
  runYouTubePipeline: any;
  mapPipelineError: any;
  clampYouTubeSearchLimit: any;
  getAuthedSupabaseClient: any;
  searchYouTubeVideos: any;
  loadExistingSourceVideoStateForUser: any;
  YouTubeSearchError: any;
  youtubeSearchCacheService: any;
  youtubeQuotaGuardService: any;
  countQueueDepth: any;
  countQueueWorkItems: any;
  emitGenerationStartedNotification: any;
  getGenerationNotificationLinkPath: any;
  scheduleQueuedIngestionProcessing: any;
  enqueueIngestionJob: any;
  clampYouTubeChannelSearchLimit: any;
  searchYouTubeChannels: any;
  YouTubeChannelSearchError: any;
  clampYouTubeSourceVideoLimit: any;
  normalizeYouTubeSourceVideoKind: any;
  listYouTubeSourceVideos: any;
  YouTubeSourceVideosError: any;
  ensureYouTubeOAuthConfig: any;
  normalizeReturnToUrl: any;
  buildDefaultReturnTo: any;
  randomBytes: (size: number) => { toString: (encoding: string) => string };
  hashOAuthState: any;
  buildYouTubeOAuthUrl: any;
  youtubeOAuthConfig: any;
  appendReturnToQuery: any;
  exchangeYouTubeOAuthCode: any;
  fetchYouTubeOAuthAccountProfile: any;
  encryptToken: any;
  mapYouTubeOAuthError: any;
  getUsableYouTubeAccessToken: any;
  fetchYouTubeUserSubscriptions: any;
  fetchYouTubeChannelAssetMap: any;
  ensureSourcePageFromYouTubeChannel: any;
  syncSingleSubscription: any;
  markSubscriptionSyncError: any;
  upsertSubscriptionNoticeSourceItem: any;
  insertFeedItem: any;
  upsertSourceItemFromVideo: any;
  decryptToken: any;
  revokeYouTubeToken: any;
  resolveGenerationTierAccess: any;
  resolveRequestedGenerationTier: any;
  normalizeRequestedGenerationTier: any;
  resolveGenerationModelProfile: any;
  resolveVariantOrReady: any;
  findVariantsByBlueprintId: any;
  requestManualBlueprintYouTubeCommentsRefresh: (input: {
    db: any;
    blueprintId: string;
    requestedByUserId: string;
  }) => Promise<
    | { ok: true; status: 'queued' | 'already_pending'; cooldown_until: string | null; queue_depth: number | null }
    | { ok: false; code: 'BLUEPRINT_YOUTUBE_REFRESH_NOT_AVAILABLE' }
    | { ok: false; code: 'COMMENTS_REFRESH_COOLDOWN_ACTIVE'; retry_at: string | null }
    | { ok: false; code: 'COMMENTS_REFRESH_QUEUE_GUARDED'; retry_after_seconds: number; queue_depth: number }
  >;
};

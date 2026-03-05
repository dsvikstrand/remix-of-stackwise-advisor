import type express from 'express';
import type { SafeParser } from './shared';

export type SourcePageVideoExistingState = any;
export type SearchVideoGenerateItem = any;
export type UserYouTubeConnectionRow = any;

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
  sourceUnlockGenerateMaxItems: number;
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
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
  consumeCredit: any;
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
  emitGenerationStartedNotification: any;
  getGenerationNotificationLinkPath: any;
  scheduleQueuedIngestionProcessing: any;
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
  decryptToken: any;
  revokeYouTubeToken: any;
  resolveGenerationTierAccess: any;
  resolveRequestedGenerationTier: any;
  normalizeRequestedGenerationTier: any;
  isDualGenerateEnabledForUser: any;
  getDualGenerateTiers: any;
  resolveGenerationModelProfile: any;
  resolveVariantOrReady: any;
  findVariantsByBlueprintId: any;
};

import type express from 'express';
import type { SafeParser } from './shared';

export type SyncSubscriptionResult = {
  processed: number;
  inserted: number;
  skipped: number;
};

export type RefreshScanCandidate = {
  subscription_id: string;
  source_channel_id: string;
  source_channel_title: string | null;
  source_channel_url: string | null;
  video_id: string;
  video_url: string;
  title: string;
  published_at?: string | null;
  thumbnail_url?: string | null;
  duration_seconds?: number | null;
};

export type RefreshSubscriptionsScanInput = {
  max_per_subscription?: number;
  max_total?: number;
};

export type RefreshSubscriptionsGenerateInput = {
  items: RefreshScanCandidate[];
  requested_tier?: 'free' | 'tier';
};

export type PublicYouTubeSubscriptionsPreviewInput = {
  channel_input: string;
  page_token?: string;
  page_size?: number;
};

export type PublicYouTubeSubscriptionPreviewItem = {
  channel_id: string;
  channel_title: string;
  channel_url: string;
  thumbnail_url: string | null;
  already_active: boolean;
  already_exists_inactive: boolean;
};

export type PublicYouTubeSubscriptionsPreviewResult = {
  source_channel_id: string;
  source_channel_title: string | null;
  source_channel_url: string;
  creators_total: number;
  next_page_token: string | null;
  has_more: boolean;
  creators: PublicYouTubeSubscriptionPreviewItem[];
};

export type SourceSubscriptionsRouteDeps = {
  getAuthedSupabaseClient: any;
  getServiceSupabaseClient: any;
  resolveYouTubeChannel: any;
  resolvePublicYouTubeChannel: any;
  youtubeDataApiKey: string;
  fetchPublicYouTubeSubscriptions: any;
  fetchYouTubeChannelAssetMap: any;
  runSourcePageAssetSweep?: any;
  ensureSourcePageFromYouTubeChannel: any;
  syncOracleProductSubscriptions?: any;
  syncSingleSubscription: any;
  markSubscriptionSyncError: any;
  upsertSubscriptionNoticeSourceItem: any;
  insertFeedItem: any;
  upsertSourceItemFromVideo: any;
  buildSourcePagePath: any;
  cleanupSubscriptionNoticeForChannel: any;
  publicYouTubePreviewLimiter: express.RequestHandler;
  refreshScanLimiter: express.RequestHandler;
  refreshGenerateLimiter: express.RequestHandler;
  RefreshSubscriptionsScanSchema: SafeParser<RefreshSubscriptionsScanInput>;
  collectRefreshCandidatesForUser: any;
  RefreshSubscriptionsGenerateSchema: SafeParser<RefreshSubscriptionsGenerateInput>;
  refreshGenerateMaxItems: number;
  generationDurationCapEnabled: boolean;
  generationMaxVideoSeconds: number;
  generationBlockUnknownDuration: boolean;
  generationDurationLookupTimeoutMs: number;
  recoverStaleIngestionJobs: any;
  getActiveManualRefreshJob: any;
  countQueueDepth: any;
  countQueueWorkItems: any;
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
  queueWorkItemsHardLimit: number;
  queueWorkItemsPerUserLimit: number;
  emitGenerationStartedNotification: any;
  getGenerationNotificationLinkPath: any;
  scheduleQueuedIngestionProcessing: any;
  enqueueIngestionJob: any;
  finalizeIngestionJob: any;
  resolveGenerationTierAccess: any;
  resolveRequestedGenerationTier: any;
  normalizeRequestedGenerationTier: any;
  resolveVariantOrReady: any;
  consumeCredit: any;
  getGenerationDailyCapStatus: any;
};

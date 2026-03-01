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

export type SourceSubscriptionsRouteDeps = {
  getAuthedSupabaseClient: any;
  getServiceSupabaseClient: any;
  resolveYouTubeChannel: any;
  youtubeDataApiKey: string;
  fetchYouTubeChannelAssetMap: any;
  ensureSourcePageFromYouTubeChannel: any;
  syncSingleSubscription: any;
  markSubscriptionSyncError: any;
  upsertSubscriptionNoticeSourceItem: any;
  insertFeedItem: any;
  buildSourcePagePath: any;
  cleanupSubscriptionNoticeForChannel: any;
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
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
  emitGenerationStartedNotification: any;
  getGenerationNotificationLinkPath: any;
  scheduleQueuedIngestionProcessing: any;
  resolveGenerationTierAccess: any;
  resolveRequestedGenerationTier: any;
  normalizeRequestedGenerationTier: any;
  resolveVariantOrReady: any;
};

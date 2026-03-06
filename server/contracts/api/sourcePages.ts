import type express from 'express';
import type { SafeParser } from './shared';

export type SourceItemUnlockRow = any;
export type SourcePageVideoExistingState = any;
export type SourcePageVideoGenerateItem = any;
export type SourceUnlockQueueItem = any;
export type SyncSubscriptionResult = any;

export type SourcePageBlueprintCursor = {
  createdAt: string;
  feedItemId: string;
};

export type SourcePageFeedScanRow = {
  id: string;
  source_item_id: string;
  blueprint_id: string;
  created_at: string;
};

export type SourcePageFeedSourceRow = {
  id: string;
  source_page_id: string | null;
  source_channel_id: string | null;
  source_url: string;
  thumbnail_url: string | null;
};

export type SourcePageSearchRow = {
  id: string;
  platform: string;
  external_id: string;
  external_url: string;
  title: string;
  avatar_url: string | null;
  is_active: boolean;
};

export type SourcePageVideosGenerateInput = {
  items: Array<{
    video_id: string;
    video_url: string;
    title: string;
    published_at?: string | null;
    thumbnail_url?: string | null;
    duration_seconds?: number | null;
  }>;
  requested_tier?: 'free' | 'tier';
};

export type SourcePagesRouteDeps = {
  clampInt: any;
  getAuthedSupabaseClient: any;
  getServiceSupabaseClient: any;
  buildSourcePagePath: any;
  normalizeSourcePagePlatform: any;
  getSourcePageByPlatformExternalId: any;
  runSourcePageAssetSweep: any;
  needsSourcePageAssetHydration: any;
  hydrateSourcePageAssetsForRow: any;
  youtubeDataApiKey: string;
  getUserSubscriptionStateForSourcePage: any;
  sourceVideoListBurstLimiter: express.RequestHandler;
  sourceVideoListSustainedLimiter: express.RequestHandler;
  sourceVideoUnlockBurstLimiter: express.RequestHandler;
  sourceVideoUnlockSustainedLimiter: express.RequestHandler;
  clampYouTubeSourceVideoLimit: any;
  normalizeYouTubeSourceVideoKind: any;
  runUnlockSweeps: any;
  listYouTubeSourceVideos: any;
  YouTubeSourceVideosError: any;
  loadExistingSourceVideoStateForUser: any;
  countActiveSubscribersForSourcePage: any;
  computeUnlockCost: any;
  getSourceItemUnlocksBySourceItemIds: any;
  toUnlockSnapshot: any;
  isConfirmedNoTranscriptUnlock: any;
  createUnlockTraceId: any;
  SourcePageVideosGenerateSchema: SafeParser<SourcePageVideosGenerateInput>;
  sourceUnlockGenerateMaxItems: number;
  generationDurationCapEnabled: boolean;
  generationMaxVideoSeconds: number;
  generationBlockUnknownDuration: boolean;
  generationDurationLookupTimeoutMs: number;
  logUnlockEvent: any;
  normalizeSourcePageVideoGenerateItem: any;
  upsertSourceItemFromVideo: any;
  ensureSourceItemUnlock: any;
  getTranscriptCooldownState: any;
  reserveUnlock: any;
  sourceUnlockReservationSeconds: number;
  reserveCredits: any;
  refundReservation: any;
  buildUnlockLedgerIdempotencyKey: any;
  failUnlock: any;
  attachReservationLedger: any;
  markUnlockProcessing: any;
  countQueueDepth: any;
  countQueueWorkItems: any;
  unlockIntakeEnabled: boolean;
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
  queueWorkItemsHardLimit: number;
  queueWorkItemsPerUserLimit: number;
  workerConcurrency: number;
  emitGenerationStartedNotification: any;
  getGenerationNotificationLinkPath: any;
  scheduleQueuedIngestionProcessing: any;
  settleReservation: any;
  completeUnlock: any;
  runYouTubePipeline: any;
  getFailureTransition: any;
  sourceTranscriptMaxAttempts: number;
  resolveYouTubeChannel: any;
  fetchYouTubeChannelAssetMap: any;
  ensureSourcePageFromYouTubeChannel: any;
  syncSingleSubscription: any;
  markSubscriptionSyncError: any;
  upsertSubscriptionNoticeSourceItem: any;
  insertFeedItem: any;
  cleanupSubscriptionNoticeForChannel: any;
  resolveGenerationTierAccess: any;
  resolveRequestedGenerationTier: any;
  normalizeRequestedGenerationTier: any;
  isDualGenerateEnabledForUser: any;
  getDualGenerateTiers: any;
  resolveVariantOrReady: any;
};

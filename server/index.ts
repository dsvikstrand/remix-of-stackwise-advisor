import './runtime/requireNode20';
import './loadEnv';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { createLLMClient, createLLMClientForPurpose } from './llm/client';
import { createOpenAIClient } from './llm/openaiClient';
import { getOpenAIConstructor } from './llm/openaiRuntime';
import { createCodexGenerationClient } from './llm/codexGenerationClient';
import { CodexExecError, runCodexExec } from './llm/codexExec';
import { consumeCredit, getCredits } from './credits';
import {
  getTranscriptForVideo,
  probeTranscriptProviders,
  resolveTranscriptOperationTimeoutMs,
} from './transcript/getTranscript';
import {
  getTranscriptProviderDebug,
  TranscriptProviderError,
  isRetryableTranscriptProviderErrorCode,
  isTerminalTranscriptProviderErrorCode,
} from './transcript/types';
import { getAdapterForUrl } from './adapters/registry';
import { evaluateCandidateForChannel } from './gates';
import type { GateMode } from './gates/types';
import {
  fetchPublicYouTubeSubscriptions,
  fetchYouTubeFeed,
  fetchYouTubeVideoStates,
  isNewerThanCheckpoint,
  resolvePublicYouTubeChannel,
  resolveYouTubeChannel,
  type YouTubeFeedVideo,
} from './services/youtubeSubscriptions';
import {
  clampYouTubeSearchLimit,
  searchYouTubeVideos,
  YouTubeSearchError,
} from './services/youtubeSearch';
import { createYouTubeSearchCacheService } from './services/youtubeSearchCache';
import { createYouTubeQuotaGuardService } from './services/youtubeQuotaGuard';
import {
  createQueuedIngestionWorkerController,
  resolveWorkerLeaseHeartbeatMs,
} from './services/queuedIngestionWorkerController';
import { parseRuntimeFlag, readBackendRuntimeConfig } from './services/runtimeConfig';
import { createYouTubeRefreshSchedulerController } from './services/youtubeRefreshSchedulerController';
import {
  createGenerationDailyCapService,
  readGenerationDailyCapConfigFromEnv,
} from './services/generationDailyCap';
import {
  getTranscriptProxyDebugMode,
  resetTranscriptProxyDispatcher,
} from './services/webshareProxy';
import {
  fetchYouTubeDurationMap,
  YouTubeDurationLookupError,
} from './services/youtubeDuration';
import {
  clampYouTubeSourceVideoLimit,
  listYouTubeSourceVideos,
  normalizeYouTubeSourceVideoKind,
  YouTubeSourceVideosError,
} from './services/youtubeSourceVideos';
import {
  clampYouTubeChannelSearchLimit,
  searchYouTubeChannels,
  YouTubeChannelSearchError,
} from './services/youtubeChannelSearch';
import {
  buildYouTubeOAuthUrl,
  exchangeYouTubeOAuthCode,
  fetchYouTubeOAuthAccountProfile,
  isYouTubeOAuthConfigured,
  refreshYouTubeAccessToken,
  revokeYouTubeToken,
  type YouTubeOAuthConfig,
  YouTubeOAuthError,
} from './services/youtubeOAuth';
import { fetchYouTubeUserSubscriptions, YouTubeUserSubscriptionsError } from './services/youtubeUserSubscriptions';
import { decryptToken, encryptToken } from './services/tokenCrypto';
import {
  buildSourcePagePath,
  ensureSourcePageFromYouTubeChannel,
  getSourcePageByPlatformExternalId,
  getUserSubscriptionStateForSourcePage,
  normalizeSourcePagePlatform,
} from './services/sourcePages';
import {
  attachAutoUnlockIntent,
  attachReservationLedger,
  completeUnlock,
  computeUnlockCost,
  countActiveSubscribersForSourcePage,
  ensureSourceItemUnlock,
  failUnlock,
  getSourceItemUnlockBySourceItemId,
  getSourceItemUnlocksBySourceItemIds,
  markUnlockProcessing,
  reserveUnlock,
  type SourceItemUnlockRow,
} from './services/sourceUnlocks';
import { refundReservation, reserveCredits, settleReservation } from './services/creditWallet';
import {
  releaseManualGeneration,
  settleManualGeneration,
  type ManualGenerationReservation,
} from './services/manualGenerationBilling';
import {
  markAutoUnlockIntentReady,
  releaseAutoUnlockIntent,
  reserveAutoUnlockIntent,
  settleAutoUnlockIntent,
} from './services/autoUnlockBilling';
import { runUnlockReliabilitySweeps } from './services/unlockReliabilitySweeps';
import { createUnlockTraceId, logUnlockEvent } from './services/unlockTrace';
import {
  suppressUnlockableFeedRowsForSourceItem,
  suppressUnlockableFeedRowsForSourceItems,
} from './services/feedSuppression';
import type { BlueprintSectionsV1 } from './services/blueprintSections';
import { ProviderCircuitOpenError, getProviderCircuitSnapshot } from './services/providerCircuit';
import { getProviderRetryDefaults, runWithProviderRetry } from './services/providerResilience';
import { createTranscriptThrottle, type TranscriptRequestClass } from './services/transcriptThrottle';
import { createCodexLane } from './services/codexLane';
import {
  claimQueuedIngestionJobs,
  countQueueDepth,
  countQueueWorkItems,
  failIngestionJob,
  touchIngestionJobLease,
  type IngestionJobRow,
} from './services/ingestionQueue';
import {
  filterScopesByQueuePriorityTier,
  getQueuePriorityTierForScope,
  listQueuePriorityTiersInOrder,
  shouldSuppressLowPriorityQueueScope,
  type QueuePriorityTier,
} from './services/queuePriority';
import {
  createNotificationFromEvent,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from './services/notifications';
import {
  createNotificationPushSender,
  deactivateNotificationPushSubscription,
  listActiveNotificationPushSubscriptions,
  processNotificationPushDispatchBatch,
  readNotificationPushConfigFromEnv,
  upsertNotificationPushSubscription,
} from './services/notificationPush';
import {
  appendGenerationEvent,
  attachBlueprintToRun,
  finalizeGenerationRunFailure,
  finalizeGenerationRunSuccess,
  getGenerationRunByRunId,
  getLatestGenerationRunByBlueprintId,
  listGenerationRunEvents,
  startGenerationRun,
  updateGenerationModelInfo,
} from './services/generationTrace';
import {
  clampInt,
  getFailureTransition,
  normalizeAutoBannerMode,
  partitionByBannerCap,
  selectDeterministicDefaultBanner,
  type BannerEffectiveSource,
} from './services/autoBannerPolicy';
import {
  buildDurationFilteredReasonCounts,
  classifyVideoDuration,
  readVideoDurationPolicyFromEnv,
  splitByDurationPolicy,
  toDurationSeconds,
} from './services/videoDurationPolicy';
import {
  pruneTranscriptForGeneration as applyTranscriptPruning,
  readTranscriptPruningConfigFromEnv,
} from './services/transcriptPruning';
import { createSourcePageAssetSweepService } from './services/sourcePageAssetSweep';
import { createAutoBannerQueueService } from './services/autoBannerQueue';
import {
  buildSubscriptionSyncErrorUpdate,
  createSourceSubscriptionSyncService,
} from './services/sourceSubscriptionSync';
import { createNotificationPushDispatcherController } from './services/notificationPushDispatcherController';
import { createBlueprintCreationService } from './services/blueprintCreation';
import {
  createBlueprintYouTubeCommentsService,
  type BlueprintYouTubeRefreshKind,
  type BlueprintYouTubeRefreshTrigger,
} from './services/blueprintYoutubeComments';
import { createYouTubeBlueprintPipelineService } from './services/youtubeBlueprintPipeline';
import {
  createGenerationTierAccessResolver,
  normalizeRequestedGenerationTier,
  readGenerationTierConfigFromEnv,
  resolveRequestedGenerationTier,
  type GenerationTier,
} from './services/generationTierAccess';
import { createBlueprintVariantsService, BlueprintVariantInProgressError } from './services/blueprintVariants';
import { runAutoChannelPipeline } from './services/autoChannelPipeline';
import { normalizeYouTubeDraftToGoldenV1 } from './services/goldenBlueprintFormat';
import {
  buildYouTubeQualityRetryInstructions,
  extractJson,
  YOUTUBE_BLUEPRINT_PROMPT_TEMPLATE_PATH_DEFAULT,
} from './llm/prompts';
import type {
  GenerationModelEvent,
  GenerationPromptEvent,
} from './llm/types';
import { registerTracingRoutes } from './routes/tracing';
import { registerNotificationRoutes } from './routes/notifications';
import { registerProfileRoutes } from './routes/profile';
import { registerFeedRoutes } from './routes/feed';
import { registerChannelCandidateRoutes } from './routes/channels';
import { registerIngestionUserRoutes } from './routes/ingestion';
import { registerCoreRoutes } from './routes/core';
import { registerOpsRoutes } from './routes/ops';
import { registerYouTubeRoutes } from './routes/youtube';
import { registerSourceSubscriptionsRoutes } from './routes/sourceSubscriptions';
import { registerSourcePagesRoutes } from './routes/sourcePages';
import { registerWallRoutes } from './routes/wall';

const app = express();
const port = Number(process.env.PORT) || 8787;
const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

// We run behind a single reverse proxy (nginx). Avoid permissive `true`.
app.set('trust proxy', 1);

const configuredCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : [];
const corsOrigin = isProduction
  ? configuredCorsOrigins
  : (configuredCorsOrigins.length ? configuredCorsOrigins : '*');

if (isProduction && configuredCorsOrigins.length === 0) {
  console.warn('[cors] NODE_ENV=production but CORS_ORIGIN is empty. Browser traffic will be blocked until explicit origins are configured.');
}

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(
  process.env.SUPABASE_ANON_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || '',
).trim();
const supabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
  : null;

const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const rateLimitMax = Number(process.env.RATE_LIMIT_MAX) || 60;
const limiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => (
    req.path === '/api/health'
    || req.path === '/api/credits'
    || req.path === '/api/ingestion/jobs/latest-mine'
    || req.path === '/api/ingestion/jobs/active-mine'
    || req.path.startsWith('/api/notifications')
    || req.path === '/api/youtube-search'
    || req.path === '/api/youtube-channel-search'
    || req.path.startsWith('/api/youtube/channels/')
  ),
});

app.use(limiter);

const yt2bpAnonLimitPerMin = Number(process.env.YT2BP_ANON_LIMIT_PER_MIN) || 6;
const yt2bpAuthLimitPerMin = Number(process.env.YT2BP_AUTH_LIMIT_PER_MIN) || 20;
const yt2bpIpLimitPerHour = Number(process.env.YT2BP_IP_LIMIT_PER_HOUR) || 30;
const yt2bpEnabledRaw = String(process.env.YT2BP_ENABLED ?? 'true').trim().toLowerCase();
const yt2bpEnabled = !(yt2bpEnabledRaw === 'false' || yt2bpEnabledRaw === '0' || yt2bpEnabledRaw === 'off');
const yt2bpOutputModeRaw = String(process.env.YT2BP_OUTPUT_MODE || 'llm_native').trim().toLowerCase();
const yt2bpOutputMode: 'llm_native' | 'deterministic' = yt2bpOutputModeRaw === 'deterministic' ? 'deterministic' : 'llm_native';
const yt2bpSafetyBlockEnabledRaw = String(process.env.YT2BP_SAFETY_BLOCK_ENABLED ?? 'false').trim().toLowerCase();
const yt2bpSafetyBlockEnabled = (
  yt2bpSafetyBlockEnabledRaw === '1'
  || yt2bpSafetyBlockEnabledRaw === 'true'
  || yt2bpSafetyBlockEnabledRaw === 'yes'
  || yt2bpSafetyBlockEnabledRaw === 'on'
);
const yt2bpCoreTimeoutMs = clampInt(process.env.YT2BP_CORE_TIMEOUT_MS, 120_000, 30_000, 300_000);
const ingestionServiceToken = String(process.env.INGESTION_SERVICE_TOKEN || '').trim();
const ingestionMaxPerSubscription = Math.max(1, Number(process.env.INGESTION_MAX_PER_SUBSCRIPTION) || 5);
const refreshScanCooldownMs = clampInt(process.env.REFRESH_SCAN_COOLDOWN_MS, 30_000, 5_000, 300_000);
const refreshGenerateCooldownMs = clampInt(process.env.REFRESH_GENERATE_COOLDOWN_MS, 120_000, 10_000, 900_000);
const refreshGenerateMaxItems = clampInt(process.env.REFRESH_GENERATE_MAX_ITEMS, 10, 1, 200);
const sourceVideoListBurstWindowMs = clampInt(process.env.SOURCE_VIDEO_LIST_BURST_WINDOW_MS, 15_000, 5_000, 300_000);
const sourceVideoListBurstMax = clampInt(process.env.SOURCE_VIDEO_LIST_BURST_MAX, 4, 1, 20);
const sourceVideoListSustainedWindowMs = clampInt(process.env.SOURCE_VIDEO_LIST_SUSTAINED_WINDOW_MS, 10 * 60_000, 60_000, 60 * 60_000);
const sourceVideoListSustainedMax = clampInt(process.env.SOURCE_VIDEO_LIST_SUSTAINED_MAX, 40, 5, 500);
const sourceVideoUnlockBurstWindowMs = clampInt(process.env.SOURCE_VIDEO_UNLOCK_BURST_WINDOW_MS, 10_000, 5_000, 300_000);
const sourceVideoUnlockBurstMax = clampInt(process.env.SOURCE_VIDEO_UNLOCK_BURST_MAX, 8, 1, 100);
const sourceVideoUnlockSustainedWindowMs = clampInt(process.env.SOURCE_VIDEO_UNLOCK_SUSTAINED_WINDOW_MS, 10 * 60_000, 60_000, 60 * 60_000);
const sourceVideoUnlockSustainedMax = clampInt(process.env.SOURCE_VIDEO_UNLOCK_SUSTAINED_MAX, 120, 10, 2_000);
const searchApiWindowMs = clampInt(process.env.SEARCH_API_WINDOW_MS, 60_000, 10_000, 10 * 60_000);
const searchApiMax = clampInt(process.env.SEARCH_API_MAX, 180, 20, 5_000);
const youtubeSearchCacheEnabled = parseRuntimeFlag(process.env.YOUTUBE_SEARCH_CACHE_ENABLED, true);
const youtubeSearchCacheTtlSeconds = clampInt(process.env.YOUTUBE_SEARCH_CACHE_TTL_SECONDS, 600, 10, 24 * 3600);
const youtubeChannelSearchCacheTtlSeconds = clampInt(process.env.YOUTUBE_CHANNEL_SEARCH_CACHE_TTL_SECONDS, 900, 10, 24 * 3600);
const youtubeSearchStaleMaxSeconds = clampInt(process.env.YOUTUBE_SEARCH_STALE_MAX_SECONDS, 86_400, 0, 7 * 24 * 3600);
const youtubeSearchDegradeEnabled = parseRuntimeFlag(process.env.YOUTUBE_SEARCH_DEGRADE_ENABLED, true);
const youtubeGlobalLiveCallsPerMinute = clampInt(process.env.YOUTUBE_GLOBAL_LIVE_CALLS_PER_MIN, 60, 1, 20_000);
const youtubeGlobalLiveCallsPerDay = clampInt(process.env.YOUTUBE_GLOBAL_LIVE_CALLS_PER_DAY, 20_000, 1, 5_000_000);
const youtubeGlobalCooldownSeconds = clampInt(process.env.YOUTUBE_GLOBAL_COOLDOWN_SECONDS, 600, 5, 24 * 3600);
const generationDailyCapConfig = readGenerationDailyCapConfigFromEnv(process.env);
const generationDailyCapService = createGenerationDailyCapService(generationDailyCapConfig);
const creditsReadWindowMs = clampInt(process.env.CREDITS_READ_WINDOW_MS, 60_000, 10_000, 10 * 60_000);
const creditsReadMaxPerWindow = clampInt(process.env.CREDITS_READ_MAX_PER_WINDOW, 180, 30, 2_000);
const ingestionLatestMineWindowMs = clampInt(process.env.INGESTION_LATEST_MINE_WINDOW_MS, 60_000, 10_000, 10 * 60_000);
const ingestionLatestMineMaxPerWindow = clampInt(process.env.INGESTION_LATEST_MINE_MAX_PER_WINDOW, 180, 30, 2_000);
const queueDepthHardLimit = clampInt(process.env.QUEUE_DEPTH_HARD_LIMIT, 1000, 10, 200_000);
const queueDepthPerUserLimit = clampInt(process.env.QUEUE_DEPTH_PER_USER_LIMIT, 50, 1, 10_000);
const queueWorkItemsHardLimit = clampInt(process.env.QUEUE_WORK_ITEMS_HARD_LIMIT, 250, 1, 200_000);
const queueWorkItemsPerUserLimit = clampInt(process.env.QUEUE_WORK_ITEMS_PER_USER_LIMIT, 40, 1, 10_000);
const queuePriorityEnabled = parseRuntimeFlag(process.env.QUEUE_PRIORITY_ENABLED, true);
const queueSweepHighBatch = clampInt(process.env.QUEUE_SWEEP_HIGH_BATCH, 10, 0, 200);
const queueSweepMediumBatch = clampInt(
  process.env.QUEUE_SWEEP_MEDIUM_BATCH,
  5,
  0,
  200,
);
const queueSweepLowBatch = clampInt(
  process.env.QUEUE_SWEEP_LOW_BATCH,
  2,
  0,
  200,
);
const queueLowPrioritySuppressionDepth = clampInt(
  process.env.QUEUE_LOW_PRIORITY_SUPPRESSION_DEPTH,
  100,
  0,
  200_000,
);
const workerConcurrency = clampInt(process.env.WORKER_CONCURRENCY, 2, 1, 16);
const workerBatchSize = clampInt(process.env.WORKER_BATCH_SIZE, 10, 1, 200);
const workerLeaseMs = clampInt(process.env.WORKER_LEASE_MS, 90_000, 5_000, 15 * 60_000);
const workerHeartbeatMs = clampInt(process.env.WORKER_HEARTBEAT_MS, 10_000, 1_000, 5 * 60_000);
const effectiveWorkerHeartbeatMs = resolveWorkerLeaseHeartbeatMs({
  workerLeaseMs,
  configuredHeartbeatMs: workerHeartbeatMs,
});
const workerKeepAliveDelayMs = clampInt(process.env.WORKER_KEEPALIVE_DELAY_MS, 1_500, 0, 60_000);
const workerIdleBackoffBaseMs = clampInt(process.env.WORKER_IDLE_BACKOFF_BASE_MS, 15_000, 1_000, 10 * 60_000);
const workerIdleBackoffMaxMs = clampInt(process.env.WORKER_IDLE_BACKOFF_MAX_MS, 60_000, workerIdleBackoffBaseMs, 30 * 60_000);
const jobExecutionTimeoutMs = clampInt(process.env.JOB_EXECUTION_TIMEOUT_MS, 180_000, 5_000, 10 * 60_000);
const youtubeRefreshEnabled = parseRuntimeFlag(process.env.YOUTUBE_REFRESH_ENABLED, true);
const youtubeRefreshIntervalMinutes = clampInt(process.env.YOUTUBE_REFRESH_INTERVAL_MINUTES, 10, 1, 120);
const youtubeRefreshQueueDepthGuard = clampInt(process.env.YOUTUBE_REFRESH_QUEUE_DEPTH_GUARD, 100, 1, 50_000);
const youtubeRefreshViewMaxPerCycle = clampInt(process.env.YOUTUBE_REFRESH_VIEW_MAX_PER_CYCLE, 15, 0, 500);
const youtubeRefreshCommentsMaxPerCycle = clampInt(process.env.YOUTUBE_REFRESH_COMMENTS_MAX_PER_CYCLE, 5, 0, 500);
const youtubeRefreshViewIntervalHours = clampInt(process.env.YOUTUBE_REFRESH_VIEW_INTERVAL_HOURS, 12, 1, 24 * 14);
const youtubeCommentsAutoFirstDelayMinutes = clampInt(process.env.YOUTUBE_COMMENTS_AUTO_FIRST_DELAY_MINUTES, 15, 1, 24 * 60);
const youtubeCommentsAutoSecondDelayHours = clampInt(process.env.YOUTUBE_COMMENTS_AUTO_SECOND_DELAY_HOURS, 24, 1, 24 * 30);
const youtubeCommentsManualCooldownMinutes = clampInt(
  process.env.YOUTUBE_COMMENTS_MANUAL_COOLDOWN_MINUTES,
  process.env.YOUTUBE_COMMENTS_MANUAL_COOLDOWN_HOURS
    ? clampInt(process.env.YOUTUBE_COMMENTS_MANUAL_COOLDOWN_HOURS, 24, 1, 24 * 30) * 60
    : 10,
  1,
  24 * 60,
);
const unlockIntakeEnabledRaw = String(process.env.UNLOCK_INTAKE_ENABLED || 'true').trim().toLowerCase();
const unlockIntakeEnabled = !(unlockIntakeEnabledRaw === 'false' || unlockIntakeEnabledRaw === '0' || unlockIntakeEnabledRaw === 'off');
const sourceUnlockReservationSeconds = clampInt(process.env.SOURCE_UNLOCK_RESERVATION_SECONDS, 300, 60, 3600);
const searchGenerateMaxItems = clampInt(process.env.SEARCH_GENERATE_MAX_ITEMS, 20, 1, 200);
const sourceUnlockGenerateMaxItems = clampInt(process.env.SOURCE_UNLOCK_GENERATE_MAX_ITEMS, 20, 1, 500);
const sourceAutoUnlockRetryDelaySeconds = clampInt(process.env.SOURCE_AUTO_UNLOCK_RETRY_DELAY_SECONDS, 90, 10, 3600);
const sourceAutoUnlockRetryMaxAttempts = clampInt(process.env.SOURCE_AUTO_UNLOCK_RETRY_MAX_ATTEMPTS, 3, 1, 10);
const sourceTranscriptRetryDelayAttempt1Seconds = clampInt(
  process.env.SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT1_SECONDS
    || process.env.SOURCE_TRANSCRIPT_RETRY_DELAY_SECONDS
    || process.env.SOURCE_AUTO_UNLOCK_TRANSCRIPT_RETRY_DELAY_SECONDS,
  300,
  30,
  24 * 3600,
);
const sourceTranscriptRetryDelayAttempt2Seconds = clampInt(
  process.env.SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT2_SECONDS,
  900,
  30,
  24 * 3600,
);
const sourceTranscriptRetryDelayAttempt3Seconds = clampInt(
  process.env.SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT3_SECONDS,
  2700,
  30,
  24 * 3600,
);
const transcriptAccessDeniedRetryEnabled = parseRuntimeFlag(
  process.env.TRANSCRIPT_ACCESS_DENIED_RETRY_ENABLED,
  true,
);
const sourceTranscriptAccessDeniedRetryDelayAttempt1Seconds = clampInt(
  process.env.SOURCE_TRANSCRIPT_ACCESS_DENIED_RETRY_DELAY_ATTEMPT1_SECONDS,
  120,
  5,
  24 * 3600,
);
const sourceTranscriptAccessDeniedRetryDelayAttempt2Seconds = clampInt(
  process.env.SOURCE_TRANSCRIPT_ACCESS_DENIED_RETRY_DELAY_ATTEMPT2_SECONDS,
  900,
  5,
  24 * 3600,
);
const sourceTranscriptAccessDeniedRetryDelayAttempt3Seconds = clampInt(
  process.env.SOURCE_TRANSCRIPT_ACCESS_DENIED_RETRY_DELAY_ATTEMPT3_SECONDS,
  7200,
  5,
  24 * 3600,
);
const sourceTranscriptMaxAttempts = clampInt(process.env.SOURCE_TRANSCRIPT_MAX_ATTEMPTS, 3, 1, 10);
const transcriptFailFastEnabled = parseRuntimeFlag(process.env.TRANSCRIPT_FAIL_FAST_ENABLED, true);
const sourceUnlockExpiredSweepBatch = clampInt(process.env.SOURCE_UNLOCK_EXPIRED_SWEEP_BATCH, 100, 10, 1000);
const sourceUnlockSweepsEnabledRaw = String(process.env.SOURCE_UNLOCK_SWEEPS_ENABLED || 'true').trim().toLowerCase();
const sourceUnlockSweepsEnabled = !(sourceUnlockSweepsEnabledRaw === 'false' || sourceUnlockSweepsEnabledRaw === '0' || sourceUnlockSweepsEnabledRaw === 'off');
const sourceUnlockSweepBatch = clampInt(process.env.SOURCE_UNLOCK_SWEEP_BATCH, 100, 10, 1000);
const sourceUnlockProcessingStaleMs = clampInt(process.env.SOURCE_UNLOCK_PROCESSING_STALE_MS, 10 * 60_000, 60_000, 24 * 60 * 60 * 1000);
const sourceUnlockSweepMinIntervalMs = clampInt(process.env.SOURCE_UNLOCK_SWEEP_MIN_INTERVAL_MS, 30_000, 1_000, 10 * 60_000);
const sourceUnlockSweepDryLogsRaw = String(process.env.SOURCE_UNLOCK_SWEEP_DRY_LOGS || 'true').trim().toLowerCase();
const sourceUnlockSweepDryLogs = !(sourceUnlockSweepDryLogsRaw === 'false' || sourceUnlockSweepDryLogsRaw === '0' || sourceUnlockSweepDryLogsRaw === 'off');
const sourcePageAssetSweepEnabledRaw = String(process.env.SOURCE_PAGE_ASSET_SWEEP_ENABLED || 'true').trim().toLowerCase();
const sourcePageAssetSweepEnabled = !(sourcePageAssetSweepEnabledRaw === 'false' || sourcePageAssetSweepEnabledRaw === '0' || sourcePageAssetSweepEnabledRaw === 'off');
const sourcePageAssetSweepBatch = clampInt(process.env.SOURCE_PAGE_ASSET_SWEEP_BATCH, 100, 10, 1000);
const sourcePageAssetSweepMinIntervalMs = clampInt(process.env.SOURCE_PAGE_ASSET_SWEEP_MIN_INTERVAL_MS, 60_000, 5_000, 10 * 60_000);
const refreshFailureCooldownHours = clampInt(process.env.REFRESH_FAILURE_COOLDOWN_HOURS, 6, 1, 168);
const ingestionStaleRunningMs = clampInt(process.env.INGESTION_STALE_RUNNING_MS, 30 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000);
const autoBannerMode = normalizeAutoBannerMode(process.env.SUBSCRIPTION_AUTO_BANNER_MODE);
const autoBannerCap = clampInt(process.env.SUBSCRIPTION_AUTO_BANNER_CAP, 1000, 1, 25_000);
const autoBannerMaxAttempts = clampInt(process.env.SUBSCRIPTION_AUTO_BANNER_MAX_ATTEMPTS, 3, 1, 10);
const autoBannerTimeoutMs = clampInt(process.env.SUBSCRIPTION_AUTO_BANNER_TIMEOUT_MS, 12_000, 1_000, 120_000);
const autoBannerBatchSize = clampInt(process.env.SUBSCRIPTION_AUTO_BANNER_BATCH_SIZE, 20, 1, 200);
const autoBannerConcurrency = clampInt(process.env.SUBSCRIPTION_AUTO_BANNER_CONCURRENCY, 1, 1, 5);
const autoBannerStaleRunningMs = clampInt(process.env.AUTO_BANNER_STALE_RUNNING_MS, 20 * 60 * 1000, 60_000, 24 * 60 * 60 * 1000);
const notificationPushConfig = readNotificationPushConfigFromEnv(process.env);
const notificationPushEnabled = notificationPushConfig.enabled;
const notificationPushSender = createNotificationPushSender(notificationPushConfig);
const notificationPushDispatchIntervalMs = 15_000;
const notificationPushBatchSize = 10;
const notificationPushMaxAttempts = 3;
const notificationPushProcessingStaleMs = 5 * 60 * 1000;
const runtimeConfig = (() => {
  try {
    return readBackendRuntimeConfig(process.env);
  } catch {
    console.error('[agentic-backend] invalid runtime mode: both RUN_HTTP_SERVER and RUN_INGESTION_WORKER are disabled');
    process.exit(1);
  }
})();
const { runHttpServer, runIngestionWorker, runtimeMode } = runtimeConfig;
const debugEndpointsEnabledRaw = String(process.env.ENABLE_DEBUG_ENDPOINTS || 'false').trim().toLowerCase();
const debugEndpointsEnabled = debugEndpointsEnabledRaw === 'true' || debugEndpointsEnabledRaw === '1' || debugEndpointsEnabledRaw === 'on';
const youtubeDataApiKey = String(process.env.YOUTUBE_DATA_API_KEY || '').trim();
const generationDurationPolicy = readVideoDurationPolicyFromEnv(process.env);
const generationDurationCapEnabled = generationDurationPolicy.enabled;
const generationMaxVideoSeconds = generationDurationPolicy.maxSeconds;
const generationBlockUnknownDuration = generationDurationPolicy.blockUnknown;
const generationDurationLookupTimeoutMs = generationDurationPolicy.lookupTimeoutMs;
const transcriptPruningConfigResult = readTranscriptPruningConfigFromEnv(process.env);
const transcriptPruningConfig = transcriptPruningConfigResult.config;
const generationTierConfig = readGenerationTierConfigFromEnv(process.env);
const resolveGenerationTierAccess = createGenerationTierAccessResolver(generationTierConfig);
function isDualGenerateEnabledForUser(_input?: {
  userId?: string | null;
  scope?: 'queue' | 'direct' | null;
}) {
  return false;
}

function normalizeReasoningEffort(raw: unknown, fallback: 'none' | 'low' | 'medium' | 'high' | 'xhigh') {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'none') return 'none';
  if (normalized === 'low') return 'low';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'high') return 'high';
  if (normalized === 'xhigh') return 'xhigh';
  return fallback;
}

type GenerationModelProfile = {
  model: string;
  fallbackModel: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
};

const generationTierFreeProfile: GenerationModelProfile = {
  model: String(process.env.GENERATION_TIER_FREE_MODEL || 'gpt-5-mini').trim() || 'gpt-5-mini',
  fallbackModel: String(process.env.GENERATION_TIER_FREE_FALLBACK_MODEL || process.env.OPENAI_GENERATION_FALLBACK_MODEL || 'o4-mini').trim() || 'o4-mini',
  reasoningEffort: normalizeReasoningEffort(
    process.env.GENERATION_TIER_FREE_REASONING_EFFORT,
    normalizeReasoningEffort(process.env.OPENAI_GENERATION_REASONING_EFFORT, 'medium'),
  ),
};

const generationTierTierProfile: GenerationModelProfile = {
  model: String(process.env.GENERATION_TIER_TIER_MODEL || 'gpt-5.2').trim() || 'gpt-5.2',
  fallbackModel: String(process.env.GENERATION_TIER_TIER_FALLBACK_MODEL || process.env.OPENAI_GENERATION_FALLBACK_MODEL || 'o4-mini').trim() || 'o4-mini',
  reasoningEffort: normalizeReasoningEffort(
    process.env.GENERATION_TIER_TIER_REASONING_EFFORT,
    'low',
  ),
};

const CANONICAL_GENERATION_TIER: GenerationTier = 'tier';

function resolveGenerationModelProfile(tier: GenerationTier): GenerationModelProfile {
  return generationTierTierProfile;
}

const youtubeBlueprintPromptTemplatePath = String(
  process.env.YOUTUBE_BLUEPRINT_PROMPT_TEMPLATE_PATH
  || YOUTUBE_BLUEPRINT_PROMPT_TEMPLATE_PATH_DEFAULT
).trim();

const useCodexForGenerationRaw = String(process.env.USE_CODEX_FOR_GENERATION || 'false').trim().toLowerCase();
const useCodexForGeneration = (
  useCodexForGenerationRaw === 'true'
  || useCodexForGenerationRaw === '1'
  || useCodexForGenerationRaw === 'yes'
  || useCodexForGenerationRaw === 'on'
);
const codexExecPath = String(process.env.CODEX_EXEC_PATH || 'codex').trim() || 'codex';
const codexExecTimeoutMs = clampInt(process.env.CODEX_EXEC_TIMEOUT_MS, 90_000, 10_000, 10 * 60 * 1000);
const codexExecReasoningEffort = normalizeReasoningEffort(process.env.CODEX_EXEC_REASONING_EFFORT, 'low');
const codexExecReasoningEffortFree = normalizeReasoningEffort(
  process.env.CODEX_EXEC_REASONING_EFFORT_FREE,
  codexExecReasoningEffort,
);
const codexExecReasoningEffortTier = normalizeReasoningEffort(
  process.env.CODEX_EXEC_REASONING_EFFORT_TIER,
  codexExecReasoningEffort,
);
const codexFallbackEnabledRaw = String(process.env.CODEX_FALLBACK_ENABLED || 'true').trim().toLowerCase();
const codexFallbackEnabled = !(
  codexFallbackEnabledRaw === 'false'
  || codexFallbackEnabledRaw === '0'
  || codexFallbackEnabledRaw === 'off'
  || codexFallbackEnabledRaw === 'no'
);
const codexCircuitFailureThreshold = clampInt(process.env.CODEX_CIRCUIT_FAILURE_THRESHOLD, 5, 1, 100);
const codexCircuitCooldownMs = clampInt(process.env.CODEX_CIRCUIT_COOLDOWN_MS, 300_000, 5_000, 24 * 60 * 60 * 1000);
const codexExecLaneConcurrencyRaw = clampInt(process.env.CODEX_EXEC_LANE_CONCURRENCY, 1, 1, 8);
const codexExecLaneConcurrency = 1;

type CodexModelProfile = {
  model: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
};

const codexFreeModelRaw = String(process.env.CODEX_FREE_MODEL || '').trim();
const codexTierModelRaw = String(process.env.CODEX_TIER_MODEL || '').trim();
const codexFreeProfile: CodexModelProfile = {
  model: codexFreeModelRaw || generationTierFreeProfile.model,
  reasoningEffort: codexExecReasoningEffortFree,
};
const codexTierProfile: CodexModelProfile = {
  model: codexTierModelRaw || generationTierTierProfile.model,
  reasoningEffort: codexExecReasoningEffortTier,
};

function resolveCodexModelProfile(tier: GenerationTier): CodexModelProfile {
  return codexTierProfile;
}

if (generationDurationCapEnabled && !youtubeDataApiKey && generationBlockUnknownDuration) {
  console.warn('[duration_policy] cap enabled without YOUTUBE_DATA_API_KEY; unknown durations will be blocked.');
}
const googleOAuthClientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
const googleOAuthClientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
const youtubeOAuthRedirectUri = String(process.env.YOUTUBE_OAUTH_REDIRECT_URI || '').trim();
const youtubeOAuthScopes = String(process.env.YOUTUBE_OAUTH_SCOPES || 'https://www.googleapis.com/auth/youtube.readonly')
  .split(/[,\s]+/)
  .map((scope) => scope.trim())
  .filter(Boolean);
const tokenEncryptionKey = String(process.env.TOKEN_ENCRYPTION_KEY || '').trim();
const youtubeImportMaxChannels = clampInt(process.env.YOUTUBE_IMPORT_MAX_CHANNELS, 2000, 50, 10_000);
const youtubeOAuthStateTtlSeconds = clampInt(process.env.YOUTUBE_OAUTH_STATE_TTL_SECONDS, 600, 60, 3600);
const autoChannelPipelineEnabledRaw = String(process.env.AUTO_CHANNEL_PIPELINE_ENABLED || 'false').trim().toLowerCase();
const autoChannelPipelineEnabled = autoChannelPipelineEnabledRaw === 'true' || autoChannelPipelineEnabledRaw === '1' || autoChannelPipelineEnabledRaw === 'on';
const autoChannelDefaultSlug = String(process.env.AUTO_CHANNEL_DEFAULT_SLUG || 'general').trim().toLowerCase() || 'general';
const autoChannelClassifierModeRaw = String(process.env.AUTO_CHANNEL_CLASSIFIER_MODE || 'deterministic_v1').trim().toLowerCase();
const autoChannelClassifierMode = autoChannelClassifierModeRaw === 'general_placeholder'
  ? 'general_placeholder'
  : autoChannelClassifierModeRaw === 'llm_labeler_v1'
    ? 'llm_labeler_v1'
    : 'deterministic_v1';
const autoChannelFallbackSlug = String(process.env.AUTO_CHANNEL_FALLBACK_SLUG || autoChannelDefaultSlug).trim().toLowerCase() || 'general';
const autoChannelLegacyManualFlowEnabledRaw = String(process.env.AUTO_CHANNEL_LEGACY_MANUAL_FLOW_ENABLED || 'true').trim().toLowerCase();
const autoChannelLegacyManualFlowEnabled = !(autoChannelLegacyManualFlowEnabledRaw === 'false' || autoChannelLegacyManualFlowEnabledRaw === '0' || autoChannelLegacyManualFlowEnabledRaw === 'off');
const autoChannelGateMode = normalizeGateMode(process.env.AUTO_CHANNEL_GATE_MODE, 'enforce');
const providerRetryDefaults = getProviderRetryDefaults();
const transcriptThrottleEnabledRaw = String(process.env.TRANSCRIPT_THROTTLE_ENABLED || 'false').trim().toLowerCase();
const transcriptThrottleEnabled = (
  transcriptThrottleEnabledRaw === 'true'
  || transcriptThrottleEnabledRaw === '1'
  || transcriptThrottleEnabledRaw === 'yes'
  || transcriptThrottleEnabledRaw === 'on'
);
const transcriptThrottleTierDefaults = [3000, 10_000, 30_000, 60_000];
const transcriptThrottleTiersRaw = String(process.env.TRANSCRIPT_THROTTLE_TIERS_MS || '').trim();
const transcriptThrottleTierValues = transcriptThrottleTiersRaw
  .split(',')
  .map((value) => clampInt(value, 0, 0, 24 * 60 * 60 * 1000))
  .filter((value) => value > 0);
const transcriptThrottleTiersMs = transcriptThrottleTierValues.length > 0
  ? transcriptThrottleTierValues
  : transcriptThrottleTierDefaults;
const transcriptThrottleTierParseWarn = transcriptThrottleTiersRaw.length > 0 && transcriptThrottleTierValues.length === 0;
const transcriptThrottleJitterMs = clampInt(process.env.TRANSCRIPT_THROTTLE_JITTER_MS, 500, 0, 5000);
const transcriptThrottleInteractiveMaxWaitMs = clampInt(process.env.TRANSCRIPT_THROTTLE_INTERACTIVE_MAX_WAIT_MS, 2000, 100, 60_000);
const youtubeOAuthConfig: YouTubeOAuthConfig = {
  clientId: googleOAuthClientId,
  clientSecret: googleOAuthClientSecret,
  redirectUri: youtubeOAuthRedirectUri,
  scopes: youtubeOAuthScopes,
};
const youtubeOAuthConfigured = isYouTubeOAuthConfigured(youtubeOAuthConfig);

if (!youtubeDataApiKey) {
  console.warn('[youtube-search] YOUTUBE_DATA_API_KEY is not configured. Video lookup will use helper providers only; channel search remains disabled.');
}

if (!youtubeOAuthConfigured) {
  console.warn('[youtube-oauth] Google OAuth env is incomplete. /api/youtube/connection* and /api/youtube/subscriptions* will return YT_OAUTH_NOT_CONFIGURED.');
}

if (!tokenEncryptionKey) {
  console.warn('[youtube-oauth] TOKEN_ENCRYPTION_KEY is not configured. YouTube connection endpoints will return YT_OAUTH_NOT_CONFIGURED.');
}

if (youtubeBlueprintPromptTemplatePath) {
  const resolvedTemplatePath = path.isAbsolute(youtubeBlueprintPromptTemplatePath)
    ? youtubeBlueprintPromptTemplatePath
    : path.resolve(process.cwd(), youtubeBlueprintPromptTemplatePath);
  if (!fs.existsSync(resolvedTemplatePath)) {
    console.warn(`[yt2bp_prompt] YOUTUBE_BLUEPRINT_PROMPT_TEMPLATE_PATH not found: ${resolvedTemplatePath}`);
  }
}

if (transcriptThrottleTierParseWarn) {
  console.warn('[transcript-throttle] TRANSCRIPT_THROTTLE_TIERS_MS is invalid. Falling back to defaults 3000,10000,30000,60000.');
}

for (const warning of transcriptPruningConfigResult.warnings) {
  console.warn(`[yt2bp_transcript_prune] ${warning}`);
}

if (generationTierConfig.testModeEnabled && generationTierConfig.tierUserIds.size === 0) {
  console.warn('[generation-tier] test mode is enabled but GENERATION_TIER_TIER_USER_IDS is empty; all users remain free-tier only.');
}

if (useCodexForGeneration && !codexFreeModelRaw) {
  console.warn('[codex_generation] CODEX_FREE_MODEL is empty. Falling back to free tier API model name.');
}

if (useCodexForGeneration && !codexTierModelRaw) {
  console.warn('[codex_generation] CODEX_TIER_MODEL is empty. Falling back to tier API model name.');
}

if (codexExecLaneConcurrencyRaw !== 1) {
  console.warn('[codex_generation] CODEX_EXEC_LANE_CONCURRENCY is forced to 1 for MVP safety.');
}

let codexBinaryAvailable = false;
if (useCodexForGeneration) {
  const probe = spawnSync(codexExecPath, ['--version'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  codexBinaryAvailable = probe.status === 0;
  if (!codexBinaryAvailable) {
    console.warn('[codex_generation] USE_CODEX_FOR_GENERATION enabled but codex binary is unavailable. API fallback-only mode will be used.');
  }
}

if (autoBannerMode !== 'off' && !String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
  console.warn('[auto-banner] SUBSCRIPTION_AUTO_BANNER_MODE is enabled but SUPABASE_SERVICE_ROLE_KEY is missing. Worker and uploads will be disabled.');
}

const QUEUED_INGESTION_SCOPES = [
  'source_item_unlock_generation',
  'source_auto_unlock_retry',
  'source_transcript_revalidate',
  'blueprint_youtube_enrichment',
  'blueprint_youtube_refresh',
  'search_video_generate',
  'manual_refresh_selection',
  'all_active_subscriptions',
] as const;
type QueuedIngestionScope = (typeof QUEUED_INGESTION_SCOPES)[number];

function getQueueSweepConfigByTier(tier: QueuePriorityTier) {
  if (tier === 'high') return queueSweepHighBatch;
  if (tier === 'medium') return queueSweepMediumBatch;
  return queueSweepLowBatch;
}

function getQueueSweepPlan() {
  if (!queuePriorityEnabled) {
    return [{
      tier: 'high' as QueuePriorityTier,
      scopes: [...QUEUED_INGESTION_SCOPES],
      maxJobs: workerBatchSize,
    }];
  }

  const plan = listQueuePriorityTiersInOrder().map((tier) => ({
    tier,
    scopes: filterScopesByQueuePriorityTier(QUEUED_INGESTION_SCOPES, tier),
    maxJobs: getQueueSweepConfigByTier(tier),
  })).filter((row) => row.scopes.length > 0 && row.maxJobs > 0);

  if (plan.length > 0) {
    return plan;
  }

  return [{
    tier: 'high' as QueuePriorityTier,
    scopes: [...QUEUED_INGESTION_SCOPES],
    maxJobs: workerBatchSize,
  }];
}

const queuedWorkerId = `ingestion-worker-${process.pid}`;

function normalizeGateMode(raw: unknown, fallback: GateMode): GateMode {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'bypass') return 'bypass';
  if (normalized === 'shadow') return 'shadow';
  if (normalized === 'enforce') return 'enforce';
  return fallback;
}

function getRetryAfterSeconds(req: express.Request) {
  const resetTime = (req as express.Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  if (!resetTime) return undefined;
  const seconds = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
  return Number.isFinite(seconds) ? seconds : undefined;
}

function yt2bpRateLimitHandler(
  limiter: 'anon' | 'auth' | 'ip_hourly',
  req: express.Request,
  res: express.Response,
) {
  const retryAfter = getRetryAfterSeconds(req);
  res.locals.rateLimited = true;
  res.locals.rateLimiter = limiter;
  res.locals.bucketErrorCode = 'RATE_LIMITED';
  return res.status(429).json({
    ok: false,
    error_code: 'RATE_LIMITED',
    message: 'Too many requests right now. Please wait a bit and try again.',
    retry_after_seconds: retryAfter,
    run_id: null,
  });
}

const yt2bpAnonLimiter = rateLimit({
  windowMs: 60_000,
  max: yt2bpAnonLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skip: (_req, res) => !!(res.locals.user as { id?: string } | undefined)?.id,
  handler: (req, res) => yt2bpRateLimitHandler('anon', req, res),
});

const yt2bpAuthLimiter = rateLimit({
  windowMs: 60_000,
  max: yt2bpAuthLimitPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    const user = res.locals.user as { id?: string } | undefined;
    return user?.id || req.ip;
  },
  skip: (_req, res) => !(res.locals.user as { id?: string } | undefined)?.id,
  handler: (req, res) => yt2bpRateLimitHandler('auth', req, res),
});

const yt2bpIpHourlyLimiter = rateLimit({
  windowMs: 3_600_000,
  max: yt2bpIpLimitPerHour,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => yt2bpRateLimitHandler('ip_hourly', req, res),
});

function getUserOrIpRateLimitKey(req: express.Request, res: express.Response) {
  const user = res.locals.user as { id?: string } | undefined;
  return user?.id ? `user:${user.id}` : req.ip;
}

function refreshRateLimitHandler(kind: 'scan' | 'generate', req: express.Request, res: express.Response) {
  const retryAfter = getRetryAfterSeconds(req);
  const message = kind === 'scan'
    ? 'Refresh scan is cooling down. Please retry shortly.'
    : 'Background generation is cooling down. Please retry shortly.';
  return res.status(429).json({
    ok: false,
    error_code: 'RATE_LIMITED',
    message,
    retry_after_seconds: retryAfter,
    data: null,
  });
}

const refreshScanLimiter = rateLimit({
  windowMs: refreshScanCooldownMs,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => refreshRateLimitHandler('scan', req, res),
});

const refreshGenerateLimiter = rateLimit({
  windowMs: refreshGenerateCooldownMs,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => refreshRateLimitHandler('generate', req, res),
});

function sourceVideoRateLimitHandler(
  kind: 'list_burst' | 'list_sustained' | 'unlock_burst' | 'unlock_sustained',
  req: express.Request,
  res: express.Response,
) {
  const retryAfter = getRetryAfterSeconds(req);
  const message = kind === 'list_burst'
    ? 'Video library listing is cooling down. Please wait a few seconds.'
    : kind === 'list_sustained'
      ? 'Video library request limit reached. Please retry in a moment.'
      : 'Too many unlock requests, retry shortly.';
  return res.status(429).json({
    ok: false,
    error_code: 'RATE_LIMITED',
    message,
    retry_after_seconds: retryAfter,
    data: null,
  });
}

function searchRateLimitHandler(req: express.Request, res: express.Response) {
  const retryAfter = getRetryAfterSeconds(req);
  return res.status(429).json({
    ok: false,
    error_code: 'RATE_LIMITED',
    message: 'Search is cooling down. Please retry shortly.',
    retry_after_seconds: retryAfter,
    data: null,
  });
}

const searchApiLimiter = rateLimit({
  windowMs: searchApiWindowMs,
  max: searchApiMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => searchRateLimitHandler(req, res),
});

const sourceVideoListBurstLimiter = rateLimit({
  windowMs: sourceVideoListBurstWindowMs,
  max: sourceVideoListBurstMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => sourceVideoRateLimitHandler('list_burst', req, res),
});

const sourceVideoListSustainedLimiter = rateLimit({
  windowMs: sourceVideoListSustainedWindowMs,
  max: sourceVideoListSustainedMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => sourceVideoRateLimitHandler('list_sustained', req, res),
});

const sourceVideoUnlockBurstLimiter = rateLimit({
  windowMs: sourceVideoUnlockBurstWindowMs,
  max: sourceVideoUnlockBurstMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => sourceVideoRateLimitHandler('unlock_burst', req, res),
});

const sourceVideoUnlockSustainedLimiter = rateLimit({
  windowMs: sourceVideoUnlockSustainedWindowMs,
  max: sourceVideoUnlockSustainedMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => sourceVideoRateLimitHandler('unlock_sustained', req, res),
});

function readEndpointRateLimitHandler(kind: 'credits' | 'ingestion_latest_mine', req: express.Request, res: express.Response) {
  const retryAfter = getRetryAfterSeconds(req);
  const message = kind === 'credits'
    ? 'Credits are refreshing too frequently. Please retry shortly.'
    : 'Job status is refreshing too frequently. Please retry shortly.';
  return res.status(429).json({
    ok: false,
    error_code: 'RATE_LIMITED',
    message,
    retry_after_seconds: retryAfter,
    data: null,
  });
}

const creditsReadLimiter = rateLimit({
  windowMs: creditsReadWindowMs,
  max: creditsReadMaxPerWindow,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => readEndpointRateLimitHandler('credits', req, res),
});

const ingestionLatestMineLimiter = rateLimit({
  windowMs: ingestionLatestMineWindowMs,
  max: ingestionLatestMineMaxPerWindow,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => readEndpointRateLimitHandler('ingestion_latest_mine', req, res),
});

function youtubeConnectionRateLimitHandler(kind: 'start' | 'preview' | 'import' | 'disconnect', req: express.Request, res: express.Response) {
  const retryAfter = getRetryAfterSeconds(req);
  const message = kind === 'start'
    ? 'Connect is cooling down. Please retry shortly.'
    : kind === 'preview'
      ? 'Import preview is cooling down. Please retry shortly.'
      : kind === 'import'
        ? 'Import is cooling down. Please retry shortly.'
        : 'Disconnect is cooling down. Please retry shortly.';

  return res.status(429).json({
    ok: false,
    error_code: 'RATE_LIMITED',
    message,
    retry_after_seconds: retryAfter,
    data: null,
  });
}

const youtubeConnectStartLimiter = rateLimit({
  windowMs: 15_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => youtubeConnectionRateLimitHandler('start', req, res),
});

const youtubePreviewLimiter = rateLimit({
  windowMs: 30_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => youtubeConnectionRateLimitHandler('preview', req, res),
});

const publicYouTubePreviewLimiter = rateLimit({
  windowMs: 5_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => youtubeConnectionRateLimitHandler('preview', req, res),
});

const youtubeImportLimiter = rateLimit({
  windowMs: 30_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => youtubeConnectionRateLimitHandler('import', req, res),
});

const youtubeDisconnectLimiter = rateLimit({
  windowMs: 15_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => getUserOrIpRateLimitKey(req, res),
  handler: (req, res) => youtubeConnectionRateLimitHandler('disconnect', req, res),
});

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const extra = [
      res.locals.bucketErrorCode ? `bucket_error_code=${String(res.locals.bucketErrorCode)}` : '',
      res.locals.rateLimited ? `rate_limited=${String(res.locals.rateLimited)}` : '',
      res.locals.rateLimiter ? `limiter=${String(res.locals.rateLimiter)}` : '',
    ].filter(Boolean);
    const line = [
      req.ip,
      req.method,
      req.originalUrl,
      res.statusCode,
      `${durationMs.toFixed(1)}ms`,
      ...extra,
    ].join(' ');
    console.log(line);
  });
  next();
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/api/health') return next();
  const isDebugSimulationRoute = /^\/api\/debug\/subscriptions\/[^/]+\/simulate-new-uploads$/.test(req.path);
  const isDebugResetTranscriptProxyRoute = req.method === 'POST' && req.path === '/api/debug/transcript/reset-proxy';
  const isPublicProfileFeedRoute = /^\/api\/profile\/[^/]+\/feed$/.test(req.path);
  const isPublicProfileHistoryRoute = /^\/api\/profile\/[^/]+\/history$/.test(req.path);
  const isPublicSourcePageSearchRoute = req.method === 'GET' && req.path === '/api/source-pages/search';
  const isPublicSourcePageRoute = req.method === 'GET' && /^\/api\/source-pages\/[^/]+\/[^/]+$/.test(req.path);
  const isPublicSourcePageBlueprintFeedRoute = req.method === 'GET' && /^\/api\/source-pages\/[^/]+\/[^/]+\/blueprints$/.test(req.path);
  const allowsAnonymous = req.path === '/api/youtube-to-blueprint'
    || req.path === '/api/youtube/connection/callback'
    || req.path === '/api/ingestion/jobs/trigger'
    || req.path === '/api/ingestion/jobs/latest'
    || req.path === '/api/ops/queue/health'
    || req.path === '/api/source-pages/assets/sweep'
    || req.path === '/api/auto-banner/jobs/trigger'
    || req.path === '/api/auto-banner/jobs/latest'
    || isPublicProfileFeedRoute
    || isPublicProfileHistoryRoute
    || isPublicSourcePageSearchRoute
    || isPublicSourcePageRoute
    || isPublicSourcePageBlueprintFeedRoute
    || (debugEndpointsEnabled && isDebugResetTranscriptProxyRoute)
    || (debugEndpointsEnabled && isDebugSimulationRoute);

  if (!supabaseClient) {
    if (allowsAnonymous) return next();
    return res.status(500).json({ error: 'Auth not configured' });
  }

  const authHeader = req.header('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    if (allowsAnonymous) return next();
    console.warn('[auth] unauthorized_request_missing_token', {
      method: req.method,
      path: req.path,
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  supabaseClient.auth.getUser(token)
    .then(({ data, error }) => {
      if (error || !data.user) {
        console.warn('[auth] unauthorized_request_invalid_token', {
          method: req.method,
          path: req.path,
          reason: error?.message || 'no_user',
          token_length: token.length,
        });
        return res.status(401).json({ error: 'Unauthorized' });
      }
      res.locals.user = data.user;
      res.locals.authToken = token;
      return next();
    })
    .catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : 'lookup_failed';
      console.warn('[auth] unauthorized_request_lookup_failed', {
        method: req.method,
        path: req.path,
        reason,
        token_length: token.length,
      });
      return res.status(401).json({ error: 'Unauthorized' });
    });
});

const SelectedItemSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    context: z.string().optional(),
  }),
]);

const BlueprintReviewSchema = z.object({
  title: z.string().min(1),
  inventoryTitle: z.string().min(1),
  selectedItems: z.record(z.array(SelectedItemSchema)),
  mixNotes: z.string().optional(),
  reviewPrompt: z.string().optional(),
  reviewSections: z.array(z.string()).optional(),
  includeScore: z.boolean().optional(),
});

const BannerRequestSchema = z.object({
  title: z.string().min(1),
  inventoryTitle: z.string().optional(),
  tags: z.array(z.string()).optional(),
  // Seed pipelines may want to generate without writing to Storage.
  dryRun: z.boolean().optional(),
});

const YouTubeToBlueprintRequestSchema = z.object({
  video_url: z.string().min(1),
  generate_review: z.boolean().default(false),
  generate_banner: z.boolean().default(false),
  source: z.literal('youtube_mvp').default('youtube_mvp'),
  requested_tier: z.enum(['free', 'tier']).optional(),
});
const GENERIC_YT2BP_FAILURE_MESSAGE = 'Could not complete the blueprint. Please test another video.';

const YouTubeConnectionStartSchema = z.object({
  return_to: z.string().url().optional(),
});

const YouTubeSubscriptionsImportSchema = z.object({
  channels: z.array(
    z.object({
      channel_id: z.string().min(1),
      channel_url: z.string().url().optional(),
      channel_title: z.string().optional(),
    }),
  ).min(1).max(5000),
});

const SourcePageVideosGenerateSchema = z.object({
  items: z.array(
    z.object({
      video_id: z.string().min(1),
      video_url: z.string().url(),
      title: z.string().min(1),
      published_at: z.string().optional().nullable(),
      thumbnail_url: z.string().url().optional().nullable(),
      duration_seconds: z.number().int().min(0).nullable().optional(),
    }),
  ).min(1).max(500),
  requested_tier: z.enum(['free', 'tier']).optional(),
});

const SearchVideosGenerateSchema = z.object({
  items: z.array(
    z.object({
      video_id: z.string().min(1),
      video_url: z.string().url(),
      title: z.string().min(1),
      channel_id: z.string().min(1),
      channel_title: z.string().nullable().optional(),
      channel_url: z.string().nullable().optional(),
      published_at: z.string().nullable().optional(),
      thumbnail_url: z.string().nullable().optional(),
      duration_seconds: z.number().int().min(0).nullable().optional(),
    }),
  ).min(1).max(50),
  requested_tier: z.enum(['free', 'tier']).optional(),
});

type YouTubeDraftStep = {
  name: string;
  notes: string;
  timestamp: string | null;
};

type YouTubeDraft = {
  title: string;
  description: string;
  steps: YouTubeDraftStep[];
  notes: string | null;
  tags: string[];
  sectionsJson: BlueprintSectionsV1 | null;
  summaryVariants: {
    default: string;
    eli5: string;
  };
};

type QualityCriterion = {
  id: string;
  text: string;
  required: boolean;
  min_score: number;
};

type Yt2bpQualityConfig = {
  enabled: boolean;
  judge_model: string;
  prompt_version: string;
  scale: { min: number; max: number };
  retry_policy: { max_retries: number; selection: 'best_overall' };
  criteria: QualityCriterion[];
};

type SafetyCriterion = {
  id: string;
  text: string;
  required: boolean;
};

type Yt2bpContentSafetyConfig = {
  enabled: boolean;
  judge_model: string;
  prompt_version: string;
  retry_policy: { max_retries: number; selection: 'first_pass' };
  criteria: SafetyCriterion[];
};

const QualityJudgeResponseSchema = z.object({
  scores: z.array(
    z.object({
      id: z.string().min(1),
      score: z.number().finite(),
    })
  ),
  overall: z.number().finite().optional(),
});

const ContentSafetyJudgeResponseSchema = z.object({
  criteria: z.array(
    z.object({
      id: z.string().min(1),
      pass: z.boolean(),
      rationale: z.string().optional(),
    })
  ),
  blocked: z.boolean(),
});

function readYt2bpQualityConfig(): Yt2bpQualityConfig {
  const fallback: Yt2bpQualityConfig = {
    enabled: true,
    judge_model: 'o4-mini',
    prompt_version: 'yt2bp_quality_v0',
    scale: { min: 0, max: 5 },
    retry_policy: { max_retries: 1, selection: 'best_overall' },
    criteria: [
      { id: 'step_purpose_clarity', text: 'Each step has a clear purpose.', required: true, min_score: 3.5 },
      { id: 'step_actionability', text: 'Steps are actionable and specific.', required: true, min_score: 3.5 },
      { id: 'step_redundancy_control', text: 'Steps are not overly redundant or fragmented.', required: true, min_score: 3.5 },
      { id: 'sequence_progression', text: 'Steps follow a natural and coherent progression.', required: true, min_score: 3.5 },
      { id: 'coverage_sufficiency', text: 'The set covers core actions without critical gaps.', required: true, min_score: 3.5 },
    ],
  };

  const configPath = path.join(process.cwd(), 'eval', 'methods', 'v0', 'llm_blueprint_quality_v0', 'global_pack_v0.json');
  let loaded = fallback;
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      loaded = {
        ...fallback,
        ...parsed,
        scale: { ...fallback.scale, ...(parsed?.scale || {}) },
        retry_policy: { ...fallback.retry_policy, ...(parsed?.retry_policy || {}) },
        criteria: Array.isArray(parsed?.criteria) ? parsed.criteria : fallback.criteria,
      };
    } catch {
      loaded = fallback;
    }
  }

  const envEnabledRaw = String(process.env.YT2BP_QUALITY_ENABLED ?? '').trim().toLowerCase();
  const enabled =
    envEnabledRaw === ''
      ? Boolean(loaded.enabled)
      : !(envEnabledRaw === '0' || envEnabledRaw === 'false' || envEnabledRaw === 'off' || envEnabledRaw === 'no');

  const envModel = String(process.env.YT2BP_QUALITY_MODEL || '').trim();
  const envMaxRetriesRaw = Number(process.env.YT2BP_QUALITY_MAX_RETRIES);
  const envMinScoreRaw = Number(process.env.YT2BP_QUALITY_MIN_SCORE);
  const envMinScore = Number.isFinite(envMinScoreRaw) ? envMinScoreRaw : null;

  const min = Number(loaded.scale?.min ?? 0);
  const max = Number(loaded.scale?.max ?? 5);
  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  const criteria = (loaded.criteria || [])
    .map((c) => ({
      id: String(c?.id || '').trim(),
      text: String(c?.text || '').trim(),
      required: Boolean(c?.required),
      min_score: clamp(Number.isFinite(Number(c?.min_score)) ? Number(c?.min_score) : 3.5),
    }))
    .filter((c) => c.id && c.text);

  const criteriaWithOverride = envMinScore === null
    ? criteria
    : criteria.map((c) => ({ ...c, min_score: clamp(envMinScore) }));

  const maxRetriesBase = Number(loaded.retry_policy?.max_retries ?? 2);
  const maxRetries = Number.isFinite(envMaxRetriesRaw) ? envMaxRetriesRaw : maxRetriesBase;

  return {
    enabled,
    judge_model: envModel || String(loaded.judge_model || fallback.judge_model),
    prompt_version: String(loaded.prompt_version || fallback.prompt_version),
    scale: { min, max },
    retry_policy: {
      // Keep YT2BP quality retries tight for public endpoint latency budget.
      // External requests often traverse a ~60s proxy boundary.
      max_retries: Math.max(0, Math.min(1, Math.floor(maxRetries))),
      selection: 'best_overall',
    },
    criteria: criteriaWithOverride.length ? criteriaWithOverride : fallback.criteria,
  };
}

function readYt2bpContentSafetyConfig(): Yt2bpContentSafetyConfig {
  const fallback: Yt2bpContentSafetyConfig = {
    enabled: true,
    judge_model: 'o4-mini',
    prompt_version: 'yt2bp_content_safety_v0',
    retry_policy: { max_retries: 1, selection: 'first_pass' },
    criteria: [
      { id: 'self_harm', text: 'No encouragement, planning, or reinforcement of self-harm/suicide.', required: true },
      { id: 'sexual_minors', text: 'No sexual content involving minors or underage persons.', required: true },
      { id: 'hate_harassment', text: 'No targeted hate, dehumanization, or harassment against protected groups.', required: true },
    ],
  };

  const configPath = path.join(process.cwd(), 'eval', 'methods', 'v0', 'llm_content_safety_grading_v0', 'global_pack_v0.json');
  let loaded = fallback;
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      loaded = {
        ...fallback,
        ...parsed,
        retry_policy: { ...fallback.retry_policy, ...(parsed?.retry_policy || {}) },
        criteria: Array.isArray(parsed?.criteria) ? parsed.criteria : fallback.criteria,
      };
    } catch {
      loaded = fallback;
    }
  }

  const envEnabledRaw = String(process.env.YT2BP_CONTENT_SAFETY_ENABLED ?? '').trim().toLowerCase();
  const enabled =
    envEnabledRaw === ''
      ? Boolean(loaded.enabled)
      : !(envEnabledRaw === '0' || envEnabledRaw === 'false' || envEnabledRaw === 'off' || envEnabledRaw === 'no');
  const envModel = String(process.env.YT2BP_CONTENT_SAFETY_MODEL || '').trim();
  const envRetryRaw = Number(process.env.YT2BP_CONTENT_SAFETY_MAX_RETRIES);
  const maxRetriesBase = Number(loaded.retry_policy?.max_retries ?? 1);
  const maxRetries = Number.isFinite(envRetryRaw) ? envRetryRaw : maxRetriesBase;

  const criteria = (loaded.criteria || [])
    .map((c) => ({
      id: String(c?.id || '').trim(),
      text: String(c?.text || '').trim(),
      required: Boolean(c?.required),
    }))
    .filter((c) => c.id && c.text);

  return {
    enabled,
    judge_model: envModel || String(loaded.judge_model || fallback.judge_model),
    prompt_version: String(loaded.prompt_version || fallback.prompt_version),
    retry_policy: { max_retries: Math.max(0, Math.min(3, Math.floor(maxRetries))), selection: 'first_pass' },
    criteria: criteria.length ? criteria : fallback.criteria,
  };
}

function buildYt2bpQualityJudgeInput(draft: YouTubeDraft, config: Yt2bpQualityConfig) {
  const criteriaLines = config.criteria
    .map((c) => `- ${c.id}: ${c.text} (required=${c.required}, min_score=${c.min_score})`)
    .join('\n');
  return [
    'Grade this blueprint quality.',
    `Scale: ${config.scale.min}..${config.scale.max}`,
    `PromptVersion: ${config.prompt_version}`,
    '',
    'Criteria:',
    criteriaLines,
    '',
    'Blueprint JSON:',
    JSON.stringify(draft, null, 2),
    '',
    'Return ONLY strict JSON:',
    '{"scores":[{"id":"criterion_id","score":0}],"overall":0}',
  ].join('\n');
}

function parseYt2bpQualityJudgeOutput(
  outputText: string,
  config: Yt2bpQualityConfig,
): {
  ok: boolean;
  overall: number;
  scores: Array<{ id: string; score: number; min_score: number; required: boolean; pass: boolean }>;
  failures: string[];
} {
  const jsonText = extractJson(String(outputText || '').trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Quality judge output is not valid JSON');
  }

  const judged = QualityJudgeResponseSchema.parse(parsed);
  const expectedIds = config.criteria.map((c) => c.id).sort();
  const actualIds = judged.scores.map((s) => s.id).sort();
  if (
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id, i) => id !== actualIds[i])
  ) {
    throw new Error('Quality judge criterion id mismatch');
  }

  const scoreMap = new Map(judged.scores.map((s) => [s.id, Number(s.score)]));
  const clamp = (n: number) => Math.max(config.scale.min, Math.min(config.scale.max, n));

  const scores = config.criteria.map((criterion) => {
    const score = clamp(Number(scoreMap.get(criterion.id) ?? config.scale.min));
    const pass = !criterion.required || score >= criterion.min_score;
    return {
      id: criterion.id,
      score,
      min_score: criterion.min_score,
      required: criterion.required,
      pass,
    };
  });
  const failures = scores.filter((s) => !s.pass).map((s) => s.id);
  const overall = Number.isFinite(Number(judged.overall))
    ? clamp(Number(judged.overall))
    : scores.reduce((sum, s) => sum + s.score, 0) / Math.max(1, scores.length);
  return { ok: failures.length === 0, overall, scores, failures };
}

async function scoreYt2bpQualityWithOpenAI(
  draft: YouTubeDraft,
  config: Yt2bpQualityConfig
): Promise<{
  ok: boolean;
  overall: number;
  scores: Array<{ id: string; score: number; min_score: number; required: boolean; pass: boolean }>;
  failures: string[];
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const OpenAI = getOpenAIConstructor();
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: config.judge_model,
    instructions: [
      'You are a strict JSON generator.',
      'Do not include markdown.',
      'Output only JSON with fields: scores, overall.',
    ].join('\n'),
    input: buildYt2bpQualityJudgeInput(draft, config),
  });

  const outputText = String(response.output_text || '').trim();
  if (!outputText) throw new Error('No output text from quality judge');
  return parseYt2bpQualityJudgeOutput(outputText, config);
}

function buildYt2bpContentSafetyJudgeInput(draft: YouTubeDraft, config: Yt2bpContentSafetyConfig) {
  const criteriaLines = config.criteria
    .map((c) => `- ${c.id}: ${c.text}`)
    .join('\n');
  return [
    'You are evaluating generated content safety.',
    `PromptVersion: ${config.prompt_version}`,
    '',
    'Mark each criterion pass=true only if the content is safe for that criterion.',
    'If any criterion fails, blocked must be true.',
    '',
    'Criteria:',
    criteriaLines,
    '',
    'Blueprint JSON:',
    JSON.stringify(draft, null, 2),
    '',
    'Return ONLY strict JSON in this shape:',
    '{"criteria":[{"id":"criterion_id","pass":true,"rationale":"optional"}],"blocked":false}',
  ].join('\n');
}

function parseYt2bpContentSafetyJudgeOutput(
  outputText: string,
  config: Yt2bpContentSafetyConfig,
): {
  ok: boolean;
  blocked: boolean;
  failedCriteria: string[];
  details: Array<{ id: string; pass: boolean; rationale?: string }>;
} {
  const jsonText = extractJson(String(outputText || '').trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Content safety judge output is not valid JSON');
  }
  const judged = ContentSafetyJudgeResponseSchema.parse(parsed);

  const expectedIds = config.criteria.map((c) => c.id).sort();
  const actualIds = judged.criteria.map((c) => c.id).sort();
  if (
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id, i) => id !== actualIds[i])
  ) {
    throw new Error('Content safety criterion id mismatch');
  }

  const failedCriteria = judged.criteria.filter((c) => !c.pass).map((c) => c.id);
  const blocked = Boolean(judged.blocked) || failedCriteria.length > 0;
  return { ok: !blocked, blocked, failedCriteria, details: judged.criteria };
}

async function scoreYt2bpContentSafetyWithOpenAI(
  draft: YouTubeDraft,
  config: Yt2bpContentSafetyConfig
): Promise<{
  ok: boolean;
  blocked: boolean;
  failedCriteria: string[];
  details: Array<{ id: string; pass: boolean; rationale?: string }>;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const OpenAI = getOpenAIConstructor();
  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model: config.judge_model,
    instructions: [
      'You are a strict JSON generator.',
      'Return only JSON.',
    ].join('\n'),
    input: buildYt2bpContentSafetyJudgeInput(draft, config),
  });

  const outputText = String(response.output_text || '').trim();
  if (!outputText) throw new Error('No output text from content safety judge');
  return parseYt2bpContentSafetyJudgeOutput(outputText, config);
}

async function scoreYt2bpQuality(
  draft: YouTubeDraft,
  config: Yt2bpQualityConfig,
  generationTier: GenerationTier = 'free',
) {
  if (!(useCodexForGeneration && codexBinaryAvailable)) {
    return scoreYt2bpQualityWithOpenAI(draft, config);
  }
  const codexProfile = resolveCodexModelProfile(generationTier);
  try {
    const response = await runCodexPromptForGeneration({
      stage: 'quality_judge',
      model: codexProfile.model,
      reasoningEffort: codexProfile.reasoningEffort,
      prompt: [
        'You are a strict JSON generator.',
        'Do not include markdown.',
        'Output only JSON with fields: scores, overall.',
        '',
        buildYt2bpQualityJudgeInput(draft, config),
      ].join('\n'),
    });
    return parseYt2bpQualityJudgeOutput(response.outputText, config);
  } catch (error) {
    if (!codexFallbackEnabled) throw error;
    return scoreYt2bpQualityWithOpenAI(draft, config);
  }
}

async function scoreYt2bpContentSafety(
  draft: YouTubeDraft,
  config: Yt2bpContentSafetyConfig,
  generationTier: GenerationTier = 'free',
) {
  if (!(useCodexForGeneration && codexBinaryAvailable)) {
    return scoreYt2bpContentSafetyWithOpenAI(draft, config);
  }
  const codexProfile = resolveCodexModelProfile(generationTier);
  try {
    const response = await runCodexPromptForGeneration({
      stage: 'content_safety_judge',
      model: codexProfile.model,
      reasoningEffort: codexProfile.reasoningEffort,
      prompt: [
        'You are a strict JSON generator.',
        'Return only JSON.',
        '',
        buildYt2bpContentSafetyJudgeInput(draft, config),
      ].join('\n'),
    });
    return parseYt2bpContentSafetyJudgeOutput(response.outputText, config);
  } catch (error) {
    if (!codexFallbackEnabled) throw error;
    return scoreYt2bpContentSafetyWithOpenAI(draft, config);
  }
}


registerCoreRoutes(app, {
  creditsReadLimiter,
  getCredits,
  getGenerationDailyCapStatus: generationDailyCapService.getStatus,
  getServiceSupabaseClient,
  blueprintReviewSchema: BlueprintReviewSchema,
  bannerRequestSchema: BannerRequestSchema,
  consumeCredit,
  createLLMClient,
  supabaseUrl: supabaseUrl || '',
});

registerProfileRoutes(app, {
  getServiceSupabaseClient,
  normalizeTranscriptTruthStatus,
});

registerWallRoutes(app, {
  getServiceSupabaseClient,
  normalizeTranscriptTruthStatus,
});

const blueprintVariantsService = createBlueprintVariantsService({
  getServiceSupabaseClient,
});
const {
  claimVariantForGeneration,
  markVariantReady,
  markVariantFailed,
  listVariantsForSourceItem,
  findVariantsByBlueprintId,
  resolveVariantOrReady,
} = blueprintVariantsService;
const youtubeSearchCacheService = createYouTubeSearchCacheService();
const youtubeQuotaGuardService = createYouTubeQuotaGuardService({
  providerKey: 'youtube_data_api',
});

registerYouTubeRoutes(app, {
  yt2bpIpHourlyLimiter,
  yt2bpAnonLimiter,
  yt2bpAuthLimiter,
  yt2bpEnabled,
  yt2bpCoreTimeoutMs,
  searchApiLimiter,
  sourceVideoUnlockBurstLimiter,
  sourceVideoUnlockSustainedLimiter,
  sourceVideoListBurstLimiter,
  sourceVideoListSustainedLimiter,
  youtubeConnectStartLimiter,
  youtubePreviewLimiter,
  youtubeImportLimiter,
  youtubeDisconnectLimiter,
  youtubeDataApiKey,
  youtubeSearchCacheEnabled,
  youtubeSearchCacheTtlSeconds,
  youtubeChannelSearchCacheTtlSeconds,
  youtubeSearchStaleMaxSeconds,
  youtubeSearchDegradeEnabled,
  youtubeGlobalLiveCallsPerMinute,
  youtubeGlobalLiveCallsPerDay,
  youtubeGlobalCooldownSeconds,
  searchGenerateMaxItems,
  sourceUnlockGenerateMaxItems,
  generationDurationCapEnabled,
  generationMaxVideoSeconds,
  generationBlockUnknownDuration,
  generationDurationLookupTimeoutMs,
  queueDepthHardLimit,
  queueDepthPerUserLimit,
  queueWorkItemsHardLimit,
  queueWorkItemsPerUserLimit,
  workerConcurrency,
  youtubeOAuthStateTtlSeconds,
  youtubeImportMaxChannels,
  tokenEncryptionKey,
  YouTubeToBlueprintRequestSchema,
  SearchVideosGenerateSchema,
  YouTubeConnectionStartSchema,
  YouTubeSubscriptionsImportSchema,
  getAdapterForUrl,
  consumeCredit,
  consumeGenerationDailyCap: generationDailyCapService.consume,
  getGenerationDailyCapStatus: generationDailyCapService.getStatus,
  getServiceSupabaseClient,
  withTimeout,
  runYouTubePipeline: (pipelineInput: any) => runYouTubePipeline(pipelineInput),
  mapPipelineError,
  clampYouTubeSearchLimit,
  getAuthedSupabaseClient,
  searchYouTubeVideos,
  loadExistingSourceVideoStateForUser,
  YouTubeSearchError,
  youtubeSearchCacheService,
  youtubeQuotaGuardService,
  countQueueDepth,
  countQueueWorkItems,
  emitGenerationStartedNotification,
  getGenerationNotificationLinkPath,
  scheduleQueuedIngestionProcessing,
  clampYouTubeChannelSearchLimit,
  searchYouTubeChannels,
  YouTubeChannelSearchError,
  clampYouTubeSourceVideoLimit,
  normalizeYouTubeSourceVideoKind,
  listYouTubeSourceVideos,
  YouTubeSourceVideosError,
  ensureYouTubeOAuthConfig,
  normalizeReturnToUrl,
  buildDefaultReturnTo,
  randomBytes,
  hashOAuthState,
  buildYouTubeOAuthUrl,
  youtubeOAuthConfig,
  appendReturnToQuery,
  exchangeYouTubeOAuthCode,
  fetchYouTubeOAuthAccountProfile,
  encryptToken,
  mapYouTubeOAuthError,
  getUsableYouTubeAccessToken,
  fetchYouTubeUserSubscriptions,
  fetchYouTubeChannelAssetMap,
  ensureSourcePageFromYouTubeChannel,
  syncSingleSubscription: (db: any, subscription: any, options: any) => syncSingleSubscription(db, subscription, options),
  markSubscriptionSyncError,
  upsertSubscriptionNoticeSourceItem,
  insertFeedItem,
  upsertSourceItemFromVideo,
  decryptToken,
  revokeYouTubeToken,
  resolveGenerationTierAccess,
  resolveRequestedGenerationTier,
  normalizeRequestedGenerationTier,
  resolveGenerationModelProfile,
  resolveVariantOrReady: (variantInput: any) => resolveVariantOrReady(variantInput),
  findVariantsByBlueprintId: (variantInput: any) => findVariantsByBlueprintId(variantInput),
  requestManualBlueprintYouTubeCommentsRefresh,
});

async function fetchYouTubeChannelAssetMap(input: {
  apiKey: string;
  channelIds: string[];
}) {
  const apiKey = String(input.apiKey || '').trim();
  const uniqueIds = Array.from(new Set(
    input.channelIds
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  ));
  const assetMap = new Map<string, {
    avatarUrl: string | null;
    bannerUrl: string | null;
  }>();

  if (!apiKey || uniqueIds.length === 0) {
    return assetMap;
  }

  const batchSize = 50;
  for (let offset = 0; offset < uniqueIds.length; offset += batchSize) {
    const ids = uniqueIds.slice(offset, offset + batchSize);
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet,brandingSettings');
    url.searchParams.set('id', ids.join(','));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString(), {
      headers: {
      'User-Agent': 'bleuv1-youtube-channel-assets/1.0 (+https://api.bleup.app)',
      Accept: 'application/json',
    },
    });
    if (!response.ok) {
      throw new Error(`YouTube channels lookup failed (${response.status})`);
    }

    const json = (await response.json().catch(() => null)) as {
      items?: Array<{
        id?: string;
        snippet?: {
          thumbnails?: {
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
        brandingSettings?: {
          image?: {
            bannerExternalUrl?: string;
            bannerTvHighImageUrl?: string;
            bannerTvMediumImageUrl?: string;
            bannerTvLowImageUrl?: string;
            bannerMobileExtraHdImageUrl?: string;
            bannerMobileHdImageUrl?: string;
            bannerMobileMediumHdImageUrl?: string;
            bannerMobileLowImageUrl?: string;
          };
        };
      }>;
    } | null;
    if (!json || !Array.isArray(json.items)) continue;

    json.items.forEach((item) => {
      const channelId = String(item.id || '').trim();
      if (!channelId) return;
      const avatarUrl =
        item.snippet?.thumbnails?.high?.url
        || item.snippet?.thumbnails?.medium?.url
        || item.snippet?.thumbnails?.default?.url
        || null;
      const bannerUrl =
        item.brandingSettings?.image?.bannerExternalUrl
        || item.brandingSettings?.image?.bannerTvHighImageUrl
        || item.brandingSettings?.image?.bannerTvMediumImageUrl
        || item.brandingSettings?.image?.bannerTvLowImageUrl
        || item.brandingSettings?.image?.bannerMobileExtraHdImageUrl
        || item.brandingSettings?.image?.bannerMobileHdImageUrl
        || item.brandingSettings?.image?.bannerMobileMediumHdImageUrl
        || item.brandingSettings?.image?.bannerMobileLowImageUrl
        || null;
      assetMap.set(channelId, { avatarUrl, bannerUrl });
    });
  }

  return assetMap;
}

type SourcePageAssetRecord = {
  id: string;
  platform: string;
  external_id: string;
  external_url: string;
  title: string;
  avatar_url: string | null;
  banner_url: string | null;
  metadata: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function needsSourcePageAssetHydration(sourcePage: {
  platform: string;
  avatar_url: string | null;
  banner_url: string | null;
}) {
  return sourcePage.platform === 'youtube' && (!sourcePage.avatar_url || !sourcePage.banner_url);
}

async function hydrateSourcePageAssetsForRow(
  db: ReturnType<typeof createClient>,
  sourcePage: SourcePageAssetRecord,
  input?: {
    assetMap?: Map<string, { avatarUrl: string | null; bannerUrl: string | null }>;
  },
) {
  if (!needsSourcePageAssetHydration(sourcePage) || !youtubeDataApiKey) {
    return { sourcePage, updated: false, hadAssets: false };
  }

  let assetMap = input?.assetMap;
  if (!assetMap) {
    assetMap = await fetchYouTubeChannelAssetMap({
      apiKey: youtubeDataApiKey,
      channelIds: [sourcePage.external_id],
    });
  }

  const assets = assetMap.get(sourcePage.external_id);
  if (!assets?.avatarUrl && !assets?.bannerUrl) {
    return { sourcePage, updated: false, hadAssets: false };
  }

  const nextAvatarUrl = sourcePage.avatar_url || assets.avatarUrl || null;
  const nextBannerUrl = sourcePage.banner_url || assets.bannerUrl || null;
  const needsUpdate = nextAvatarUrl !== sourcePage.avatar_url || nextBannerUrl !== sourcePage.banner_url;
  if (!needsUpdate) {
    return { sourcePage, updated: false, hadAssets: true };
  }

  const { data: updatedSourcePage, error: updateError } = await db
    .from('source_pages')
    .update({
      avatar_url: nextAvatarUrl,
      banner_url: nextBannerUrl,
    })
    .eq('id', sourcePage.id)
    .select('id, platform, external_id, external_url, title, avatar_url, banner_url, metadata, is_active, created_at, updated_at')
    .single();

  if (updateError || !updatedSourcePage) {
    throw updateError || new Error('Could not update source page assets');
  }

  return {
    sourcePage: updatedSourcePage as SourcePageAssetRecord,
    updated: true,
    hadAssets: true,
  };
}

const sourcePageAssetSweepService = createSourcePageAssetSweepService({
  sourcePageAssetSweepEnabled,
  youtubeDataApiKey,
  sourcePageAssetSweepBatch,
  sourcePageAssetSweepMinIntervalMs,
  fetchYouTubeChannelAssetMap,
  hydrateSourcePageAssetsForRow,
});
const { runSourcePageAssetSweep } = sourcePageAssetSweepService;

function getAuthedSupabaseClient(authToken: string) {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${authToken}` } },
  });
}

function getServiceSupabaseClient() {
  if (!supabaseUrl) return null;
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function isServiceRequestAuthorized(req: express.Request) {
  if (!ingestionServiceToken) return false;
  const fromHeader = String(req.header('x-service-token') || '').trim();
  const fromBearer = String(req.header('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return fromHeader === ingestionServiceToken || fromBearer === ingestionServiceToken;
}

function rejectLegacyManualFlowIfDisabled(res: express.Response) {
  if (autoChannelLegacyManualFlowEnabled) return false;
  res.status(404).json({
    ok: false,
    error_code: 'LEGACY_FLOW_DISABLED',
    message: 'Manual channel candidate flow is disabled.',
    data: null,
  });
  return true;
}

function hashOAuthState(state: string) {
  return createHash('sha256').update(String(state || '')).digest('hex');
}

function getAllowedReturnToOrigins(req: express.Request) {
  const values = new Set<string>();
  const configured = Array.isArray(corsOrigin) ? corsOrigin : [];
  for (const raw of configured) {
    const value = String(raw || '').trim();
    if (!value || value === '*') continue;
    try {
      values.add(new URL(value).origin);
    } catch {
      continue;
    }
  }

  const requestOrigin = String(req.header('origin') || '').trim();
  if (requestOrigin) {
    try {
      values.add(new URL(requestOrigin).origin);
    } catch {
      // ignore invalid origin
    }
  }

  return values;
}

function normalizeReturnToUrl(input: string, req: express.Request) {
  const value = String(input || '').trim();
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const allowedOrigins = getAllowedReturnToOrigins(req);
  if (!allowedOrigins.has(parsed.origin)) {
    return null;
  }
  return parsed.toString();
}

function buildDefaultReturnTo(req: express.Request) {
  const allowedOrigins = getAllowedReturnToOrigins(req);
  const origin = allowedOrigins.values().next().value as string | undefined;
  if (!origin) return null;
  return `${origin.replace(/\/$/, '')}/subscriptions`;
}

function appendReturnToQuery(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function ensureYouTubeOAuthConfig() {
  if (!youtubeOAuthConfigured || !tokenEncryptionKey) {
    return {
      ok: false as const,
      status: 503,
      error_code: 'YT_OAUTH_NOT_CONFIGURED',
      message: 'YouTube OAuth is not configured.',
    };
  }
  return { ok: true as const };
}

function mapYouTubeOAuthError(error: unknown) {
  if (error instanceof YouTubeOAuthError || error instanceof YouTubeUserSubscriptionsError) {
    return {
      status: error.status,
      error_code: error.code,
      message: error.message,
    };
  }
  return {
    status: 502,
    error_code: 'YT_PROVIDER_FAIL',
    message: error instanceof Error ? error.message : 'YouTube provider failed.',
  };
}

type UserYouTubeConnectionRow = {
  id: string;
  user_id: string;
  google_sub: string | null;
  youtube_channel_id: string | null;
  youtube_channel_title: string | null;
  youtube_channel_url: string | null;
  youtube_channel_avatar_url: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scope: string | null;
  is_active: boolean;
  last_import_at: string | null;
  last_error: string | null;
};

async function getUsableYouTubeAccessToken(input: {
  db: ReturnType<typeof createClient>;
  connection: UserYouTubeConnectionRow;
}) {
  const { db, connection } = input;
  const nowPlusSlackMs = Date.now() + 60_000;
  const expiresAtMs = connection.token_expires_at ? Date.parse(connection.token_expires_at) : null;
  const accessToken = connection.access_token_encrypted
    ? decryptToken(connection.access_token_encrypted, tokenEncryptionKey)
    : null;

  if (accessToken && (!expiresAtMs || expiresAtMs > nowPlusSlackMs)) {
    return { accessToken, connection };
  }

  const refreshToken = connection.refresh_token_encrypted
    ? decryptToken(connection.refresh_token_encrypted, tokenEncryptionKey)
    : null;
  if (!refreshToken) {
    throw new YouTubeOAuthError('YT_REAUTH_REQUIRED', 'YouTube authorization expired. Reconnect required.', 401);
  }

  const refreshed = await refreshYouTubeAccessToken(youtubeOAuthConfig, refreshToken);
  const nextAccessTokenEncrypted = encryptToken(refreshed.accessToken, tokenEncryptionKey);
  const nextRefreshToken = refreshed.refreshToken || refreshToken;
  const nextRefreshTokenEncrypted = encryptToken(nextRefreshToken, tokenEncryptionKey);
  const expiresAt = refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString() : null;

  const { data: updated, error: updateError } = await db
    .from('user_youtube_connections')
    .update({
      access_token_encrypted: nextAccessTokenEncrypted,
      refresh_token_encrypted: nextRefreshTokenEncrypted,
      token_expires_at: expiresAt,
      scope: refreshed.scope || connection.scope,
      is_active: true,
      last_error: null,
    })
    .eq('id', connection.id)
    .select('id, user_id, google_sub, youtube_channel_id, youtube_channel_title, youtube_channel_url, youtube_channel_avatar_url, access_token_encrypted, refresh_token_encrypted, token_expires_at, scope, is_active, last_import_at, last_error')
    .single();
  if (updateError || !updated) {
    throw new YouTubeOAuthError('WRITE_FAILED', updateError?.message || 'Could not update OAuth connection.', 400);
  }

  return {
    accessToken: refreshed.accessToken,
    connection: updated as UserYouTubeConnectionRow,
  };
}

async function runAutoChannelForFeedItem(input: {
  db: ReturnType<typeof createClient>;
  userId: string;
  userFeedItemId: string;
  blueprintId: string;
  sourceItemId: string | null;
  sourceTag: string;
}) {
  if (!autoChannelPipelineEnabled) return null;

  console.log('[auto_channel_started]', JSON.stringify({
    user_feed_item_id: input.userFeedItemId,
    blueprint_id: input.blueprintId,
    source_item_id: input.sourceItemId,
    source_tag: input.sourceTag,
    channel_default_slug: autoChannelFallbackSlug,
    classifier_mode: autoChannelClassifierMode,
    gate_mode: autoChannelGateMode,
  }));

  const result = await runAutoChannelPipeline({
    db: input.db,
    userId: input.userId,
    userFeedItemId: input.userFeedItemId,
    blueprintId: input.blueprintId,
    defaultChannelSlug: autoChannelFallbackSlug,
    classifierMode: autoChannelClassifierMode,
    gateMode: autoChannelGateMode,
    sourceTag: input.sourceTag,
  });

  const logTag = result.decision === 'published' ? '[auto_channel_published]' : '[auto_channel_held]';
  console.log(logTag, JSON.stringify({
    user_feed_item_id: result.userFeedItemId,
    blueprint_id: result.blueprintId,
    candidate_id: result.candidateId,
    channel_slug: result.channelSlug,
    reason_code: result.reasonCode,
    aggregate: result.aggregate,
    gate_mode: result.gateMode,
    classifier_mode: result.classifierMode,
    classifier_reason: result.classifierReason,
    classifier_confidence: result.classifierConfidence ?? null,
    idempotent: result.idempotent,
    source_tag: input.sourceTag,
  }));

  return result;
}

function toTagSlug(raw: string) {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function ensureTagId(db: ReturnType<typeof createClient>, userId: string, tagSlug: string): Promise<string> {
  const slug = toTagSlug(tagSlug);
  if (!slug) throw new Error('INVALID_TAG');

  const { data: existing } = await db.from('tags').select('id').eq('slug', slug).maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await db
    .from('tags')
    .insert({ slug, created_by: userId })
    .select('id')
    .single();
  if (error) {
    const { data: retry } = await db.from('tags').select('id').eq('slug', slug).maybeSingle();
    if (retry?.id) return retry.id;
    throw error;
  }
  return created.id;
}

function mapDraftStepsForBlueprint(steps: Array<{ name: string; notes: string }>) {
  const knownSectionLabels = [
    'lightning takeaways',
    'takeaways',
    'summary',
    'bleup',
    'mechanism deep dive',
    'deep dive',
    'tradeoffs',
    'decision rules',
    'practical rules',
    'open questions',
    'bottom line',
    'playbook steps',
    'fast fallbacks',
    'red flags',
    'steps',
  ];
  const normalizeLabel = (value: string) => value.toLowerCase().replace(/^#+\s+/, '').replace(/:$/, '').replace(/\s+/g, ' ').trim();
  const startsWithSectionLabel = (line: string, titleKey: string) => {
    const normalized = normalizeLabel(line);
    for (const label of knownSectionLabels) {
      if (label === titleKey) continue;
      if (
        normalized === label
        || normalized.startsWith(`${label}:`)
        || normalized.startsWith(`${label} `)
        || normalized.startsWith(`${label}(`)
      ) {
        return true;
      }
    }
    return false;
  };
  const stripHeadingPrefix = (line: string, title: string, titleKey: string) => {
    let next = line.trimStart().replace(/^#{1,6}\s+/, '').trim();
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
    if (escapedTitle) {
      next = next.replace(new RegExp(`^(?:${escapedTitle}\\s*[:\\-–—]?\\s*)+`, 'i'), '').trim();
    }
    while (normalizeLabel(next) === titleKey) {
      next = '';
      break;
    }
    return next;
  };

  return steps.map((step, index) => {
    const title = String(step.name || '').trim();
    const titleKey = normalizeLabel(title);
    const isSummaryStep = titleKey === 'summary' || titleKey === 'bleup';
    const rawLines = String(step.notes || '').split(/\r?\n/);
    const cleanedLines = rawLines
      .map((line) => line.replace(/\s+$/g, ''))
      .map((line) => stripHeadingPrefix(line, title, titleKey))
      .filter((line) => !startsWithSectionLabel(line, titleKey))
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        const normalized = normalizeLabel(trimmed);
        return normalized !== titleKey;
      });

    const bulletItems = cleanedLines
      .map((line) => line.trim())
      .filter((line) => /^([-*•]|\d+[.)])\s+/.test(line))
      .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, '').trim())
      .filter((line) => {
        const normalized = normalizeLabel(line);
        return normalized !== titleKey && !startsWithSectionLabel(line, titleKey);
      })
      .filter(Boolean);

    const descriptionLines = cleanedLines
      .filter((line) => !/^([-*•]|\d+[.)])\s+/.test(line.trim()))
      .concat(
        isSummaryStep
          ? bulletItems
          : [],
      );

    const description = descriptionLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      id: `yt-sub-step-${index + 1}`,
      title,
      description: description || null,
      items: isSummaryStep ? [] : bulletItems.map((item) => ({ name: item })),
    };
  });
}

async function upsertSourceItemFromVideo(db: ReturnType<typeof createClient>, input: {
  video: YouTubeFeedVideo;
  channelId: string;
  channelTitle: string | null;
  sourcePageId?: string | null;
}) {
  const canonicalKey = `youtube:${input.video.videoId}`;
  const { data, error } = await db
    .from('source_items')
    .upsert(
      {
        source_type: 'youtube',
        source_native_id: input.video.videoId,
        canonical_key: canonicalKey,
        source_url: input.video.url,
        title: input.video.title,
        published_at: input.video.publishedAt,
        ingest_status: 'ready',
        source_channel_id: input.channelId,
        source_channel_title: input.channelTitle,
        source_page_id: input.sourcePageId || null,
        thumbnail_url: input.video.thumbnailUrl,
        metadata: {
          provider: 'youtube_rss',
          duration_seconds: toDurationSeconds((input.video as { durationSeconds?: unknown }).durationSeconds),
        },
      },
      { onConflict: 'canonical_key' },
    )
    .select('id, source_url, source_native_id, source_page_id, source_channel_id, source_channel_title, title, published_at, thumbnail_url')
    .single();
  if (error) throw error;
  return data;
}

async function upsertSubscriptionNoticeSourceItem(db: ReturnType<typeof createClient>, input: {
  channelId: string;
  channelTitle: string | null;
  channelUrl: string | null;
  channelAvatarUrl: string | null;
  channelBannerUrl: string | null;
}) {
  const safeTitle = input.channelTitle || input.channelId;
  const canonicalKey = `subscription:youtube:${input.channelId}`;
  const { data, error } = await db
    .from('source_items')
    .upsert(
      {
        source_type: 'subscription_notice',
        source_native_id: input.channelId,
        canonical_key: canonicalKey,
        source_url: input.channelUrl || `https://www.youtube.com/channel/${input.channelId}`,
        title: `You are now subscribing to ${safeTitle}`,
        ingest_status: 'ready',
        source_channel_id: input.channelId,
        source_channel_title: safeTitle,
        thumbnail_url: input.channelAvatarUrl,
        metadata: {
          notice_kind: 'subscription_created',
          channel_title: safeTitle,
          channel_avatar_url: input.channelAvatarUrl,
          channel_banner_url: input.channelBannerUrl,
        },
      },
      { onConflict: 'canonical_key' },
    )
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function getExistingFeedItem(db: ReturnType<typeof createClient>, userId: string, sourceItemId: string) {
  const { data, error } = await db
    .from('user_feed_items')
    .select('id, state, blueprint_id')
    .eq('user_id', userId)
    .eq('source_item_id', sourceItemId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function insertFeedItem(db: ReturnType<typeof createClient>, input: {
  userId: string;
  sourceItemId: string;
  blueprintId: string | null;
  state: string;
}) {
  const { data, error } = await db
    .from('user_feed_items')
    .insert({
      user_id: input.userId,
      source_item_id: input.sourceItemId,
      blueprint_id: input.blueprintId,
      state: input.state,
      last_decision_code: null,
    })
    .select('id')
    .single();
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return null;
    throw error;
  }
  return data;
}

async function upsertFeedItemWithBlueprint(db: ReturnType<typeof createClient>, input: {
  userId: string;
  sourceItemId: string;
  blueprintId: string;
  state: string;
}) {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('user_feed_items')
    .upsert(
      {
        user_id: input.userId,
        source_item_id: input.sourceItemId,
        blueprint_id: input.blueprintId,
        state: input.state,
        last_decision_code: null,
        // Treat unlock completion as fresh feed content for ordering.
        created_at: nowIso,
      },
      { onConflict: 'user_id,source_item_id' },
    )
    .select('id, user_id')
    .single();
  if (error) throw error;
  return data as { id: string; user_id: string };
}

async function attachBlueprintToSubscribedUsers(db: ReturnType<typeof createClient>, input: {
  sourceItemId: string;
  sourcePageId: string | null;
  sourceChannelId: string | null;
  blueprintId: string;
  unlockingUserId: string;
}) {
  const targetUsers = new Set<string>([input.unlockingUserId]);

  if (input.sourcePageId) {
    const { data: subscriptions, error: subscriptionsError } = await db
      .from('user_source_subscriptions')
      .select('user_id')
      .eq('source_page_id', input.sourcePageId)
      .eq('is_active', true);
    if (subscriptionsError) throw subscriptionsError;
    for (const row of subscriptions || []) {
      const userId = String(row.user_id || '').trim();
      if (userId) targetUsers.add(userId);
    }
  }

  const sourceChannelId = String(input.sourceChannelId || '').trim();
  if (sourceChannelId) {
    const { data: subscriptions, error: subscriptionsError } = await db
      .from('user_source_subscriptions')
      .select('user_id')
      .eq('source_type', 'youtube')
      .eq('source_channel_id', sourceChannelId)
      .eq('is_active', true);
    if (subscriptionsError) throw subscriptionsError;
    for (const row of subscriptions || []) {
      const userId = String(row.user_id || '').trim();
      if (userId) targetUsers.add(userId);
    }
  }

  const results: Array<{ id: string; user_id: string }> = [];
  for (const userId of targetUsers) {
    const row = await upsertFeedItemWithBlueprint(db, {
      userId,
      sourceItemId: input.sourceItemId,
      blueprintId: input.blueprintId,
      state: 'my_feed_published',
    });
    results.push(row);
  }

  return results;
}

const AUTO_BANNER_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const AUTO_BANNER_MAX_BYTES = 5 * 1024 * 1024;

type AutoBannerJobRow = {
  id: string;
  blueprint_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  available_at: string;
  source_item_id: string | null;
  subscription_id: string | null;
  run_id: string | null;
  last_error?: string | null;
};

function toBannerFileExtension(contentType: string) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/jpg' || contentType === 'image/jpeg') return 'jpg';
  return 'bin';
}

async function uploadBannerToSupabaseAsService(input: {
  imageBase64: string;
  contentType: string;
  blueprintId: string;
}) {
  const serviceDb = getServiceSupabaseClient();
  if (!serviceDb) {
    throw new Error('Service role client not configured');
  }

  if (!AUTO_BANNER_ALLOWED_TYPES.has(input.contentType)) {
    throw new Error(`Unsupported banner content type: ${input.contentType}`);
  }

  const bytes = Buffer.from(input.imageBase64, 'base64');
  if (!bytes.length || bytes.length > AUTO_BANNER_MAX_BYTES) {
    throw new Error(`Banner payload out of bounds (${bytes.length} bytes)`);
  }

  const extension = toBannerFileExtension(input.contentType);
  const filename = `auto/${input.blueprintId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const { error: uploadError } = await serviceDb
    .storage
    .from('blueprint-banners')
    .upload(filename, bytes, {
      contentType: input.contentType,
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Banner upload failed: ${uploadError.message}`);
  }

  const { data } = serviceDb.storage.from('blueprint-banners').getPublicUrl(filename);
  if (!data?.publicUrl) {
    throw new Error('Banner upload missing public URL');
  }
  return data.publicUrl;
}

async function enqueueAutoBannerJob(input: {
  blueprintId: string;
  sourceItemId: string | null;
  subscriptionId: string | null;
  runId: string | null;
}) {
  const serviceDb = getServiceSupabaseClient();
  if (!serviceDb) {
    throw new Error('Service role client not configured');
  }

  const { data, error } = await serviceDb
    .from('auto_banner_jobs')
    .upsert(
      {
        blueprint_id: input.blueprintId,
        status: 'queued',
        max_attempts: autoBannerMaxAttempts,
        available_at: new Date().toISOString(),
        source_item_id: input.sourceItemId,
        subscription_id: input.subscriptionId,
        run_id: input.runId,
        finished_at: null,
        last_error: null,
      },
      { onConflict: 'blueprint_id' },
    )
    .select('id, blueprint_id, status, attempts, max_attempts, available_at')
    .single();
  if (error) throw error;
  return data;
}

async function fetchPublishedChannelSlugMapForBlueprints(db: ReturnType<typeof createClient>, blueprintIds: string[]) {
  const map = new Map<string, string>();
  const uniqueBlueprintIds = Array.from(new Set(blueprintIds.filter(Boolean)));
  if (!uniqueBlueprintIds.length) return map;

  const { data: feedItems, error: feedError } = await db
    .from('user_feed_items')
    .select('id, blueprint_id')
    .in('blueprint_id', uniqueBlueprintIds);
  if (feedError) throw feedError;

  const feedToBlueprint = new Map<string, string>();
  const feedIds: string[] = [];
  for (const row of feedItems || []) {
    const feedId = String(row.id || '').trim();
    const blueprintId = String(row.blueprint_id || '').trim();
    if (!feedId || !blueprintId) continue;
    feedToBlueprint.set(feedId, blueprintId);
    feedIds.push(feedId);
  }
  if (!feedIds.length) return map;

  const { data: candidates, error: candidateError } = await db
    .from('channel_candidates')
    .select('user_feed_item_id, channel_slug, updated_at, created_at')
    .eq('status', 'published')
    .in('user_feed_item_id', feedIds)
    .order('updated_at', { ascending: false });
  if (candidateError) throw candidateError;

  const newestByBlueprint = new Map<string, { channelSlug: string; ts: number }>();
  for (const candidate of candidates || []) {
    const feedId = String(candidate.user_feed_item_id || '').trim();
    const channelSlug = String(candidate.channel_slug || '').trim();
    const blueprintId = feedToBlueprint.get(feedId);
    if (!blueprintId || !channelSlug) continue;
    const ts = Date.parse(String(candidate.updated_at || candidate.created_at || ''));
    const prev = newestByBlueprint.get(blueprintId);
    if (!prev || ts > prev.ts) {
      newestByBlueprint.set(blueprintId, { channelSlug, ts: Number.isNaN(ts) ? 0 : ts });
    }
  }

  newestByBlueprint.forEach((value, blueprintId) => {
    map.set(blueprintId, value.channelSlug);
  });
  return map;
}

async function fetchChannelDefaultBannerMap(db: ReturnType<typeof createClient>, channelSlugs: string[]) {
  const map = new Map<string, string[]>();
  const uniqueSlugs = Array.from(new Set(channelSlugs.filter(Boolean)));
  if (!uniqueSlugs.length) return map;

  const { data, error } = await db
    .from('channel_default_banners')
    .select('channel_slug, banner_url, priority, created_at')
    .in('channel_slug', uniqueSlugs)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  for (const row of data || []) {
    const channelSlug = String(row.channel_slug || '').trim();
    const bannerUrl = String(row.banner_url || '').trim();
    if (!channelSlug || !bannerUrl) continue;
    const existing = map.get(channelSlug) || [];
    existing.push(bannerUrl);
    map.set(channelSlug, existing);
  }

  return map;
}

async function rebalanceGeneratedBannerCap(db: ReturnType<typeof createClient>) {
  const pageSize = 500;
  let from = 0;
  const eligibleRows: Array<{
    id: string;
    created_at: string;
    banner_generated_url: string;
    banner_url: string | null;
    banner_effective_source: BannerEffectiveSource | null;
  }> = [];

  while (true) {
    const { data, error } = await db
      .from('blueprints')
      .select('id, created_at, banner_generated_url, banner_url, banner_effective_source')
      .not('banner_generated_url', 'is', null)
      .eq('banner_is_locked', false)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (!row.banner_generated_url) continue;
      eligibleRows.push({
        id: row.id,
        created_at: row.created_at,
        banner_generated_url: row.banner_generated_url,
        banner_url: row.banner_url,
        banner_effective_source: (row.banner_effective_source || null) as BannerEffectiveSource | null,
      });
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  const partition = partitionByBannerCap(
    eligibleRows.map((row) => ({ id: row.id, created_at: row.created_at })),
    autoBannerCap,
  );
  const keepIds = new Set(partition.keep.map((row) => row.id));
  const keepRows = eligibleRows.filter((row) => keepIds.has(row.id));
  const demoteRows = eligibleRows.filter((row) => !keepIds.has(row.id));
  const nowIso = new Date().toISOString();

  let restoredToGenerated = 0;
  for (const row of keepRows) {
    if (row.banner_url === row.banner_generated_url && row.banner_effective_source === 'generated') continue;
    const { error } = await db
      .from('blueprints')
      .update({
        banner_url: row.banner_generated_url,
        banner_effective_source: 'generated',
        banner_policy_updated_at: nowIso,
      })
      .eq('id', row.id);
    if (!error) restoredToGenerated += 1;
  }

  let demotedToDefault = 0;
  let demotedToNone = 0;
  if (demoteRows.length) {
    const blueprintIds = demoteRows.map((row) => row.id);
    const channelSlugMap = await fetchPublishedChannelSlugMapForBlueprints(db, blueprintIds);
    const defaultMap = await fetchChannelDefaultBannerMap(db, Array.from(channelSlugMap.values()));

    for (const row of demoteRows) {
      const channelSlug = channelSlugMap.get(row.id);
      const fallback = channelSlug
        ? selectDeterministicDefaultBanner({
            channelSlug,
            blueprintId: row.id,
            bannerUrls: defaultMap.get(channelSlug) || [],
          })
        : null;

      const nextSource: BannerEffectiveSource = fallback ? 'channel_default' : 'none';
      const nextBanner = fallback || null;
      const { error } = await db
        .from('blueprints')
        .update({
          banner_url: nextBanner,
          banner_effective_source: nextSource,
          banner_policy_updated_at: nowIso,
        })
        .eq('id', row.id);
      if (error) continue;
      if (fallback) demotedToDefault += 1;
      else demotedToNone += 1;
    }
  }

  return {
    eligible: eligibleRows.length,
    kept: keepRows.length,
    demoted: demoteRows.length,
    restoredToGenerated,
    demotedToDefault,
    demotedToNone,
  };
}

async function processAutoBannerJob(db: ReturnType<typeof createClient>, job: AutoBannerJobRow) {
  const { data: blueprint, error: blueprintError } = await db
    .from('blueprints')
    .select('id, title')
    .eq('id', job.blueprint_id)
    .maybeSingle();
  if (blueprintError) throw blueprintError;
  if (!blueprint) {
    throw new Error('Blueprint not found');
  }

  const { data: tagsData } = await db
    .from('blueprint_tags')
    .select('tag:tags(slug)')
    .eq('blueprint_id', blueprint.id);
  const tags = (tagsData || [])
    .map((row) => {
      const maybeTag = (row as { tag?: { slug?: string } | Array<{ slug?: string }> }).tag;
      if (Array.isArray(maybeTag)) return maybeTag[0]?.slug || null;
      return maybeTag?.slug || null;
    })
    .filter((value): value is string => !!value);

  const client = createLLMClient();
  const banner = await withTimeout(
    client.generateBanner({
      title: blueprint.title,
      inventoryTitle: 'Auto subscription ingest',
      tags,
    }),
    autoBannerTimeoutMs,
  );
  const bannerUrl = await uploadBannerToSupabaseAsService({
    imageBase64: banner.buffer.toString('base64'),
    contentType: banner.mimeType,
    blueprintId: blueprint.id,
  });

  const nowIso = new Date().toISOString();
  const { error: bannerUpdateError } = await db
    .from('blueprints')
    .update({
      banner_generated_url: bannerUrl,
      banner_url: bannerUrl,
      banner_effective_source: 'generated',
      banner_policy_updated_at: nowIso,
    })
    .eq('id', blueprint.id);
  if (bannerUpdateError) throw bannerUpdateError;

  const { error: jobUpdateError } = await db
    .from('auto_banner_jobs')
    .update({
      status: 'succeeded',
      finished_at: nowIso,
      last_error: null,
    })
    .eq('id', job.id);
  if (jobUpdateError) throw jobUpdateError;

  return {
    blueprintId: blueprint.id,
    bannerUrl,
  };
}

async function recoverStaleAutoBannerJobs(db: ReturnType<typeof createClient>) {
  const staleBeforeIso = new Date(Date.now() - autoBannerStaleRunningMs).toISOString();
  const { data: staleRows, error } = await db
    .from('auto_banner_jobs')
    .select('id, blueprint_id, status, attempts, max_attempts, available_at, source_item_id, subscription_id, run_id, last_error')
    .eq('status', 'running')
    .not('started_at', 'is', null)
    .lt('started_at', staleBeforeIso)
    .order('started_at', { ascending: true })
    .limit(500);
  if (error) throw error;

  const recovered: Array<{ id: string; next_status: string; next_available_at: string | null }> = [];
  for (const row of staleRows || []) {
    const transition = getFailureTransition({
      attempts: Number(row.attempts || 0),
      maxAttempts: Math.max(1, Number(row.max_attempts || autoBannerMaxAttempts)),
      now: new Date(),
    });
    const { data: updated } = await db
      .from('auto_banner_jobs')
      .update({
        status: transition.status,
        available_at: transition.availableAt,
        finished_at: transition.status === 'dead' ? new Date().toISOString() : null,
        last_error: 'Recovered stale running job',
      })
      .eq('id', row.id)
      .eq('status', 'running')
      .select('id')
      .maybeSingle();
    if (!updated?.id) continue;

    recovered.push({
      id: row.id,
      next_status: transition.status,
      next_available_at: transition.availableAt,
    });

    console.log('[auto_banner_stale_recovered]', JSON.stringify({
      job_id: row.id,
      blueprint_id: row.blueprint_id,
      attempts: Number(row.attempts || 0),
      timeout_ms: autoBannerTimeoutMs,
      transition_reason: 'stale_running_timeout',
      next_status: transition.status,
      next_available_at: transition.availableAt,
    }));
  }
  return recovered;
}

const autoBannerQueueService = createAutoBannerQueueService({
  autoBannerBatchSize,
  autoBannerMaxAttempts,
  autoBannerTimeoutMs,
  autoBannerCap,
  recoverStaleAutoBannerJobs,
  getFailureTransition,
  processAutoBannerJob,
  rebalanceGeneratedBannerCap,
});
const { processAutoBannerQueue } = autoBannerQueueService;

async function maybeApplyAutoBannerPolicyAfterCreate(input: {
  blueprintId: string;
  sourceItemId: string | null;
  subscriptionId: string | null;
  runId: string | null;
}) {
  if (autoBannerMode === 'off') return;
  const serviceDb = getServiceSupabaseClient();
  if (!serviceDb) return;

  if (autoBannerMode === 'async') {
    await enqueueAutoBannerJob({
      blueprintId: input.blueprintId,
      sourceItemId: input.sourceItemId,
      subscriptionId: input.subscriptionId,
      runId: input.runId,
    });
    return;
  }

  if (autoBannerMode === 'sync') {
    await enqueueAutoBannerJob({
      blueprintId: input.blueprintId,
      sourceItemId: input.sourceItemId,
      subscriptionId: input.subscriptionId,
      runId: input.runId,
    });
    await processAutoBannerQueue(serviceDb, { maxJobs: autoBannerConcurrency });
  }
}

const blueprintYouTubeCommentsService = createBlueprintYouTubeCommentsService({
  apiKey: youtubeDataApiKey,
  refreshViewIntervalHours: youtubeRefreshViewIntervalHours,
  commentsAutoFirstDelayMinutes: youtubeCommentsAutoFirstDelayMinutes,
  commentsAutoSecondDelayHours: youtubeCommentsAutoSecondDelayHours,
  commentsManualCooldownMinutes: youtubeCommentsManualCooldownMinutes,
});

const blueprintCreationService = createBlueprintCreationService({
  getServiceSupabaseClient,
  safeGenerationTraceWrite,
  startGenerationRun,
  runYouTubePipeline: (pipelineInput: any) => runYouTubePipeline(pipelineInput),
  toTagSlug,
  ensureTagId,
  attachBlueprintToRun,
  youtubeVideoIdRegex: /^[a-zA-Z0-9_-]{8,15}$/,
  resolveGenerationModelProfile,
  claimVariantForGeneration,
  markVariantReady,
  markVariantFailed,
  enqueueBlueprintYouTubeEnrichment: enqueueBlueprintYouTubeEnrichmentJob,
  registerBlueprintYouTubeRefreshState: blueprintYouTubeCommentsService.registerRefreshStateForBlueprint,
});
const { createBlueprintFromVideo } = blueprintCreationService;

type RefreshScanCandidate = {
  subscription_id: string;
  source_channel_id: string;
  source_channel_title: string | null;
  source_channel_url: string | null;
  video_id: string;
  video_url: string;
  title: string;
  published_at: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  source_item_id?: string | null;
  reservation?: ManualGenerationReservation | null;
};

type SourcePageVideoGenerateItem = {
  video_id: string;
  video_url: string;
  title: string;
  published_at: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
};

type SearchVideoGenerateItem = {
  video_id: string;
  video_url: string;
  title: string;
  channel_id: string;
  channel_title: string | null;
  channel_url: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  source_item_id?: string | null;
  reservation?: ManualGenerationReservation | null;
};

type SourcePageVideoExistingState = {
  already_exists_for_user: boolean;
  existing_blueprint_id: string | null;
  existing_feed_item_id: string | null;
  source_item_id: string | null;
};

type SourcePageVideoUnlockSnapshot = {
  unlock_status: 'available' | 'reserved' | 'processing' | 'ready';
  unlock_cost: number;
  unlock_in_progress: boolean;
  ready_blueprint_id: string | null;
  unlock_id: string | null;
};

type TranscriptCooldownState = {
  active: boolean;
  retryAfterSeconds: number;
};

type TranscriptTruthStatus = 'unknown' | 'retrying' | 'confirmed_no_speech' | 'transient_error';

type TranscriptFailureDecision = {
  finalErrorCode: string;
  transcriptStatus: TranscriptTruthStatus;
  transcriptAttemptCount: number;
  transcriptNoCaptionHits: number;
  retryAfterSeconds: number;
  probeMeta: Record<string, unknown>;
  confirmedPermanent: boolean;
};

type SourceUnlockQueueItem = {
  unlock_id: string;
  source_item_id: string;
  source_page_id: string | null;
  source_channel_id: string;
  source_channel_title: string | null;
  video_id: string;
  video_url: string;
  title: string;
  duration_seconds: number | null;
  reserved_cost: number;
  reserved_by_user_id: string;
  auto_intent_id?: string | null;
  unlock_origin: 'manual_unlock' | 'subscription_auto_unlock' | 'source_auto_unlock_retry';
  generation_tier?: GenerationTier | null;
  dual_generate_enabled?: boolean | null;
};

type SourceAutoUnlockRetryPayload = {
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
  generation_tier?: GenerationTier | null;
};

type SourceTranscriptRevalidatePayload = {
  unlock_id: string;
  source_item_id: string;
  source_page_id: string | null;
  source_channel_id: string;
  source_channel_title: string | null;
  video_id: string;
  video_url: string;
  title: string;
};

type BlueprintYouTubeEnrichmentPayload = {
  run_id: string;
  blueprint_id: string;
  video_id: string | null;
  source_item_id: string | null;
};

type BlueprintYouTubeRefreshPayload = {
  blueprint_id: string;
  refresh_kind: BlueprintYouTubeRefreshKind;
  refresh_trigger: BlueprintYouTubeRefreshTrigger;
  youtube_video_id: string;
  source_item_id: string | null;
};

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{8,15}$/;

type DurationPolicyVideoItem = {
  video_id: string;
  title: string;
  duration_seconds?: number | null;
};

async function resolveDurationsForItems(input: {
  apiKey: string;
  lookupTimeoutMs: number;
  items: DurationPolicyVideoItem[];
  userAgent: string;
}) {
  const normalizedItems = input.items.map((item) => ({
    ...item,
    duration_seconds: toDurationSeconds(item.duration_seconds),
  }));
  const missingVideoIds = normalizedItems
    .filter((item) => item.duration_seconds == null)
    .map((item) => item.video_id);
  if (missingVideoIds.length === 0) {
    return new Map<string, number | null>(normalizedItems.map((item) => [item.video_id, item.duration_seconds ?? null]));
  }

  const fetched = await fetchYouTubeDurationMap({
    apiKey: input.apiKey,
    videoIds: missingVideoIds,
    timeoutMs: input.lookupTimeoutMs,
    userAgent: input.userAgent,
  });

  const result = new Map<string, number | null>();
  for (const item of normalizedItems) {
    if (item.duration_seconds != null) {
      result.set(item.video_id, item.duration_seconds);
      continue;
    }
    result.set(item.video_id, fetched.get(item.video_id) ?? null);
  }
  return result;
}

async function splitItemsByDurationPolicy<T extends DurationPolicyVideoItem>(input: {
  enabled: boolean;
  maxSeconds: number;
  blockUnknown: boolean;
  apiKey: string;
  lookupTimeoutMs: number;
  userAgent: string;
  items: T[];
}) {
  if (!input.enabled) {
    return {
      allowed: input.items.map((item) => ({
        ...item,
        duration_seconds: toDurationSeconds(item.duration_seconds),
      })),
      blocked: [] as Array<{
        video_id: string;
        title: string;
        error_code: 'VIDEO_TOO_LONG' | 'VIDEO_DURATION_UNAVAILABLE';
        reason: 'too_long' | 'unknown';
        max_duration_seconds: number;
        video_duration_seconds: number | null;
      }>,
    };
  }

  const durationByVideoId = await resolveDurationsForItems({
    apiKey: input.apiKey,
    lookupTimeoutMs: input.lookupTimeoutMs,
    items: input.items,
    userAgent: input.userAgent,
  });

  const normalized = input.items.map((item) => ({
    ...item,
    duration_seconds: durationByVideoId.get(item.video_id) ?? null,
  }));

  const split = splitByDurationPolicy({
    items: normalized,
    config: {
      enabled: input.enabled,
      maxSeconds: input.maxSeconds,
      blockUnknown: input.blockUnknown,
    },
    getVideoId: (item) => item.video_id,
    getTitle: (item) => item.title,
    getDurationSeconds: (item) => item.duration_seconds ?? null,
  });

  return {
    allowed: split.allowed,
    blocked: split.blocked,
  };
}

async function enforceVideoDurationPolicyForGeneration(input: {
  videoId: string;
  videoTitle?: string | null;
  durationSeconds?: number | null;
  userAgent: string;
}) {
  const videoId = String(input.videoId || '').trim();
  const videoTitle = String(input.videoTitle || '').trim() || `Video ${videoId}`;
  let durationSeconds = toDurationSeconds(input.durationSeconds);
  if (!generationDurationCapEnabled) return durationSeconds;

  if (durationSeconds == null) {
    try {
      const durationMap = await fetchYouTubeDurationMap({
        apiKey: youtubeDataApiKey,
        videoIds: [videoId],
        timeoutMs: generationDurationLookupTimeoutMs,
        userAgent: input.userAgent,
      });
      durationSeconds = durationMap.get(videoId) ?? null;
    } catch (error) {
      if (error instanceof YouTubeDurationLookupError) {
        if (error.code === 'RATE_LIMITED') {
          makePipelineError('RATE_LIMITED', 'Too many requests right now. Please retry shortly.');
        }
        makePipelineError('PROVIDER_FAIL', 'Video metadata provider is currently unavailable. Please try again.');
      }
      throw error;
    }
  }

  const decision = classifyVideoDuration({
    durationSeconds,
    maxSeconds: generationMaxVideoSeconds,
    blockUnknown: generationBlockUnknownDuration,
  });
  if (decision === 'too_long') {
    makePipelineError(
      'VIDEO_TOO_LONG',
      `Video exceeds max length of ${Math.floor(generationMaxVideoSeconds / 60)} minutes.`,
      {
        details: {
          video_id: videoId,
          max_duration_seconds: generationMaxVideoSeconds,
          video_duration_seconds: durationSeconds,
          title: videoTitle,
        },
      },
    );
  }
  if (decision === 'unknown') {
    makePipelineError(
      'VIDEO_DURATION_UNAVAILABLE',
      'Video length is unavailable for now. Please try another video.',
      {
        details: {
          video_id: videoId,
          max_duration_seconds: generationMaxVideoSeconds,
          video_duration_seconds: null,
          title: videoTitle,
        },
      },
    );
  }

  return durationSeconds;
}

function extractYouTubeVideoIdFromUrl(rawUrl: string) {
  const value = String(rawUrl || '').trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const pathParts = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      let videoId = '';
      if (parsed.pathname === '/watch') {
        videoId = String(parsed.searchParams.get('v') || '').trim();
      } else if (pathParts[0] === 'shorts' || pathParts[0] === 'live' || pathParts[0] === 'embed') {
        videoId = String(pathParts[1] || '').trim();
      } else {
        return null;
      }
      return YOUTUBE_VIDEO_ID_REGEX.test(videoId) ? videoId : null;
    }
    if (host === 'youtu.be') {
      const videoId = String(pathParts[0] || '').trim();
      return YOUTUBE_VIDEO_ID_REGEX.test(videoId) ? videoId : null;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeSourcePageVideoGenerateItem(raw: unknown): SourcePageVideoGenerateItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as {
    video_id?: unknown;
    video_url?: unknown;
    title?: unknown;
    published_at?: unknown;
    thumbnail_url?: unknown;
    duration_seconds?: unknown;
  };

  const videoId = String(row.video_id || '').trim();
  const videoUrl = String(row.video_url || '').trim();
  const title = String(row.title || '').trim();
  const publishedAt = row.published_at == null ? null : String(row.published_at || '').trim() || null;
  const thumbnailUrl = row.thumbnail_url == null ? null : String(row.thumbnail_url || '').trim() || null;
  const durationSeconds = toDurationSeconds(row.duration_seconds);

  if (!YOUTUBE_VIDEO_ID_REGEX.test(videoId)) return null;
  if (!title || !videoUrl) return null;

  const parsedVideoId = extractYouTubeVideoIdFromUrl(videoUrl);
  if (!parsedVideoId || parsedVideoId !== videoId) return null;

  return {
    video_id: videoId,
    video_url: videoUrl,
    title,
    published_at: publishedAt,
    thumbnail_url: thumbnailUrl,
    duration_seconds: durationSeconds,
  };
}

async function loadExistingSourceVideoStateForUser(
  db: ReturnType<typeof createClient>,
  userId: string,
  videoIds: string[],
) {
  const result = new Map<string, SourcePageVideoExistingState>();
  const uniqueVideoIds = Array.from(new Set(videoIds.map((videoId) => String(videoId || '').trim()).filter(Boolean)));
  if (!uniqueVideoIds.length) return result;

  const canonicalKeys = uniqueVideoIds.map((videoId) => `youtube:${videoId}`);
  const { data: sourceRows, error: sourceRowsError } = await db
    .from('source_items')
    .select('id, canonical_key')
    .in('canonical_key', canonicalKeys);
  if (sourceRowsError) throw sourceRowsError;

  const sourceByCanonical = new Map<string, { id: string; canonical_key: string }>();
  for (const row of sourceRows || []) {
    const sourceId = String(row.id || '').trim();
    const canonicalKey = String(row.canonical_key || '').trim();
    if (!sourceId || !canonicalKey) continue;
    sourceByCanonical.set(canonicalKey, {
      id: sourceId,
      canonical_key: canonicalKey,
    });
  }

  const sourceIds = Array.from(new Set(Array.from(sourceByCanonical.values()).map((row) => row.id)));
  const feedBySourceItemId = new Map<string, { id: string; blueprint_id: string | null }>();
  if (sourceIds.length > 0) {
    const { data: feedRows, error: feedRowsError } = await db
      .from('user_feed_items')
      .select('id, source_item_id, blueprint_id')
      .eq('user_id', userId)
      .not('blueprint_id', 'is', null)
      .in('source_item_id', sourceIds);
    if (feedRowsError) throw feedRowsError;

    for (const row of feedRows || []) {
      const sourceItemId = String(row.source_item_id || '').trim();
      if (!sourceItemId || feedBySourceItemId.has(sourceItemId)) continue;
      feedBySourceItemId.set(sourceItemId, {
        id: String(row.id || '').trim(),
        blueprint_id: row.blueprint_id ? String(row.blueprint_id).trim() : null,
      });
    }
  }

  for (const videoId of uniqueVideoIds) {
    const source = sourceByCanonical.get(`youtube:${videoId}`);
    if (!source) {
      result.set(videoId, {
        already_exists_for_user: false,
        existing_blueprint_id: null,
        existing_feed_item_id: null,
        source_item_id: null,
      });
      continue;
    }
    const existingFeed = feedBySourceItemId.get(source.id);
    result.set(videoId, {
      already_exists_for_user: Boolean(existingFeed),
      existing_blueprint_id: existingFeed?.blueprint_id || null,
      existing_feed_item_id: existingFeed?.id || null,
      source_item_id: source.id,
    });
  }

  return result;
}

async function runUnlockSweeps(db: ReturnType<typeof createClient>, input?: {
  mode?: 'opportunistic' | 'cron';
  force?: boolean;
  traceId?: string;
}) {
  if (!sourceUnlockSweepsEnabled) return null;
  try {
    const sweepResult = await runUnlockReliabilitySweeps(db, {
      mode: input?.mode || 'opportunistic',
      force: Boolean(input?.force),
      traceId: input?.traceId,
      batchSize: sourceUnlockSweepBatch || sourceUnlockExpiredSweepBatch,
      processingStaleMs: sourceUnlockProcessingStaleMs,
      minIntervalMs: sourceUnlockSweepMinIntervalMs,
      dryLogs: sourceUnlockSweepDryLogs,
      enabled: sourceUnlockSweepsEnabled,
    });
    if (Boolean(input?.force) || !sweepResult.skipped) {
      await runTranscriptFeedSuppressionSweep(db, { traceId: input?.traceId });
    }
    return sweepResult;
  } catch (error) {
    logUnlockEvent(
      'unlock_sweep_failed',
      { trace_id: String(input?.traceId || '').trim() || createUnlockTraceId() },
      {
        mode: input?.mode || 'opportunistic',
        error: error instanceof Error ? error.message : String(error),
      },
    );
    return null;
  }
}

async function runTranscriptFeedSuppressionSweep(
  db: ReturnType<typeof createClient>,
  input?: { traceId?: string },
) {
  const { data, error } = await db
    .from('source_item_unlocks')
    .select('source_item_id, transcript_status, last_error_code, updated_at')
    .or('transcript_status.eq.retrying,transcript_status.eq.confirmed_no_speech,last_error_code.eq.NO_TRANSCRIPT_PERMANENT,last_error_code.eq.TRANSCRIPT_UNAVAILABLE')
    .order('updated_at', { ascending: false })
    .limit(Math.max(10, sourceUnlockSweepBatch));
  if (error) {
    logUnlockEvent(
      'transcript_feed_sweep_failed',
      { trace_id: String(input?.traceId || '').trim() || createUnlockTraceId() },
      { error: error.message },
    );
    return;
  }

  const permanentSourceItemIds = new Set<string>();
  const transientSourceItemIds = new Set<string>();

  for (const row of data || []) {
    const sourceItemId = String(row.source_item_id || '').trim();
    if (!sourceItemId) continue;
    const isPermanent =
      normalizeTranscriptTruthStatus((row as { transcript_status?: unknown }).transcript_status) === 'confirmed_no_speech'
      || isPermanentNoTranscriptCode(String((row as { last_error_code?: unknown }).last_error_code || ''));
    if (isPermanent) {
      permanentSourceItemIds.add(sourceItemId);
      continue;
    }
    transientSourceItemIds.add(sourceItemId);
  }

  let hiddenRows = 0;
  if (permanentSourceItemIds.size > 0) {
    hiddenRows += await suppressUnlockableFeedRowsForSourceItems(db, {
      sourceItemIds: [...permanentSourceItemIds],
      decisionCode: 'NO_TRANSCRIPT_PERMANENT_AUTO',
      traceId: input?.traceId,
    });
  }
  if (transientSourceItemIds.size > 0) {
    hiddenRows += await suppressUnlockableFeedRowsForSourceItems(db, {
      sourceItemIds: [...transientSourceItemIds],
      decisionCode: 'TRANSCRIPT_UNAVAILABLE_AUTO',
      traceId: input?.traceId,
    });
  }

  if (hiddenRows > 0) {
    logUnlockEvent(
      'transcript_feed_sweep_summary',
      { trace_id: String(input?.traceId || '').trim() || createUnlockTraceId() },
      {
        hidden_rows: hiddenRows,
        scanned: (data || []).length,
        unique_source_items: permanentSourceItemIds.size + transientSourceItemIds.size,
      },
    );
  }
}

function toUnlockSnapshot(input: {
  unlock: SourceItemUnlockRow | null;
  fallbackCost: number;
}): SourcePageVideoUnlockSnapshot {
  const unlock = input.unlock;
  if (!unlock) {
    return {
      unlock_status: 'available',
      unlock_cost: input.fallbackCost,
      unlock_in_progress: false,
      ready_blueprint_id: null,
      unlock_id: null,
    };
  }

  const status = unlock.status;
  const cost = status === 'ready'
    ? Math.max(0, Number(unlock.estimated_cost || input.fallbackCost))
    : Math.max(0, Number(input.fallbackCost));
  return {
    unlock_status: status,
    unlock_cost: cost,
    unlock_in_progress: status === 'reserved' || status === 'processing',
    ready_blueprint_id: status === 'ready' ? unlock.blueprint_id || null : null,
    unlock_id: unlock.id,
  };
}

function isPermanentNoTranscriptCode(code: string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === 'NO_TRANSCRIPT_PERMANENT'
    || isTerminalTranscriptProviderErrorCodeForUnlock(normalized);
}

function isTransientTranscriptUnavailableCode(code: string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  if (transcriptAccessDeniedRetryEnabled && normalized === 'ACCESS_DENIED') {
    return true;
  }
  return normalized === 'TRANSCRIPT_EMPTY'
    || normalized === 'TRANSCRIPT_UNAVAILABLE'
    || normalized === 'NO_CAPTIONS'
    || normalized === 'PROVIDER_FAIL'
    || isRetryableTranscriptProviderErrorCode(normalized);
}

function isTerminalTranscriptProviderErrorCodeForUnlock(code: string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  if (transcriptAccessDeniedRetryEnabled && normalized === 'ACCESS_DENIED') {
    return false;
  }
  return isTerminalTranscriptProviderErrorCode(normalized);
}

function normalizeTranscriptTruthStatus(value: unknown): TranscriptTruthStatus {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'retrying') return 'retrying';
  if (normalized === 'confirmed_no_speech') return 'confirmed_no_speech';
  if (normalized === 'transient_error') return 'transient_error';
  return 'unknown';
}

function getUnlockTranscriptAttemptCount(unlock: SourceItemUnlockRow | null) {
  return Math.max(0, Number(unlock?.transcript_attempt_count || 0));
}

function getUnlockTranscriptNoCaptionHits(unlock: SourceItemUnlockRow | null) {
  return Math.max(0, Number(unlock?.transcript_no_caption_hits || 0));
}

function isConfirmedNoTranscriptUnlock(unlock: SourceItemUnlockRow | null | undefined) {
  if (!unlock) return false;
  const status = normalizeTranscriptTruthStatus(unlock.transcript_status);
  if (status === 'confirmed_no_speech') return true;
  return isPermanentNoTranscriptCode(unlock.last_error_code);
}

function normalizeUnlockFailureCode(code: string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  if (isTerminalTranscriptProviderErrorCodeForUnlock(normalized)) {
    return normalized;
  }
  if (normalized === 'ACCESS_DENIED' && transcriptAccessDeniedRetryEnabled) {
    return 'TRANSCRIPT_UNAVAILABLE';
  }
  if (
    normalized === 'NO_CAPTIONS'
    || normalized === 'TRANSCRIPT_EMPTY'
    || normalized === 'RATE_LIMITED'
    || normalized === 'TIMEOUT'
    || normalized === 'TRANSCRIPT_FETCH_FAIL'
    || normalized === 'PROVIDER_FAIL'
  ) {
    return 'TRANSCRIPT_UNAVAILABLE';
  }
  return normalized || 'UNLOCK_GENERATION_FAILED';
}

function getTranscriptRetryDelaySecondsForAttempt(attemptCount: number) {
  const normalizedAttempt = Math.max(1, Math.floor(Number(attemptCount) || 1));
  if (normalizedAttempt <= 1) return sourceTranscriptRetryDelayAttempt1Seconds;
  if (normalizedAttempt === 2) return sourceTranscriptRetryDelayAttempt2Seconds;
  return sourceTranscriptRetryDelayAttempt3Seconds;
}

function getTranscriptRetryDelaySecondsForErrorCode(code: string | null | undefined, attemptCount: number) {
  const normalized = String(code || '').trim().toUpperCase();
  const normalizedAttempt = Math.max(1, Math.floor(Number(attemptCount) || 1));
  if (transcriptAccessDeniedRetryEnabled && normalized === 'ACCESS_DENIED') {
    if (normalizedAttempt <= 1) return sourceTranscriptAccessDeniedRetryDelayAttempt1Seconds;
    if (normalizedAttempt === 2) return sourceTranscriptAccessDeniedRetryDelayAttempt2Seconds;
    return sourceTranscriptAccessDeniedRetryDelayAttempt3Seconds;
  }
  return getTranscriptRetryDelaySecondsForAttempt(normalizedAttempt);
}

function getTranscriptRetryAfterSeconds(unlock: SourceItemUnlockRow | null) {
  if (!unlock) return 0;

  const explicitRetryAtMs = Date.parse(String(unlock.transcript_retry_after || ''));
  if (Number.isFinite(explicitRetryAtMs)) {
    const explicitRetryAfterMs = explicitRetryAtMs - Date.now();
    if (explicitRetryAfterMs > 0) {
      return Math.max(1, Math.ceil(explicitRetryAfterMs / 1000));
    }
  }
  return 0;
}

function getTranscriptCooldownState(unlock: SourceItemUnlockRow | null): TranscriptCooldownState {
  const retryAfterSeconds = getTranscriptRetryAfterSeconds(unlock);
  if (!unlock || retryAfterSeconds <= 0) {
    return { active: false, retryAfterSeconds: 0 };
  }
  return {
    active: true,
    retryAfterSeconds,
  };
}

function buildTranscriptRetryAfterIso(delaySeconds: number) {
  return new Date(Date.now() + Math.max(1, Math.floor(delaySeconds)) * 1000).toISOString();
}

async function markUnlockTranscriptSuccess(db: ReturnType<typeof createClient>, unlockId: string) {
  await db
    .from('source_item_unlocks')
    .update({
      transcript_status: 'unknown',
      transcript_attempt_count: 0,
      transcript_no_caption_hits: 0,
      transcript_last_probe_at: null,
      transcript_retry_after: null,
      transcript_probe_meta: {},
    })
    .eq('id', unlockId);
}

async function classifyTranscriptFailureForUnlock(input: {
  db: ReturnType<typeof createClient>;
  unlock: SourceItemUnlockRow;
  videoId: string;
  traceId: string;
  rawErrorCode: string;
  rawError?: unknown;
}) : Promise<TranscriptFailureDecision> {
  const normalizedRawErrorCode = String(input.rawErrorCode || '').trim().toUpperCase();
  const terminalFailFast =
    transcriptFailFastEnabled
    && isTerminalTranscriptProviderErrorCodeForUnlock(normalizedRawErrorCode);
  const nextAttemptCount = getUnlockTranscriptAttemptCount(input.unlock) + 1;
  let nextNoCaptionHits = getUnlockTranscriptNoCaptionHits(input.unlock);
  let transcriptStatus: TranscriptTruthStatus = 'transient_error';
  let finalErrorCode = normalizeUnlockFailureCode(normalizedRawErrorCode);
  let retryAfterSeconds = getTranscriptRetryDelaySecondsForErrorCode(normalizedRawErrorCode, nextAttemptCount);
  const probeMeta: Record<string, unknown> = {
    normalized_raw_error_code: normalizedRawErrorCode || null,
  };
  const providerDebug = getTranscriptProviderDebug(input.rawError);
  if (providerDebug) {
    probeMeta.provider_debug = providerDebug;
  }

  if (terminalFailFast) {
    transcriptStatus = 'confirmed_no_speech';
    retryAfterSeconds = 0;
    probeMeta.fail_fast = true;
    probeMeta.fail_fast_reason = normalizedRawErrorCode || 'UNKNOWN';
  } else if (isTransientTranscriptUnavailableCode(normalizedRawErrorCode)) {
    transcriptStatus = 'retrying';
  }

  if (!terminalFailFast && normalizedRawErrorCode === 'NO_CAPTIONS') {
    logUnlockEvent('transcript_probe_started', { trace_id: input.traceId, unlock_id: input.unlock.id }, {
      video_id: input.videoId,
      attempt: nextAttemptCount,
    });
    const probe = await probeTranscriptProvidersWithThrottle(input.videoId, {
      requestClass: 'background',
      reason: 'unlock_no_captions_probe',
    });
    probeMeta.providers = probe.providers;
    probeMeta.all_no_captions = probe.all_no_captions;
    probeMeta.any_success = probe.any_success;
    if (probe.all_no_captions) {
      nextNoCaptionHits += 1;
    } else {
      transcriptStatus = 'transient_error';
    }
    logUnlockEvent('transcript_probe_result', { trace_id: input.traceId, unlock_id: input.unlock.id }, {
      video_id: input.videoId,
      attempt: nextAttemptCount,
      no_caption_hits: nextNoCaptionHits,
      all_no_captions: probe.all_no_captions,
      any_success: probe.any_success,
    });
  }

  const confirmedByAttempts = nextAttemptCount >= sourceTranscriptMaxAttempts
    && nextNoCaptionHits >= sourceTranscriptMaxAttempts;
  const confirmedPermanent = terminalFailFast || confirmedByAttempts;
  if (confirmedPermanent) {
    transcriptStatus = 'confirmed_no_speech';
    if (!terminalFailFast) {
      finalErrorCode = 'NO_TRANSCRIPT_PERMANENT';
    }
    retryAfterSeconds = 0;
  } else if (isTransientTranscriptUnavailableCode(normalizedRawErrorCode)) {
    finalErrorCode = 'TRANSCRIPT_UNAVAILABLE';
    retryAfterSeconds = getTranscriptRetryDelaySecondsForErrorCode(normalizedRawErrorCode, nextAttemptCount);
  }

  await input.db
    .from('source_item_unlocks')
    .update({
      transcript_status: transcriptStatus,
      transcript_attempt_count: nextAttemptCount,
      transcript_no_caption_hits: nextNoCaptionHits,
      transcript_last_probe_at: new Date().toISOString(),
      transcript_retry_after: retryAfterSeconds > 0 ? buildTranscriptRetryAfterIso(retryAfterSeconds) : null,
      transcript_probe_meta: probeMeta,
    })
    .eq('id', input.unlock.id);

  if (confirmedPermanent) {
    logUnlockEvent('transcript_confirmed_no_speech', { trace_id: input.traceId, unlock_id: input.unlock.id }, {
      video_id: input.videoId,
      attempt: nextAttemptCount,
      no_caption_hits: nextNoCaptionHits,
      final_error_code: finalErrorCode,
      fail_fast: terminalFailFast,
    });
  } else if (retryAfterSeconds > 0) {
    logUnlockEvent('transcript_retry_scheduled', { trace_id: input.traceId, unlock_id: input.unlock.id }, {
      video_id: input.videoId,
      attempt: nextAttemptCount,
      retry_after_seconds: retryAfterSeconds,
    });
  }

  return {
    finalErrorCode,
    transcriptStatus,
    transcriptAttemptCount: nextAttemptCount,
    transcriptNoCaptionHits: nextNoCaptionHits,
    retryAfterSeconds,
    probeMeta,
    confirmedPermanent,
  };
}

function buildUnlockLedgerIdempotencyKey(input: {
  unlockId: string;
  userId: string;
  action: 'hold' | 'settle' | 'refund';
}) {
  return `unlock:${input.unlockId}:user:${input.userId}:${input.action}`;
}

type AutoUnlockAttemptReason =
  | 'SERVICE_DB_MISSING'
  | 'INVALID_SOURCE'
  | 'UNLOCK_NOT_AVAILABLE'
  | 'PERMANENT_NO_TRANSCRIPT'
  | 'NO_ELIGIBLE_USERS'
  | 'TRANSCRIPT_COOLDOWN'
  | 'ALREADY_READY'
  | 'ALREADY_IN_PROGRESS'
  | 'QUEUE_DISABLED'
  | 'QUEUE_BACKPRESSURE'
  | 'NO_ELIGIBLE_CREDITS';

type AutoUnlockAttemptResult =
  | {
    queued: true;
    auto_intent_id: string;
    owner_user_id: string;
    job_id: string;
    trace_id: string;
  }
  | {
    queued: false;
    reason: AutoUnlockAttemptReason;
  };

async function listEligibleAutoUnlockUsers(
  db: ReturnType<typeof createClient>,
  input: {
    sourcePageId: string | null;
    sourceChannelId: string | null;
  },
) {
  const userIds = new Set<string>();
  const sourcePageId = String(input.sourcePageId || '').trim();
  const sourceChannelId = String(input.sourceChannelId || '').trim();

  if (sourcePageId) {
    const { data, error } = await db
      .from('user_source_subscriptions')
      .select('user_id')
      .eq('is_active', true)
      .eq('auto_unlock_enabled', true)
      .eq('source_page_id', sourcePageId);
    if (error) throw error;
    for (const row of data || []) {
      const userId = String(row.user_id || '').trim();
      if (userId) userIds.add(userId);
    }
  }

  if (sourceChannelId) {
    const { data, error } = await db
      .from('user_source_subscriptions')
      .select('user_id')
      .eq('source_type', 'youtube')
      .eq('is_active', true)
      .eq('auto_unlock_enabled', true)
      .eq('source_channel_id', sourceChannelId);
    if (error) throw error;
    for (const row of data || []) {
      const userId = String(row.user_id || '').trim();
      if (userId) userIds.add(userId);
    }
  }

  return Array.from(userIds);
}

async function attemptAutoUnlockForSourceItem(input: {
  sourceItemId: string;
  sourcePageId: string | null;
  sourceChannelId: string;
  sourceChannelTitle: string | null;
  video: YouTubeFeedVideo;
  unlock: SourceItemUnlockRow;
  trigger: 'user_sync' | 'service_cron' | 'subscription_create' | 'debug_simulation' | 'youtube_import';
}): Promise<AutoUnlockAttemptResult> {
  const db = getServiceSupabaseClient();
  if (!db) return { queued: false as const, reason: 'SERVICE_DB_MISSING' as const };

  const sourceItemId = String(input.sourceItemId || '').trim();
  const sourceChannelId = String(input.sourceChannelId || '').trim();
  if (!sourceItemId || !sourceChannelId) {
    return { queued: false as const, reason: 'INVALID_SOURCE' as const };
  }

  if (input.unlock.status !== 'available') {
    return { queued: false as const, reason: 'UNLOCK_NOT_AVAILABLE' as const };
  }
  if (isConfirmedNoTranscriptUnlock(input.unlock)) {
    return { queued: false as const, reason: 'PERMANENT_NO_TRANSCRIPT' as const };
  }

  const transcriptCooldown = getTranscriptCooldownState(input.unlock);
  if (transcriptCooldown.active) {
    return { queued: false as const, reason: 'TRANSCRIPT_COOLDOWN' as const };
  }

  const eligibleUsers = await listEligibleAutoUnlockUsers(db, {
    sourcePageId: input.sourcePageId,
    sourceChannelId,
  });
  if (eligibleUsers.length === 0) {
    return { queued: false as const, reason: 'NO_ELIGIBLE_USERS' as const };
  }

  const reservation = await reserveAutoUnlockIntent(db, {
    sourceItemId,
    sourcePageId: input.sourcePageId,
    unlockId: input.unlock.id,
    sourceChannelId,
    eligibleUserIds: eligibleUsers,
    trigger: input.trigger,
    videoId: input.video.videoId,
  });
  if (reservation.state === 'empty_funded_set') {
    return { queued: false as const, reason: 'NO_ELIGIBLE_CREDITS' as const };
  }
  if (reservation.state === 'invalid_source_item' || !reservation.intent) {
    return { queued: false as const, reason: 'INVALID_SOURCE' as const };
  }

  const autoIntent = reservation.intent;
  if (autoIntent.status === 'ready') {
    return { queued: false as const, reason: 'ALREADY_READY' as const };
  }
  if (!reservation.reservedNow && autoIntent.status === 'reserved') {
    return { queued: false as const, reason: 'ALREADY_IN_PROGRESS' as const };
  }

  const ownerUserId = String(autoIntent.intent_owner_user_id || '').trim();
  if (!ownerUserId) {
    if (reservation.reservedNow) {
      await releaseAutoUnlockIntent(db, {
        intentId: autoIntent.id,
        reasonCode: 'AUTO_UNLOCK_OWNER_MISSING',
        lastErrorCode: 'AUTO_UNLOCK_OWNER_MISSING',
        lastErrorMessage: 'Auto-unlock intent owner missing.',
      });
    }
    return { queued: false as const, reason: 'NO_ELIGIBLE_CREDITS' as const };
  }

  const reserveResult = await reserveUnlock(db, {
    unlock: input.unlock,
    userId: ownerUserId,
    estimatedCost: computeUnlockCost(1),
    reservationSeconds: sourceUnlockReservationSeconds,
  });

  if (reserveResult.state === 'ready') {
    if (reservation.reservedNow) {
      await releaseAutoUnlockIntent(db, {
        intentId: autoIntent.id,
        reasonCode: 'AUTO_UNLOCK_ALREADY_READY',
      });
    }
    return { queued: false as const, reason: 'ALREADY_READY' as const };
  }
  if (reserveResult.state === 'in_progress') {
    if (reservation.reservedNow) {
      await releaseAutoUnlockIntent(db, {
        intentId: autoIntent.id,
        reasonCode: 'AUTO_UNLOCK_ALREADY_IN_PROGRESS',
      });
    }
    return { queued: false as const, reason: 'ALREADY_IN_PROGRESS' as const };
  }

  let reservedUnlock = reserveResult.unlock;
  reservedUnlock = await attachAutoUnlockIntent(db, {
    unlockId: reservedUnlock.id,
    userId: ownerUserId,
    intentId: autoIntent.id,
    amount: computeUnlockCost(1),
  });

  const queueDepth = await countQueueDepth(db, {
    scope: 'source_item_unlock_generation',
    includeRunning: true,
  });
  const ownerQueueDepth = await countQueueDepth(db, {
    scope: 'source_item_unlock_generation',
    userId: ownerUserId,
    includeRunning: true,
  });

  if (!unlockIntakeEnabled || queueDepth >= queueDepthHardLimit || ownerQueueDepth >= queueDepthPerUserLimit) {
    if (reservation.reservedNow) {
      await releaseAutoUnlockIntent(db, {
        intentId: autoIntent.id,
        reasonCode: !unlockIntakeEnabled ? 'QUEUE_INTAKE_DISABLED' : 'QUEUE_BACKPRESSURE',
        lastErrorCode: !unlockIntakeEnabled ? 'QUEUE_INTAKE_DISABLED' : 'QUEUE_BACKPRESSURE',
        lastErrorMessage: !unlockIntakeEnabled
          ? 'Unlock intake is temporarily paused.'
          : 'Unlock queue is currently busy.',
      });
    }
    await failUnlock(db, {
      unlockId: reservedUnlock.id,
      errorCode: !unlockIntakeEnabled ? 'QUEUE_INTAKE_DISABLED' : 'QUEUE_BACKPRESSURE',
      errorMessage: !unlockIntakeEnabled
        ? 'Unlock intake is temporarily paused.'
        : 'Unlock queue is currently busy.',
    });
    return { queued: false as const, reason: !unlockIntakeEnabled ? 'QUEUE_DISABLED' as const : 'QUEUE_BACKPRESSURE' as const };
  }

  const traceId = createUnlockTraceId();
  const ownerGenerationTier = resolveGenerationTierForUser({
    userId: ownerUserId,
  });
  const { data: job, error: jobError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: input.trigger === 'service_cron' ? 'service_cron' : 'user_sync',
      scope: 'source_item_unlock_generation',
      status: 'queued',
      requested_by_user_id: ownerUserId,
      trace_id: traceId,
      payload: {
        user_id: ownerUserId,
        trace_id: traceId,
        generation_tier: ownerGenerationTier,
        items: [{
          unlock_id: reservedUnlock.id,
          source_item_id: sourceItemId,
          source_page_id: input.sourcePageId,
          source_channel_id: sourceChannelId,
          source_channel_title: input.sourceChannelTitle,
          video_id: input.video.videoId,
          video_url: input.video.url,
          title: input.video.title,
          duration_seconds: toDurationSeconds((input.video as { durationSeconds?: unknown }).durationSeconds),
          reserved_cost: 0,
          reserved_by_user_id: ownerUserId,
          auto_intent_id: autoIntent.id,
          unlock_origin: reservation.reservedNow ? 'subscription_auto_unlock' : 'source_auto_unlock_retry',
          generation_tier: ownerGenerationTier,
          dual_generate_enabled: false,
        } satisfies SourceUnlockQueueItem],
      },
      next_run_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (jobError || !job?.id) {
    if (reservation.reservedNow) {
      await releaseAutoUnlockIntent(db, {
        intentId: autoIntent.id,
        reasonCode: 'QUEUE_INSERT_FAILED',
        lastErrorCode: 'QUEUE_INSERT_FAILED',
        lastErrorMessage: jobError?.message || 'Could not enqueue auto-unlock job.',
      });
    }
    await failUnlock(db, {
      unlockId: reservedUnlock.id,
      errorCode: 'SOURCE_VIDEO_GENERATE_FAILED',
      errorMessage: jobError?.message || 'Could not enqueue auto-unlock job.',
    });
    return { queued: false as const, reason: 'UNLOCK_NOT_AVAILABLE' as const };
  }

  await db
    .from('source_auto_unlock_intents')
    .update({
      job_id: job.id,
    })
    .eq('id', autoIntent.id);

  scheduleQueuedIngestionProcessing();
  return {
    queued: true as const,
    auto_intent_id: autoIntent.id,
    owner_user_id: ownerUserId,
    job_id: job.id,
    trace_id: traceId,
  };
}

async function hasPendingSourceAutoUnlockRetryJob(
  db: ReturnType<typeof createClient>,
  sourceItemId: string,
) {
  const normalizedSourceItemId = String(sourceItemId || '').trim();
  if (!normalizedSourceItemId) return false;

  const { data, error } = await db
    .from('ingestion_jobs')
    .select('id')
    .eq('scope', 'source_auto_unlock_retry')
    .in('status', ['queued', 'running'])
    .filter('payload->>source_item_id', 'eq', normalizedSourceItemId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function enqueueSourceAutoUnlockRetryJob(
  db: ReturnType<typeof createClient>,
  input: SourceAutoUnlockRetryPayload,
) {
  if (await hasPendingSourceAutoUnlockRetryJob(db, input.source_item_id)) {
    return { enqueued: false as const, reason: 'ALREADY_PENDING' as const };
  }

  const nextRunAt = new Date(Date.now() + sourceAutoUnlockRetryDelaySeconds * 1000).toISOString();
  const retryGenerationTier = 'free';
  const { data: job, error: jobError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: input.trigger === 'service_cron' ? 'service_cron' : 'user_sync',
      scope: 'source_auto_unlock_retry',
      status: 'queued',
      requested_by_user_id: null,
      max_attempts: sourceAutoUnlockRetryMaxAttempts,
      payload: {
        ...input,
        generation_tier: retryGenerationTier,
      },
      next_run_at: nextRunAt,
    })
    .select('id')
    .single();
  if (jobError || !job?.id) {
    throw new Error(jobError?.message || 'Could not enqueue auto-unlock retry job.');
  }
  scheduleQueuedIngestionProcessing(sourceAutoUnlockRetryDelaySeconds * 1000);
  return {
    enqueued: true as const,
    job_id: job.id,
    next_run_at: nextRunAt,
  };
}

async function hasPendingSourceTranscriptRevalidateJob(
  db: ReturnType<typeof createClient>,
  unlockId: string,
) {
  const normalizedUnlockId = String(unlockId || '').trim();
  if (!normalizedUnlockId) return false;

  const { data, error } = await db
    .from('ingestion_jobs')
    .select('id')
    .eq('scope', 'source_transcript_revalidate')
    .in('status', ['queued', 'running'])
    .filter('payload->>unlock_id', 'eq', normalizedUnlockId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function enqueueSourceTranscriptRevalidateJob(
  db: ReturnType<typeof createClient>,
  input: SourceTranscriptRevalidatePayload,
) {
  if (await hasPendingSourceTranscriptRevalidateJob(db, input.unlock_id)) {
    return { enqueued: false as const, reason: 'ALREADY_PENDING' as const };
  }

  const traceId = createUnlockTraceId();
  const { data: job, error: jobError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: 'service_cron',
      scope: 'source_transcript_revalidate',
      status: 'queued',
      max_attempts: 1,
      trace_id: traceId,
      payload: {
        ...input,
        trace_id: traceId,
      },
      next_run_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (jobError || !job?.id) {
    throw new Error(jobError?.message || 'Could not enqueue transcript revalidate job.');
  }

  scheduleQueuedIngestionProcessing();
  return {
    enqueued: true as const,
    job_id: job.id,
    trace_id: traceId,
  };
}

async function shouldSuppressLowPriorityEnqueue(input: {
  db: ReturnType<typeof createClient>;
  scope: QueuedIngestionScope;
  context?: Record<string, unknown>;
}) {
  const queueDepth = await countQueueDepth(input.db, { includeRunning: true });
  const suppressed = shouldSuppressLowPriorityQueueScope({
    scope: input.scope,
    queueDepth,
    suppressionDepth: queueLowPrioritySuppressionDepth,
    enabled: queuePriorityEnabled,
  });
  if (suppressed) {
    console.log('[queue_low_priority_suppressed]', JSON.stringify({
      scope: input.scope,
      queue_depth: queueDepth,
      suppression_depth: queueLowPrioritySuppressionDepth,
      priority: getQueuePriorityTierForScope(input.scope),
      ...(input.context || {}),
    }));
  }
  return { suppressed, queueDepth };
}

async function enqueueBlueprintYouTubeEnrichmentJob(input: {
  db: ReturnType<typeof createClient>;
  traceDb?: ReturnType<typeof createClient> | null;
  runId: string;
  blueprintId: string;
  explicitVideoId?: string | null;
  explicitSourceItemId?: string | null;
}) {
  const writeDb = input.traceDb || input.db;
  const suppression = await shouldSuppressLowPriorityEnqueue({
    db: writeDb,
    scope: 'blueprint_youtube_enrichment',
    context: {
      run_id: input.runId,
      blueprint_id: input.blueprintId,
    },
  });
  if (suppression.suppressed) {
    return {
      job_id: null,
      suppressed: true,
      queue_depth: suppression.queueDepth,
    };
  }
  const nowIso = new Date().toISOString();
  const { data: job, error: jobError } = await writeDb
    .from('ingestion_jobs')
    .insert({
      trigger: 'service_cron',
      scope: 'blueprint_youtube_enrichment',
      status: 'queued',
      max_attempts: 3,
      trace_id: input.runId,
      payload: {
        run_id: input.runId,
        blueprint_id: input.blueprintId,
        video_id: input.explicitVideoId == null ? null : String(input.explicitVideoId || '').trim() || null,
        source_item_id: input.explicitSourceItemId == null ? null : String(input.explicitSourceItemId || '').trim() || null,
      } satisfies BlueprintYouTubeEnrichmentPayload,
      next_run_at: nowIso,
    })
    .select('id')
    .single();
  if (jobError || !job?.id) {
    throw new Error(jobError?.message || 'Could not enqueue blueprint YouTube enrichment job.');
  }
  scheduleQueuedIngestionProcessing();
  return {
    job_id: job.id,
  };
}

async function enqueueBlueprintYouTubeRefreshJob(input: {
  db: ReturnType<typeof createClient>;
  blueprintId: string;
  refreshKind: BlueprintYouTubeRefreshKind;
  refreshTrigger?: BlueprintYouTubeRefreshTrigger;
  youtubeVideoId: string;
  sourceItemId?: string | null;
  requestedByUserId?: string | null;
}) {
  const suppression = await shouldSuppressLowPriorityEnqueue({
    db: input.db,
    scope: 'blueprint_youtube_refresh',
    context: {
      blueprint_id: input.blueprintId,
      refresh_kind: input.refreshKind,
      refresh_trigger: input.refreshTrigger || 'auto',
    },
  });
  if (suppression.suppressed) {
    return {
      job_id: null,
      suppressed: true,
      queue_depth: suppression.queueDepth,
    };
  }
  const nowIso = new Date().toISOString();
  const { data: job, error: jobError } = await input.db
    .from('ingestion_jobs')
    .insert({
      trigger: input.refreshTrigger === 'manual' ? 'user_sync' : 'service_cron',
      scope: 'blueprint_youtube_refresh',
      status: 'queued',
      requested_by_user_id: input.requestedByUserId || null,
      max_attempts: 1,
      trace_id: null,
      payload: {
        blueprint_id: input.blueprintId,
        refresh_kind: input.refreshKind,
        refresh_trigger: input.refreshTrigger || 'auto',
        youtube_video_id: input.youtubeVideoId,
        source_item_id: input.sourceItemId == null ? null : String(input.sourceItemId || '').trim() || null,
      } satisfies BlueprintYouTubeRefreshPayload,
      next_run_at: nowIso,
    })
    .select('id')
    .single();
  if (jobError || !job?.id) {
    throw new Error(jobError?.message || 'Could not enqueue blueprint YouTube refresh job.');
  }
  scheduleQueuedIngestionProcessing();
  return {
    job_id: job.id,
  };
}

type ManualBlueprintYouTubeCommentsRefreshResult =
  | { ok: true; status: 'queued' | 'already_pending'; cooldown_until: string | null; queue_depth: number | null }
  | { ok: false; code: 'BLUEPRINT_YOUTUBE_REFRESH_NOT_AVAILABLE' }
  | { ok: false; code: 'COMMENTS_REFRESH_COOLDOWN_ACTIVE'; retry_at: string | null }
  | { ok: false; code: 'COMMENTS_REFRESH_QUEUE_GUARDED'; retry_after_seconds: number; queue_depth: number };

async function requestManualBlueprintYouTubeCommentsRefresh(input: {
  db: ReturnType<typeof createClient>;
  blueprintId: string;
  requestedByUserId: string;
}) : Promise<ManualBlueprintYouTubeCommentsRefreshResult> {
  const blueprintId = String(input.blueprintId || '').trim();
  const requestedByUserId = String(input.requestedByUserId || '').trim();
  if (!blueprintId || !requestedByUserId) {
    return { ok: false, code: 'BLUEPRINT_YOUTUBE_REFRESH_NOT_AVAILABLE' };
  }

  let refreshState = await blueprintYouTubeCommentsService.getRefreshStateForBlueprint({
    db: input.db,
    blueprintId,
  });
  if (!refreshState || !refreshState.enabled || !refreshState.youtube_video_id) {
    await blueprintYouTubeCommentsService.registerRefreshStateForBlueprint({
      db: input.db,
      blueprintId,
    });
    refreshState = await blueprintYouTubeCommentsService.getRefreshStateForBlueprint({
      db: input.db,
      blueprintId,
    });
  }
  if (!refreshState || !refreshState.enabled || !refreshState.youtube_video_id) {
    return { ok: false, code: 'BLUEPRINT_YOUTUBE_REFRESH_NOT_AVAILABLE' };
  }

  const nowMs = Date.now();
  const cooldownMs = refreshState.comments_manual_cooldown_until
    ? Date.parse(refreshState.comments_manual_cooldown_until)
    : Number.NaN;
  if (Number.isFinite(cooldownMs) && cooldownMs > nowMs) {
    return {
      ok: false,
      code: 'COMMENTS_REFRESH_COOLDOWN_ACTIVE',
      retry_at: refreshState.comments_manual_cooldown_until,
    };
  }

  const hasPending = await blueprintYouTubeCommentsService.hasPendingRefreshJob({
    db: input.db,
    blueprintId,
    kind: 'comments',
  });
  if (hasPending) {
    return {
      ok: true,
      status: 'already_pending',
      cooldown_until: refreshState.comments_manual_cooldown_until,
      queue_depth: null,
    };
  }

  const queueDepth = await countQueueDepth(input.db, {
    statuses: ['queued', 'running'],
    scopes: [...QUEUED_INGESTION_SCOPES],
  });
  if (queueDepth >= youtubeRefreshQueueDepthGuard) {
    return {
      ok: false,
      code: 'COMMENTS_REFRESH_QUEUE_GUARDED',
      retry_after_seconds: 60,
      queue_depth: queueDepth,
    };
  }

  const claimedCooldown = await blueprintYouTubeCommentsService.claimManualCommentsRefreshCooldown({
    db: input.db,
    blueprintId,
    triggeredByUserId: requestedByUserId,
    previousCooldownUntil: refreshState.comments_manual_cooldown_until,
  });
  if (!claimedCooldown.claimed || !claimedCooldown.cooldownUntil) {
    const latestState = await blueprintYouTubeCommentsService.getRefreshStateForBlueprint({
      db: input.db,
      blueprintId,
    });
    return {
      ok: false,
      code: 'COMMENTS_REFRESH_COOLDOWN_ACTIVE',
      retry_at: latestState?.comments_manual_cooldown_until || null,
    };
  }

  try {
    const enqueueResult = await enqueueBlueprintYouTubeRefreshJob({
      db: input.db,
      blueprintId,
      refreshKind: 'comments',
      refreshTrigger: 'manual',
      requestedByUserId,
      youtubeVideoId: refreshState.youtube_video_id,
      sourceItemId: refreshState.source_item_id,
    });
    if (enqueueResult.suppressed) {
      await blueprintYouTubeCommentsService.releaseManualCommentsRefreshCooldown({
        db: input.db,
        blueprintId,
        expectedCooldownUntil: claimedCooldown.cooldownUntil,
        previousCooldownUntil: refreshState.comments_manual_cooldown_until,
        previousManualRefreshAt: refreshState.last_comments_manual_refresh_at,
        previousManualTriggeredBy: refreshState.last_comments_manual_triggered_by,
      });
      return {
        ok: false,
        code: 'COMMENTS_REFRESH_QUEUE_GUARDED',
        retry_after_seconds: 60,
        queue_depth: enqueueResult.queue_depth ?? queueDepth,
      };
    }
    return {
      ok: true,
      status: 'queued',
      cooldown_until: claimedCooldown.cooldownUntil,
      queue_depth: queueDepth,
    };
  } catch {
    await blueprintYouTubeCommentsService.releaseManualCommentsRefreshCooldown({
      db: input.db,
      blueprintId,
      expectedCooldownUntil: claimedCooldown.cooldownUntil,
      previousCooldownUntil: refreshState.comments_manual_cooldown_until,
      previousManualRefreshAt: refreshState.last_comments_manual_refresh_at,
      previousManualTriggeredBy: refreshState.last_comments_manual_triggered_by,
    });
    throw new Error('Could not enqueue manual YouTube comments refresh.');
  }
}

async function seedSourceTranscriptRevalidateJobs(
  db: ReturnType<typeof createClient>,
  limit = 50,
) {
  const cappedLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 50)));
  const { data: unlockRows, error: unlockError } = await db
    .from('source_item_unlocks')
    .select('id, source_item_id, source_page_id, status, last_error_code, transcript_status')
    .eq('status', 'available')
    .eq('last_error_code', 'NO_TRANSCRIPT_PERMANENT')
    .order('updated_at', { ascending: true })
    .limit(cappedLimit);
  if (unlockError) throw unlockError;

  const pending = (unlockRows || [])
    .filter((row) => normalizeTranscriptTruthStatus((row as { transcript_status?: unknown }).transcript_status) !== 'confirmed_no_speech');
  if (pending.length === 0) return { scanned: 0, enqueued: 0 };

  const sourceItemIds = Array.from(new Set(
    pending.map((row) => String((row as { source_item_id?: string }).source_item_id || '').trim()).filter(Boolean),
  ));
  const { data: sourceRows, error: sourceError } = await db
    .from('source_items')
    .select('id, source_native_id, source_url, title, source_channel_id, source_channel_title, source_page_id')
    .in('id', sourceItemIds);
  if (sourceError) throw sourceError;
  const sourceById = new Map((sourceRows || []).map((row) => [row.id, row]));

  let enqueued = 0;
  for (const unlockRow of pending) {
    const sourceItemId = String((unlockRow as { source_item_id?: string }).source_item_id || '').trim();
    const unlockId = String((unlockRow as { id?: string }).id || '').trim();
    const source = sourceById.get(sourceItemId);
    if (!source || !unlockId) continue;
    const videoId = String(source.source_native_id || '').trim();
    const sourceUrl = String(source.source_url || '').trim();
    const sourceChannelId = String(source.source_channel_id || '').trim();
    const title = String(source.title || '').trim();
    if (!videoId || !sourceUrl || !sourceChannelId || !title) continue;

    const enqueueResult = await enqueueSourceTranscriptRevalidateJob(db, {
      unlock_id: unlockId,
      source_item_id: sourceItemId,
      source_page_id: source.source_page_id || null,
      source_channel_id: sourceChannelId,
      source_channel_title: source.source_channel_title || null,
      video_id: videoId,
      video_url: sourceUrl,
      title,
    });
    if (enqueueResult.enqueued) enqueued += 1;
  }

  return {
    scanned: pending.length,
    enqueued,
  };
}

type RefreshVideoAttemptRow = {
  subscription_id: string;
  video_id: string;
  cooldown_until: string | null;
};

const RefreshSubscriptionsScanSchema = z.object({
  max_per_subscription: z.coerce.number().int().min(1).max(20).optional(),
  max_total: z.coerce.number().int().min(1).max(200).optional(),
});

const RefreshSubscriptionsGenerateSchema = z.object({
  items: z.array(
    z.object({
      subscription_id: z.string().uuid(),
      source_channel_id: z.string().min(1),
      source_channel_title: z.string().nullable().optional(),
      source_channel_url: z.string().nullable().optional(),
      video_id: z.string().min(1),
      video_url: z.string().url(),
      title: z.string().min(1),
      published_at: z.string().nullable().optional(),
      thumbnail_url: z.string().nullable().optional(),
      duration_seconds: z.number().int().min(0).nullable().optional(),
    }),
  ).min(1).max(200),
  requested_tier: z.enum(['free', 'tier']).optional(),
});

function getSupabaseErrorCode(error: unknown) {
  return String((error as { code?: string } | null)?.code || '').trim();
}

function isMissingTableError(error: unknown) {
  return getSupabaseErrorCode(error) === '42P01';
}

async function recoverStaleIngestionJobs(
  db: ReturnType<typeof createClient>,
  input?: { scope?: string; requestedByUserId?: string; olderThanMs?: number },
) {
  const nowIso = new Date().toISOString();
  const olderThanMs = Math.max(60_000, input?.olderThanMs || ingestionStaleRunningMs);
  const staleBeforeIso = new Date(Date.now() - olderThanMs).toISOString();

  let query = db
    .from('ingestion_jobs')
    .update({
      status: 'failed',
      finished_at: nowIso,
      error_code: 'STALE_RUNNING_RECOVERY',
      error_message: 'Recovered stale running job',
    })
    .eq('status', 'running')
    .not('started_at', 'is', null)
    .lt('started_at', staleBeforeIso);

  if (input?.scope) query = query.eq('scope', input.scope);
  if (input?.requestedByUserId) query = query.eq('requested_by_user_id', input.requestedByUserId);

  const { data, error } = await query.select('id, scope, requested_by_user_id');
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return data || [];
}

async function getActiveManualRefreshJob(db: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await db
    .from('ingestion_jobs')
    .select('id, status, started_at')
    .eq('requested_by_user_id', userId)
    .eq('scope', 'manual_refresh_selection')
    .in('status', ['queued', 'running'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return data || null;
}

function shouldAdvanceSubscriptionCheckpoint(
  currentPublishedAt: string | null,
  currentVideoId: string | null,
  nextPublishedAt: string | null,
  nextVideoId: string | null,
) {
  const candidateVideoId = String(nextVideoId || '').trim();
  if (!candidateVideoId) return false;
  if (!currentPublishedAt) return true;
  if (!nextPublishedAt) return false;

  const currentTs = Date.parse(currentPublishedAt);
  const nextTs = Date.parse(nextPublishedAt);
  if (Number.isNaN(currentTs)) return true;
  if (Number.isNaN(nextTs)) return false;
  if (nextTs > currentTs) return true;
  if (nextTs < currentTs) return false;
  if (!currentVideoId) return true;
  return candidateVideoId !== String(currentVideoId || '').trim();
}

async function markRefreshVideoFailureCooldown(
  db: ReturnType<typeof createClient>,
  input: { userId: string; subscriptionId: string; videoId: string; errorCode: string; errorMessage: string },
) {
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + refreshFailureCooldownHours * 60 * 60 * 1000);
  const { error } = await db.from('refresh_video_attempts').upsert(
    {
      user_id: input.userId,
      subscription_id: input.subscriptionId,
      video_id: input.videoId,
      last_attempt_at: now.toISOString(),
      last_result: 'failed',
      error_code: input.errorCode,
      error_message: input.errorMessage.slice(0, 500),
      cooldown_until: cooldownUntil.toISOString(),
    },
    { onConflict: 'user_id,subscription_id,video_id' },
  );
  if (error && !isMissingTableError(error)) throw error;
}

async function clearRefreshVideoFailureCooldown(
  db: ReturnType<typeof createClient>,
  input: { userId: string; subscriptionId: string; videoId: string },
) {
  const { error } = await db
    .from('refresh_video_attempts')
    .delete()
    .eq('user_id', input.userId)
    .eq('subscription_id', input.subscriptionId)
    .eq('video_id', input.videoId);
  if (error && !isMissingTableError(error)) throw error;
}

async function fetchActiveRefreshCooldownRows(
  db: ReturnType<typeof createClient>,
  input: { userId: string; subscriptionIds: string[]; videoIds: string[] },
) {
  if (!input.subscriptionIds.length || !input.videoIds.length) return [] as RefreshVideoAttemptRow[];
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('refresh_video_attempts')
    .select('subscription_id, video_id, cooldown_until')
    .eq('user_id', input.userId)
    .in('subscription_id', input.subscriptionIds)
    .in('video_id', input.videoIds)
    .not('cooldown_until', 'is', null)
    .gt('cooldown_until', nowIso);
  if (error) {
    if (isMissingTableError(error)) return [] as RefreshVideoAttemptRow[];
    throw error;
  }
  return (data || []) as RefreshVideoAttemptRow[];
}

async function collectRefreshCandidatesForUser(db: ReturnType<typeof createClient>, userId: string, options?: {
  maxPerSubscription?: number;
  maxTotal?: number;
}) {
  const maxPerSubscription = Math.max(1, Math.min(20, options?.maxPerSubscription || ingestionMaxPerSubscription));
  const maxTotal = Math.max(1, Math.min(200, options?.maxTotal || 100));

  const { data: subscriptions, error: subscriptionsError } = await db
    .from('user_source_subscriptions')
    .select('id, source_channel_id, source_channel_title, source_channel_url, last_seen_published_at, last_seen_video_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('source_type', 'youtube')
    .order('updated_at', { ascending: false });
  if (subscriptionsError) throw subscriptionsError;

  const scanErrors: Array<{ subscription_id: string; error: string }> = [];
  const rawCandidates: RefreshScanCandidate[] = [];
  let cooldownFiltered = 0;
  let durationFilteredCount = 0;
  let durationFilteredReasons: { too_long: number; unknown: number } = {
    too_long: 0,
    unknown: 0,
  };

  for (const subscription of subscriptions || []) {
    try {
      const feed = await fetchYouTubeFeed(subscription.source_channel_id, 20);
      const candidates = feed.videos
        .filter((video) =>
          isNewerThanCheckpoint(video, subscription.last_seen_published_at, subscription.last_seen_video_id),
        )
        .slice(0, maxPerSubscription);

      for (const video of candidates) {
        rawCandidates.push({
          subscription_id: subscription.id,
          source_channel_id: subscription.source_channel_id,
          source_channel_title: feed.channelTitle || subscription.source_channel_title || null,
          source_channel_url: subscription.source_channel_url || `https://www.youtube.com/channel/${subscription.source_channel_id}`,
          video_id: video.videoId,
          video_url: video.url,
          title: video.title,
          published_at: video.publishedAt,
          thumbnail_url: video.thumbnailUrl,
          duration_seconds: toDurationSeconds((video as { durationSeconds?: unknown }).durationSeconds),
        });
      }
    } catch (error) {
      scanErrors.push({
        subscription_id: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const dedupedMap = new Map<string, RefreshScanCandidate>();
  for (const candidate of rawCandidates) {
    dedupedMap.set(`${candidate.subscription_id}:${candidate.video_id}`, candidate);
  }
  let candidates = Array.from(dedupedMap.values());

  if (candidates.length > 0) {
    const canonicalKeys = candidates.map((candidate) => `youtube:${candidate.video_id}`);
    const { data: existingSources, error: existingSourcesError } = await db
      .from('source_items')
      .select('id, canonical_key')
      .in('canonical_key', canonicalKeys);
    if (existingSourcesError) throw existingSourcesError;

    const sourceIds = (existingSources || []).map((row) => row.id);
    const sourceIdsWithFeedItems = new Set<string>();
    if (sourceIds.length > 0) {
      const { data: existingFeedRows, error: existingFeedRowsError } = await db
        .from('user_feed_items')
        .select('source_item_id')
        .eq('user_id', userId)
        .in('source_item_id', sourceIds);
      if (existingFeedRowsError) throw existingFeedRowsError;
      for (const row of existingFeedRows || []) {
        if (row.source_item_id) sourceIdsWithFeedItems.add(row.source_item_id);
      }
    }

    const canonicalKeysWithFeedItems = new Set<string>();
    for (const source of existingSources || []) {
      if (source.id && sourceIdsWithFeedItems.has(source.id)) {
        canonicalKeysWithFeedItems.add(String(source.canonical_key || '').trim());
      }
    }

    candidates = candidates.filter((candidate) => !canonicalKeysWithFeedItems.has(`youtube:${candidate.video_id}`));
  }

  if (candidates.length > 0) {
    const split = await splitItemsByDurationPolicy({
      enabled: generationDurationCapEnabled,
      maxSeconds: generationMaxVideoSeconds,
      blockUnknown: generationBlockUnknownDuration,
      apiKey: youtubeDataApiKey,
      lookupTimeoutMs: generationDurationLookupTimeoutMs,
      userAgent: 'bleuv1-subscription-refresh-scan/1.0 (+https://api.bleup.app)',
      items: candidates,
    });
    candidates = split.allowed.map((item) => ({
      ...item,
      duration_seconds: toDurationSeconds(item.duration_seconds),
    }));
    durationFilteredCount = split.blocked.length;
    durationFilteredReasons = buildDurationFilteredReasonCounts(split.blocked);
  }

  if (candidates.length > 0) {
    const cooldownRows = await fetchActiveRefreshCooldownRows(db, {
      userId,
      subscriptionIds: Array.from(new Set(candidates.map((candidate) => candidate.subscription_id))),
      videoIds: Array.from(new Set(candidates.map((candidate) => candidate.video_id))),
    });
    const cooldownKeys = new Set(
      cooldownRows.map((row) => `${String(row.subscription_id || '').trim()}:${String(row.video_id || '').trim()}`),
    );
    const beforeCooldown = candidates.length;
    candidates = candidates.filter((candidate) => !cooldownKeys.has(`${candidate.subscription_id}:${candidate.video_id}`));
    cooldownFiltered = Math.max(0, beforeCooldown - candidates.length);
  }

  candidates = candidates
    .sort((a, b) => {
      const aTs = a.published_at ? Date.parse(a.published_at) : 0;
      const bTs = b.published_at ? Date.parse(b.published_at) : 0;
      return bTs - aTs;
    })
    .slice(0, maxTotal);

  return {
    subscriptionsTotal: (subscriptions || []).length,
    candidates,
    scanErrors,
    cooldownFiltered,
    durationFilteredCount,
    durationFilteredReasons,
  };
}

async function emitGenerationTerminalNotification(
  db: ReturnType<typeof createClient>,
  params: {
    userId: string;
    jobId: string;
    scope: string;
    inserted: number;
    skipped: number;
    failed: number;
    itemTitle?: string | null;
    blueprintTitle?: string | null;
    failureSummary?: string | null;
    traceId?: string | null;
    firstBlueprintId?: string | null;
    linkPath?: string | null;
  },
) {
  if (params.inserted <= 0 && params.failed <= 0) return;
  try {
    await createNotificationFromEvent(db, {
      kind: 'generation_terminal',
      userId: params.userId,
      jobId: params.jobId,
      scope: params.scope,
      inserted: params.inserted,
      skipped: params.skipped,
      failed: params.failed,
      itemTitle: params.itemTitle || null,
      blueprintTitle: params.blueprintTitle || null,
      failureSummary: params.failureSummary || null,
      traceId: params.traceId || null,
      linkPath: params.linkPath || null,
      firstBlueprintId: params.firstBlueprintId || null,
    });
  } catch (notificationError) {
    console.log('[notification_emit_failed]', JSON.stringify({
      kind: 'generation_terminal',
      user_id: params.userId,
      job_id: params.jobId,
      scope: params.scope,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
    }));
  }
}

function getGenerationNotificationLinkPath(input: {
  scope: string;
  sourcePagePath?: string | null;
}) {
  if (input.sourcePagePath) return input.sourcePagePath;
  switch (String(input.scope || '').trim()) {
    case 'search_video_generate':
      return '/search';
    case 'manual_refresh_selection':
      return '/subscriptions';
    case 'source_item_unlock_generation':
    case 'source_page_video_library_selection':
    default:
      return '/wall';
  }
}

function summarizeGenerationFailure(input: {
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const errorCode = String(input.errorCode || '').trim().toUpperCase();
  const errorMessage = String(input.errorMessage || '').trim();
  if (
    errorCode === 'NO_TRANSCRIPT_PERMANENT'
    || errorCode === 'NO_CAPTIONS'
    || errorCode === 'VIDEO_UNAVAILABLE'
  ) {
    return 'No transcript available for this video.';
  }
  if (errorCode === 'TRANSCRIPT_INSUFFICIENT_CONTEXT') {
    return "This video has very limited speech, so a blueprint can't be generated from it right now. If that seems incorrect, try again tomorrow.";
  }
  if (
    errorCode === 'TRANSCRIPT_UNAVAILABLE'
    || errorCode === 'ACCESS_DENIED'
    || errorCode === 'TRANSCRIPT_FETCH_FAIL'
    || errorCode === 'PROVIDER_FAIL'
    || errorCode === 'RATE_LIMITED'
    || errorCode === 'TIMEOUT'
  ) {
    return 'Transcript temporarily unavailable. Try again later.';
  }
  if (errorCode === 'VIDEO_TOO_LONG') {
    return 'This video is too long to generate right now.';
  }
  if (errorCode === 'VIDEO_DURATION_UNAVAILABLE') {
    return 'This video could not be processed because its duration is unavailable.';
  }
  return errorMessage || null;
}

async function emitGenerationStartedNotification(
  db: ReturnType<typeof createClient>,
  params: {
    userId: string;
    jobId: string;
    scope: string;
    queuedCount: number;
    itemTitle?: string | null;
    traceId?: string | null;
    linkPath?: string | null;
  },
) {
  const queuedCount = Math.max(0, Number(params.queuedCount || 0));
  if (queuedCount <= 0) return;

  try {
    const noisyWindowMs = 30_000;
    const { data: latestUnread, error: latestUnreadError } = await db
      .from('notifications')
      .select('id, created_at, metadata')
      .eq('user_id', params.userId)
      .eq('type', 'generation_started')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latestUnreadError && latestUnread) {
      const createdAtMs = Date.parse(String(latestUnread.created_at || ''));
      const scope = latestUnread.metadata && typeof latestUnread.metadata === 'object'
        ? String((latestUnread.metadata as Record<string, unknown>).scope || '').trim()
        : '';
      if (
        Number.isFinite(createdAtMs)
        && Date.now() - createdAtMs <= noisyWindowMs
        && scope === params.scope
      ) {
        console.log('[notification_generation_started_skipped]', JSON.stringify({
          user_id: params.userId,
          job_id: params.jobId,
          scope: params.scope,
          reason: 'scope_coalesce_window',
          noisy_window_ms: noisyWindowMs,
        }));
        return;
      }
    }

    await createNotificationFromEvent(db, {
      kind: 'generation_started',
      userId: params.userId,
      jobId: params.jobId,
      scope: params.scope,
      queuedCount,
      itemTitle: params.itemTitle || null,
      traceId: params.traceId || null,
      linkPath: params.linkPath || null,
    });
    console.log('[notification_generation_started_emitted]', JSON.stringify({
      user_id: params.userId,
      job_id: params.jobId,
      scope: params.scope,
      queued_count: queuedCount,
    }));
  } catch (notificationError) {
    console.log('[notification_emit_failed]', JSON.stringify({
      kind: 'generation_started',
      user_id: params.userId,
      job_id: params.jobId,
      scope: params.scope,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
    }));
  }
}

async function processSearchVideoGenerateJob(input: {
  jobId: string;
  userId: string;
  items: SearchVideoGenerateItem[];
  generationTier: GenerationTier;
  dualGenerateEnabled: boolean;
}) {
  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client not configured');
  }

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  const dualGenerateEnabled = false;
  const generationTier: GenerationTier = CANONICAL_GENERATION_TIER;
  const firstItemTitle = String(input.items[0]?.title || '').trim() || null;
  let firstBlueprintId: string | null = null;
  let firstBlueprintTitle: string | null = null;
  const failures: Array<{ video_id: string; error_code: string; error: string }> = [];

  for (const item of input.items) {
    let mirrorAttemptedForItem = false;
    const reservation = item.reservation || null;
    let reservationSettled = false;
    const settleReservationOnce = async () => {
      if (!reservation || reservationSettled) return;
      await settleManualGeneration(db, reservation);
      reservationSettled = true;
    };
    const releaseReservationIfPending = async () => {
      if (!reservation || reservationSettled) return;
      await releaseManualGeneration(db, reservation);
    };
    processed += 1;
    try {
      const source = await upsertSourceItemFromVideo(db, {
        video: {
          videoId: item.video_id,
          title: item.title,
          url: item.video_url,
          publishedAt: item.published_at || null,
          thumbnailUrl: item.thumbnail_url || null,
          durationSeconds: item.duration_seconds,
        },
        channelId: item.channel_id,
        channelTitle: item.channel_title || null,
        channelUrl: item.channel_url || null,
        sourcePageId: null,
      });

      const existingFeedItem = await getExistingFeedItem(db, input.userId, source.id);
      if (existingFeedItem && !dualGenerateEnabled) {
        await releaseReservationIfPending();
        skipped += 1;
        continue;
      }

      const tryMirrorGeneration = async () => {
        if (!dualGenerateEnabled) return;
        mirrorAttemptedForItem = true;
        await ensureMirrorVariantForQueueItem({
          db,
          enabled: dualGenerateEnabled,
          jobId: input.jobId,
          scope: 'search_video_generate',
          userId: input.userId,
          sourceItemId: source.id,
          videoUrl: source.source_url,
          videoId: source.source_native_id,
          durationSeconds: item.duration_seconds,
          sourceTag: 'youtube_search_direct',
          primaryTier: generationTier,
        });
      };

      let generated: { blueprintId: string; runId: string; title: string } | null = null;
      try {
        generated = await createBlueprintFromVideo(db, {
          userId: input.userId,
          videoUrl: source.source_url,
          videoId: source.source_native_id,
          videoTitle: item.title,
          durationSeconds: item.duration_seconds,
          sourceTag: 'youtube_search_direct',
          sourceItemId: source.id,
          subscriptionId: null,
          generationTier,
          onBeforeFirstModelDispatch: settleReservationOnce,
        });
      } catch (primaryError) {
        await tryMirrorGeneration();
        throw primaryError;
      }

      await tryMirrorGeneration();
      if (!generated) throw new Error('PRIMARY_GENERATION_MISSING');
      if (generated.creationState === 'ready_existing') {
        await releaseReservationIfPending();
      }

      if (existingFeedItem) {
        await releaseReservationIfPending();
        skipped += 1;
        continue;
      }

      const insertedItem = await insertFeedItem(db, {
        userId: input.userId,
        sourceItemId: source.id,
        blueprintId: generated.blueprintId,
        state: 'my_feed_published',
      });
      if (insertedItem) inserted += 1;
      else skipped += 1;
      if (insertedItem && !firstBlueprintId) firstBlueprintId = generated.blueprintId;
      if (insertedItem && !firstBlueprintTitle) firstBlueprintTitle = String(generated.title || '').trim() || null;

      if (insertedItem) {
        try {
          await runAutoChannelForFeedItem({
            db,
            userId: input.userId,
            userFeedItemId: insertedItem.id,
            blueprintId: generated.blueprintId,
            sourceItemId: source.id,
            sourceTag: 'youtube_search_direct',
          });
        } catch (autoChannelError) {
          console.log('[auto_channel_pipeline_failed]', JSON.stringify({
            user_id: input.userId,
            user_feed_item_id: insertedItem.id,
            blueprint_id: generated.blueprintId,
            source_item_id: source.id,
            source_tag: 'youtube_search_direct',
            error: autoChannelError instanceof Error ? autoChannelError.message : String(autoChannelError),
          }));
        }
      }
    } catch (error) {
      if (error instanceof BlueprintVariantInProgressError) {
        await releaseReservationIfPending();
        if (!mirrorAttemptedForItem && dualGenerateEnabled) {
          try {
            const source = await upsertSourceItemFromVideo(db, {
              video: {
                videoId: item.video_id,
                title: item.title,
                url: item.video_url,
                publishedAt: item.published_at || null,
                thumbnailUrl: item.thumbnail_url || null,
                durationSeconds: item.duration_seconds,
              },
              channelId: item.channel_id,
              channelTitle: item.channel_title || null,
              channelUrl: item.channel_url || null,
              sourcePageId: null,
            });
            await ensureMirrorVariantForQueueItem({
              db,
              enabled: dualGenerateEnabled,
              jobId: input.jobId,
              scope: 'search_video_generate',
              userId: input.userId,
              sourceItemId: source.id,
              videoUrl: source.source_url,
              videoId: source.source_native_id,
              durationSeconds: item.duration_seconds,
              sourceTag: 'youtube_search_direct',
              primaryTier: generationTier,
            });
          } catch {
            // no-op: preserve existing in-progress handling
          }
        }
        skipped += 1;
        console.log('[search_video_generate_variant_in_progress]', JSON.stringify({
          job_id: input.jobId,
          user_id: input.userId,
          video_id: item.video_id,
          source_item_id: error.sourceItemId,
          generation_tier: error.generationTier,
          active_job_id: error.activeJobId,
        }));
        continue;
      }
      await releaseReservationIfPending();
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof PipelineError
        ? error.errorCode
        : getSupabaseErrorCode(error) || 'GENERATION_FAILED';
      failures.push({
        video_id: item.video_id,
        error_code: errorCode,
        error: message,
      });
      console.log('[search_video_generate_item_failed]', JSON.stringify({
        job_id: input.jobId,
        user_id: input.userId,
        video_id: item.video_id,
        channel_id: item.channel_id,
        error_code: errorCode,
        error: message.slice(0, 220),
      }));
    }
  }

  await db.from('ingestion_jobs').update({
    status: failures.length ? 'failed' : 'succeeded',
    finished_at: new Date().toISOString(),
    processed_count: processed,
    inserted_count: inserted,
    skipped_count: skipped,
    lease_expires_at: null,
    worker_id: null,
    last_heartbeat_at: new Date().toISOString(),
    error_code: failures.length ? 'PARTIAL_FAILURE' : null,
    error_message: failures.length ? JSON.stringify(failures).slice(0, 1000) : null,
  }).eq('id', input.jobId);

  await emitGenerationTerminalNotification(db, {
    userId: input.userId,
    jobId: input.jobId,
    scope: 'search_video_generate',
    inserted,
    skipped,
    failed: failures.length,
    itemTitle: firstItemTitle,
    blueprintTitle: firstBlueprintTitle,
    linkPath: getGenerationNotificationLinkPath({ scope: 'search_video_generate' }),
    firstBlueprintId,
  });

  console.log('[search_video_generate_job_done]', JSON.stringify({
    job_id: input.jobId,
    user_id: input.userId,
    processed,
    inserted,
    skipped,
    failures: failures.length,
  }));
}

async function ensureMirrorVariantForQueueItem(input: {
  db: ReturnType<typeof createClient>;
  enabled: boolean;
  jobId: string;
  scope: string;
  userId: string;
  sourceItemId: string;
  videoUrl: string;
  videoId: string;
  durationSeconds: number | null;
  sourceTag: 'subscription_auto' | 'source_page_video_library' | 'youtube_search_direct';
  primaryTier: GenerationTier;
  subscriptionId?: string | null;
}) {
  return;
}

async function processManualRefreshGenerateJob(input: {
  jobId: string;
  userId: string;
  items: RefreshScanCandidate[];
  generationTier: GenerationTier;
  dualGenerateEnabled: boolean;
}) {
  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client not configured');
  }

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  const firstItemTitle = String(input.items[0]?.title || '').trim() || null;
  let firstBlueprintId: string | null = null;
  let firstBlueprintTitle: string | null = null;
  const failures: Array<{ subscription_id: string; video_id: string; error_code: string; error: string }> = [];
  const checkpointBySubscription = new Map<string, { publishedAt: string | null; videoId: string }>();

  const recordCheckpointCandidate = (item: RefreshScanCandidate) => {
    const videoId = String(item.video_id || '').trim();
    if (!videoId) return;
    const current = checkpointBySubscription.get(item.subscription_id);
    if (!current) {
      checkpointBySubscription.set(item.subscription_id, {
        publishedAt: item.published_at || null,
        videoId,
      });
      return;
    }
    if (
      shouldAdvanceSubscriptionCheckpoint(
        current.publishedAt,
        current.videoId,
        item.published_at || null,
        videoId,
      )
    ) {
      checkpointBySubscription.set(item.subscription_id, {
        publishedAt: item.published_at || null,
        videoId,
      });
    }
  };

  const subscriptionIds = Array.from(new Set(input.items.map((item) => item.subscription_id)));
  const { data: subscriptions, error: subscriptionsError } = await db
    .from('user_source_subscriptions')
    .select('id, user_id, source_channel_id, source_channel_title, source_page_id, last_seen_published_at, last_seen_video_id')
    .eq('user_id', input.userId)
    .eq('is_active', true)
    .in('id', subscriptionIds);
  if (subscriptionsError) throw subscriptionsError;
  const subscriptionById = new Map((subscriptions || []).map((row) => [row.id, row]));
  const dualGenerateEnabled = false;
  const generationTier: GenerationTier = CANONICAL_GENERATION_TIER;

  for (const item of input.items) {
    let mirrorAttemptedForItem = false;
    const reservation = item.reservation || null;
    let reservationSettled = false;
    const settleReservationOnce = async () => {
      if (!reservation || reservationSettled) return;
      await settleManualGeneration(db, reservation);
      reservationSettled = true;
    };
    const releaseReservationIfPending = async () => {
      if (!reservation || reservationSettled) return;
      await releaseManualGeneration(db, reservation);
    };
    processed += 1;
    const subscription = subscriptionById.get(item.subscription_id);
    if (!subscription) {
      await releaseReservationIfPending();
      skipped += 1;
      continue;
    }
    if (subscription.source_channel_id !== item.source_channel_id) {
      await releaseReservationIfPending();
      skipped += 1;
      continue;
    }

    try {
      const source = await upsertSourceItemFromVideo(db, {
        video: {
          videoId: item.video_id,
          title: item.title,
          url: item.video_url,
          publishedAt: item.published_at || null,
          thumbnailUrl: item.thumbnail_url || null,
          durationSeconds: item.duration_seconds,
        },
        channelId: subscription.source_channel_id,
        channelTitle: item.source_channel_title || subscription.source_channel_title || null,
        sourcePageId: subscription.source_page_id || null,
      });

      const existingFeedItem = await getExistingFeedItem(db, input.userId, source.id);
      if (existingFeedItem && !dualGenerateEnabled) {
        await releaseReservationIfPending();
        skipped += 1;
        recordCheckpointCandidate(item);
        continue;
      }

      const tryMirrorGeneration = async () => {
        if (!dualGenerateEnabled) return;
        mirrorAttemptedForItem = true;
        await ensureMirrorVariantForQueueItem({
          db,
          enabled: dualGenerateEnabled,
          jobId: input.jobId,
          scope: 'manual_refresh_selection',
          userId: input.userId,
          sourceItemId: source.id,
          videoUrl: source.source_url,
          videoId: source.source_native_id,
          durationSeconds: item.duration_seconds,
          sourceTag: 'subscription_auto',
          primaryTier: generationTier,
          subscriptionId: subscription.id,
        });
      };

      let generated: { blueprintId: string; runId: string; title: string } | null = null;
      try {
        generated = await createBlueprintFromVideo(db, {
          userId: input.userId,
          videoUrl: source.source_url,
          videoId: source.source_native_id,
          videoTitle: item.title,
          durationSeconds: item.duration_seconds,
          sourceTag: 'subscription_auto',
          sourceItemId: source.id,
          subscriptionId: subscription.id,
          generationTier,
          onBeforeFirstModelDispatch: settleReservationOnce,
        });
      } catch (primaryError) {
        await tryMirrorGeneration();
        throw primaryError;
      }

      await tryMirrorGeneration();
      if (!generated) throw new Error('PRIMARY_GENERATION_MISSING');
      if (generated.creationState === 'ready_existing') {
        await releaseReservationIfPending();
      }

      if (existingFeedItem) {
        await releaseReservationIfPending();
        skipped += 1;
        recordCheckpointCandidate(item);
        continue;
      }

      const insertedItem = await insertFeedItem(db, {
        userId: input.userId,
        sourceItemId: source.id,
        blueprintId: generated.blueprintId,
        state: 'my_feed_published',
      });
      if (insertedItem) inserted += 1;
      else skipped += 1;
      if (insertedItem && !firstBlueprintId) firstBlueprintId = generated.blueprintId;
      if (insertedItem && !firstBlueprintTitle) firstBlueprintTitle = String(generated.title || '').trim() || null;

      if (insertedItem) {
        try {
          await runAutoChannelForFeedItem({
            db,
            userId: input.userId,
            userFeedItemId: insertedItem.id,
            blueprintId: generated.blueprintId,
            sourceItemId: source.id,
            sourceTag: 'manual_refresh_generate',
          });
        } catch (autoChannelError) {
          console.log('[auto_channel_pipeline_failed]', JSON.stringify({
            user_id: input.userId,
            user_feed_item_id: insertedItem.id,
            blueprint_id: generated.blueprintId,
            source_item_id: source.id,
            source_tag: 'manual_refresh_generate',
            error: autoChannelError instanceof Error ? autoChannelError.message : String(autoChannelError),
          }));
        }
      }

      recordCheckpointCandidate(item);
      await clearRefreshVideoFailureCooldown(db, {
        userId: input.userId,
        subscriptionId: item.subscription_id,
        videoId: item.video_id,
      });
      console.log('[subscription_refresh_generate_item_succeeded]', JSON.stringify({
        job_id: input.jobId,
        user_id: input.userId,
        subscription_id: item.subscription_id,
        video_id: item.video_id,
        blueprint_id: generated.blueprintId,
        source_item_id: source.id,
      }));
    } catch (error) {
      if (error instanceof BlueprintVariantInProgressError) {
        await releaseReservationIfPending();
        if (!mirrorAttemptedForItem && dualGenerateEnabled) {
          try {
            const source = await upsertSourceItemFromVideo(db, {
              video: {
                videoId: item.video_id,
                title: item.title,
                url: item.video_url,
                publishedAt: item.published_at || null,
                thumbnailUrl: item.thumbnail_url || null,
                durationSeconds: item.duration_seconds,
              },
              channelId: subscription.source_channel_id,
              channelTitle: item.source_channel_title || subscription.source_channel_title || null,
              sourcePageId: subscription.source_page_id || null,
            });
            await ensureMirrorVariantForQueueItem({
              db,
              enabled: dualGenerateEnabled,
              jobId: input.jobId,
              scope: 'manual_refresh_selection',
              userId: input.userId,
              sourceItemId: source.id,
              videoUrl: source.source_url,
              videoId: source.source_native_id,
              durationSeconds: item.duration_seconds,
              sourceTag: 'subscription_auto',
              primaryTier: generationTier,
              subscriptionId: subscription.id,
            });
          } catch {
            // no-op: preserve existing in-progress handling
          }
        }
        skipped += 1;
        console.log('[subscription_refresh_generate_variant_in_progress]', JSON.stringify({
          job_id: input.jobId,
          user_id: input.userId,
          subscription_id: item.subscription_id,
          video_id: item.video_id,
          source_item_id: error.sourceItemId,
          generation_tier: error.generationTier,
          active_job_id: error.activeJobId,
        }));
        continue;
      }
      await releaseReservationIfPending();
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof PipelineError
        ? error.errorCode
        : getSupabaseErrorCode(error) || 'GENERATION_FAILED';
      failures.push({
        subscription_id: item.subscription_id,
        video_id: item.video_id,
        error_code: errorCode,
        error: message,
      });
      await markRefreshVideoFailureCooldown(db, {
        userId: input.userId,
        subscriptionId: item.subscription_id,
        videoId: item.video_id,
        errorCode,
        errorMessage: message,
      });
      console.log('[subscription_refresh_generate_item_failed]', JSON.stringify({
        job_id: input.jobId,
        user_id: input.userId,
        subscription_id: item.subscription_id,
        video_id: item.video_id,
        error_code: errorCode,
        error: message.slice(0, 220),
      }));
    }
  }

  const checkpointUpdatedAt = new Date().toISOString();
  for (const [subscriptionId, checkpoint] of checkpointBySubscription.entries()) {
    const subscription = subscriptionById.get(subscriptionId);
    if (!subscription) continue;

    const shouldAdvance = shouldAdvanceSubscriptionCheckpoint(
      subscription.last_seen_published_at || null,
      subscription.last_seen_video_id || null,
      checkpoint.publishedAt,
      checkpoint.videoId,
    );
    if (!shouldAdvance) continue;

    const { error: checkpointError } = await db
      .from('user_source_subscriptions')
      .update({
        last_seen_published_at: checkpoint.publishedAt,
        last_seen_video_id: checkpoint.videoId,
        last_polled_at: checkpointUpdatedAt,
        last_sync_error: null,
      })
      .eq('id', subscriptionId)
      .eq('user_id', input.userId);
    if (checkpointError) {
      console.log('[subscription_manual_refresh_checkpoint_update_failed]', JSON.stringify({
        job_id: input.jobId,
        user_id: input.userId,
        subscription_id: subscriptionId,
        error: checkpointError.message,
      }));
    }
  }

  await db.from('ingestion_jobs').update({
    status: failures.length ? 'failed' : 'succeeded',
    finished_at: new Date().toISOString(),
    processed_count: processed,
    inserted_count: inserted,
    skipped_count: skipped,
    lease_expires_at: null,
    worker_id: null,
    last_heartbeat_at: new Date().toISOString(),
    error_code: failures.length ? 'PARTIAL_FAILURE' : null,
    error_message: failures.length ? JSON.stringify(failures).slice(0, 1000) : null,
  }).eq('id', input.jobId);

  await emitGenerationTerminalNotification(db, {
    userId: input.userId,
    jobId: input.jobId,
    scope: 'manual_refresh_selection',
    inserted,
    skipped,
    failed: failures.length,
    itemTitle: firstItemTitle,
    blueprintTitle: firstBlueprintTitle,
    linkPath: getGenerationNotificationLinkPath({ scope: 'manual_refresh_selection' }),
    firstBlueprintId,
  });

  console.log('[subscription_manual_refresh_job_done]', JSON.stringify({
    job_id: input.jobId,
    user_id: input.userId,
    processed,
    inserted,
    skipped,
    failures: failures.length,
  }));
}

async function processSourcePageVideoLibraryJob(input: {
  jobId: string;
  userId: string;
  sourcePageId: string;
  sourceChannelId: string;
  sourceChannelTitle: string | null;
  items: SourcePageVideoGenerateItem[];
}) {
  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client not configured');
  }

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  const firstItemTitle = String(input.items[0]?.title || '').trim() || null;
  let firstBlueprintId: string | null = null;
  let firstBlueprintTitle: string | null = null;
  const failures: Array<{ video_id: string; error_code: string; error: string }> = [];

  for (const item of input.items) {
    processed += 1;
    try {
      const source = await upsertSourceItemFromVideo(db, {
        video: {
          videoId: item.video_id,
          title: item.title,
          url: item.video_url,
          publishedAt: item.published_at || null,
          thumbnailUrl: item.thumbnail_url || null,
          durationSeconds: item.duration_seconds,
        },
        channelId: input.sourceChannelId,
        channelTitle: input.sourceChannelTitle,
        sourcePageId: input.sourcePageId,
      });

      const existingFeedItem = await getExistingFeedItem(db, input.userId, source.id);
      if (existingFeedItem) {
        skipped += 1;
        continue;
      }

      const generated = await createBlueprintFromVideo(db, {
        userId: input.userId,
        videoUrl: source.source_url,
        videoId: source.source_native_id,
        videoTitle: item.title,
        durationSeconds: item.duration_seconds,
        sourceTag: 'source_page_video_library',
        sourceItemId: source.id,
        subscriptionId: null,
      });

      const insertedItem = await insertFeedItem(db, {
        userId: input.userId,
        sourceItemId: source.id,
        blueprintId: generated.blueprintId,
        state: 'my_feed_published',
      });
      if (insertedItem) inserted += 1;
      else skipped += 1;
      if (insertedItem && !firstBlueprintId) firstBlueprintId = generated.blueprintId;
      if (insertedItem && !firstBlueprintTitle) firstBlueprintTitle = String(generated.title || '').trim() || null;

      if (insertedItem) {
        try {
          await runAutoChannelForFeedItem({
            db,
            userId: input.userId,
            userFeedItemId: insertedItem.id,
            blueprintId: generated.blueprintId,
            sourceItemId: source.id,
            sourceTag: 'source_page_video_library',
          });
        } catch (autoChannelError) {
          console.log('[auto_channel_pipeline_failed]', JSON.stringify({
            user_id: input.userId,
            user_feed_item_id: insertedItem.id,
            blueprint_id: generated.blueprintId,
            source_item_id: source.id,
            source_tag: 'source_page_video_library',
            error: autoChannelError instanceof Error ? autoChannelError.message : String(autoChannelError),
          }));
        }
      }
    } catch (error) {
      if (error instanceof BlueprintVariantInProgressError) {
        skipped += 1;
        console.log('[source_page_video_generate_variant_in_progress]', JSON.stringify({
          job_id: input.jobId,
          user_id: input.userId,
          source_page_id: input.sourcePageId,
          source_channel_id: input.sourceChannelId,
          video_id: item.video_id,
          source_item_id: error.sourceItemId,
          generation_tier: error.generationTier,
          active_job_id: error.activeJobId,
        }));
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof PipelineError
        ? error.errorCode
        : getSupabaseErrorCode(error) || 'GENERATION_FAILED';
      failures.push({
        video_id: item.video_id,
        error_code: errorCode,
        error: message,
      });
      console.log('[source_page_video_generate_item_failed]', JSON.stringify({
        job_id: input.jobId,
        user_id: input.userId,
        source_page_id: input.sourcePageId,
        source_channel_id: input.sourceChannelId,
        video_id: item.video_id,
        error_code: errorCode,
        error: message.slice(0, 220),
      }));
    }
  }

  await db.from('ingestion_jobs').update({
    status: failures.length ? 'failed' : 'succeeded',
    finished_at: new Date().toISOString(),
    processed_count: processed,
    inserted_count: inserted,
    skipped_count: skipped,
    lease_expires_at: null,
    worker_id: null,
    last_heartbeat_at: new Date().toISOString(),
    error_code: failures.length ? 'PARTIAL_FAILURE' : null,
    error_message: failures.length ? JSON.stringify(failures).slice(0, 1000) : null,
  }).eq('id', input.jobId);

  await emitGenerationTerminalNotification(db, {
    userId: input.userId,
    jobId: input.jobId,
    scope: 'source_page_video_library_selection',
    inserted,
    skipped,
    failed: failures.length,
    itemTitle: firstItemTitle,
    blueprintTitle: firstBlueprintTitle,
    linkPath: getGenerationNotificationLinkPath({ scope: 'source_item_unlock_generation' }),
    firstBlueprintId,
  });

  console.log('[source_page_video_generate_job_done]', JSON.stringify({
    job_id: input.jobId,
    user_id: input.userId,
    source_page_id: input.sourcePageId,
    source_channel_id: input.sourceChannelId,
    processed,
    inserted,
    skipped,
    failures: failures.length,
  }));
}

async function processSourceItemUnlockGenerationJob(input: {
  jobId: string;
  userId: string;
  items: SourceUnlockQueueItem[];
  traceId: string;
  generationTier: GenerationTier;
}) {
  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client not configured');
  }

  logUnlockEvent(
    'unlock_job_started',
    { trace_id: input.traceId, job_id: input.jobId, user_id: input.userId },
    { queued_count: input.items.length },
  );

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  const firstItemTitle = String(input.items[0]?.title || '').trim() || null;
  let firstBlueprintId: string | null = null;
  let firstBlueprintTitle: string | null = null;
  let notifyFailedCount = 0;
  const failures: Array<{ video_id: string; unlock_id: string; error_code: string; error: string }> = [];
  const dualGenerateEnabled = false;

  for (const item of input.items) {
    let mirrorAttemptedForItem = false;
    let processingUnlockRow: SourceItemUnlockRow | null = null;
    let skipUnlockSettlement = false;
    let sourceRowForMirror: {
      id: string;
      source_url: string;
      source_native_id: string;
    } | null = null;
    const itemGenerationTier: GenerationTier = CANONICAL_GENERATION_TIER;
    const autoIntentId = String(item.auto_intent_id || '').trim() || null;
    let autoIntentSettled = false;
    let autoIntentReleased = false;
    const settleAutoIntentOnce = async () => {
      if (!autoIntentId || autoIntentSettled || autoIntentReleased) return;
      const settled = await settleAutoUnlockIntent(db, {
        intentId: autoIntentId,
        jobId: input.jobId,
        traceId: input.traceId,
      });
      if (settled.intent?.status === 'settled' || settled.intent?.status === 'ready') {
        autoIntentSettled = true;
      }
    };
    const releaseAutoIntentIfPending = async (releaseInput: {
      reasonCode: string;
      blueprintId?: string | null;
      lastErrorCode?: string | null;
      lastErrorMessage?: string | null;
    }) => {
      if (!autoIntentId || autoIntentSettled || autoIntentReleased) return;
      const released = await releaseAutoUnlockIntent(db, {
        intentId: autoIntentId,
        reasonCode: releaseInput.reasonCode,
        blueprintId: releaseInput.blueprintId || null,
        jobId: input.jobId,
        traceId: input.traceId,
        lastErrorCode: releaseInput.lastErrorCode || null,
        lastErrorMessage: releaseInput.lastErrorMessage || null,
      });
      if (released.intent?.status === 'released') {
        autoIntentReleased = true;
      }
    };
    processed += 1;
    try {
      const processingUnlock = await markUnlockProcessing(db, {
        unlockId: item.unlock_id,
        userId: item.reserved_by_user_id,
        jobId: input.jobId,
        reservationSeconds: sourceUnlockReservationSeconds,
      });
      processingUnlockRow = processingUnlock;

      if (!processingUnlock) {
        const current = await getSourceItemUnlockBySourceItemId(db, item.source_item_id);
        const variantState = await resolveVariantOrReady({
          sourceItemId: item.source_item_id,
          generationTier: itemGenerationTier,
        });
        if (variantState.state === 'ready' && variantState.blueprintId) {
          if (!dualGenerateEnabled) {
            await releaseAutoIntentIfPending({
              reasonCode: 'AUTO_UNLOCK_ALREADY_READY',
              blueprintId: variantState.blueprintId,
            });
            skipped += 1;
            continue;
          }
          skipUnlockSettlement = true;
        }
        if (variantState.state === 'in_progress') {
          if (dualGenerateEnabled) {
            const { data: sourceForMirror } = await db
              .from('source_items')
              .select('id, source_url, source_native_id')
              .eq('id', item.source_item_id)
              .maybeSingle();
            if (sourceForMirror?.id && sourceForMirror.source_url && sourceForMirror.source_native_id) {
              await ensureMirrorVariantForQueueItem({
                db,
                enabled: true,
                jobId: input.jobId,
                scope: 'source_item_unlock_generation',
                userId: input.userId,
                sourceItemId: sourceForMirror.id,
                videoUrl: sourceForMirror.source_url,
                videoId: sourceForMirror.source_native_id,
                durationSeconds: item.duration_seconds,
                sourceTag: 'source_page_video_library',
                primaryTier: itemGenerationTier,
              });
            }
          }
          await releaseAutoIntentIfPending({
            reasonCode: 'AUTO_UNLOCK_ALREADY_IN_PROGRESS',
            lastErrorCode: 'ALREADY_IN_PROGRESS',
            lastErrorMessage: 'Variant generation already in progress.',
          });
          skipped += 1;
          continue;
        }
        if (skipUnlockSettlement) {
          // Dual-generate mode: primary is already ready, keep going so mirror can be ensured.
        } else if (current?.status === 'ready' && current.blueprint_id) {
          skipUnlockSettlement = true;
        } else {
          await releaseAutoIntentIfPending({
            reasonCode: 'AUTO_UNLOCK_SKIPPED_NO_PROCESSING_UNLOCK',
          });
          skipped += 1;
          continue;
        }
      }

      if (processingUnlock && processingUnlock.status === 'ready' && processingUnlock.blueprint_id) {
        const variantState = await resolveVariantOrReady({
          sourceItemId: item.source_item_id,
          generationTier: itemGenerationTier,
        });
        if (variantState.state === 'ready' && variantState.blueprintId) {
          if (!dualGenerateEnabled) {
            await releaseAutoIntentIfPending({
              reasonCode: 'AUTO_UNLOCK_ALREADY_READY',
              blueprintId: variantState.blueprintId,
            });
            skipped += 1;
            continue;
          }
          skipUnlockSettlement = true;
        }
        if (variantState.state === 'in_progress') {
          if (dualGenerateEnabled) {
            const { data: sourceForMirror } = await db
              .from('source_items')
              .select('id, source_url, source_native_id')
              .eq('id', item.source_item_id)
              .maybeSingle();
            if (sourceForMirror?.id && sourceForMirror.source_url && sourceForMirror.source_native_id) {
              await ensureMirrorVariantForQueueItem({
                db,
                enabled: true,
                jobId: input.jobId,
                scope: 'source_item_unlock_generation',
                userId: input.userId,
                sourceItemId: sourceForMirror.id,
                videoUrl: sourceForMirror.source_url,
                videoId: sourceForMirror.source_native_id,
                durationSeconds: item.duration_seconds,
                sourceTag: 'source_page_video_library',
                primaryTier: itemGenerationTier,
              });
            }
          }
          await releaseAutoIntentIfPending({
            reasonCode: 'AUTO_UNLOCK_ALREADY_IN_PROGRESS',
            lastErrorCode: 'ALREADY_IN_PROGRESS',
            lastErrorMessage: 'Variant generation already in progress.',
          });
          skipped += 1;
          continue;
        }
        if (!skipUnlockSettlement) {
          skipUnlockSettlement = true;
        }
      }

      const { data: sourceRow, error: sourceError } = await db
        .from('source_items')
        .select('id, source_url, source_native_id, source_page_id, source_channel_id, source_channel_title, title')
        .eq('id', item.source_item_id)
        .maybeSingle();

      if (sourceError || !sourceRow) {
        throw new Error(sourceError?.message || 'SOURCE_ITEM_NOT_FOUND');
      }
      sourceRowForMirror = {
        id: sourceRow.id,
        source_url: sourceRow.source_url,
        source_native_id: sourceRow.source_native_id,
      };

      const tryMirrorGeneration = async () => {
        if (!dualGenerateEnabled) return;
        mirrorAttemptedForItem = true;
        await ensureMirrorVariantForQueueItem({
          db,
          enabled: dualGenerateEnabled,
          jobId: input.jobId,
          scope: 'source_item_unlock_generation',
          userId: input.userId,
          sourceItemId: sourceRow.id,
          videoUrl: sourceRow.source_url,
          videoId: sourceRow.source_native_id,
          durationSeconds: item.duration_seconds,
          sourceTag: 'source_page_video_library',
          primaryTier: itemGenerationTier,
        });
      };

      let generated: { blueprintId: string; runId: string; title: string } | null = null;
      try {
        generated = await createBlueprintFromVideo(db, {
          userId: input.userId,
          videoUrl: sourceRow.source_url,
          videoId: sourceRow.source_native_id,
          videoTitle: item.title,
          durationSeconds: item.duration_seconds,
          sourceTag: 'source_page_video_library',
          sourceItemId: sourceRow.id,
          subscriptionId: null,
          generationTier: itemGenerationTier,
          onBeforeFirstModelDispatch: autoIntentId ? settleAutoIntentOnce : undefined,
        });
      } catch (primaryError) {
        await tryMirrorGeneration();
        throw primaryError;
      }
      await tryMirrorGeneration();
      if (!generated) throw new Error('PRIMARY_GENERATION_MISSING');
      if (generated.creationState === 'ready_existing') {
        await releaseAutoIntentIfPending({
          reasonCode: 'AUTO_UNLOCK_ALREADY_READY',
          blueprintId: generated.blueprintId,
        });
      }

      const feedRows = await attachBlueprintToSubscribedUsers(db, {
        sourceItemId: sourceRow.id,
        sourcePageId: sourceRow.source_page_id || item.source_page_id || null,
        sourceChannelId: sourceRow.source_channel_id || item.source_channel_id || null,
        blueprintId: generated.blueprintId,
        unlockingUserId: input.userId,
      });

      const unlockingFeed = feedRows.find((row) => row.user_id === input.userId) || null;
      if (unlockingFeed) {
        try {
          await runAutoChannelForFeedItem({
            db,
            userId: input.userId,
            userFeedItemId: unlockingFeed.id,
            blueprintId: generated.blueprintId,
            sourceItemId: sourceRow.id,
            sourceTag: 'source_unlock_generation',
          });
        } catch (autoChannelError) {
          logUnlockEvent(
            'auto_channel_pipeline_failed',
            {
              trace_id: input.traceId,
              job_id: input.jobId,
              user_id: input.userId,
              source_item_id: sourceRow.id,
            },
            {
              user_feed_item_id: unlockingFeed.id,
              blueprint_id: generated.blueprintId,
              source_tag: 'source_unlock_generation',
              error: autoChannelError instanceof Error ? autoChannelError.message : String(autoChannelError),
            },
          );
        }
      }

      if (!skipUnlockSettlement && processingUnlockRow) {
        await completeUnlock(db, {
          unlockId: item.unlock_id,
          blueprintId: generated.blueprintId,
          jobId: input.jobId,
        });
        await markUnlockTranscriptSuccess(db, item.unlock_id);

        if (item.reserved_cost > 0) {
          await settleReservation(db, {
            userId: item.reserved_by_user_id,
            amount: item.reserved_cost,
            idempotencyKey: buildUnlockLedgerIdempotencyKey({
              unlockId: item.unlock_id,
              userId: item.reserved_by_user_id,
              action: 'settle',
            }),
            reasonCode: 'UNLOCK_SETTLE',
            context: {
              source_item_id: item.source_item_id,
              source_page_id: item.source_page_id,
              unlock_id: item.unlock_id,
              metadata: {
                job_id: input.jobId,
                blueprint_id: generated.blueprintId,
                trace_id: input.traceId,
              },
            },
          });
        }
      }
      if (autoIntentId) {
        if (!autoIntentSettled) {
          await settleAutoIntentOnce();
        }
        if (!autoIntentReleased) {
          await markAutoUnlockIntentReady(db, {
            intentId: autoIntentId,
            blueprintId: generated.blueprintId,
            jobId: input.jobId,
          });
        }
      }

      inserted += 1;
      if (!firstBlueprintId) firstBlueprintId = generated.blueprintId;
      if (!firstBlueprintTitle) firstBlueprintTitle = String(generated.title || '').trim() || null;

      logUnlockEvent(
        'unlock_item_succeeded',
        {
          trace_id: input.traceId,
          job_id: input.jobId,
          unlock_id: item.unlock_id,
          source_item_id: item.source_item_id,
          video_id: item.video_id,
        },
        {
          blueprint_id: generated.blueprintId,
          attached_users: feedRows.length,
        },
      );
    } catch (error) {
      if (error instanceof BlueprintVariantInProgressError) {
        if (sourceRowForMirror && !mirrorAttemptedForItem) {
          await ensureMirrorVariantForQueueItem({
            db,
            enabled: dualGenerateEnabled,
            jobId: input.jobId,
            scope: 'source_item_unlock_generation',
            userId: input.userId,
            sourceItemId: sourceRowForMirror.id,
            videoUrl: sourceRowForMirror.source_url,
            videoId: sourceRowForMirror.source_native_id,
            durationSeconds: item.duration_seconds,
            sourceTag: 'source_page_video_library',
            primaryTier: itemGenerationTier,
          });
        }
        skipped += 1;
        await releaseAutoIntentIfPending({
          reasonCode: 'AUTO_UNLOCK_ALREADY_IN_PROGRESS',
          lastErrorCode: 'ALREADY_IN_PROGRESS',
          lastErrorMessage: 'Variant generation already in progress.',
        });
        if (processingUnlockRow) {
          try {
            if (item.reserved_cost > 0) {
              await refundReservation(db, {
                userId: item.reserved_by_user_id,
                amount: item.reserved_cost,
                idempotencyKey: buildUnlockLedgerIdempotencyKey({
                  unlockId: item.unlock_id,
                  userId: item.reserved_by_user_id,
                  action: 'refund',
                }),
                reasonCode: 'UNLOCK_REFUND',
                context: {
                  source_item_id: item.source_item_id,
                  source_page_id: item.source_page_id,
                  unlock_id: item.unlock_id,
                  metadata: {
                    job_id: input.jobId,
                    error_code: 'ALREADY_IN_PROGRESS',
                    trace_id: input.traceId,
                  },
                },
              });
            }
          } catch (refundError) {
            logUnlockEvent(
              'source_unlock_variant_refund_failed',
              { trace_id: input.traceId, job_id: input.jobId, unlock_id: item.unlock_id, user_id: item.reserved_by_user_id },
              { error: refundError instanceof Error ? refundError.message : String(refundError) },
            );
          }
          try {
            await failUnlock(db, {
              unlockId: item.unlock_id,
              errorCode: 'ALREADY_IN_PROGRESS',
              errorMessage: 'Variant generation already in progress.',
            });
          } catch (unlockError) {
            logUnlockEvent(
              'source_unlock_variant_fail_transition_failed',
              { trace_id: input.traceId, job_id: input.jobId, unlock_id: item.unlock_id },
              { error: unlockError instanceof Error ? unlockError.message : String(unlockError) },
            );
          }
        }
        logUnlockEvent(
          'unlock_item_variant_in_progress',
          {
            trace_id: input.traceId,
            job_id: input.jobId,
            unlock_id: item.unlock_id,
            source_item_id: item.source_item_id,
            video_id: item.video_id,
          },
          {
            generation_tier: error.generationTier,
            active_job_id: error.activeJobId,
          },
        );
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      const rawErrorCode = String(error instanceof PipelineError
        ? error.errorCode
        : getSupabaseErrorCode(error) || 'UNLOCK_GENERATION_FAILED').trim().toUpperCase();
      let errorCode = normalizeUnlockFailureCode(rawErrorCode);
      let transcriptDecision: TranscriptFailureDecision | null = null;

      if (
        isTransientTranscriptUnavailableCode(rawErrorCode)
        || (transcriptFailFastEnabled && isTerminalTranscriptProviderErrorCodeForUnlock(rawErrorCode))
      ) {
        let unlockForDecision = processingUnlockRow;
        if (!unlockForDecision) {
          unlockForDecision = await getSourceItemUnlockBySourceItemId(db, item.source_item_id);
        }

        if (unlockForDecision) {
          try {
            transcriptDecision = await classifyTranscriptFailureForUnlock({
              db,
              unlock: unlockForDecision,
              videoId: item.video_id,
              traceId: input.traceId,
              rawErrorCode,
              rawError: error,
            });
            errorCode = transcriptDecision.finalErrorCode;
          } catch (decisionError) {
            logUnlockEvent(
              'transcript_classification_failed',
              { trace_id: input.traceId, job_id: input.jobId, unlock_id: item.unlock_id, source_item_id: item.source_item_id },
              {
                video_id: item.video_id,
                raw_error_code: rawErrorCode,
                error: decisionError instanceof Error ? decisionError.message : String(decisionError),
              },
            );
          }
        }
      }

      const isAutoOrigin = item.unlock_origin === 'subscription_auto_unlock' || item.unlock_origin === 'source_auto_unlock_retry';
      const transcriptAttempts = transcriptDecision?.transcriptAttemptCount || 0;
      const transcriptRetryExhausted =
        isAutoOrigin
        && errorCode === 'TRANSCRIPT_UNAVAILABLE'
        && transcriptAttempts >= sourceTranscriptMaxAttempts;
      if (transcriptRetryExhausted) {
        try {
          await db
            .from('source_item_unlocks')
            .update({
              transcript_status: 'transient_error',
              transcript_attempt_count: Math.max(sourceTranscriptMaxAttempts, transcriptAttempts),
              transcript_no_caption_hits: Math.max(
                getUnlockTranscriptNoCaptionHits(processingUnlockRow),
                transcriptDecision?.transcriptNoCaptionHits || 0,
              ),
              transcript_retry_after: null,
              transcript_probe_meta: {
                ...(transcriptDecision?.probeMeta || {}),
                exhausted_at: new Date().toISOString(),
                exhausted_reason: 'MAX_TRANSCRIPT_ATTEMPTS_TRANSIENT',
              },
              last_error_code: 'TRANSCRIPT_UNAVAILABLE',
              last_error_message: 'Transcript temporarily unavailable after max retry attempts.',
            })
            .eq('id', item.unlock_id);
        } catch (exhaustionError) {
          logUnlockEvent(
            'auto_transcript_retry_exhausted_update_failed',
            { trace_id: input.traceId, job_id: input.jobId, unlock_id: item.unlock_id, source_item_id: item.source_item_id },
            { error: exhaustionError instanceof Error ? exhaustionError.message : String(exhaustionError) },
          );
        }
      }

      failures.push({
        video_id: item.video_id,
        unlock_id: item.unlock_id,
        error_code: errorCode,
        error: message,
      });

      const isIntermediateAutoTranscriptFailure =
        isAutoOrigin
        && errorCode === 'TRANSCRIPT_UNAVAILABLE'
        && !transcriptRetryExhausted
        && !transcriptDecision?.confirmedPermanent;
      if (!isIntermediateAutoTranscriptFailure) {
        notifyFailedCount += 1;
      } else {
        logUnlockEvent(
          'auto_transcript_failure_notification_suppressed',
          {
            trace_id: input.traceId,
            job_id: input.jobId,
            unlock_id: item.unlock_id,
            source_item_id: item.source_item_id,
            video_id: item.video_id,
          },
          {
            error_code: errorCode,
            transcript_attempt_count: transcriptDecision?.transcriptAttemptCount || null,
            transcript_no_caption_hits: transcriptDecision?.transcriptNoCaptionHits || null,
          },
        );
      }

      await releaseAutoIntentIfPending({
        reasonCode: errorCode,
        lastErrorCode: errorCode,
        lastErrorMessage: message,
      });

      if (processingUnlockRow) {
        try {
          if (item.reserved_cost > 0) {
            await refundReservation(db, {
              userId: item.reserved_by_user_id,
              amount: item.reserved_cost,
              idempotencyKey: buildUnlockLedgerIdempotencyKey({
                unlockId: item.unlock_id,
                userId: item.reserved_by_user_id,
                action: 'refund',
              }),
              reasonCode: 'UNLOCK_REFUND',
              context: {
                source_item_id: item.source_item_id,
                source_page_id: item.source_page_id,
                unlock_id: item.unlock_id,
                metadata: {
                  job_id: input.jobId,
                  error_code: errorCode,
                  trace_id: input.traceId,
                },
              },
            });
          }
        } catch (refundError) {
          logUnlockEvent(
            'source_unlock_refund_failed',
            {
              trace_id: input.traceId,
              job_id: input.jobId,
              unlock_id: item.unlock_id,
              user_id: item.reserved_by_user_id,
            },
            {
              error: refundError instanceof Error ? refundError.message : String(refundError),
            },
          );
        }

        try {
          await failUnlock(db, {
            unlockId: item.unlock_id,
            errorCode,
            errorMessage: message,
          });
        } catch (unlockError) {
          logUnlockEvent(
            'source_unlock_fail_transition_failed',
            { trace_id: input.traceId, job_id: input.jobId, unlock_id: item.unlock_id },
            {
              error: unlockError instanceof Error ? unlockError.message : String(unlockError),
            },
          );
        }
        logUnlockEvent(
          'auto_transcript_retry_exhausted',
          { trace_id: input.traceId, job_id: input.jobId, source_item_id: item.source_item_id, unlock_id: item.unlock_id, video_id: item.video_id },
          {
            transcript_attempt_count: transcriptAttempts,
            forced_terminal: false,
            exhausted_reason: 'MAX_TRANSCRIPT_ATTEMPTS_TRANSIENT',
          },
        );
      }

      if (
        isAutoOrigin
        && (
          errorCode === 'TRANSCRIPT_UNAVAILABLE'
          || errorCode === 'NO_TRANSCRIPT_PERMANENT'
          || isTerminalTranscriptProviderErrorCodeForUnlock(errorCode)
          || errorCode === 'VIDEO_TOO_LONG'
          || errorCode === 'VIDEO_DURATION_UNAVAILABLE'
        )
      ) {
        try {
          const decisionCode = errorCode === 'NO_TRANSCRIPT_PERMANENT'
            ? 'NO_TRANSCRIPT_PERMANENT_AUTO'
            : isTerminalTranscriptProviderErrorCodeForUnlock(errorCode)
              ? `${errorCode}_AUTO`
            : errorCode === 'VIDEO_TOO_LONG'
              ? 'VIDEO_TOO_LONG_AUTO'
              : errorCode === 'VIDEO_DURATION_UNAVAILABLE'
                ? 'VIDEO_DURATION_UNAVAILABLE_AUTO'
                : 'TRANSCRIPT_UNAVAILABLE_AUTO';
          await suppressUnlockableFeedRowsForSourceItem(db, {
            sourceItemId: item.source_item_id,
            decisionCode,
            traceId: input.traceId,
            sourceChannelId: item.source_channel_id,
            videoId: item.video_id,
          });
        } catch (hideError) {
          logUnlockEvent(
            'auto_transcript_hide_failed',
            { trace_id: input.traceId, job_id: input.jobId, unlock_id: item.unlock_id, source_item_id: item.source_item_id },
            { error: hideError instanceof Error ? hideError.message : String(hideError) },
          );
        }
      }

      if (
        isAutoOrigin
        && errorCode === 'TRANSCRIPT_UNAVAILABLE'
        && !transcriptDecision?.confirmedPermanent
        && !transcriptRetryExhausted
      ) {
        try {
          const retry = await enqueueSourceAutoUnlockRetryJob(db, {
            source_item_id: item.source_item_id,
            source_page_id: item.source_page_id,
            source_channel_id: item.source_channel_id,
            source_channel_title: item.source_channel_title,
            video_id: item.video_id,
            video_url: item.video_url,
            title: item.title,
            duration_seconds: item.duration_seconds,
            trigger: 'service_cron',
            auto_intent_id: item.auto_intent_id || null,
          });
          logUnlockEvent(
            'auto_transcript_retry_scheduled',
            {
              trace_id: input.traceId,
              job_id: input.jobId,
              source_item_id: item.source_item_id,
              unlock_id: item.unlock_id,
              video_id: item.video_id,
            },
            {
              reason: errorCode,
              retry_enqueued: retry.enqueued,
              retry_job_id: retry.enqueued ? retry.job_id : null,
              retry_next_run_at: retry.enqueued ? retry.next_run_at : null,
              transcript_attempt_count: transcriptDecision?.transcriptAttemptCount || null,
              transcript_no_caption_hits: transcriptDecision?.transcriptNoCaptionHits || null,
            },
          );
        } catch (retryError) {
          logUnlockEvent(
            'subscription_auto_unlock_retry_schedule_failed',
            {
              trace_id: input.traceId,
              job_id: input.jobId,
              source_item_id: item.source_item_id,
              unlock_id: item.unlock_id,
              video_id: item.video_id,
            },
            {
              reason: errorCode,
              error: retryError instanceof Error ? retryError.message : String(retryError),
            },
          );
        }
      } else if (transcriptRetryExhausted) {
        logUnlockEvent(
          'auto_transcript_retry_exhausted',
          {
            trace_id: input.traceId,
            job_id: input.jobId,
            source_item_id: item.source_item_id,
            unlock_id: item.unlock_id,
            video_id: item.video_id,
          },
          {
            transcript_attempt_count: transcriptAttempts,
            transcript_no_caption_hits: transcriptDecision?.transcriptNoCaptionHits || null,
          },
        );
      }

      logUnlockEvent(
        'unlock_item_failed',
        {
          trace_id: input.traceId,
          job_id: input.jobId,
          unlock_id: item.unlock_id,
          source_item_id: item.source_item_id,
          video_id: item.video_id,
        },
        {
          error_code: errorCode,
          error: message.slice(0, 220),
          transcript_status: transcriptDecision?.transcriptStatus || null,
          transcript_attempt_count: transcriptDecision?.transcriptAttemptCount || null,
          transcript_no_caption_hits: transcriptDecision?.transcriptNoCaptionHits || null,
        },
      );
    }
  }

  await db.from('ingestion_jobs').update({
    status: failures.length ? 'failed' : 'succeeded',
    finished_at: new Date().toISOString(),
    processed_count: processed,
    inserted_count: inserted,
    skipped_count: skipped,
    lease_expires_at: null,
    worker_id: null,
    last_heartbeat_at: new Date().toISOString(),
    error_code: failures.length ? 'PARTIAL_FAILURE' : null,
    error_message: failures.length ? JSON.stringify(failures).slice(0, 1000) : null,
  }).eq('id', input.jobId);

  await emitGenerationTerminalNotification(db, {
    userId: input.userId,
    jobId: input.jobId,
    scope: 'source_item_unlock_generation',
    inserted,
    skipped,
    failed: notifyFailedCount,
    itemTitle: firstItemTitle,
    blueprintTitle: firstBlueprintTitle,
    failureSummary: summarizeGenerationFailure({
      errorCode: failures[0]?.error_code,
      errorMessage: failures[0]?.error,
    }),
    traceId: input.traceId,
    linkPath: getGenerationNotificationLinkPath({ scope: 'source_item_unlock_generation' }),
    firstBlueprintId,
  });

  logUnlockEvent(
    'unlock_job_terminal',
    { trace_id: input.traceId, job_id: input.jobId, user_id: input.userId },
    {
      status: failures.length ? 'failed' : 'succeeded',
      processed,
      inserted,
      skipped,
      failures: failures.length,
    },
  );
}

async function processSourceTranscriptRevalidateJob(input: {
  jobId: string;
  payload: SourceTranscriptRevalidatePayload;
  traceId: string;
}) {
  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client not configured');
  }

  const unlock = await getSourceItemUnlockBySourceItemId(db, input.payload.source_item_id);
  if (!unlock || unlock.id !== input.payload.unlock_id) {
    await db.from('ingestion_jobs').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      processed_count: 1,
      inserted_count: 0,
      skipped_count: 1,
      lease_expires_at: null,
      worker_id: null,
      last_heartbeat_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    }).eq('id', input.jobId);
    return;
  }

  if (isConfirmedNoTranscriptUnlock(unlock)) {
    const probe = await probeTranscriptProvidersWithThrottle(input.payload.video_id, {
      requestClass: 'background',
      reason: 'source_transcript_revalidate_probe',
    });
    if (probe.all_no_captions) {
      await db
        .from('source_item_unlocks')
        .update({
          transcript_status: 'confirmed_no_speech',
          transcript_attempt_count: Math.max(sourceTranscriptMaxAttempts, getUnlockTranscriptAttemptCount(unlock)),
          transcript_no_caption_hits: Math.max(sourceTranscriptMaxAttempts, getUnlockTranscriptNoCaptionHits(unlock)),
          transcript_last_probe_at: new Date().toISOString(),
          transcript_retry_after: null,
          transcript_probe_meta: {
            providers: probe.providers,
            all_no_captions: true,
            any_success: probe.any_success,
            revalidated_at: new Date().toISOString(),
          },
          last_error_code: 'NO_TRANSCRIPT_PERMANENT',
          last_error_message: 'Transcript unavailable for this video.',
        })
        .eq('id', unlock.id);
      logUnlockEvent('transcript_probe_result', { trace_id: input.traceId, unlock_id: unlock.id }, {
        source_item_id: unlock.source_item_id,
        video_id: input.payload.video_id,
        all_no_captions: true,
      });
    } else {
      await db
        .from('source_item_unlocks')
        .update({
          transcript_status: 'retrying',
          transcript_attempt_count: 0,
          transcript_no_caption_hits: 0,
          transcript_last_probe_at: new Date().toISOString(),
          transcript_retry_after: buildTranscriptRetryAfterIso(getTranscriptRetryDelaySecondsForAttempt(1)),
          transcript_probe_meta: {
            providers: probe.providers,
            all_no_captions: false,
            any_success: probe.any_success,
            revalidated_at: new Date().toISOString(),
          },
          last_error_code: 'TRANSCRIPT_UNAVAILABLE',
          last_error_message: 'Transcript temporarily unavailable. Retry later.',
        })
        .eq('id', unlock.id);
      logUnlockEvent('transcript_revalidated_to_retryable', { trace_id: input.traceId, unlock_id: unlock.id }, {
        source_item_id: unlock.source_item_id,
        video_id: input.payload.video_id,
      });
    }
  } else {
    await db.from('ingestion_jobs').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      processed_count: 1,
      inserted_count: 0,
      skipped_count: 1,
      lease_expires_at: null,
      worker_id: null,
      last_heartbeat_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    }).eq('id', input.jobId);
    return;
  }

  await db.from('ingestion_jobs').update({
    status: 'succeeded',
    finished_at: new Date().toISOString(),
    processed_count: 1,
    inserted_count: 1,
    skipped_count: 0,
    lease_expires_at: null,
    worker_id: null,
    last_heartbeat_at: new Date().toISOString(),
    error_code: null,
    error_message: null,
  }).eq('id', input.jobId);
}

class AutoUnlockRetryableError extends Error {
  code: 'AUTO_UNLOCK_RETRYABLE';
  errorCode: 'NO_ELIGIBLE_USERS' | 'NO_ELIGIBLE_CREDITS' | 'QUEUE_BACKPRESSURE' | 'QUEUE_INTAKE_DISABLED' | 'TRANSCRIPT_UNAVAILABLE';
  retryDelaySeconds: number;

  constructor(input: {
    errorCode: 'NO_ELIGIBLE_USERS' | 'NO_ELIGIBLE_CREDITS' | 'QUEUE_BACKPRESSURE' | 'QUEUE_INTAKE_DISABLED' | 'TRANSCRIPT_UNAVAILABLE';
    message: string;
    retryDelaySeconds: number;
  }) {
    super(input.message);
    this.code = 'AUTO_UNLOCK_RETRYABLE';
    this.errorCode = input.errorCode;
    this.retryDelaySeconds = Math.max(5, Math.floor(input.retryDelaySeconds));
  }
}

async function processSourceAutoUnlockRetryJob(input: {
  jobId: string;
  payload: SourceAutoUnlockRetryPayload;
  traceId: string;
}) {
  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client not configured');
  }

  const sourceItemId = String(input.payload.source_item_id || '').trim();
  const sourceChannelId = String(input.payload.source_channel_id || '').trim();
  if (!sourceItemId || !sourceChannelId) {
    throw new Error('INVALID_AUTO_UNLOCK_RETRY_PAYLOAD');
  }

  // Current runtime keeps a flat unlock cost, so subscriber counting is
  // unnecessary in the hot auto-unlock retry path.
  const estimatedUnlockCost = computeUnlockCost(1);
  const unlock = await ensureSourceItemUnlock(db, {
    sourceItemId,
    sourcePageId: input.payload.source_page_id || null,
    estimatedCost: estimatedUnlockCost,
  });

  if (unlock.status !== 'available') {
    await db.from('ingestion_jobs').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      processed_count: 1,
      inserted_count: 0,
      skipped_count: 1,
      lease_expires_at: null,
      worker_id: null,
      last_heartbeat_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    }).eq('id', input.jobId);

    logUnlockEvent(
      'subscription_auto_unlock_retry_skipped',
      { trace_id: input.traceId, job_id: input.jobId, source_item_id: sourceItemId },
      {
        reason: 'UNLOCK_NOT_AVAILABLE',
        unlock_status: unlock.status,
      },
    );
    return;
  }

  const transcriptAttempts = getUnlockTranscriptAttemptCount(unlock);
  const transcriptStatus = normalizeTranscriptTruthStatus(unlock.transcript_status);
  const shouldForceTerminalNoTranscript =
    isTerminalTranscriptProviderErrorCodeForUnlock(unlock.last_error_code)
    || (
      transcriptAttempts >= sourceTranscriptMaxAttempts
      && getUnlockTranscriptNoCaptionHits(unlock) >= sourceTranscriptMaxAttempts
    );
  if (shouldForceTerminalNoTranscript) {
    await db
      .from('source_item_unlocks')
      .update({
        transcript_status: 'confirmed_no_speech',
        transcript_attempt_count: Math.max(sourceTranscriptMaxAttempts, transcriptAttempts),
        transcript_no_caption_hits: Math.max(sourceTranscriptMaxAttempts, getUnlockTranscriptNoCaptionHits(unlock)),
        transcript_retry_after: null,
        last_error_code: 'NO_TRANSCRIPT_PERMANENT',
        last_error_message: 'Transcript unavailable after max retry attempts.',
      })
      .eq('id', unlock.id);
    await suppressUnlockableFeedRowsForSourceItem(db, {
      sourceItemId,
      decisionCode: 'NO_TRANSCRIPT_PERMANENT_AUTO',
      traceId: input.traceId,
      sourceChannelId,
      videoId: input.payload.video_id,
    });
    await db.from('ingestion_jobs').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      processed_count: 1,
      inserted_count: 0,
      skipped_count: 1,
      lease_expires_at: null,
      worker_id: null,
      last_heartbeat_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    }).eq('id', input.jobId);

    logUnlockEvent(
      'auto_transcript_retry_exhausted',
      { trace_id: input.traceId, job_id: input.jobId, source_item_id: sourceItemId, unlock_id: unlock.id, video_id: input.payload.video_id },
      { transcript_attempt_count: transcriptAttempts, forced_terminal: true },
    );
    return;
  }

  if (
    transcriptAttempts >= sourceTranscriptMaxAttempts
    && (
      transcriptStatus === 'retrying'
      || transcriptStatus === 'transient_error'
      || isTransientTranscriptUnavailableCode(unlock.last_error_code)
    )
  ) {
    await db
      .from('source_item_unlocks')
      .update({
        transcript_status: 'transient_error',
        transcript_attempt_count: Math.max(sourceTranscriptMaxAttempts, transcriptAttempts),
        transcript_retry_after: null,
        last_error_code: 'TRANSCRIPT_UNAVAILABLE',
        last_error_message: 'Transcript temporarily unavailable after max retry attempts.',
      })
      .eq('id', unlock.id);
    await suppressUnlockableFeedRowsForSourceItem(db, {
      sourceItemId,
      decisionCode: 'TRANSCRIPT_UNAVAILABLE_AUTO',
      traceId: input.traceId,
      sourceChannelId,
      videoId: input.payload.video_id,
    });
    await db.from('ingestion_jobs').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      processed_count: 1,
      inserted_count: 0,
      skipped_count: 1,
      lease_expires_at: null,
      worker_id: null,
      last_heartbeat_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    }).eq('id', input.jobId);

    logUnlockEvent(
      'auto_transcript_retry_exhausted',
      { trace_id: input.traceId, job_id: input.jobId, source_item_id: sourceItemId, unlock_id: unlock.id, video_id: input.payload.video_id },
      {
        transcript_attempt_count: transcriptAttempts,
        forced_terminal: false,
        exhausted_reason: 'MAX_TRANSCRIPT_ATTEMPTS_TRANSIENT',
      },
    );
    return;
  }

  const attempt = await attemptAutoUnlockForSourceItem({
    sourceItemId,
    sourcePageId: input.payload.source_page_id || null,
    sourceChannelId,
    sourceChannelTitle: input.payload.source_channel_title || null,
    video: {
      videoId: input.payload.video_id,
      title: input.payload.title,
      url: input.payload.video_url,
      publishedAt: null,
      thumbnailUrl: null,
      durationSeconds: input.payload.duration_seconds,
    },
    unlock,
    trigger: input.payload.trigger,
  });

  if (!attempt.queued) {
    if (attempt.reason === 'TRANSCRIPT_COOLDOWN') {
      const currentUnlock = await getSourceItemUnlockBySourceItemId(db, sourceItemId);
      const cooldownDelaySeconds = Math.max(
        5,
        getTranscriptRetryAfterSeconds(currentUnlock || unlock)
          || getTranscriptRetryDelaySecondsForAttempt(
            getUnlockTranscriptAttemptCount(currentUnlock || unlock) + 1,
          ),
      );
      throw new AutoUnlockRetryableError({
        errorCode: 'TRANSCRIPT_UNAVAILABLE',
        message: 'Auto-unlock retry delayed: transcript unavailable cooldown active.',
        retryDelaySeconds: cooldownDelaySeconds,
      });
    }
    if (attempt.reason === 'NO_ELIGIBLE_USERS' || attempt.reason === 'NO_ELIGIBLE_CREDITS') {
      throw new AutoUnlockRetryableError({
        errorCode: attempt.reason,
        message: `Auto-unlock retry pending: ${attempt.reason}.`,
        retryDelaySeconds: sourceAutoUnlockRetryDelaySeconds,
      });
    }
    if (attempt.reason === 'QUEUE_BACKPRESSURE' || attempt.reason === 'QUEUE_DISABLED') {
      throw new AutoUnlockRetryableError({
        errorCode: attempt.reason === 'QUEUE_DISABLED' ? 'QUEUE_INTAKE_DISABLED' : 'QUEUE_BACKPRESSURE',
        message: `Auto-unlock retry delayed: ${attempt.reason}.`,
        retryDelaySeconds: sourceAutoUnlockRetryDelaySeconds,
      });
    }

    await db.from('ingestion_jobs').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      processed_count: 1,
      inserted_count: 0,
      skipped_count: 1,
      lease_expires_at: null,
      worker_id: null,
      last_heartbeat_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    }).eq('id', input.jobId);

    logUnlockEvent(
      'subscription_auto_unlock_retry_terminal',
      { trace_id: input.traceId, job_id: input.jobId, source_item_id: sourceItemId },
      {
        queued: false,
        reason: attempt.reason,
      },
    );
    return;
  }

  await db.from('ingestion_jobs').update({
    status: 'succeeded',
    finished_at: new Date().toISOString(),
    processed_count: 1,
    inserted_count: 1,
    skipped_count: 0,
    lease_expires_at: null,
    worker_id: null,
    last_heartbeat_at: new Date().toISOString(),
    error_code: null,
    error_message: null,
  }).eq('id', input.jobId);

  logUnlockEvent(
    'subscription_auto_unlock_retry_queued',
    { trace_id: input.traceId, job_id: input.jobId, source_item_id: sourceItemId },
    {
      queued: true,
      unlock_job_id: attempt.job_id,
      owner_user_id: attempt.owner_user_id,
      auto_intent_id: attempt.auto_intent_id,
      unlock_trace_id: attempt.trace_id,
    },
  );
}

class WorkerTimeoutError extends Error {
  code: 'WORKER_TIMEOUT';

  constructor(message: string) {
    super(message);
    this.code = 'WORKER_TIMEOUT';
  }
}

function isQueuedIngestionScope(value: string): value is QueuedIngestionScope {
  return QUEUED_INGESTION_SCOPES.includes(value as QueuedIngestionScope);
}

function asObjectPayload(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function normalizeSourceUnlockQueueItems(value: unknown): SourceUnlockQueueItem[] {
  if (!Array.isArray(value)) return [];
  const rows: SourceUnlockQueueItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const unlockId = String(row.unlock_id || '').trim();
    const sourceItemId = String(row.source_item_id || '').trim();
    const sourceChannelId = String(row.source_channel_id || '').trim();
    const videoId = String(row.video_id || '').trim();
    const videoUrl = String(row.video_url || '').trim();
    const title = String(row.title || '').trim();
    const reservedByUserId = String(row.reserved_by_user_id || '').trim();
    if (!unlockId || !sourceItemId || !sourceChannelId || !videoId || !videoUrl || !title || !reservedByUserId) continue;
    const unlockOriginRaw = String(row.unlock_origin || '').trim();
    const unlockOrigin: SourceUnlockQueueItem['unlock_origin'] =
      unlockOriginRaw === 'subscription_auto_unlock' || unlockOriginRaw === 'source_auto_unlock_retry'
        ? unlockOriginRaw
        : 'manual_unlock';
    const generationTier = normalizeRequestedGenerationTier(row.generation_tier) || null;
    rows.push({
      unlock_id: unlockId,
      source_item_id: sourceItemId,
      source_page_id: row.source_page_id == null ? null : String(row.source_page_id || '').trim() || null,
      source_channel_id: sourceChannelId,
      source_channel_title: row.source_channel_title == null ? null : String(row.source_channel_title || '').trim() || null,
      video_id: videoId,
      video_url: videoUrl,
      title,
      duration_seconds: toDurationSeconds(row.duration_seconds),
      reserved_cost: Math.max(0, Number(row.reserved_cost || 0)),
      reserved_by_user_id: reservedByUserId,
      auto_intent_id: String(row.auto_intent_id || '').trim() || null,
      unlock_origin: unlockOrigin,
      generation_tier: generationTier,
      dual_generate_enabled: Boolean(row.dual_generate_enabled),
    });
  }
  return rows;
}

function normalizeSourceAutoUnlockRetryPayload(value: unknown): SourceAutoUnlockRetryPayload | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const sourceItemId = String(row.source_item_id || '').trim();
  const sourceChannelId = String(row.source_channel_id || '').trim();
  const videoId = String(row.video_id || '').trim();
  const videoUrl = String(row.video_url || '').trim();
  const title = String(row.title || '').trim();
  const triggerRaw = String(row.trigger || '').trim();
  const autoIntentId = String(row.auto_intent_id || '').trim() || null;
  if (!sourceItemId || !sourceChannelId || !videoId || !videoUrl || !title) return null;

  let trigger: SourceAutoUnlockRetryPayload['trigger'] = 'user_sync';
  if (
    triggerRaw === 'service_cron'
    || triggerRaw === 'subscription_create'
    || triggerRaw === 'debug_simulation'
    || triggerRaw === 'youtube_import'
    || triggerRaw === 'user_sync'
  ) {
    trigger = triggerRaw;
  }

  return {
    source_item_id: sourceItemId,
    source_page_id: row.source_page_id == null ? null : String(row.source_page_id || '').trim() || null,
    source_channel_id: sourceChannelId,
    source_channel_title: row.source_channel_title == null ? null : String(row.source_channel_title || '').trim() || null,
    video_id: videoId,
    video_url: videoUrl,
    title,
    duration_seconds: toDurationSeconds(row.duration_seconds),
    trigger,
    auto_intent_id: autoIntentId,
    generation_tier: normalizeRequestedGenerationTier(row.generation_tier),
  };
}

function normalizeSourceTranscriptRevalidatePayload(value: unknown): SourceTranscriptRevalidatePayload | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const unlockId = String(row.unlock_id || '').trim();
  const sourceItemId = String(row.source_item_id || '').trim();
  const sourceChannelId = String(row.source_channel_id || '').trim();
  const videoId = String(row.video_id || '').trim();
  const videoUrl = String(row.video_url || '').trim();
  const title = String(row.title || '').trim();
  if (!unlockId || !sourceItemId || !sourceChannelId || !videoId || !videoUrl || !title) return null;

  return {
    unlock_id: unlockId,
    source_item_id: sourceItemId,
    source_page_id: row.source_page_id == null ? null : String(row.source_page_id || '').trim() || null,
    source_channel_id: sourceChannelId,
    source_channel_title: row.source_channel_title == null ? null : String(row.source_channel_title || '').trim() || null,
    video_id: videoId,
    video_url: videoUrl,
    title,
  };
}

function normalizeBlueprintYouTubeEnrichmentPayload(value: unknown): BlueprintYouTubeEnrichmentPayload | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const runId = String(row.run_id || '').trim();
  const blueprintId = String(row.blueprint_id || '').trim();
  if (!runId || !blueprintId) return null;
  return {
    run_id: runId,
    blueprint_id: blueprintId,
    video_id: row.video_id == null ? null : String(row.video_id || '').trim() || null,
    source_item_id: row.source_item_id == null ? null : String(row.source_item_id || '').trim() || null,
  };
}

function normalizeBlueprintYouTubeRefreshPayload(value: unknown): BlueprintYouTubeRefreshPayload | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const blueprintId = String(row.blueprint_id || '').trim();
  const youtubeVideoId = String(row.youtube_video_id || '').trim();
  const refreshKindRaw = String(row.refresh_kind || '').trim().toLowerCase();
  const refreshKind: BlueprintYouTubeRefreshKind | null = refreshKindRaw === 'view_count'
    ? 'view_count'
    : refreshKindRaw === 'comments'
      ? 'comments'
      : null;
  const refreshTriggerRaw = String(row.refresh_trigger || '').trim().toLowerCase();
  const refreshTrigger: BlueprintYouTubeRefreshTrigger = refreshTriggerRaw === 'manual' ? 'manual' : 'auto';
  if (!blueprintId || !youtubeVideoId || !refreshKind) return null;
  return {
    blueprint_id: blueprintId,
    refresh_kind: refreshKind,
    refresh_trigger: refreshTrigger,
    youtube_video_id: youtubeVideoId,
    source_item_id: row.source_item_id == null ? null : String(row.source_item_id || '').trim() || null,
  };
}

function normalizeManualGenerationReservation(value: unknown): ManualGenerationReservation | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const userId = String(row.userId || '').trim();
  const holdIdempotencyKey = String(row.holdIdempotencyKey || '').trim();
  const settleIdempotencyKey = String(row.settleIdempotencyKey || '').trim();
  const releaseIdempotencyKey = String(row.releaseIdempotencyKey || '').trim();
  const reasonCodeBase = String(row.reasonCodeBase || '').trim();
  const amount = Math.max(0, Number(row.amount || 0));
  if (!userId || !holdIdempotencyKey || !settleIdempotencyKey || !releaseIdempotencyKey || !reasonCodeBase || !(amount > 0)) {
    return null;
  }
  const contextRaw = row.context;
  const context = contextRaw && typeof contextRaw === 'object' ? contextRaw as ManualGenerationReservation['context'] : undefined;
  return {
    userId,
    amount,
    holdIdempotencyKey,
    settleIdempotencyKey,
    releaseIdempotencyKey,
    reasonCodeBase,
    context,
  };
}

function normalizeRefreshScanCandidates(value: unknown): RefreshScanCandidate[] {
  if (!Array.isArray(value)) return [];
  const rows: RefreshScanCandidate[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const subscriptionId = String(row.subscription_id || '').trim();
    const sourceChannelId = String(row.source_channel_id || '').trim();
    const videoId = String(row.video_id || '').trim();
    const videoUrl = String(row.video_url || '').trim();
    const title = String(row.title || '').trim();
    if (!subscriptionId || !sourceChannelId || !videoId || !videoUrl || !title) continue;
    rows.push({
      subscription_id: subscriptionId,
      source_channel_id: sourceChannelId,
      source_channel_title: row.source_channel_title == null ? null : String(row.source_channel_title || '').trim() || null,
      source_channel_url: row.source_channel_url == null ? null : String(row.source_channel_url || '').trim() || null,
      video_id: videoId,
      video_url: videoUrl,
      title,
      published_at: row.published_at == null ? null : String(row.published_at || '').trim() || null,
      thumbnail_url: row.thumbnail_url == null ? null : String(row.thumbnail_url || '').trim() || null,
      duration_seconds: toDurationSeconds(row.duration_seconds),
      source_item_id: row.source_item_id == null ? null : String(row.source_item_id || '').trim() || null,
      reservation: normalizeManualGenerationReservation(row.reservation),
    });
  }
  return rows;
}

function normalizeSearchVideoGenerateItems(value: unknown): SearchVideoGenerateItem[] {
  if (!Array.isArray(value)) return [];
  const rows: SearchVideoGenerateItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const videoId = String(row.video_id || '').trim();
    const videoUrl = String(row.video_url || '').trim();
    const title = String(row.title || '').trim();
    const channelId = String(row.channel_id || '').trim();
    if (!videoId || !videoUrl || !title || !channelId) continue;
    rows.push({
      video_id: videoId,
      video_url: videoUrl,
      title,
      channel_id: channelId,
      channel_title: row.channel_title == null ? null : String(row.channel_title || '').trim() || null,
      channel_url: row.channel_url == null ? null : String(row.channel_url || '').trim() || null,
      published_at: row.published_at == null ? null : String(row.published_at || '').trim() || null,
      thumbnail_url: row.thumbnail_url == null ? null : String(row.thumbnail_url || '').trim() || null,
      duration_seconds: toDurationSeconds(row.duration_seconds),
      source_item_id: row.source_item_id == null ? null : String(row.source_item_id || '').trim() || null,
      reservation: normalizeManualGenerationReservation(row.reservation),
    });
  }
  return rows;
}

function resolveGenerationTierForUser(input: {
  userId: string;
  payloadTierRaw?: unknown;
}): GenerationTier {
  return CANONICAL_GENERATION_TIER;
}

function getRetryDelayForErrorCode(errorCode: string) {
  if (isTerminalTranscriptProviderErrorCodeForUnlock(errorCode)) {
    return 0;
  }
  switch (errorCode) {
    case 'ACCESS_DENIED':
      return getTranscriptRetryDelaySecondsForErrorCode('ACCESS_DENIED', 1);
    case 'PROVIDER_DEGRADED':
      return 30;
    case 'PROVIDER_FAIL':
    case 'TRANSCRIPT_FETCH_FAIL':
    case 'RATE_LIMITED':
    case 'TIMEOUT':
    case 'WORKER_TIMEOUT':
      return 20;
    default:
      return 0;
  }
}

function classifyQueuedJobError(error: unknown) {
  if (error instanceof AutoUnlockRetryableError) {
    return {
      errorCode: error.errorCode,
      message: error.message,
      retryDelaySeconds: error.retryDelaySeconds,
    };
  }
  if (error instanceof WorkerTimeoutError) {
    return {
      errorCode: 'WORKER_TIMEOUT',
      message: error.message,
      retryDelaySeconds: getRetryDelayForErrorCode('WORKER_TIMEOUT'),
    };
  }
  if (error instanceof ProviderCircuitOpenError) {
    return {
      errorCode: 'PROVIDER_DEGRADED',
      message: error.message,
      retryDelaySeconds: getRetryDelayForErrorCode('PROVIDER_DEGRADED'),
    };
  }
  if (error instanceof TranscriptProviderError) {
    const retryDelaySeconds = (
      isRetryableTranscriptProviderErrorCode(error.code)
      || (transcriptAccessDeniedRetryEnabled && String(error.code || '').trim().toUpperCase() === 'ACCESS_DENIED')
    )
      ? (error.retryAfterSeconds || getRetryDelayForErrorCode(error.code))
      : 0;
    return {
      errorCode: error.code,
      message: error.message,
      retryDelaySeconds,
    };
  }
  if (error instanceof CodexExecError) {
    const mappedErrorCode = error.code === 'TIMEOUT'
      ? 'TIMEOUT'
      : error.code === 'RATE_LIMITED'
        ? 'RATE_LIMITED'
        : 'PROVIDER_FAIL';
    return {
      errorCode: mappedErrorCode,
      message: error.message,
      retryDelaySeconds: getRetryDelayForErrorCode(mappedErrorCode),
    };
  }
  if (error instanceof PipelineError) {
    return {
      errorCode: error.errorCode,
      message: error.message,
      retryDelaySeconds: getRetryDelayForErrorCode(error.errorCode),
    };
  }
  if (String((error as { code?: string } | null)?.code || '').trim().toUpperCase() === 'DAILY_GENERATION_CAP_REACHED') {
    return {
      errorCode: 'DAILY_GENERATION_CAP_REACHED',
      message: error instanceof Error ? error.message : 'Daily generation cap reached.',
      retryDelaySeconds: 0,
    };
  }
  const providerCode = String((error as { code?: string } | null)?.code || '').trim().toUpperCase();
  if (providerCode === 'PROVIDER_DEGRADED') {
    return {
      errorCode: 'PROVIDER_DEGRADED',
      message: error instanceof Error ? error.message : 'Provider temporarily degraded.',
      retryDelaySeconds: getRetryDelayForErrorCode('PROVIDER_DEGRADED'),
    };
  }
  if (
    providerCode === 'RATE_LIMITED'
    || providerCode === 'TIMEOUT'
    || providerCode === 'TRANSCRIPT_FETCH_FAIL'
    || providerCode === 'TRANSCRIPT_EMPTY'
    || providerCode === 'NO_CAPTIONS'
    || providerCode === 'VIDEO_UNAVAILABLE'
    || providerCode === 'ACCESS_DENIED'
  ) {
    const retryDelaySeconds = (
      isRetryableTranscriptProviderErrorCode(providerCode)
        || (transcriptAccessDeniedRetryEnabled && providerCode === 'ACCESS_DENIED')
        ? getRetryDelayForErrorCode(providerCode)
        : 0
    );
    return {
      errorCode: providerCode,
      message: error instanceof Error ? error.message : 'Transcript provider failed.',
      retryDelaySeconds,
    };
  }
  const message = error instanceof Error ? error.message : String(error || 'Unknown job error');
  return {
    errorCode: 'ASYNC_JOB_FAILED',
    message,
    retryDelaySeconds: 0,
  };
}

async function runWithExecutionTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new WorkerTimeoutError(`Job timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function processAllActiveSubscriptionsJob(input: {
  jobId: string;
  traceId: string;
}) {
  const db = getServiceSupabaseClient();
  if (!db) throw new Error('Service role client not configured');

  const { data: subscriptions, error: subscriptionsError } = await db
    .from('user_source_subscriptions')
    .select('id, user_id, mode, source_channel_id, source_channel_title, source_page_id, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, is_active')
    .eq('is_active', true)
    .eq('source_type', 'youtube')
    .order('updated_at', { ascending: false });
  if (subscriptionsError) throw subscriptionsError;

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  const failures: Array<{ subscription_id: string; error: string }> = [];
  for (const subscription of subscriptions || []) {
    try {
      const sync = await syncSingleSubscription(db, subscription, { trigger: 'service_cron' });
      processed += sync.processed;
      inserted += sync.inserted;
      skipped += sync.skipped;
    } catch (error) {
      failures.push({
        subscription_id: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await markSubscriptionSyncError(db, subscription, error);
    }
  }

  await db.from('ingestion_jobs').update({
    status: failures.length ? 'failed' : 'succeeded',
    finished_at: new Date().toISOString(),
    processed_count: processed,
    inserted_count: inserted,
    skipped_count: skipped,
    lease_expires_at: null,
    worker_id: null,
    last_heartbeat_at: new Date().toISOString(),
    error_code: failures.length ? 'PARTIAL_FAILURE' : null,
    error_message: failures.length ? JSON.stringify(failures).slice(0, 1000) : null,
  }).eq('id', input.jobId);

  logUnlockEvent('unlock_job_terminal', { trace_id: input.traceId, job_id: input.jobId }, {
    scope: 'all_active_subscriptions',
    processed,
    inserted,
    skipped,
    failures: failures.length,
  });
}

async function processClaimedIngestionJob(db: ReturnType<typeof createClient>, job: IngestionJobRow) {
  const scope = String(job.scope || '').trim();
  if (!isQueuedIngestionScope(scope)) {
    await failIngestionJob(db, {
      jobId: job.id,
      errorCode: 'UNSUPPORTED_SCOPE',
      errorMessage: `Unsupported queued scope: ${scope}`,
      scheduleRetryInSeconds: 0,
      maxAttempts: Number(job.max_attempts || 3),
    });
    return;
  }

  const payload = asObjectPayload(job.payload);
  const traceId = String(job.trace_id || payload.trace_id || '').trim() || createUnlockTraceId();
  const jobStartMs = Date.now();
  const leaseSeconds = Math.max(5, Math.ceil(workerLeaseMs / 1000));
  let heartbeatError: unknown = null;
  const heartbeat = setInterval(() => {
    void touchIngestionJobLease(db, {
      jobId: job.id,
      workerId: queuedWorkerId,
      leaseSeconds,
    }).then((ok) => {
      if (!ok && !heartbeatError) {
        heartbeatError = new Error('LEASE_HEARTBEAT_REJECTED');
      }
    }).catch((error) => {
      if (!heartbeatError) heartbeatError = error;
    });
  }, effectiveWorkerHeartbeatMs);

  try {
    await runWithExecutionTimeout(
      (async () => {
        if (scope === 'source_item_unlock_generation') {
          const userId = String(payload.user_id || job.requested_by_user_id || '').trim();
          const items = normalizeSourceUnlockQueueItems(payload.items);
          if (!userId || items.length === 0) {
            throw new Error('INVALID_UNLOCK_JOB_PAYLOAD');
          }
          const generationTier = resolveGenerationTierForUser({
            userId,
            payloadTierRaw: payload.generation_tier,
          });
          await processSourceItemUnlockGenerationJob({
            jobId: job.id,
            userId,
            items,
            traceId,
            generationTier,
          });
          return;
        }

        if (scope === 'source_auto_unlock_retry') {
          const retryPayload = normalizeSourceAutoUnlockRetryPayload(payload);
          if (!retryPayload) {
            throw new Error('INVALID_AUTO_UNLOCK_RETRY_PAYLOAD');
          }
          await processSourceAutoUnlockRetryJob({
            jobId: job.id,
            payload: retryPayload,
            traceId,
          });
          return;
        }

        if (scope === 'source_transcript_revalidate') {
          const revalidatePayload = normalizeSourceTranscriptRevalidatePayload(payload);
          if (!revalidatePayload) {
            throw new Error('INVALID_TRANSCRIPT_REVALIDATE_PAYLOAD');
          }
          await processSourceTranscriptRevalidateJob({
            jobId: job.id,
            payload: revalidatePayload,
            traceId,
          });
          return;
        }

        if (scope === 'blueprint_youtube_enrichment') {
          const enrichmentPayload = normalizeBlueprintYouTubeEnrichmentPayload(payload);
          if (!enrichmentPayload) {
            throw new Error('INVALID_BLUEPRINT_YOUTUBE_ENRICHMENT_PAYLOAD');
          }
          await blueprintYouTubeCommentsService.populateForBlueprint({
            db,
            traceDb: db,
            runId: enrichmentPayload.run_id,
            blueprintId: enrichmentPayload.blueprint_id,
            explicitVideoId: enrichmentPayload.video_id,
            explicitSourceItemId: enrichmentPayload.source_item_id,
          });
          await db.from('ingestion_jobs').update({
            status: 'succeeded',
            finished_at: new Date().toISOString(),
            processed_count: 1,
            inserted_count: 1,
            skipped_count: 0,
            lease_expires_at: null,
            worker_id: null,
            last_heartbeat_at: new Date().toISOString(),
            error_code: null,
            error_message: null,
          }).eq('id', job.id);
          return;
        }

        if (scope === 'blueprint_youtube_refresh') {
          const refreshPayload = normalizeBlueprintYouTubeRefreshPayload(payload);
          if (!refreshPayload) {
            throw new Error('INVALID_BLUEPRINT_YOUTUBE_REFRESH_PAYLOAD');
          }
          await blueprintYouTubeCommentsService.executeRefresh({
            db,
            traceDb: db,
            blueprintId: refreshPayload.blueprint_id,
            kind: refreshPayload.refresh_kind,
            trigger: refreshPayload.refresh_trigger,
            youtubeVideoId: refreshPayload.youtube_video_id,
            sourceItemId: refreshPayload.source_item_id,
            triggeredByUserId: job.requested_by_user_id || null,
          });
          await db.from('ingestion_jobs').update({
            status: 'succeeded',
            finished_at: new Date().toISOString(),
            processed_count: 1,
            inserted_count: 1,
            skipped_count: 0,
            lease_expires_at: null,
            worker_id: null,
            last_heartbeat_at: new Date().toISOString(),
            error_code: null,
            error_message: null,
          }).eq('id', job.id);
          return;
        }

        if (scope === 'manual_refresh_selection') {
          const userId = String(payload.user_id || job.requested_by_user_id || '').trim();
          const items = normalizeRefreshScanCandidates(payload.items);
          if (!userId || items.length === 0) {
            throw new Error('INVALID_MANUAL_REFRESH_JOB_PAYLOAD');
          }
          const generationTier = resolveGenerationTierForUser({
            userId,
            payloadTierRaw: payload.generation_tier,
          });
          const dualGenerateEnabled = isDualGenerateEnabledForUser({
            userId,
            scope: 'queue',
          });
          await processManualRefreshGenerateJob({
            jobId: job.id,
            userId,
            items,
            generationTier,
            dualGenerateEnabled,
          });
          return;
        }

        if (scope === 'search_video_generate') {
          const userId = String(payload.user_id || job.requested_by_user_id || '').trim();
          const items = normalizeSearchVideoGenerateItems(payload.items);
          if (!userId || items.length === 0) {
            throw new Error('INVALID_SEARCH_GENERATE_JOB_PAYLOAD');
          }
          const generationTier = resolveGenerationTierForUser({
            userId,
            payloadTierRaw: payload.generation_tier,
          });
          const dualGenerateEnabled = isDualGenerateEnabledForUser({
            userId,
            scope: 'queue',
          });
          await processSearchVideoGenerateJob({
            jobId: job.id,
            userId,
            items,
            generationTier,
            dualGenerateEnabled,
          });
          return;
        }

        await processAllActiveSubscriptionsJob({
          jobId: job.id,
          traceId,
        });
      })(),
      jobExecutionTimeoutMs,
    );

    if (heartbeatError) {
      throw heartbeatError;
    }

    logUnlockEvent('unlock_job_finished', { trace_id: traceId, job_id: job.id }, {
      scope,
      duration_ms: Date.now() - jobStartMs,
      attempts: Number(job.attempts || 0),
      max_attempts: Number(job.max_attempts || 0),
    });
  } catch (error) {
    const classified = classifyQueuedJobError(error);
    const nextRetryDelay = Math.max(0, Math.floor(Number(classified.retryDelaySeconds) || 0));
    await failIngestionJob(db, {
      jobId: job.id,
      errorCode: classified.errorCode,
      errorMessage: classified.message,
      scheduleRetryInSeconds: nextRetryDelay,
      maxAttempts: Number(job.max_attempts || 3),
    });

    logUnlockEvent('unlock_job_failed', { trace_id: traceId, job_id: job.id }, {
      scope,
      error_code: classified.errorCode,
      error: classified.message.slice(0, 220),
      duration_ms: Date.now() - jobStartMs,
      attempts: Number(job.attempts || 0),
      max_attempts: Number(job.max_attempts || 0),
      retry_delay_seconds: nextRetryDelay,
    });

    if (scope === 'source_item_unlock_generation' && nextRetryDelay === 0) {
      await runUnlockSweeps(db, { mode: 'cron', force: true, traceId });
    }
  } finally {
    clearInterval(heartbeat);
  }
}

async function processClaimedIngestionJobs(db: ReturnType<typeof createClient>, jobs: IngestionJobRow[]) {
  const queue = jobs.slice();
  const concurrency = Math.max(1, Math.min(workerConcurrency, queue.length));
  const workers = Array.from({ length: concurrency }, () => (async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      await processClaimedIngestionJob(db, next);
    }
  })());
  await Promise.all(workers);
}

const queuedIngestionWorkerController = createQueuedIngestionWorkerController({
  getServiceSupabaseClient,
  runUnlockSweeps,
  recoverStaleIngestionJobs,
  queuedIngestionScopes: QUEUED_INGESTION_SCOPES,
  queuedWorkerId,
  workerLeaseMs,
  keepAliveEnabled: runIngestionWorker,
  keepAliveDelayMs: workerKeepAliveDelayMs,
  keepAliveIdleBaseDelayMs: workerIdleBackoffBaseMs,
  keepAliveIdleMaxDelayMs: workerIdleBackoffMaxMs,
  getQueueSweepPlan,
  claimQueuedIngestionJobs,
  processClaimedIngestionJobs,
  onRecoveredJobs: ({ scope, recoveredJobs, workerId }) => {
    console.log('[ingestion_stale_recovered]', JSON.stringify({
      worker_id: workerId,
      scope,
      recovered_count: recoveredJobs.length,
      recovered_job_ids: recoveredJobs.map((row) => row.id),
    }));
  },
  onWorkerFailure: ({ workerId, error }) => {
    console.log('[ingestion_queue_worker_failed]', JSON.stringify({
      worker_id: workerId,
      error: error instanceof Error ? error.message : String(error),
    }));
  },
});

async function runNotificationPushDispatcherCycle() {
  if (!notificationPushEnabled || !runIngestionWorker || !notificationPushSender) return;
  const db = getServiceSupabaseClient();
  if (!db) return;

  try {
    const processed = await processNotificationPushDispatchBatch(db, {
      batchSize: notificationPushBatchSize,
      maxAttempts: notificationPushMaxAttempts,
      processingStaleMs: notificationPushProcessingStaleMs,
      sendPushNotification: notificationPushSender,
      quietIosEnabled: notificationPushConfig.quietIosEnabled,
    });

    if (processed.length > 0) {
      console.log('[notification_push_dispatch_cycle]', JSON.stringify({
        processed_count: processed.length,
      }));
    }
  } catch (error) {
    console.log('[notification_push_dispatch_failed]', JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

const notificationPushDispatcherController = createNotificationPushDispatcherController({
  enabled: notificationPushEnabled,
  runIngestionWorker,
  intervalMs: notificationPushDispatchIntervalMs,
  runCycle: runNotificationPushDispatcherCycle,
});

function scheduleQueuedIngestionProcessing(delayMs = 0) {
  queuedIngestionWorkerController.schedule(delayMs);
}

async function runYouTubeRefreshSchedulerCycle() {
  if (!youtubeRefreshEnabled || !runIngestionWorker) return;
  const db = getServiceSupabaseClient();
  if (!db) return;

  try {
    const queueDepth = await countQueueDepth(db, {
      statuses: ['queued', 'running'],
      scopes: [...QUEUED_INGESTION_SCOPES],
    });
    if (queueDepth >= youtubeRefreshQueueDepthGuard) {
      console.log('[youtube_refresh_scheduler_skipped]', JSON.stringify({
        reason: 'QUEUE_DEPTH_GUARD',
        queue_depth: queueDepth,
        depth_guard: youtubeRefreshQueueDepthGuard,
      }));
      return;
    }

    const totalBudget = Math.max(0, youtubeRefreshViewMaxPerCycle + youtubeRefreshCommentsMaxPerCycle);
    let enqueuedTotal = 0;

    if (youtubeRefreshViewMaxPerCycle > 0 && enqueuedTotal < totalBudget) {
      const viewCandidates = await blueprintYouTubeCommentsService.listDueRefreshCandidates({
        db,
        kind: 'view_count',
        limit: Math.min(youtubeRefreshViewMaxPerCycle, totalBudget),
      });
      const pendingViewBlueprintIds = await blueprintYouTubeCommentsService.listPendingRefreshBlueprintIds({
        db,
        blueprintIds: viewCandidates.map((candidate) => candidate.blueprint_id),
        kind: 'view_count',
      });
      for (const candidate of viewCandidates) {
        if (enqueuedTotal >= totalBudget) break;
        if (pendingViewBlueprintIds.has(candidate.blueprint_id)) continue;
        const enqueueResult = await enqueueBlueprintYouTubeRefreshJob({
          db,
          blueprintId: candidate.blueprint_id,
          refreshKind: 'view_count',
          refreshTrigger: 'auto',
          youtubeVideoId: candidate.youtube_video_id,
          sourceItemId: candidate.source_item_id,
        });
        if (!enqueueResult.suppressed) {
          enqueuedTotal += 1;
        }
      }
    }

    if (youtubeRefreshCommentsMaxPerCycle > 0 && enqueuedTotal < totalBudget) {
      const commentsBudget = Math.min(
        youtubeRefreshCommentsMaxPerCycle,
        Math.max(0, totalBudget - enqueuedTotal),
      );
      const commentCandidates = await blueprintYouTubeCommentsService.listDueRefreshCandidates({
        db,
        kind: 'comments',
        limit: commentsBudget,
      });
      const pendingCommentBlueprintIds = await blueprintYouTubeCommentsService.listPendingRefreshBlueprintIds({
        db,
        blueprintIds: commentCandidates.map((candidate) => candidate.blueprint_id),
        kind: 'comments',
      });
      for (const candidate of commentCandidates) {
        if (enqueuedTotal >= totalBudget) break;
        if (pendingCommentBlueprintIds.has(candidate.blueprint_id)) continue;
        const enqueueResult = await enqueueBlueprintYouTubeRefreshJob({
          db,
          blueprintId: candidate.blueprint_id,
          refreshKind: 'comments',
          refreshTrigger: 'auto',
          youtubeVideoId: candidate.youtube_video_id,
          sourceItemId: candidate.source_item_id,
        });
        if (!enqueueResult.suppressed) {
          enqueuedTotal += 1;
        }
      }
    }

    console.log('[youtube_refresh_scheduler_cycle]', JSON.stringify({
      enqueued_total: enqueuedTotal,
      total_budget: totalBudget,
      view_max_per_cycle: youtubeRefreshViewMaxPerCycle,
      comments_max_per_cycle: youtubeRefreshCommentsMaxPerCycle,
      queue_depth: queueDepth,
    }));
  } catch (error) {
    console.log('[youtube_refresh_scheduler_failed]', JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

const youtubeRefreshSchedulerController = createYouTubeRefreshSchedulerController({
  enabled: youtubeRefreshEnabled,
  runIngestionWorker,
  intervalMinutes: youtubeRefreshIntervalMinutes,
  runCycle: runYouTubeRefreshSchedulerCycle,
});

function scheduleYouTubeRefreshScheduler(delayMs?: number) {
  youtubeRefreshSchedulerController.schedule(delayMs);
}

const sourceSubscriptionSyncService = createSourceSubscriptionSyncService({
  fetchYouTubeFeed,
  isNewerThanCheckpoint,
  ingestionMaxPerSubscription,
  youtubeDataApiKey,
  generationDurationCapEnabled,
  generationMaxVideoSeconds,
  generationBlockUnknownDuration,
  generationDurationLookupTimeoutMs,
  fetchYouTubeDurationMap,
  fetchYouTubeVideoStates,
  upsertSourceItemFromVideo,
  getExistingFeedItem,
  ensureSourceItemUnlock,
  computeUnlockCost,
  attemptAutoUnlockForSourceItem,
  getServiceSupabaseClient,
  enqueueSourceAutoUnlockRetryJob,
  getSourceItemUnlockBySourceItemId,
  getTranscriptCooldownState,
  isConfirmedNoTranscriptUnlock,
  suppressUnlockableFeedRowsForSourceItem,
  insertFeedItem,
});
const { syncSingleSubscription } = sourceSubscriptionSyncService;

const DebugSimulateSubscriptionRequestSchema = z.object({
  rewind_days: z.coerce.number().int().min(1).max(365).optional(),
});

async function markSubscriptionSyncError(
  db: ReturnType<typeof createClient>,
  subscription: string | { id: string; last_polled_at?: string | null; last_sync_error?: string | null },
  err: unknown,
) {
  const message = err instanceof Error ? err.message : String(err);
  const nowIso = new Date().toISOString();
  const update = buildSubscriptionSyncErrorUpdate({
    subscription: typeof subscription === 'string' ? null : subscription,
    errorMessage: message,
    nowIso,
  });
  if (!update) return;

  await db
    .from('user_source_subscriptions')
    .update(update)
    .eq('id', typeof subscription === 'string' ? subscription : subscription.id);
}

async function cleanupSubscriptionNoticeForChannel(
  db: ReturnType<typeof createClient>,
  input: {
    userId: string;
    subscriptionId: string;
    channelId: string;
  },
) {
  try {
    const { data: noticeSource } = await db
      .from('source_items')
      .select('id')
      .eq('source_type', 'subscription_notice')
      .eq('source_native_id', input.channelId)
      .maybeSingle();

    if (noticeSource?.id) {
      await db
        .from('user_feed_items')
        .delete()
        .eq('user_id', input.userId)
        .eq('source_item_id', noticeSource.id)
        .eq('state', 'subscription_notice');
    }
  } catch (cleanupError) {
    console.log('[subscription_notice_cleanup_failed]', JSON.stringify({
      user_id: input.userId,
      subscription_id: input.subscriptionId,
      source_channel_id: input.channelId,
      error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
    }));
  }
}

registerSourceSubscriptionsRoutes(app, {
  getAuthedSupabaseClient,
  getServiceSupabaseClient,
  resolveYouTubeChannel,
  resolvePublicYouTubeChannel,
  youtubeDataApiKey,
  fetchPublicYouTubeSubscriptions,
  fetchYouTubeChannelAssetMap,
  runSourcePageAssetSweep,
  ensureSourcePageFromYouTubeChannel,
  syncSingleSubscription,
  markSubscriptionSyncError,
  upsertSubscriptionNoticeSourceItem,
  insertFeedItem,
  upsertSourceItemFromVideo,
  buildSourcePagePath,
  cleanupSubscriptionNoticeForChannel,
  publicYouTubePreviewLimiter,
  refreshScanLimiter,
  refreshGenerateLimiter,
  RefreshSubscriptionsScanSchema,
  collectRefreshCandidatesForUser,
  RefreshSubscriptionsGenerateSchema,
  refreshGenerateMaxItems,
  generationDurationCapEnabled,
  generationMaxVideoSeconds,
  generationBlockUnknownDuration,
  generationDurationLookupTimeoutMs,
  recoverStaleIngestionJobs,
  getActiveManualRefreshJob,
  countQueueDepth,
  countQueueWorkItems,
  queueDepthHardLimit,
  queueDepthPerUserLimit,
  queueWorkItemsHardLimit,
  queueWorkItemsPerUserLimit,
  emitGenerationStartedNotification,
  getGenerationNotificationLinkPath,
  scheduleQueuedIngestionProcessing,
  resolveGenerationTierAccess,
  resolveRequestedGenerationTier,
  normalizeRequestedGenerationTier,
  resolveVariantOrReady,
  consumeCredit,
  getGenerationDailyCapStatus: generationDailyCapService.getStatus,
});

registerSourcePagesRoutes(app, {
  clampInt,
  getAuthedSupabaseClient,
  getServiceSupabaseClient,
  buildSourcePagePath,
  normalizeSourcePagePlatform,
  getSourcePageByPlatformExternalId,
  runSourcePageAssetSweep,
  needsSourcePageAssetHydration,
  hydrateSourcePageAssetsForRow,
  youtubeDataApiKey,
  getUserSubscriptionStateForSourcePage,
  sourceVideoListBurstLimiter,
  sourceVideoListSustainedLimiter,
  sourceVideoUnlockBurstLimiter,
  sourceVideoUnlockSustainedLimiter,
  clampYouTubeSourceVideoLimit,
  normalizeYouTubeSourceVideoKind,
  runUnlockSweeps,
  listYouTubeSourceVideos,
  YouTubeSourceVideosError,
  loadExistingSourceVideoStateForUser,
  countActiveSubscribersForSourcePage,
  computeUnlockCost,
  getSourceItemUnlocksBySourceItemIds,
  toUnlockSnapshot,
  isConfirmedNoTranscriptUnlock,
  createUnlockTraceId,
  SourcePageVideosGenerateSchema,
  sourceUnlockGenerateMaxItems,
  generationDurationCapEnabled,
  generationMaxVideoSeconds,
  generationBlockUnknownDuration,
  generationDurationLookupTimeoutMs,
  logUnlockEvent,
  normalizeSourcePageVideoGenerateItem,
  upsertSourceItemFromVideo,
  ensureSourceItemUnlock,
  getTranscriptCooldownState,
  reserveUnlock,
  sourceUnlockReservationSeconds,
  reserveCredits,
  refundReservation,
  buildUnlockLedgerIdempotencyKey,
  failUnlock,
  attachReservationLedger,
  markUnlockProcessing,
  countQueueDepth,
  countQueueWorkItems,
  unlockIntakeEnabled,
  queueDepthHardLimit,
  queueDepthPerUserLimit,
  queueWorkItemsHardLimit,
  queueWorkItemsPerUserLimit,
  workerConcurrency,
  emitGenerationStartedNotification,
  getGenerationNotificationLinkPath,
  scheduleQueuedIngestionProcessing,
  settleReservation,
  completeUnlock,
  runYouTubePipeline: (pipelineInput: any) => runYouTubePipeline(pipelineInput),
  getFailureTransition,
  sourceTranscriptMaxAttempts,
  resolveYouTubeChannel,
  fetchYouTubeChannelAssetMap,
  ensureSourcePageFromYouTubeChannel,
  syncSingleSubscription,
  markSubscriptionSyncError,
  upsertSubscriptionNoticeSourceItem,
  insertFeedItem,
  cleanupSubscriptionNoticeForChannel,
  resolveGenerationTierAccess,
  resolveRequestedGenerationTier,
  normalizeRequestedGenerationTier,
  resolveVariantOrReady,
});

registerIngestionUserRoutes(app, {
  getAuthedSupabaseClient,
  getServiceSupabaseClient,
  clampInt,
  ingestionLatestMineLimiter,
  workerConcurrency,
  queuedIngestionScopes: QUEUED_INGESTION_SCOPES,
  isQueuedIngestionScope,
});

registerNotificationRoutes(app, {
  getAuthedSupabaseClient,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  getNotificationPushConfig: () => ({
    enabled: notificationPushEnabled,
    vapidPublicKey: notificationPushConfig.publicKey,
    quietIosEnabled: notificationPushConfig.quietIosEnabled,
  }),
  listNotificationPushSubscriptions: listActiveNotificationPushSubscriptions,
  upsertNotificationPushSubscription,
  deactivateNotificationPushSubscription,
  clampInt,
});

registerOpsRoutes(app, {
  isServiceRequestAuthorized,
  getServiceSupabaseClient,
  recoverStaleIngestionJobs,
  runUnlockSweeps,
  runSourcePageAssetSweep,
  seedSourceTranscriptRevalidateJobs,
  countQueueDepth,
  countQueueWorkItems,
  createUnlockTraceId,
  scheduleQueuedIngestionProcessing,
  queueDepthHardLimit,
  queueDepthPerUserLimit,
  queueWorkItemsHardLimit,
  queueWorkItemsPerUserLimit,
  queuePriorityEnabled,
  queueLowPrioritySuppressionDepth,
  workerConcurrency,
  workerBatchSize,
  workerLeaseMs,
  workerHeartbeatMs,
  jobExecutionTimeoutMs,
  queuedWorkerId,
  getQueuedWorkerRunning: () => queuedIngestionWorkerController.getRunning(),
  runtimeMode,
  queuedIngestionScopes: QUEUED_INGESTION_SCOPES,
  isQueuedIngestionScope,
  getProviderCircuitSnapshot,
  autoBannerMode,
  autoBannerCap,
  autoBannerMaxAttempts,
  autoBannerTimeoutMs,
  autoBannerBatchSize,
  autoBannerConcurrency,
  processAutoBannerQueue,
  debugEndpointsEnabled,
  debugSimulateSubscriptionRequestSchema: DebugSimulateSubscriptionRequestSchema,
  resetTranscriptProxyDispatcher,
  getTranscriptProxyDebugMode,
  syncSingleSubscription,
  markSubscriptionSyncError,
});

registerFeedRoutes(app, {
  autoChannelPipelineEnabled,
  getAuthedSupabaseClient,
  getServiceSupabaseClient,
  createBlueprintFromVideo,
  runAutoChannelForFeedItem,
});

registerChannelCandidateRoutes(app, {
  rejectLegacyManualFlowIfDisabled,
  getAuthedSupabaseClient,
  evaluateCandidateForChannel,
});

type PipelineErrorCode =
  | 'SERVICE_DISABLED'
  | 'INVALID_URL'
  | 'VIDEO_TOO_LONG'
  | 'VIDEO_DURATION_UNAVAILABLE'
  | 'VIDEO_DURATION_POLICY_BLOCKED'
  | 'NO_CAPTIONS'
  | 'VIDEO_UNAVAILABLE'
  | 'ACCESS_DENIED'
  | 'PROVIDER_FAIL'
  | 'PROVIDER_DEGRADED'
  | 'TRANSCRIPT_EMPTY'
  | 'TRANSCRIPT_INSUFFICIENT_CONTEXT'
  | 'GENERATION_FAIL'
  | 'SAFETY_BLOCKED'
  | 'PII_BLOCKED'
  | 'RATE_LIMITED'
  | 'TIMEOUT';

type PipelineErrorShape = {
  error_code: PipelineErrorCode;
  message: string;
  retry_after_seconds?: number;
  max_duration_seconds?: number;
  video_duration_seconds?: number | null;
  video_id?: string;
};

class PipelineError extends Error {
  errorCode: PipelineErrorCode;
  retryAfterSeconds: number | null;
  details: Record<string, unknown> | null;
  constructor(
    errorCode: PipelineErrorCode,
    message: string,
    options?: {
      retryAfterSeconds?: number | null;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.errorCode = errorCode;
    const retryAfterRaw = Number(options?.retryAfterSeconds);
    this.retryAfterSeconds = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0
      ? Math.max(1, Math.ceil(retryAfterRaw))
      : null;
    this.details = options?.details ? { ...options.details } : null;
  }
}

function makePipelineError(
  errorCode: PipelineErrorCode,
  message: string,
  options?: {
    retryAfterSeconds?: number | null;
    details?: Record<string, unknown>;
  },
): never {
  throw new PipelineError(errorCode, message, options);
}

function mapPipelineError(error: unknown): PipelineErrorShape | null {
  if (error instanceof PipelineError) {
    const details = error.details || {};
    return {
      error_code: error.errorCode,
      message: error.message,
      retry_after_seconds: error.retryAfterSeconds || undefined,
      max_duration_seconds: Number.isFinite(Number(details.max_duration_seconds))
        ? Math.max(1, Math.floor(Number(details.max_duration_seconds)))
        : undefined,
      video_duration_seconds: Object.prototype.hasOwnProperty.call(details, 'video_duration_seconds')
        ? (details.video_duration_seconds == null
          ? null
          : Number.isFinite(Number(details.video_duration_seconds))
            ? Math.max(0, Math.floor(Number(details.video_duration_seconds)))
            : null)
        : undefined,
      video_id: typeof details.video_id === 'string' ? details.video_id : undefined,
    };
  }
  const providerCode = String((error as { code?: string } | null)?.code || '').trim();
  if (providerCode === 'BLUEPRINT_JSON_INVALID') {
    return {
      error_code: 'BLUEPRINT_JSON_INVALID',
      message: error instanceof Error
        ? error.message
        : 'Blueprint generation returned malformed structured output. Please try again.',
    };
  }
  if (providerCode === 'PROVIDER_DEGRADED') {
    return {
      error_code: 'PROVIDER_DEGRADED',
      message: error instanceof Error ? error.message : 'Provider temporarily degraded.',
    };
  }
  if (error instanceof TranscriptProviderError) {
    if (error.code === 'VIDEOTRANSCRIBER_DAILY_LIMIT') {
      return {
        error_code: 'RATE_LIMITED',
        message: 'Temporary transcript provider daily limit reached. Please retry later.',
        retry_after_seconds: error.retryAfterSeconds || undefined,
      };
    }
    if (error.code === 'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE') {
      return {
        error_code: 'PROVIDER_FAIL',
        message: 'Transcript provider is currently unavailable. Please try another video.',
      };
    }
    if (error.code === 'TRANSCRIPT_FETCH_FAIL') {
      return { error_code: 'PROVIDER_FAIL', message: 'Transcript provider is currently unavailable. Please try another video.' };
    }
    return {
      error_code: error.code,
      message: error.message,
      retry_after_seconds: error.retryAfterSeconds || undefined,
    };
  }
  if (error instanceof CodexExecError) {
    if (error.code === 'TIMEOUT') {
      return {
        error_code: 'TIMEOUT',
        message: 'Generation request timed out. Please retry.',
      };
    }
    if (error.code === 'RATE_LIMITED') {
      return {
        error_code: 'RATE_LIMITED',
        message: 'Generation provider is rate-limited. Please retry shortly.',
        retry_after_seconds: 15,
      };
    }
    return {
      error_code: 'PROVIDER_FAIL',
      message: 'Generation provider is currently unavailable. Please try again.',
    };
  }
  return null;
}

function flattenDraftText(draft: {
  title: string;
  description: string;
  notes?: string | null;
  tags?: string[];
  sectionsJson?: BlueprintSectionsV1 | null;
  steps?: Array<{ name: string; notes: string; timestamp?: string | null }>;
}) {
  const canonicalBlocks = draft.sectionsJson ? [
    String(draft.sectionsJson.summary?.text || '').trim(),
    ...(draft.sectionsJson.takeaways?.bullets || []).map((item) => String(item || '').trim()),
    String(draft.sectionsJson.storyline?.text || '').trim(),
    ...(draft.sectionsJson.deep_dive?.bullets || []).map((item) => String(item || '').trim()),
    ...(draft.sectionsJson.practical_rules?.bullets || []).map((item) => String(item || '').trim()),
    ...(draft.sectionsJson.open_questions?.bullets || []).map((item) => String(item || '').trim()),
  ] : [];
  const blocks = [
    draft.title,
    draft.description,
    draft.notes || '',
    ...(draft.tags || []),
    ...canonicalBlocks,
    ...((draft.steps || []).flatMap((step) => [step.name, step.notes, step.timestamp || ''])),
  ];
  return blocks.filter(Boolean).join('\n').toLowerCase();
}

const GOLDEN_QUALITY_MAX_RETRIES = 2;

type LlmNativeGateResult = {
  pass: boolean;
  issues: string[];
  issueDetails: string[];
};

function normalizeSectionKey(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/^#+\s+/, '')
    .replace(/:$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalSectionName(value: string) {
  const key = normalizeSectionKey(value);
  if (!key) return '';
  if (key === 'takeaways' || key === 'lightning takeaways') return 'takeaways';
  if (key === 'deep dive' || key === 'mechanism deep dive') return 'deep_dive';
  if (key === 'practical rules' || key === 'decision rules') return 'practical_rules';
  if (key === 'open questions') return 'open_questions';
  return key;
}

function extractSectionBullets(notes: string) {
  return String(notes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) return bulletMatch[1].trim();
      const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);
      if (numberedMatch) return numberedMatch[1].trim();
      return '';
    })
    .filter(Boolean);
}

function sentenceCount(value: string) {
  const sentences = String(value || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return sentences.length === 0 && String(value || '').trim() ? 1 : sentences.length;
}

function wordCount(value: string) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeSummaryVariantText(value: unknown) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function evaluateLlmNativeGate(draft: YouTubeDraft): LlmNativeGateResult {
  if (!draft.sectionsJson || draft.sectionsJson.schema_version !== 'blueprint_sections_v1') {
    return {
      pass: false,
      issues: ['CANONICAL_SECTIONS_MISSING'],
      issueDetails: ['CANONICAL_SECTIONS_MISSING section=sections_json'],
    };
  }

  const issues: string[] = [];
  const issueDetails: string[] = [];
  const sections = draft.sectionsJson;

  const requiredNarrativeSections: Array<{
    key: 'summary' | 'storyline';
    code: 'SUMMARY' | 'STORYLINE';
  }> = [
    { key: 'summary', code: 'SUMMARY' },
    { key: 'storyline', code: 'STORYLINE' },
  ];
  for (const target of requiredNarrativeSections) {
    const text = target.key === 'summary'
      ? String(sections.summary?.text || '').trim()
      : String(sections.storyline?.text || '').trim();
    const notes = normalizeSummaryVariantText(text);
    if (!notes) {
      issues.push(`${target.code}_EMPTY`);
      issueDetails.push(`${target.code}_EMPTY section=${target.key}`);
    }
  }

  const targetSections: Array<{ key: string; code: string }> = [
    { key: 'takeaways', code: 'TAKEAWAYS' },
    { key: 'deep_dive', code: 'DEEP_DIVE' },
    { key: 'practical_rules', code: 'PRACTICAL_RULES' },
    { key: 'open_questions', code: 'OPEN_QUESTIONS' },
  ];

  for (const target of targetSections) {
    const bullets = (() => {
      if (target.key === 'takeaways') return sections.takeaways?.bullets || [];
      if (target.key === 'deep_dive') return sections.deep_dive?.bullets || [];
      if (target.key === 'practical_rules') return sections.practical_rules?.bullets || [];
      return sections.open_questions?.bullets || [];
    })()
      .map((bullet) => String(bullet || '').trim())
      .filter(Boolean);
    if (bullets.length === 0) {
      issues.push(`${target.code}_NO_BULLETS`);
      issueDetails.push(`${target.code}_NO_BULLETS section=${target.key}`);
      continue;
    }
    if (target.key === 'takeaways') {
      if (bullets.length < 3 || bullets.length > 4) {
        issues.push('TAKEAWAYS_BULLET_COUNT');
        issueDetails.push(`TAKEAWAYS_BULLET_COUNT count=${bullets.length}`);
      }
      const totalWords = bullets.reduce((sum, bullet) => sum + wordCount(bullet), 0);
      if (totalWords > 100) {
        issues.push('TAKEAWAYS_TOO_LONG');
        issueDetails.push(`TAKEAWAYS_TOO_LONG words=${totalWords}`);
      }
    } else if (bullets.length < 3 || bullets.length > 5) {
      issues.push(`${target.code}_BULLET_COUNT`);
      issueDetails.push(`${target.code}_BULLET_COUNT count=${bullets.length}`);
    }

    bullets.forEach((bullet, index) => {
      const sentences = sentenceCount(bullet);
      if (sentences > 2) {
        issues.push(`${target.code}_BULLET_SENTENCE_LIMIT`);
        issueDetails.push(`${target.code}_BULLET_SENTENCE_LIMIT bullet=${index + 1} sentences=${sentences}`);
      }
      if (target.key === 'open_questions' && !/\?\s*$/.test(bullet)) {
        issues.push('OPEN_QUESTIONS_NOT_QUESTIONS');
        issueDetails.push(`OPEN_QUESTIONS_NOT_QUESTIONS bullet=${index + 1}`);
      }
    });
  }

  return {
    pass: issues.length === 0,
    issues: Array.from(new Set(issues)),
    issueDetails: Array.from(new Set(issueDetails)),
  };
}

function draftToNormalizationInput(draft: YouTubeDraft) {
  return {
    title: draft.title,
    tags: draft.tags,
    sectionsJson: draft.sectionsJson!,
  };
}

function formatGoldenQualityIssueDetails(detail: Array<{ code: string; section?: string; detail?: string }>) {
  return detail.map((item) => {
    const section = item.section ? ` section=${item.section}` : '';
    const reason = item.detail ? ` detail=${item.detail}` : '';
    return `${item.code}${section}${reason}`.trim();
  });
}

function runSafetyChecks(flattened: string) {
  const checks: Record<string, RegExp[]> = {
    self_harm: [/\bkill yourself\b/, /\bsuicide\b/, /\bself-harm\b/, /\bhow to self harm\b/],
    sexual_minors: [/\bminor\b.*\bsex/i, /\bchild\b.*\bsex/i, /\bunderage\b.*\bsexual/i],
    hate_harassment: [/\bkill (all|those)\b/, /\bsubhuman\b/, /\bgo back to your country\b/, /\bslur\b/],
  };
  const hits = Object.entries(checks)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(flattened)))
    .map(([key]) => key);
  return {
    ok: hits.length === 0,
    blockedTopics: hits,
  };
}

function runPiiChecks(flattened: string) {
  const checks = [
    { type: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
    { type: 'phone', regex: /\b(?:\+?\d{1,2}\s*)?(?:\(?\d{3}\)?[-.\s]*)\d{3}[-.\s]*\d{4}\b/ },
    { type: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  ];
  const hits = checks.filter((check) => check.regex.test(flattened)).map((check) => check.type);
  return { ok: hits.length === 0, matches: hits };
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new PipelineError('TIMEOUT', 'Request timed out.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

type YouTubeGenerationTraceContext = {
  db: ReturnType<typeof createClient> | null;
  userId: string | null;
  sourceScope: string | null;
  sourceTag: string | null;
  modelPrimary: string | null;
  reasoningEffort: string | null;
  traceVersion: string;
};

function getYouTubeGenerationTraceContext(input: {
  db?: ReturnType<typeof createClient> | null;
  userId?: string | null;
  sourceScope?: string | null;
  sourceTag?: string | null;
  modelPrimary?: string | null;
  reasoningEffort?: string | null;
}): YouTubeGenerationTraceContext {
  return {
    db: input.db || null,
    userId: String(input.userId || '').trim() || null,
    sourceScope: String(input.sourceScope || '').trim() || null,
    sourceTag: String(input.sourceTag || '').trim() || null,
    modelPrimary: String(input.modelPrimary || process.env.OPENAI_GENERATION_MODEL || 'gpt-5.2').trim() || 'gpt-5.2',
    reasoningEffort: String(input.reasoningEffort || process.env.OPENAI_GENERATION_REASONING_EFFORT || 'medium').trim().toLowerCase() || 'medium',
    traceVersion: 'yt2bp_trace_v2',
  };
}

async function safeGenerationTraceWrite(input: {
  runId: string;
  op: string;
  fn: () => Promise<unknown>;
}) {
  try {
    await input.fn();
  } catch (error) {
    console.log('[generation_trace_write_failed]', JSON.stringify({
      run_id: input.runId,
      op: input.op,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

const transcriptThrottle = createTranscriptThrottle({
  enabled: transcriptThrottleEnabled,
  tiersMs: transcriptThrottleTiersMs,
  jitterMs: transcriptThrottleJitterMs,
  interactiveMaxWaitMs: transcriptThrottleInteractiveMaxWaitMs,
});

async function runTranscriptTaskWithThrottle<T>(
  input: {
    requestClass?: TranscriptRequestClass;
    reason?: string;
    videoId?: string;
  },
  task: () => Promise<T>,
) {
  return transcriptThrottle.runTranscriptTask({
    requestClass: input.requestClass === 'interactive' ? 'interactive' : 'background',
    reason: input.reason,
    videoId: input.videoId,
  }, task);
}

async function getTranscriptForVideoWithThrottle(
  videoId: string,
  options?: {
    requestClass?: TranscriptRequestClass;
    reason?: string;
  },
) {
  return runTranscriptTaskWithThrottle(
    {
      requestClass: options?.requestClass,
      reason: options?.reason || 'pipeline_transcript_fetch',
      videoId,
    },
    () => getTranscriptForVideo(videoId, {
      db: getServiceSupabaseClient(),
      enableFallback: true,
    }),
  );
}

async function probeTranscriptProvidersWithThrottle(
  videoId: string,
  options?: {
    requestClass?: TranscriptRequestClass;
    reason?: string;
  },
) {
  return runTranscriptTaskWithThrottle(
    {
      requestClass: options?.requestClass,
      reason: options?.reason || 'transcript_probe',
      videoId,
    },
    () => probeTranscriptProviders(videoId),
  );
}

const codexLane = createCodexLane({
  enabled: useCodexForGeneration && codexBinaryAvailable,
  concurrency: codexExecLaneConcurrency,
});
let codexCircuitConsecutiveFailures = 0;
let codexCircuitOpenUntilMs = 0;

function isCodexCircuitOpen() {
  return Date.now() < codexCircuitOpenUntilMs;
}

function onCodexSuccess() {
  codexCircuitConsecutiveFailures = 0;
}

function onCodexFailure() {
  codexCircuitConsecutiveFailures += 1;
  if (codexCircuitConsecutiveFailures >= codexCircuitFailureThreshold) {
    codexCircuitOpenUntilMs = Date.now() + codexCircuitCooldownMs;
    codexCircuitConsecutiveFailures = 0;
    console.warn('[codex_generation_circuit_open]', JSON.stringify({
      cooldown_ms: codexCircuitCooldownMs,
    }));
  }
}

async function runCodexPromptForGeneration(input: {
  stage: string;
  model: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  prompt: string;
}) {
  if (!(useCodexForGeneration && codexBinaryAvailable)) {
    throw new CodexExecError({
      code: 'PROCESS_FAIL',
      message: 'Codex generation is disabled.',
    });
  }
  if (isCodexCircuitOpen()) {
    throw new CodexExecError({
      code: 'PROCESS_FAIL',
      message: 'Codex circuit is temporarily open.',
    });
  }

  return codexLane.runCodexTask(
    { stage: input.stage },
    async () => {
      const startedAt = Date.now();
      try {
        const result = await runCodexExec({
          prompt: input.prompt,
          model: input.model,
          reasoningEffort: input.reasoningEffort,
          timeoutMs: codexExecTimeoutMs,
          execPath: codexExecPath,
        });
        onCodexSuccess();
        console.log('[codex_generation_attempt]', JSON.stringify({
          stage: input.stage,
          model: input.model,
          reasoning_effort: input.reasoningEffort,
          result: 'codex_success',
          latency_ms: Date.now() - startedAt,
        }));
        return result;
      } catch (error) {
        onCodexFailure();
        const code = error instanceof CodexExecError ? error.code : 'PROCESS_FAIL';
        console.warn('[codex_generation_attempt]', JSON.stringify({
          stage: input.stage,
          model: input.model,
          reasoning_effort: input.reasoningEffort,
          result: codexFallbackEnabled ? 'codex_fallback_openai' : 'codex_failed_no_fallback',
          codex_error_code: code,
          message: error instanceof Error ? error.message : String(error),
          latency_ms: Date.now() - startedAt,
        }));
        throw error;
      }
    },
  );
}

function createYouTubeGenerationLLMClient(input: {
  generationTier: GenerationTier;
}) {
  const codexProfile = resolveCodexModelProfile(input.generationTier);
  const codexEnabled = useCodexForGeneration && codexBinaryAvailable;
  return createLLMClientForPurpose({
    purpose: 'youtube_generation',
    codexEnabled,
    createCodexClient: () => createCodexGenerationClient({
      fallbackClientFactory: () => createOpenAIClient(),
      fallbackEnabled: codexFallbackEnabled,
      codexModel: codexProfile.model,
      codexReasoningEffort: codexProfile.reasoningEffort,
      codexTimeoutMs: codexExecTimeoutMs,
      runCodexPrompt: async (payload) => runCodexPromptForGeneration({
        stage: payload.operation,
        model: payload.model,
        reasoningEffort: payload.reasoningEffort,
        prompt: payload.prompt,
      }),
      onCodexFallback: (payload) => {
        console.warn('[codex_generation_fallback]', JSON.stringify({
          stage: payload.operation,
          error_code: payload.errorCode,
          message: payload.message,
        }));
      },
    }),
  });
}

const youtubeBlueprintPipelineService = createYouTubeBlueprintPipelineService({
  getServiceSupabaseClient,
  getYouTubeGenerationTraceContext,
  safeGenerationTraceWrite,
  startGenerationRun,
  appendGenerationEvent,
  runWithProviderRetry,
  providerRetryDefaults: {
    ...providerRetryDefaults,
    transcriptTimeoutMs: resolveTranscriptOperationTimeoutMs(providerRetryDefaults.transcriptTimeoutMs),
  },
  getTranscriptForVideo: getTranscriptForVideoWithThrottle,
  createYouTubeGenerationLLMClient,
  updateGenerationModelInfo,
  yt2bpSafetyBlockEnabled,
  readYt2bpQualityConfig,
  readYt2bpContentSafetyConfig,
  flattenDraftText,
  runSafetyChecks,
  runPiiChecks,
  makePipelineError,
  scoreYt2bpQuality,
  scoreYt2bpContentSafety,
  evaluateLlmNativeGate,
  yt2bpOutputMode,
  normalizeYouTubeDraftToGoldenV1,
  draftToNormalizationInput,
  formatGoldenQualityIssueDetails,
  buildYouTubeQualityRetryInstructions,
  GOLDEN_QUALITY_MAX_RETRIES,
  uploadBannerToSupabase,
  supabaseUrl,
  finalizeGenerationRunSuccess,
  finalizeGenerationRunFailure,
  mapPipelineError,
  canonicalSectionName,
  normalizeSummaryVariantText,
  youtubeBlueprintPromptTemplatePath,
  pruneTranscriptForGeneration: (input: { transcriptText: string }) => applyTranscriptPruning({
    transcriptText: input.transcriptText,
    config: transcriptPruningConfig,
  }),
  enforceVideoDurationPolicy: (input: {
    videoId: string;
    videoTitle?: string | null;
    durationSeconds?: number | null;
    userAgent: string;
  }) => enforceVideoDurationPolicyForGeneration(input),
});
const { runYouTubePipeline } = youtubeBlueprintPipelineService;

async function uploadBannerToSupabase(imageBase64: string, contentType: string, authToken: string) {
  if (!supabaseUrl) return null;
  const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/upload-banner`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ contentType, imageBase64 }),
  });
  if (!uploadResponse.ok) {
    return null;
  }
  const uploadData = await uploadResponse.json().catch(() => null);
  return typeof uploadData?.bannerUrl === 'string' ? uploadData.bannerUrl : null;
}

console.log(`[agentic-backend] runtime_mode=${runtimeMode}`);

if (runHttpServer) {
  app.listen(port, () => {
    console.log(`[agentic-backend] listening on :${port}`);
  });
}

if (runIngestionWorker) {
  queuedIngestionWorkerController.start(1500);
  if (youtubeRefreshEnabled) {
    youtubeRefreshSchedulerController.start(1500);
  }
  if (notificationPushEnabled) {
    notificationPushDispatcherController.start(5000);
  }
}

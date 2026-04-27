import './runtime/requireNode20';
import './loadEnv';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
  resolveWorkerLeaseHeartbeatStartupDelayMs,
  resolveWorkerLeaseHeartbeatMs,
} from './services/queuedIngestionWorkerController';
import {
  parseRuntimeFlag,
  readBackendRuntimeConfig,
  readWorkerRuntimeControls,
  shouldRunOraclePrimarySubscriptionScheduler,
} from './services/runtimeConfig';
import { readOracleControlPlaneConfig } from './services/oracleControlPlaneConfig';
import { openOracleControlPlaneDb } from './services/oracleControlPlaneDb';
import { createOracleSubscriptionSchedulerController } from './services/oracleSubscriptionSchedulerController';
import {
  clearOracleQueueClaimCooldowns,
  recordOracleQueueClaimResult,
  shouldAttemptOracleQueueClaim,
} from './services/oracleQueueClaimGovernor';
import {
  expediteOracleQueueSweeps,
  getOracleQueueSweepNextDelayMs,
  recordOracleQueueSweepResult,
  selectDueOracleQueueSweeps,
} from './services/oracleQueueSweepScheduler';
import {
  readOracleQueueAdmissionCounts,
  supportsOracleQueueAdmissionMirror,
  syncOracleQueueAdmissionMirrorFromSupabase,
} from './services/oracleQueueAdmissionState';
import {
  findOracleStaleRunningJobs,
  getOracleActiveJobForUserScope,
  getOracleLatestIngestionJob,
  listOracleActiveJobsForScope,
  listOracleActiveJobsForScopes,
  listOracleActiveJobsForUser,
  listOracleJobsByIds,
  listOracleLatestJobsForUserScope,
  listOracleRunningJobsByScope,
  type OracleMirroredIngestionJob,
  recordOracleJobLeaseHeartbeat,
  syncOracleJobActivityMirrorFromSupabase,
  syncOracleJobActivityRowFromSupabaseById,
  syncOracleJobActivityRowsFromSupabaseByIds,
  upsertOracleJobActivityRow,
  upsertOracleJobActivityRows,
} from './services/oracleJobActivityState';
import {
  buildOracleQueueLedgerJobFromInsertValues,
  claimOracleQueuedIngestionJobs,
  countOracleQueueLedgerJobs,
  deleteOracleQueueLedgerJob,
  failOracleQueueJob,
  finalizeOracleQueueJob,
  getOracleLatestQueueJob,
  getOracleLatestQueueJobForScope,
  listOracleQueueLedgerJobs,
  markOracleRunningJobsFailed,
  readOracleQueueLedgerBootstrapSummary,
  syncOracleQueueLedgerFromSupabase,
  touchOracleQueueJobLease,
  upsertOracleQueueLedgerRow,
  upsertOracleQueueLedgerRows,
} from './services/oracleQueueLedgerState';
import {
  countOracleProductActiveSubscriptions,
  deleteOracleProductFeedRows,
  getOracleProductSubscriptionState,
  getOracleProductUnlockBySourceItemId,
  listOracleProductActiveSubscriptionsForUser,
  listOracleProductFeedRows,
  listOracleProductSourceItems,
  listOracleProductUnlocks,
  syncOracleProductStateFromSupabase,
  upsertOracleProductFeedRows,
  upsertOracleProductSourceItemRows,
  upsertOracleProductSubscriptionRows,
  upsertOracleProductUnlockRows,
} from './services/oracleProductState';
import {
  countOracleSubscriptionLedgerActiveSubscriptions,
  deleteOracleSubscriptionLedgerRow,
  getOracleSubscriptionLedgerById,
  getOracleSubscriptionLedgerByUserChannel,
  getOracleSubscriptionLedgerState,
  listOracleSubscriptionLedgerActiveUserIdsForSource,
  listOracleSubscriptionLedgerActiveSubscriptionsForUser,
  listOracleSubscriptionLedgerRowsByIds,
  listOracleSubscriptionLedgerRowsPageForUser,
  listOracleSubscriptionLedgerRowsForUser,
  syncOracleSubscriptionLedgerFromSupabase,
  upsertOracleSubscriptionLedgerRow,
} from './services/oracleSubscriptionLedgerState';
import {
  countOracleUnlockLedgerActiveLinksForJobs,
  deleteOracleUnlockLedgerRow,
  getOracleUnlockLedgerById,
  getOracleUnlockLedgerBySourceItemId,
  listOracleUnlockLedgerExpiredReservedRows,
  type OracleUnlockLedgerRow,
  listOracleUnlockLedgerProcessingRows,
  listOracleUnlockLedgerRowsBySourceItemIds,
  replaceOracleUnlockLedgerRow,
  upsertOracleUnlockLedgerRow,
} from './services/oracleUnlockLedgerState';
import {
  deleteOracleFeedLedgerRows,
  getOracleFeedLedgerById,
  getOracleFeedLedgerByUserSourceItem,
  listOracleFeedLedgerRows,
  upsertOracleFeedLedgerRow,
  upsertOracleFeedLedgerRows,
} from './services/oracleFeedLedgerState';
import {
  deleteOracleSourceItemLedgerRows,
  getOracleSourceItemLedgerByCanonicalKey,
  getOracleSourceItemLedgerById,
  listOracleSourceItemLedgerRows,
  upsertOracleSourceItemLedgerRow,
} from './services/oracleSourceItemLedgerState';
import {
  attachOracleBlueprintToGenerationRun,
  claimOracleGenerationVariantForGeneration,
  finalizeOracleGenerationRunFailure,
  finalizeOracleGenerationRunSuccess,
  findOracleGenerationVariantsByBlueprintId,
  getOracleGenerationRunByRunId,
  getOracleLatestGenerationRunByBlueprintId,
  listOracleFailedGenerationRunsByVideoId,
  listOracleGenerationVariantsForSourceItem,
  markOracleGenerationVariantFailed,
  markOracleGenerationVariantReady,
  resolveOracleGenerationVariantOrReady,
  startOracleGenerationRun,
  countOracleGenerationStateRows,
  updateOracleGenerationRunModelInfo,
  upsertOracleGenerationRunRow,
  upsertOracleGenerationVariantRow,
} from './services/oracleGenerationState';
import {
  normalizeIsoOrNull,
  normalizeObject,
  normalizeRequiredIso,
  normalizeStringOrNull,
} from './services/oracleValueNormalization';
import {
  getEffectiveUnlockDisplayStatus,
  isEffectiveUnlockDisplayInProgress,
} from './services/unlockDisplayState';
import {
  evaluateOraclePrimarySchedulerDecision,
  evaluateOracleShadowSchedulerDecision,
} from './services/oracleSubscriptionScheduler';
import {
  bootstrapOracleSubscriptionSchedulerState,
  listOracleDueSubscriptions,
  markOracleAllActiveSubscriptionsRunFinished,
  markOracleAllActiveSubscriptionsRunStarted,
  recordOracleSubscriptionSchedulerObservation,
  recordOracleSubscriptionSyncOutcome,
  type OracleScopeDecisionCode,
} from './services/oracleSubscriptionSchedulerState';
import { createYouTubeRefreshSchedulerController } from './services/youtubeRefreshSchedulerController';
import {
  createGenerationDailyCapService,
  readGenerationDailyCapConfigFromEnv,
} from './services/generationDailyCap';
import { getBlueprintAvailabilityForVideo as readBlueprintAvailabilityForVideo } from './services/blueprintAvailability';
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
  resolveStrongYouTubeChannelByCreatorName,
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
  getSourceItemUnlockById,
  getSourceItemUnlockBySourceItemId,
  getSourceItemUnlocksBySourceItemIds,
  markUnlockProcessing,
  normalizeSupabaseUnlockShadowRow,
  reserveUnlock,
  type SourceItemUnlockRow,
} from './services/sourceUnlocks';
import {
  configureCreditWalletOracleAdapter,
  refundReservation,
  reserveCredits,
  settleReservation,
} from './services/creditWallet';
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
import { evaluateLlmNativeGate, normalizeSummaryVariantText } from './services/llmNativeQualityGate';
import {
  ProviderCircuitOpenError,
  configureProviderCircuitOracleWriteAdapter,
  getProviderCircuitSnapshot,
} from './services/providerCircuit';
import {
  getProviderRetryDefaults,
  resolveProviderRetryDefaultsForRequestClass,
  runWithProviderRetry,
} from './services/providerResilience';
import { createTranscriptThrottle, type TranscriptRequestClass } from './services/transcriptThrottle';
import { createTranscriptFetchWithCacheBypass } from './services/transcriptFetchWithCacheBypass';
import { createCodexLane } from './services/codexLane';
import {
  claimQueuedIngestionJobsWithHooks,
  countQueueDepth,
  countQueueWorkItems,
  failIngestionJobWithHooks,
  getQueuedJobWorkItemCount,
  touchIngestionJobLeaseWithHooks,
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
  configureNotificationOracleWriteAdapter,
  createNotificationFromEvent,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from './services/notifications';
import {
  configureNotificationPushOracleReadAdapter,
  createNotificationPushSender,
  deactivateNotificationPushSubscription,
  listActiveNotificationPushSubscriptions,
  processNotificationPushDispatchBatch,
  readNotificationPushConfigFromEnv,
  upsertNotificationPushSubscription,
} from './services/notificationPush';
import {
  appendGenerationEvent,
  attachBlueprintToRun as attachBlueprintToRunSupabase,
  configureGenerationTraceOracleWriteAdapter,
  finalizeGenerationRunFailure as finalizeGenerationRunFailureSupabase,
  finalizeGenerationRunSuccess as finalizeGenerationRunSuccessSupabase,
  getGenerationRunByRunId as getGenerationRunByRunIdSupabase,
  getLatestGenerationRunByBlueprintId as getLatestGenerationRunByBlueprintIdSupabase,
  listGenerationRunEvents,
  startGenerationRun as startGenerationRunSupabase,
  updateGenerationModelInfo as updateGenerationModelInfoSupabase,
} from './services/generationTrace';
import {
  appendOracleGenerationTraceEvent,
  clearOracleGenerationTraceSeqCursor,
  listOracleGenerationRunEvents,
} from './services/oracleGenerationTrace';
import {
  getOracleProviderCircuitRow,
  upsertOracleProviderCircuitRow,
} from './services/oracleProviderCircuitState';
import {
  countUnreadOracleNotificationsForUser,
  getOracleNotificationRowById,
  listOracleNotificationsForUser,
  markAllOracleNotificationsRead,
  markOracleNotificationRead,
  upsertOracleNotificationRow,
} from './services/oracleNotifications';
import {
  compareAndSetOracleCreditWalletRow,
  getOracleCreditWalletRow,
  listOracleCreditWalletRowsByUserIds,
  upsertOracleCreditWalletRow,
} from './services/oracleCreditWallet';
import {
  getOracleCreditLedgerByIdempotencyKey,
  insertOracleCreditLedgerEntry,
} from './services/oracleCreditLedger';
import {
  listOracleBlueprintYoutubeComments,
  replaceOracleBlueprintYoutubeCommentsSnapshot,
} from './services/oracleBlueprintYoutubeCommentsState';
import {
  countOracleBlueprintCommentRows,
  insertOracleBlueprintCommentRow,
  listOracleBlueprintCommentRows,
  listOracleBlueprintCommentRowsByUser,
  syncOracleBlueprintCommentRowsFromSupabase,
} from './services/oracleBlueprintCommentState';
import {
  countOracleBlueprintLikeRows,
  deleteOracleBlueprintLikeRow,
  getOracleBlueprintLikeRow,
  hasOracleBlueprintLikeBootstrapCompleted,
  listOracleBlueprintLikeRows,
  listOracleLikedBlueprintIdsByUser,
  syncOracleBlueprintLikeRowsFromSupabase,
  upsertOracleBlueprintLikeRow,
} from './services/oracleBlueprintLikeState';
import {
  countOracleBlueprintRows,
  getOracleBlueprintRow,
  listOracleBlueprintRows,
  patchOracleBlueprintRow,
  syncOracleBlueprintRowFromSupabase,
  syncOracleBlueprintRowsFromSupabase,
  upsertOracleBlueprintRow,
} from './services/oracleBlueprintState';
import {
  countOracleBlueprintTagRows,
  listOracleBlueprintTagRows,
  listOracleBlueprintTagRowsByTagIds,
  listOracleBlueprintTagRowsByTagSlugs,
  listOracleBlueprintTagSlugs,
  syncOracleBlueprintTagRowsFromSupabase,
  upsertOracleBlueprintTagRow,
} from './services/oracleBlueprintTagState';
import {
  countOracleTagRows,
  getOracleTagRowById,
  getOracleTagRowBySlug,
  hasOracleTagBootstrapCompleted,
  listOracleTagRows,
  syncOracleTagRowsFromSupabase,
  upsertOracleTagRow,
} from './services/oracleTagState';
import {
  countOracleTagFollowRows,
  deleteOracleTagFollowRow,
  getOracleTagFollowRow,
  hasOracleTagFollowBootstrapCompleted,
  listOracleFollowedTagSlugs,
  listOracleTagFollowRows,
  syncOracleTagFollowRowsFromSupabase,
  upsertOracleTagFollowRow,
} from './services/oracleTagFollowState';
import {
  countOracleChannelCandidateStateRows,
  getOracleChannelCandidateByFeedChannel,
  getOracleChannelCandidateById,
  insertOracleChannelGateDecisionRows,
  listOracleChannelCandidateRows,
  listOracleChannelGateDecisions,
  mapChannelGateDecisionRowsFromEvaluation,
  syncOracleChannelCandidateStateFromSupabase,
  updateOracleChannelCandidateStatus,
  upsertOracleChannelCandidateRow,
} from './services/oracleChannelCandidateState';
import {
  countOracleProfileRows,
  getOracleProfileRow,
  listOracleProfileRows,
  syncOracleProfileRowFromSupabase,
  syncOracleProfileRowsFromSupabase,
  upsertOracleProfileRow,
} from './services/oracleProfileState';
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
  formatSubscriptionSyncErrorMessage,
  summarizeSubscriptionSyncError,
} from './services/sourceSubscriptionSync';
import { createNotificationPushDispatcherController } from './services/notificationPushDispatcherController';
import {
  getSubscriptionShadowChangedFields,
  shouldSkipSupabaseSubscriptionShadowWrite,
} from './services/subscriptionShadowPolicy';
import {
  getSourceItemShadowChangedFields,
  mapSourceItemShadowUpdateValues,
  shouldLookupSupabaseSourceItemCurrent,
  shouldWriteSupabaseSourceItemShadow,
} from './services/sourceItemShadowPolicy';
import { shouldWriteSupabaseFeedItemShadow } from './services/feedShadowPolicy';
import {
  getQueueShadowActionClass,
  getQueueShadowChangedFields,
  mapQueueShadowInsertValues,
} from './services/queueShadowPolicy';
import {
  resolveFeedItemGeneratedAtOnWall,
  resolveFeedItemWallCreatedAt,
  resolveFeedItemWallDisplayAt,
} from './services/feedItemWallPolicy';
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
import { registerProfileReadRoutes } from './routes/profileRead';
import { registerFeedRoutes } from './routes/feed';
import { registerChannelCandidateRoutes } from './routes/channels';
import { registerIngestionUserRoutes } from './routes/ingestion';
import { registerCoreRoutes } from './routes/core';
import { registerOpsRoutes } from './routes/ops';
import { registerYouTubeRoutes } from './routes/youtube';
import { registerSourceSubscriptionsRoutes } from './routes/sourceSubscriptions';
import { registerSourcePagesRoutes } from './routes/sourcePages';
import { registerWallRoutes } from './routes/wall';
import { registerBlueprintCommentRoutes } from './routes/blueprintComments';
import { registerBlueprintLikeRoutes } from './routes/blueprintLikes';
import { registerBlueprintReadRoutes } from './routes/blueprintRead';
import { registerBlueprintTagReadRoutes } from './routes/blueprintTags';
import { registerTagRoutes } from './routes/tags';

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
const refreshScanCooldownMs = clampInt(process.env.REFRESH_SCAN_COOLDOWN_MS, 60_000, 5_000, 600_000);
const refreshGenerateCooldownMs = clampInt(process.env.REFRESH_GENERATE_COOLDOWN_MS, 300_000, 10_000, 1_800_000);
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
const autoUnlockEligibleUsersCacheMs = clampInt(process.env.AUTO_UNLOCK_ELIGIBLE_USERS_CACHE_MS, 10 * 60_000, 5_000, 60 * 60_000);
const autoUnlockQueueDepthCacheMs = clampInt(process.env.AUTO_UNLOCK_QUEUE_DEPTH_CACHE_MS, 180_000, 5_000, 10 * 60_000);
const queuePriorityEnabled = parseRuntimeFlag(process.env.QUEUE_PRIORITY_ENABLED, true);
const queueSweepHighBatch = clampInt(process.env.QUEUE_SWEEP_HIGH_BATCH, 8, 0, 200);
const queueSweepMediumBatch = clampInt(
  process.env.QUEUE_SWEEP_MEDIUM_BATCH,
  3,
  0,
  200,
);
const queueSweepLowBatch = clampInt(
  process.env.QUEUE_SWEEP_LOW_BATCH,
  1,
  0,
  200,
);
const queueLowPrioritySuppressionDepth = clampInt(
  process.env.QUEUE_LOW_PRIORITY_SUPPRESSION_DEPTH,
  100,
  0,
  200_000,
);
const allActiveSubscriptionsMinTriggerIntervalMs = clampInt(
  process.env.ALL_ACTIVE_SUBSCRIPTIONS_MIN_TRIGGER_INTERVAL_MS,
  60 * 60_000,
  60_000,
  60 * 60_000,
);
const allActiveSubscriptionsMaxPerRun = clampInt(
  process.env.ALL_ACTIVE_SUBSCRIPTIONS_MAX_PER_RUN,
  75,
  1,
  500,
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
const workerIdleBackoffBaseMs = clampInt(process.env.WORKER_IDLE_BACKOFF_BASE_MS, 600_000, 1_000, 15 * 60_000);
const workerIdleBackoffMaxMs = clampInt(process.env.WORKER_IDLE_BACKOFF_MAX_MS, 1_800_000, workerIdleBackoffBaseMs, 45 * 60_000);
const workerMaintenanceMinIntervalMs = clampInt(process.env.WORKER_MAINTENANCE_MIN_INTERVAL_MS, 900_000, 0, 60 * 60_000);
const jobExecutionTimeoutMs = clampInt(process.env.JOB_EXECUTION_TIMEOUT_MS, 180_000, 5_000, 10 * 60_000);
const youtubeRefreshEnabled = parseRuntimeFlag(process.env.YOUTUBE_REFRESH_ENABLED, true);
const youtubeRefreshIntervalMinutes = clampInt(process.env.YOUTUBE_REFRESH_INTERVAL_MINUTES, 120, 1, 240);
const youtubeRefreshQueueDepthGuard = clampInt(process.env.YOUTUBE_REFRESH_QUEUE_DEPTH_GUARD, 100, 1, 50_000);
const youtubeRefreshViewMaxPerCycle = clampInt(process.env.YOUTUBE_REFRESH_VIEW_MAX_PER_CYCLE, 15, 0, 500);
const youtubeRefreshCommentsMaxPerCycle = clampInt(process.env.YOUTUBE_REFRESH_COMMENTS_MAX_PER_CYCLE, 5, 0, 500);
const youtubeRefreshViewIntervalHours = clampInt(process.env.YOUTUBE_REFRESH_VIEW_INTERVAL_HOURS, 12, 1, 24 * 14);
const youtubeCommentsAutoFirstDelayMinutes = clampInt(process.env.YOUTUBE_COMMENTS_AUTO_FIRST_DELAY_MINUTES, 60, 1, 24 * 60);
const youtubeCommentsAutoSecondDelayHours = clampInt(process.env.YOUTUBE_COMMENTS_AUTO_SECOND_DELAY_HOURS, 48, 1, 24 * 30);
const youtubeCommentsManualCooldownMinutes = clampInt(
  process.env.YOUTUBE_COMMENTS_MANUAL_COOLDOWN_MINUTES,
  process.env.YOUTUBE_COMMENTS_MANUAL_COOLDOWN_HOURS
    ? clampInt(process.env.YOUTUBE_COMMENTS_MANUAL_COOLDOWN_HOURS, 24, 1, 24 * 30) * 60
    : 60,
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
const sourceUnlockSweepBatch = clampInt(process.env.SOURCE_UNLOCK_SWEEP_BATCH, 20, 10, 1000);
const sourceUnlockProcessingStaleMs = clampInt(process.env.SOURCE_UNLOCK_PROCESSING_STALE_MS, 40 * 60_000, 60_000, 24 * 60 * 60 * 1000);
const sourceUnlockSweepMinIntervalMs = clampInt(process.env.SOURCE_UNLOCK_SWEEP_MIN_INTERVAL_MS, 1_200_000, 1_000, 30 * 60_000);
const transcriptFeedSuppressionSweepMinIntervalMs = clampInt(
  process.env.TRANSCRIPT_FEED_SUPPRESSION_SWEEP_MIN_INTERVAL_MS,
  60 * 60_000,
  60_000,
  6 * 60 * 60_000,
);
const sourceUnlockSweepDryLogsRaw = String(process.env.SOURCE_UNLOCK_SWEEP_DRY_LOGS || 'true').trim().toLowerCase();
const sourceUnlockSweepDryLogs = !(sourceUnlockSweepDryLogsRaw === 'false' || sourceUnlockSweepDryLogsRaw === '0' || sourceUnlockSweepDryLogsRaw === 'off');
const sourcePageAssetSweepEnabledRaw = String(process.env.SOURCE_PAGE_ASSET_SWEEP_ENABLED || 'true').trim().toLowerCase();
const sourcePageAssetSweepEnabled = !(sourcePageAssetSweepEnabledRaw === 'false' || sourcePageAssetSweepEnabledRaw === '0' || sourcePageAssetSweepEnabledRaw === 'off');
const sourcePageAssetSweepBatch = clampInt(process.env.SOURCE_PAGE_ASSET_SWEEP_BATCH, 100, 10, 1000);
const sourcePageAssetSweepMinIntervalMs = clampInt(process.env.SOURCE_PAGE_ASSET_SWEEP_MIN_INTERVAL_MS, 3_600_000, 5_000, 2 * 60 * 60_000);
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
const notificationPushDispatchIntervalMs = 600_000;
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
const workerRuntimeControls = readWorkerRuntimeControls(process.env, runtimeMode);
const oracleControlPlaneConfig = readOracleControlPlaneConfig(process.env);
function logWorkerMemoryCheckpoint(phase: string, extra?: Record<string, unknown>) {
  if (!runIngestionWorker || !workerRuntimeControls.memoryLoggingEnabled) return;
  const memory = process.memoryUsage();
  console.log('[worker_memory_checkpoint]', JSON.stringify({
    phase,
    runtime_mode: runtimeMode,
    rss_mb: Math.round(memory.rss / 1024 / 1024),
    heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
    external_mb: Math.round(memory.external / 1024 / 1024),
    array_buffers_mb: Math.round(memory.arrayBuffers / 1024 / 1024),
    ...extra,
  }));
}
const oracleControlPlane = (() => {
  if (!oracleControlPlaneConfig.enabled) return null;
  try {
    return openOracleControlPlaneDb({
      sqlitePath: oracleControlPlaneConfig.sqlitePath,
    });
  } catch (error) {
    console.error('[oracle-control-plane] failed to open sqlite store', error);
    process.exit(1);
  }
})();
const runOraclePrimarySubscriptionScheduler = shouldRunOraclePrimarySubscriptionScheduler({
  oracleControlPlaneEnabled: oracleControlPlaneConfig.enabled && Boolean(oracleControlPlane),
  subscriptionSchedulerMode: oracleControlPlaneConfig.subscriptionSchedulerMode,
  runHttpServer,
});
const oracleQueueClaimControlEnabled = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlaneConfig.queueControlEnabled
  && !oracleControlPlaneConfig.queueSweepControlEnabled
  && Boolean(oracleControlPlane)
);
const oracleQueueAdmissionMirrorEnabled = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlaneConfig.queueAdmissionMirrorEnabled
  && Boolean(oracleControlPlane)
);
const oracleJobActivityMirrorEnabled = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlaneConfig.jobActivityMirrorEnabled
  && Boolean(oracleControlPlane)
);
const oracleQueueLedgerMode = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlane
)
  ? oracleControlPlaneConfig.queueLedgerMode
  : 'supabase';
const oracleSubscriptionLedgerMode = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlane
)
  ? oracleControlPlaneConfig.subscriptionLedgerMode
  : 'supabase';
const oracleUnlockLedgerMode = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlane
)
  ? oracleControlPlaneConfig.unlockLedgerMode
  : 'supabase';
const oracleFeedLedgerMode = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlane
)
  ? oracleControlPlaneConfig.feedLedgerMode
  : 'supabase';
const oracleSourceItemLedgerMode = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlane
)
  ? oracleControlPlaneConfig.sourceItemLedgerMode
  : 'supabase';
const oracleGenerationStateMode = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlane
)
  ? oracleControlPlaneConfig.generationStateMode
  : 'supabase';
const oracleQueueLedgerEnabled = (
  oracleQueueLedgerMode === 'dual'
  || oracleQueueLedgerMode === 'primary'
);
const oracleQueueLedgerPrimaryEnabled = oracleQueueLedgerMode === 'primary';
const oracleQueueOracleOnlyEnabled = oracleQueueLedgerPrimaryEnabled;
const oracleSubscriptionLedgerEnabled = (
  oracleSubscriptionLedgerMode === 'dual'
  || oracleSubscriptionLedgerMode === 'primary'
);
const oracleSubscriptionLedgerPrimaryEnabled = oracleSubscriptionLedgerMode === 'primary';
const oracleUnlockLedgerEnabled = (
  oracleUnlockLedgerMode === 'dual'
  || oracleUnlockLedgerMode === 'primary'
);
const oracleUnlockLedgerPrimaryEnabled = oracleUnlockLedgerMode === 'primary';
const oracleFeedLedgerEnabled = (
  oracleFeedLedgerMode === 'dual'
  || oracleFeedLedgerMode === 'primary'
);
const oracleFeedLedgerPrimaryEnabled = oracleFeedLedgerMode === 'primary';
const oracleSourceItemLedgerEnabled = (
  oracleSourceItemLedgerMode === 'dual'
  || oracleSourceItemLedgerMode === 'primary'
);
const oracleSourceItemLedgerPrimaryEnabled = oracleSourceItemLedgerMode === 'primary';
const oracleGenerationStateEnabled = (
  oracleGenerationStateMode === 'dual'
  || oracleGenerationStateMode === 'primary'
);
const oracleGenerationStatePrimaryEnabled = oracleGenerationStateMode === 'primary';

configureGenerationTraceOracleWriteAdapter(
  oracleGenerationStateEnabled && oracleControlPlane && oracleGenerationStatePrimaryEnabled
    ? {
        resetRun(runId: string) {
          clearOracleGenerationTraceSeqCursor(runId);
        },
        async appendEvent(input) {
          await appendOracleGenerationTraceEvent({
            controlDb: oracleControlPlane,
            runId: input.runId,
            event: input.event,
            level: input.level,
            payload: input.payload,
          });
        },
        async listEvents(input) {
          return listOracleGenerationRunEvents({
            controlDb: oracleControlPlane,
            runId: input.runId,
            limit: input.limit,
            cursor: input.cursor,
          });
        },
      }
    : null,
);

configureProviderCircuitOracleWriteAdapter(
  oracleControlPlaneConfig.enabled && oracleControlPlane
    ? {
        async getRow(input) {
          return getOracleProviderCircuitRow({
            controlDb: oracleControlPlane,
            providerKey: input.providerKey,
          });
        },
        async upsertRow(input) {
          return upsertOracleProviderCircuitRow({
            controlDb: oracleControlPlane,
            providerKey: input.providerKey,
            patch: input.patch,
            nowIso: input.nowIso,
          });
        },
      }
    : null,
);

configureCreditWalletOracleAdapter(
  oracleControlPlaneConfig.enabled && oracleControlPlane
    ? {
        async getWalletRow(userId) {
          return getOracleCreditWalletRow({
            controlDb: oracleControlPlane,
            userId,
          });
        },
        async listWalletRowsByUserIds(userIds) {
          return listOracleCreditWalletRowsByUserIds({
            controlDb: oracleControlPlane,
            userIds,
          });
        },
        async upsertWalletRow(row) {
          return upsertOracleCreditWalletRow({
            controlDb: oracleControlPlane,
            row: {
              user_id: row.user_id,
              balance: Number(row.balance || 0),
              capacity: Number(row.capacity || 0),
              refill_rate_per_sec: Number(row.refill_rate_per_sec || 0),
              last_refill_at: row.last_refill_at,
              created_at: row.created_at || row.last_refill_at,
              updated_at: row.updated_at || row.last_refill_at,
            },
          });
        },
        async compareAndSetWalletRow(input) {
          return compareAndSetOracleCreditWalletRow({
            controlDb: oracleControlPlane,
            userId: input.userId,
            expectedBalance: Number(input.expectedBalance || 0),
            expectedLastRefillAt: input.expectedLastRefillAt,
            nextRow: {
              user_id: input.nextRow.user_id,
              balance: Number(input.nextRow.balance || 0),
              capacity: Number(input.nextRow.capacity || 0),
              refill_rate_per_sec: Number(input.nextRow.refill_rate_per_sec || 0),
              last_refill_at: input.nextRow.last_refill_at,
              created_at: input.nextRow.created_at || input.nextRow.last_refill_at,
              updated_at: input.nextRow.updated_at || input.nextRow.last_refill_at,
            },
          });
        },
        async getLedgerByIdempotencyKey(idempotencyKey) {
          return getOracleCreditLedgerByIdempotencyKey({
            controlDb: oracleControlPlane,
            idempotencyKey,
          });
        },
        async insertLedgerEntry(input) {
          return insertOracleCreditLedgerEntry({
            controlDb: oracleControlPlane,
            row: {
              user_id: input.userId,
              delta: Number(input.delta || 0),
              entry_type: input.entryType,
              reason_code: input.reasonCode,
              source_item_id: input.context?.source_item_id || null,
              source_page_id: input.context?.source_page_id || null,
              unlock_id: input.context?.unlock_id || null,
              idempotency_key: input.idempotencyKey,
              metadata: input.context?.metadata || {},
            },
          });
        },
      }
    : null,
);

configureNotificationOracleWriteAdapter(
  oracleControlPlaneConfig.enabled && oracleControlPlane
    ? {
        async listNotificationsForUser(input) {
          return listOracleNotificationsForUser({
            controlDb: oracleControlPlane,
            userId: input.userId,
            limit: input.limit,
            cursor: input.cursor,
          });
        },
        async upsertNotification(input) {
          return upsertOracleNotificationRow({
            controlDb: oracleControlPlane,
            row: input.row,
            nowIso: input.nowIso,
          });
        },
        async markNotificationRead(input) {
          return markOracleNotificationRead({
            controlDb: oracleControlPlane,
            userId: input.userId,
            notificationId: input.notificationId,
            readAt: input.readAt,
          });
        },
        async markAllNotificationsRead(input) {
          return markAllOracleNotificationsRead({
            controlDb: oracleControlPlane,
            userId: input.userId,
            readAt: input.readAt,
          });
        },
      }
    : null,
);

configureNotificationPushOracleReadAdapter(
  oracleControlPlaneConfig.enabled && oracleControlPlane
    ? {
        async countUnreadNotificationsForUser(input) {
          return countUnreadOracleNotificationsForUser({
            controlDb: oracleControlPlane,
            userId: input.userId,
          });
        },
        async getNotificationById(input) {
          const row = await getOracleNotificationRowById({
            controlDb: oracleControlPlane,
            notificationId: input.notificationId,
          });
          if (!row) return null;
          return {
            id: row.id,
            user_id: row.user_id,
            type: row.type,
            title: row.title,
            body: row.body,
            link_path: row.link_path,
            created_at: row.created_at,
          };
        },
      }
    : null,
);
const oracleQueueSweepControlEnabled = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlaneConfig.queueSweepControlEnabled
  && Boolean(oracleControlPlane)
);
const oracleProductMirrorEnabled = (
  oracleControlPlaneConfig.enabled
  && oracleControlPlaneConfig.productMirrorEnabled
  && Boolean(oracleControlPlane)
);
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
const pipelineProviderRetryDefaults = {
  ...providerRetryDefaults,
  transcriptTimeoutMs: resolveTranscriptOperationTimeoutMs(providerRetryDefaults.transcriptTimeoutMs),
};
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
const transcriptThrottleMaxConcurrency = clampInt(process.env.TRANSCRIPT_THROTTLE_MAX_CONCURRENCY, 4, 1, 32);
const effectiveTranscriptThrottleConcurrency = Math.max(
  1,
  Math.min(workerConcurrency, transcriptThrottleMaxConcurrency),
);
const effectiveQueuedTranscriptBoundSlotCapacity = effectiveTranscriptThrottleConcurrency;
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
const INTERACTIVE_QUEUE_REFILL_SCOPES = new Set<QueuedIngestionScope>([
  'source_item_unlock_generation',
  'search_video_generate',
  'manual_refresh_selection',
]);

function getQueueSweepConfigByTier(tier: QueuePriorityTier) {
  if (oracleQueueSweepControlEnabled) {
    if (tier === 'high') return oracleControlPlaneConfig.queueSweepHighBatch;
    if (tier === 'medium') return oracleControlPlaneConfig.queueSweepMediumBatch;
    return oracleControlPlaneConfig.queueSweepLowBatch;
  }

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

function resolveQueueSweepPlanEntriesForScopes(scopes: readonly string[]) {
  const requestedScopes = new Set(
    scopes
      .map((scope) => String(scope || '').trim())
      .filter(Boolean),
  );
  if (requestedScopes.size === 0) return [];

  return getQueueSweepPlan().filter((entry) => (
    entry.scopes.some((scope) => requestedScopes.has(scope))
  ));
}

async function countQueueDepthForAdmission(
  db: ReturnType<typeof createClient>,
  input?: {
    scope?: string;
    scopes?: string[];
    userId?: string;
    includeRunning?: boolean;
    statuses?: string[];
  },
) {
  const queueLedgerCount = await countOracleQueueLedgerJobsSafe({
    action: 'count_queue_depth_queue_ledger',
    scope: input?.scope,
    scopes: input?.scopes,
    userId: input?.userId,
    statuses: Array.isArray(input?.statuses) && input?.statuses.length > 0
      ? input?.statuses
      : input?.includeRunning
        ? ['queued', 'running']
        : ['queued'],
  });
  if (queueLedgerCount != null) {
    return queueLedgerCount;
  }

  if (!oracleQueueAdmissionMirrorEnabled || !oracleControlPlane || !supportsOracleQueueAdmissionMirror(input)) {
    if (oracleQueueOracleOnlyEnabled) {
      logQueueOracleOnlyBypass({
        action: 'count_queue_depth',
        scope: input?.scope,
        scopes: input?.scopes,
        userId: input?.userId,
        reason: 'oracle_only_no_supabase_fallback',
      });
      return 0;
    }
    return countQueueDepth(db, input);
  }

  try {
    const counts = await readOracleQueueAdmissionCounts({
      controlDb: oracleControlPlane,
      db,
      refreshStaleMs: oracleControlPlaneConfig.queueAdmissionRefreshStaleMs,
      userId: String(input?.userId || '').trim(),
      scope: input?.scope,
      scopes: input?.scopes,
    });
    return input?.userId ? counts.user_queue_depth : counts.queue_depth;
  } catch (error) {
    console.warn('[oracle-control-plane] queue_admission_mirror_failed', JSON.stringify({
      action: 'count_queue_depth',
      error: error instanceof Error ? error.message : String(error),
    }));
    if (oracleQueueOracleOnlyEnabled) {
      logQueueOracleOnlyBypass({
        action: 'count_queue_depth',
        scope: input?.scope,
        scopes: input?.scopes,
        userId: input?.userId,
        reason: 'oracle_only_admission_mirror_failed',
      });
      return 0;
    }
    return countQueueDepth(db, input);
  }
}

async function countQueueWorkItemsForAdmission(
  db: ReturnType<typeof createClient>,
  input?: {
    scope?: string;
    scopes?: string[];
    userId?: string;
    includeRunning?: boolean;
    statuses?: string[];
  },
) {
  const queueLedgerRows = await listOracleQueueLedgerJobsSafe({
    action: 'count_queue_work_items_queue_ledger',
    scope: input?.scope,
    scopes: input?.scopes,
    userId: input?.userId,
    statuses: Array.isArray(input?.statuses) && input?.statuses.length > 0
      ? input?.statuses
      : input?.includeRunning
        ? ['queued', 'running']
        : ['queued'],
    limit: 5000,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows) {
    return queueLedgerRows.reduce((total, row) => (
      total + getQueuedJobWorkItemCount({
        scope: row.scope,
        payload: normalizeOracleJobPayload(row.payload),
      })
    ), 0);
  }

  if (!oracleQueueAdmissionMirrorEnabled || !oracleControlPlane || !supportsOracleQueueAdmissionMirror(input)) {
    if (oracleQueueOracleOnlyEnabled) {
      logQueueOracleOnlyBypass({
        action: 'count_queue_work_items',
        scope: input?.scope,
        scopes: input?.scopes,
        userId: input?.userId,
        reason: 'oracle_only_no_supabase_fallback',
      });
      return 0;
    }
    return countQueueWorkItems(db, input);
  }

  try {
    const counts = await readOracleQueueAdmissionCounts({
      controlDb: oracleControlPlane,
      db,
      refreshStaleMs: oracleControlPlaneConfig.queueAdmissionRefreshStaleMs,
      userId: String(input?.userId || '').trim(),
      scope: input?.scope,
      scopes: input?.scopes,
    });
    return input?.userId ? counts.user_queue_work_items : counts.queue_work_items;
  } catch (error) {
    console.warn('[oracle-control-plane] queue_admission_mirror_failed', JSON.stringify({
      action: 'count_queue_work_items',
      error: error instanceof Error ? error.message : String(error),
    }));
    if (oracleQueueOracleOnlyEnabled) {
      logQueueOracleOnlyBypass({
        action: 'count_queue_work_items',
        scope: input?.scope,
        scopes: input?.scopes,
        userId: input?.userId,
        reason: 'oracle_only_admission_mirror_failed',
      });
      return 0;
    }
    return countQueueWorkItems(db, input);
  }
}

async function syncOracleJobActivityById(
  db: ReturnType<typeof createClient>,
  jobId: string,
) {
  const normalizedJobId = String(jobId || '').trim();
  if (!oracleJobActivityMirrorEnabled || !oracleControlPlane || !normalizedJobId || oracleQueueLedgerPrimaryEnabled) {
    return;
  }

  try {
    await syncOracleJobActivityRowFromSupabaseById({
      controlDb: oracleControlPlane,
      db,
      jobId: normalizedJobId,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
      action: 'sync_by_id',
      job_id: normalizedJobId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function syncOracleJobActivityByIds(
  db: ReturnType<typeof createClient>,
  jobIds: string[],
) {
  const normalizedJobIds = [...new Set(
    (Array.isArray(jobIds) ? jobIds : [])
      .map((jobId) => String(jobId || '').trim())
      .filter(Boolean),
  )];
  if (!oracleJobActivityMirrorEnabled || !oracleControlPlane || normalizedJobIds.length === 0 || oracleQueueLedgerPrimaryEnabled) {
    return;
  }

  try {
    await syncOracleJobActivityRowsFromSupabaseByIds({
      controlDb: oracleControlPlane,
      db,
      jobIds: normalizedJobIds,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
      action: 'sync_by_ids',
      job_ids: normalizedJobIds.slice(0, 10),
      count: normalizedJobIds.length,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function upsertOracleJobActivityFromKnownRow(
  job: OracleMirroredIngestionJob | IngestionJobRow | null | undefined,
  action: string,
) {
  if (!oracleJobActivityMirrorEnabled || !oracleControlPlane || !job?.id || oracleQueueLedgerPrimaryEnabled) {
    return;
  }

  try {
    await upsertOracleJobActivityRow({
      controlDb: oracleControlPlane,
      job,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
      action,
      job_id: String(job.id || '').trim(),
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function upsertOracleJobActivityFromKnownRows(
  jobs: Array<OracleMirroredIngestionJob | IngestionJobRow | null | undefined>,
  action: string,
) {
  const normalizedJobs = jobs
    .filter((job): job is OracleMirroredIngestionJob | IngestionJobRow => Boolean(job?.id))
    .map((job) => ({ ...job }));
  if (!oracleJobActivityMirrorEnabled || !oracleControlPlane || normalizedJobs.length === 0 || oracleQueueLedgerPrimaryEnabled) {
    return;
  }

  try {
    await upsertOracleJobActivityRows({
      controlDb: oracleControlPlane,
      jobs: normalizedJobs,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
      action,
      count: normalizedJobs.length,
      job_ids: normalizedJobs.slice(0, 10).map((job) => String(job.id || '').trim()),
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function upsertOracleQueueLedgerFromKnownRow(
  job: IngestionJobRow | null | undefined,
  action: string,
) {
  if (!oracleQueueLedgerEnabled || !oracleControlPlane || !job?.id) {
    return;
  }

  try {
    await upsertOracleQueueLedgerRow({
      controlDb: oracleControlPlane,
      job,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] queue_ledger_mirror_failed', JSON.stringify({
      action,
      job_id: String(job.id || '').trim(),
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function upsertOracleQueueLedgerFromKnownRows(
  jobs: Array<IngestionJobRow | null | undefined>,
  action: string,
) {
  const normalizedJobs = jobs
    .filter((job): job is IngestionJobRow => Boolean(job?.id))
    .map((job) => ({ ...job }));
  if (!oracleQueueLedgerEnabled || !oracleControlPlane || normalizedJobs.length === 0) {
    return;
  }

  try {
    await upsertOracleQueueLedgerRows({
      controlDb: oracleControlPlane,
      jobs: normalizedJobs,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] queue_ledger_mirror_failed', JSON.stringify({
      action,
      count: normalizedJobs.length,
      job_ids: normalizedJobs.slice(0, 10).map((job) => String(job.id || '').trim()),
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

function logQueueOracleOnlyBypass(input: {
  action: string;
  scope?: string | null;
  scopes?: string[] | null;
  userId?: string | null;
  jobId?: string | null;
  reason: string;
}) {
  console.warn('[oracle-control-plane] queue_oracle_only_bypass', JSON.stringify({
    action: input.action,
    scope: input.scope || null,
    scopes: input.scopes || null,
    user_id: input.userId || null,
    job_id: input.jobId || null,
    reason: input.reason,
  }));
}

function logQueueShadowWriteSkipped(input: {
  action: string;
  actionClass?: string | null;
  jobId?: string | null;
  scope?: string | null;
  reason: string;
  changedFields?: string[] | null;
}) {
  console.log('[oracle-control-plane] queue_shadow_write_skipped', JSON.stringify({
    action: input.action,
    action_class: input.actionClass || null,
    job_id: input.jobId || null,
    scope: input.scope || null,
    reason: input.reason,
    changed_fields: Array.isArray(input.changedFields) ? input.changedFields : null,
  }));
}

function logSubscriptionSupabaseFallbackRead(input: {
  action: string;
  userId?: string | null;
  subscriptionId?: string | null;
  sourceType?: string | null;
  sourceChannelId?: string | null;
  sourcePageId?: string | null;
}) {
  console.warn('[oracle-control-plane] subscription_fallback_read', JSON.stringify({
    action: input.action,
    user_id: input.userId || null,
    subscription_id: input.subscriptionId || null,
    source_type: input.sourceType || null,
    source_channel_id: input.sourceChannelId || null,
    source_page_id: input.sourcePageId || null,
  }));
}

function logSubscriptionShadowWriteSkipped(input: {
  action: string;
  subscriptionId?: string | null;
  userId?: string | null;
  reason: string;
  changedFields?: string[] | null;
}) {
  console.log('[oracle-control-plane] subscription_shadow_write_skipped', JSON.stringify({
    action: input.action,
    subscription_id: input.subscriptionId || null,
    user_id: input.userId || null,
    reason: input.reason,
    changed_fields: Array.isArray(input.changedFields) ? input.changedFields : null,
  }));
}

function sourceSubscriptionRowsEquivalent(
  left: Pick<
    SourceSubscriptionRow,
    | 'source_channel_url'
    | 'source_channel_title'
    | 'source_page_id'
    | 'mode'
    | 'auto_unlock_enabled'
    | 'is_active'
    | 'last_polled_at'
    | 'last_seen_published_at'
    | 'last_seen_video_id'
    | 'last_sync_error'
  > | null | undefined,
  right: Pick<
    SourceSubscriptionRow,
    | 'source_channel_url'
    | 'source_channel_title'
    | 'source_page_id'
    | 'mode'
    | 'auto_unlock_enabled'
    | 'is_active'
    | 'last_polled_at'
    | 'last_seen_published_at'
    | 'last_seen_video_id'
    | 'last_sync_error'
  > | null | undefined,
) {
  if (!left || !right) return false;
  return (
    left.source_channel_url === right.source_channel_url
    && left.source_channel_title === right.source_channel_title
    && left.source_page_id === right.source_page_id
    && left.mode === right.mode
    && left.auto_unlock_enabled === right.auto_unlock_enabled
    && left.is_active === right.is_active
    && left.last_polled_at === right.last_polled_at
    && left.last_seen_published_at === right.last_seen_published_at
    && left.last_seen_video_id === right.last_seen_video_id
    && left.last_sync_error === right.last_sync_error
  );
}

async function finalizeIngestionJobWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    jobId: string;
    status: 'succeeded' | 'failed';
    processedCount: number;
    insertedCount: number;
    skippedCount: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    action: string;
    finishedAt?: string;
    heartbeatAt?: string;
  },
) {
  const finishedAt = input.finishedAt || new Date().toISOString();
  const heartbeatAt = input.heartbeatAt || finishedAt;
  if (oracleQueueLedgerPrimaryEnabled && oracleControlPlane) {
    const finalizedJob = await finalizeOracleQueueJob({
      controlDb: oracleControlPlane,
      jobId: input.jobId,
      status: input.status,
      processedCount: input.processedCount,
      insertedCount: input.insertedCount,
      skippedCount: input.skippedCount,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      finishedAt,
      heartbeatAt,
    });
    if (!finalizedJob) return null;
    logQueueShadowWriteSkipped({
      action: `${input.action}_finalize_shadow`,
      actionClass: 'terminal',
      jobId: finalizedJob.id,
      scope: finalizedJob.scope,
      reason: 'oracle_primary_oracle_only',
    });
    await upsertOracleJobActivityFromKnownRow(finalizedJob, input.action);
    return finalizedJob;
  }

  const { data, error } = await db
    .from('ingestion_jobs')
    .update({
      status: input.status,
      finished_at: finishedAt,
      processed_count: input.processedCount,
      inserted_count: input.insertedCount,
      skipped_count: input.skippedCount,
      lease_expires_at: null,
      worker_id: null,
      last_heartbeat_at: heartbeatAt,
      error_code: input.errorCode || null,
      error_message: input.errorMessage || null,
    })
    .eq('id', input.jobId)
    .select('*')
    .single();
  if (error) throw error;

  const finalizedJob = data as IngestionJobRow;
  if (oracleQueueLedgerEnabled && oracleControlPlane) {
    try {
      await upsertOracleQueueLedgerRow({
        controlDb: oracleControlPlane,
        job: finalizedJob,
      });
    } catch (error) {
      console.warn('[oracle-control-plane] queue_ledger_mirror_failed', JSON.stringify({
        action: input.action,
        job_id: finalizedJob.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  await upsertOracleJobActivityFromKnownRow(finalizedJob, input.action);
  return finalizedJob;
}

async function enqueueIngestionJobWithMirror(
  db: ReturnType<typeof createClient>,
  values: Record<string, unknown>,
) {
  const normalizedJob = buildOracleQueueLedgerJobFromInsertValues({ values });
  if (oracleQueueLedgerPrimaryEnabled && oracleControlPlane) {
    await upsertOracleQueueLedgerRow({
      controlDb: oracleControlPlane,
      job: normalizedJob,
    });
    logQueueShadowWriteSkipped({
      action: 'enqueue_insert_shadow',
      actionClass: 'generic',
      jobId: normalizedJob.id,
      scope: normalizedJob.scope,
      reason: 'oracle_primary_oracle_only',
    });
    await upsertOracleJobActivityFromKnownRow(normalizedJob, 'enqueue_insert');
    return {
      data: normalizedJob,
      error: null,
    };
  }
  const result = await db
    .from('ingestion_jobs')
    .insert(mapQueueShadowInsertValues(normalizedJob))
    .select('*')
    .single();

  if (!result.error && result.data?.id) {
    if (oracleQueueLedgerEnabled && oracleControlPlane) {
      try {
        await upsertOracleQueueLedgerRow({
          controlDb: oracleControlPlane,
          job: result.data as IngestionJobRow,
        });
      } catch (error) {
        console.warn('[oracle-control-plane] queue_ledger_mirror_failed', JSON.stringify({
          action: 'enqueue_insert',
          job_id: String(result.data.id || '').trim(),
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
    await upsertOracleJobActivityFromKnownRow(result.data as IngestionJobRow, 'enqueue_insert');
  }

  return result;
}

async function markRunningIngestionJobsFailedWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    jobIds: string[];
    errorCode: string;
    errorMessage: string;
    action: string;
  },
) {
  const uniqueJobIds = [...new Set(
    (Array.isArray(input.jobIds) ? input.jobIds : [])
      .map((jobId) => String(jobId || '').trim())
      .filter(Boolean),
  )];
  if (uniqueJobIds.length === 0) {
    return 0;
  }

  const finishedAt = new Date().toISOString();
  if (oracleQueueLedgerPrimaryEnabled && oracleControlPlane) {
    const updatedRows = await markOracleRunningJobsFailed({
      controlDb: oracleControlPlane,
      jobIds: uniqueJobIds,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      finishedAt,
    });
    for (const job of updatedRows) {
      logQueueShadowWriteSkipped({
        action: `${input.action}_mark_failed_shadow`,
        actionClass: 'terminal',
        jobId: job.id,
        scope: job.scope,
        reason: 'oracle_primary_oracle_only',
      });
      await upsertOracleJobActivityFromKnownRow(job, input.action);
    }
    return updatedRows.length;
  }

  let updated = 0;
  for (const jobId of uniqueJobIds) {
    const { data, error } = await db
      .from('ingestion_jobs')
      .update({
        status: 'failed',
        finished_at: finishedAt,
        lease_expires_at: null,
        worker_id: null,
        last_heartbeat_at: finishedAt,
        error_code: input.errorCode,
        error_message: input.errorMessage.slice(0, 500),
      })
      .eq('id', jobId)
      .eq('status', 'running')
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) continue;
    updated += 1;
    if (oracleQueueLedgerEnabled && oracleControlPlane) {
      try {
        await upsertOracleQueueLedgerRow({
          controlDb: oracleControlPlane,
          job: data as IngestionJobRow,
        });
      } catch (error) {
        console.warn('[oracle-control-plane] queue_ledger_mirror_failed', JSON.stringify({
          action: input.action,
          job_id: String(data.id || '').trim(),
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
    await upsertOracleJobActivityFromKnownRow(data as IngestionJobRow, input.action);
  }
  return updated;
}

async function claimQueuedIngestionJobsWithLedger(
  db: ReturnType<typeof createClient>,
  input: {
    scopes?: string[];
    maxJobs?: number;
    workerId: string;
    leaseSeconds: number;
  },
  hooks?: {
    afterClaimedJobs?: (jobs: IngestionJobRow[]) => Promise<void> | void;
  },
) {
  if (oracleQueueLedgerPrimaryEnabled && oracleControlPlane) {
    const claimed = await claimOracleQueuedIngestionJobs({
      controlDb: oracleControlPlane,
      scopes: input.scopes,
      maxJobs: input.maxJobs,
      workerId: input.workerId,
      leaseSeconds: input.leaseSeconds,
    });
    for (const job of claimed) {
      logQueueShadowWriteSkipped({
        action: 'queued_job_claim_shadow',
        jobId: job.id,
        scope: job.scope,
        reason: 'oracle_primary_claim_state',
      });
    }
    await hooks?.afterClaimedJobs?.(claimed);
    return claimed;
  }

  return claimQueuedIngestionJobsWithHooks(db, input, {
    afterClaimedJobs: async (claimed) => {
      await upsertOracleQueueLedgerFromKnownRows(claimed, 'queued_job_claim_batch');
      await hooks?.afterClaimedJobs?.(claimed);
    },
  });
}

async function touchClaimedIngestionJobLeaseWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    job: IngestionJobRow;
    workerId: string;
    leaseSeconds: number;
    heartbeatAtIso: string;
  },
) {
  if (oracleQueueLedgerPrimaryEnabled && oracleControlPlane) {
    const touchedJob = await touchOracleQueueJobLease({
      controlDb: oracleControlPlane,
      jobId: input.job.id,
      workerId: input.workerId,
      leaseSeconds: input.leaseSeconds,
      nowIso: input.heartbeatAtIso,
    });
    if (!touchedJob) {
      return false;
    }

    if (oracleJobActivityMirrorEnabled && oracleControlPlane && !oracleQueueLedgerPrimaryEnabled) {
      await recordOracleJobLeaseHeartbeat({
        controlDb: oracleControlPlane,
        job: touchedJob,
        leaseSeconds: input.leaseSeconds,
        heartbeatAtIso: input.heartbeatAtIso,
      });
    }
    return true;
  }

  return touchIngestionJobLeaseWithHooks(db, {
    jobId: input.job.id,
    workerId: input.workerId,
    leaseSeconds: input.leaseSeconds,
  }, {
    afterLeaseTouched: async ({ leaseSeconds: normalizedLeaseSeconds }) => {
      const leaseExpiresAtIso = new Date(Date.parse(input.heartbeatAtIso) + (normalizedLeaseSeconds * 1000)).toISOString();
      await upsertOracleQueueLedgerFromKnownRow({
        ...input.job,
        status: 'running',
        worker_id: input.workerId,
        lease_expires_at: leaseExpiresAtIso,
        last_heartbeat_at: input.heartbeatAtIso,
        updated_at: input.heartbeatAtIso,
      }, 'queued_job_lease_touch');
      if (!oracleJobActivityMirrorEnabled || !oracleControlPlane || oracleQueueLedgerPrimaryEnabled) {
        return;
      }
      await recordOracleJobLeaseHeartbeat({
        controlDb: oracleControlPlane,
        job: input.job,
        leaseSeconds: normalizedLeaseSeconds,
        heartbeatAtIso: input.heartbeatAtIso,
      });
    },
  });
}

async function failClaimedIngestionJobWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    job: IngestionJobRow;
    errorCode: string;
    errorMessage: string;
    scheduleRetryInSeconds?: number;
    maxAttempts?: number;
    action: string;
  },
) {
  if (oracleQueueLedgerPrimaryEnabled && oracleControlPlane) {
    const failedJob = await failOracleQueueJob({
      controlDb: oracleControlPlane,
      jobId: input.job.id,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      scheduleRetryInSeconds: input.scheduleRetryInSeconds,
      maxAttempts: input.maxAttempts,
      currentAttempts: Number(input.job.attempts || 0),
    });
    if (!failedJob) return null;
    await upsertOracleJobActivityFromKnownRow(failedJob, input.action);
    logQueueShadowWriteSkipped({
      action: `${input.action}_shadow`,
      actionClass: getQueueShadowActionClass({
        action: `${input.action}_shadow`,
        current: input.job,
        next: failedJob,
        changedFields: input.job.id === failedJob.id
          ? getQueueShadowChangedFields(input.job, failedJob)
          : null,
      }),
      jobId: failedJob.id,
      scope: failedJob.scope,
      reason: 'oracle_primary_oracle_only',
    });
    return failedJob;
  }

  return failIngestionJobWithHooks(db, {
    jobId: input.job.id,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    scheduleRetryInSeconds: input.scheduleRetryInSeconds,
    maxAttempts: input.maxAttempts,
    currentAttempts: Number(input.job.attempts || 0),
  }, {
    afterFailedJob: async (failedJob) => {
      await upsertOracleQueueLedgerFromKnownRow(failedJob, input.action);
      await upsertOracleJobActivityFromKnownRow(failedJob, input.action);
    },
  });
}

async function listLatestUserIngestionJobsOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    userId: string;
    scope: string;
    limit: number;
  },
) {
  const queueLedgerRows = await listOracleQueueLedgerJobsSafe({
    action: 'list_latest_for_user_scope_queue_ledger',
    scope: input.scope,
    userId: input.userId,
    limit: input.limit,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows) {
    return queueLedgerRows;
  }

  if (oracleJobActivityMirrorEnabled && oracleControlPlane) {
    try {
      const rows = await listOracleLatestJobsForUserScope({
        controlDb: oracleControlPlane,
        userId: input.userId,
        scope: input.scope,
        limit: input.limit,
      });
      if (rows.length > 0) return rows;
    } catch (error) {
      console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
        action: 'list_latest_for_user_scope',
        scope: input.scope,
        user_id: input.userId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'list_latest_for_user_scope',
      scope: input.scope,
      userId: input.userId,
      reason: 'oracle_only_primary',
    });
    return [];
  }
  const latestResult = await db
    .from('ingestion_jobs')
    .select('id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id, created_at, updated_at')
    .eq('requested_by_user_id', input.userId)
    .eq('scope', input.scope)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(10, input.limit)));
  if (latestResult.error) throw latestResult.error;
  return latestResult.data || [];
}

async function listActiveUserIngestionJobsOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    userId: string;
    scopes: string[];
    limit: number;
  },
) {
  const queueLedgerRows = await listOracleQueueLedgerJobsSafe({
    action: 'list_active_for_user_queue_ledger',
    scopes: input.scopes,
    userId: input.userId,
    statuses: ['queued', 'running'],
    limit: input.limit,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows) {
    return queueLedgerRows;
  }

  if (oracleJobActivityMirrorEnabled && oracleControlPlane) {
    try {
      const rows = await listOracleActiveJobsForUser({
        controlDb: oracleControlPlane,
        userId: input.userId,
        scopes: input.scopes,
        limit: input.limit,
      });
      if (rows.length > 0 || input.scopes.length === 0) return rows;
    } catch (error) {
      console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
        action: 'list_active_for_user',
        scopes: input.scopes,
        user_id: input.userId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'list_active_for_user',
      scopes: input.scopes,
      userId: input.userId,
      reason: 'oracle_only_primary',
    });
    return [];
  }
  let query = db
    .from('ingestion_jobs')
    .select('id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id, payload, created_at, updated_at')
    .eq('requested_by_user_id', input.userId)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(50, input.limit)));

  if (input.scopes.length > 0) {
    query = query.in('scope', input.scopes);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getUserIngestionJobByIdOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    userId: string;
    jobId: string;
  },
) {
  const normalizedJobId = String(input.jobId || '').trim();
  if (!normalizedJobId) {
    return null;
  }

  const queueLedgerRows = await listOracleQueueLedgerJobsSafe({
    action: 'get_user_job_by_id_queue_ledger',
    userId: input.userId,
    jobIds: [normalizedJobId],
    limit: 1,
  });
  if (queueLedgerRows) {
    return queueLedgerRows[0] || null;
  }

  if (oracleJobActivityMirrorEnabled && oracleControlPlane) {
    try {
      const rows = await listOracleJobsByIds({
        controlDb: oracleControlPlane,
        jobIds: [normalizedJobId],
      });
      const row = rows.find((candidate) => (
        String(candidate.id || '').trim() === normalizedJobId
        && String(candidate.requested_by_user_id || '').trim() === String(input.userId || '').trim()
      ));
      if (row) return row;
    } catch (error) {
      console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
        action: 'get_user_job_by_id',
        job_id: normalizedJobId,
        user_id: input.userId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'get_user_job_by_id',
      userId: input.userId,
      jobId: normalizedJobId,
      reason: 'oracle_only_primary',
    });
    return null;
  }
  const result = await db
    .from('ingestion_jobs')
    .select('id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id, created_at, updated_at')
    .eq('id', normalizedJobId)
    .eq('requested_by_user_id', input.userId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function getActiveIngestionJobForScopeOracleFirst(input: {
  scope: string;
}) {
  const queueLedgerRows = await listOracleQueueLedgerJobsSafe({
    action: 'get_active_for_scope_queue_ledger',
    scope: input.scope,
    statuses: ['queued', 'running'],
    limit: 1,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows) {
    const queueLedgerRow = queueLedgerRows[0];
    if (!queueLedgerRow) {
      return null;
    }
    return {
      id: queueLedgerRow.id,
      status: queueLedgerRow.status,
      started_at: queueLedgerRow.started_at,
    };
  }

  if (oracleJobActivityMirrorEnabled && oracleControlPlane) {
    try {
      const rows = await listOracleActiveJobsForScope({
        controlDb: oracleControlPlane,
        scope: input.scope,
        limit: 10,
      });
      const activeRow = rows[0];
      if (activeRow) {
        return {
          id: activeRow.id,
          status: activeRow.status,
          started_at: activeRow.started_at,
        };
      }
    } catch (error) {
      console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
        action: 'get_active_for_scope',
        scope: input.scope,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const serviceDb = getServiceSupabaseClient();
  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'get_active_for_scope',
      scope: input.scope,
      reason: 'oracle_only_primary',
    });
    return null;
  }
  if (!serviceDb) {
    return null;
  }

  const { data, error } = await serviceDb
    .from('ingestion_jobs')
    .select('id, status, started_at')
    .eq('scope', input.scope)
    .in('status', ['queued', 'running'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function listQueuedJobsForScopesOracleFirst(input: {
  scopes: string[];
}) {
  const queueLedgerRows = await listOracleQueueLedgerJobsSafe({
    action: 'list_queued_jobs_for_scopes_queue_ledger',
    scopes: input.scopes,
    statuses: ['queued'],
    limit: 5000,
    orderBy: 'next_run_asc',
  });
  if (queueLedgerRows) {
    return queueLedgerRows.map((row) => ({
      id: row.id,
      next_run_at: row.next_run_at,
      created_at: row.created_at,
    }));
  }

  if (oracleJobActivityMirrorEnabled && oracleControlPlane) {
    try {
      const rows = await listOracleActiveJobsForScopes({
        controlDb: oracleControlPlane,
        scopes: input.scopes,
        limit: 5000,
      });
      return rows
        .filter((row) => row.status === 'queued')
        .map((row) => ({
          id: row.id,
          next_run_at: row.next_run_at,
          created_at: row.created_at,
        }));
    } catch (error) {
      console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
        action: 'list_queued_jobs_for_scopes',
        scopes: input.scopes,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const serviceDb = getServiceSupabaseClient();
  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'list_queued_jobs_for_scopes',
      scopes: input.scopes,
      reason: 'oracle_only_primary',
    });
    return [];
  }
  if (!serviceDb) {
    return [];
  }

  let queueQuery = serviceDb
    .from('ingestion_jobs')
    .select('id, next_run_at, created_at')
    .eq('status', 'queued')
    .order('next_run_at', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (input.scopes.length > 0) {
    queueQuery = queueQuery.in('scope', input.scopes);
  }

  const { data, error } = await queueQuery;
  if (error) throw error;
  return (data || []) as Array<{
    id: string;
    next_run_at: string | null;
    created_at: string | null;
  }>;
}

function normalizeOracleJobPayload(raw: unknown) {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

async function listOracleQueueLedgerJobsSafe(input: {
  action: string;
  scope?: string;
  scopes?: string[];
  userId?: string;
  jobIds?: string[];
  statuses?: string[];
  startedBeforeIso?: string | null;
  limit?: number;
  orderBy?: 'created_desc' | 'next_run_asc' | 'started_asc';
}) {
  if (!oracleQueueLedgerEnabled || !oracleControlPlane) {
    return null;
  }

  try {
    return await listOracleQueueLedgerJobs({
      controlDb: oracleControlPlane,
      scope: input.scope,
      scopes: input.scopes,
      userId: input.userId,
      jobIds: input.jobIds,
      statuses: input.statuses,
      startedBeforeIso: input.startedBeforeIso,
      limit: input.limit,
      orderBy: input.orderBy,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] queue_ledger_mirror_failed', JSON.stringify({
      action: input.action,
      scope: input.scope || null,
      scopes: input.scopes || null,
      user_id: input.userId || null,
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

async function countOracleQueueLedgerJobsSafe(input: {
  action: string;
  scope?: string;
  scopes?: string[];
  userId?: string;
  statuses?: string[];
}) {
  if (!oracleQueueLedgerEnabled || !oracleControlPlane) {
    return null;
  }

  try {
    return await countOracleQueueLedgerJobs({
      controlDb: oracleControlPlane,
      scope: input.scope,
      scopes: input.scopes,
      userId: input.userId,
      statuses: input.statuses,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] queue_ledger_mirror_failed', JSON.stringify({
      action: input.action,
      scope: input.scope || null,
      scopes: input.scopes || null,
      user_id: input.userId || null,
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

type SourceSubscriptionRow = {
  id: string;
  user_id: string;
  source_type: string;
  source_channel_id: string | null;
  source_channel_url: string | null;
  source_channel_title: string | null;
  source_page_id: string | null;
  mode: string | null;
  auto_unlock_enabled: boolean;
  is_active: boolean;
  last_polled_at: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

const SOURCE_SUBSCRIPTION_SELECT = [
  'id',
  'user_id',
  'source_type',
  'source_channel_id',
  'source_channel_url',
  'source_channel_title',
  'source_page_id',
  'mode',
  'auto_unlock_enabled',
  'is_active',
  'last_polled_at',
  'last_seen_published_at',
  'last_seen_video_id',
  'last_sync_error',
  'created_at',
  'updated_at',
].join(', ');

function normalizeIsoDateOrNull(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeSourceSubscriptionRow(input: Record<string, unknown>, fallbackIso?: string): SourceSubscriptionRow {
  const nowIso = new Date().toISOString();
  const createdAt = normalizeIsoDateOrNull(input.created_at) || fallbackIso || nowIso;
  const updatedAt = normalizeIsoDateOrNull(input.updated_at) || fallbackIso || createdAt;
  const normalizeText = (value: unknown) => {
    const normalized = String(value || '').trim();
    return normalized || null;
  };
  const normalizeBool = (value: unknown) => (
    value === true
    || value === 1
    || String(value || '').trim().toLowerCase() === 'true'
  );
  return {
    id: String(input.id || '').trim(),
    user_id: String(input.user_id || '').trim(),
    source_type: String(input.source_type || '').trim() || 'youtube',
    source_channel_id: normalizeText(input.source_channel_id),
    source_channel_url: normalizeText(input.source_channel_url),
    source_channel_title: normalizeText(input.source_channel_title),
    source_page_id: normalizeText(input.source_page_id),
    mode: normalizeText(input.mode),
    auto_unlock_enabled: normalizeBool(input.auto_unlock_enabled),
    is_active: normalizeBool(input.is_active),
    last_polled_at: normalizeIsoDateOrNull(input.last_polled_at),
    last_seen_published_at: normalizeIsoDateOrNull(input.last_seen_published_at),
    last_seen_video_id: normalizeText(input.last_seen_video_id),
    last_sync_error: normalizeText(input.last_sync_error),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function pickPatchedValue<T>(patch: Record<string, unknown>, key: string, fallback: T): T {
  return Object.prototype.hasOwnProperty.call(patch, key)
    ? patch[key] as T
    : fallback;
}

function buildPatchedSourceSubscriptionRow(input: {
  current?: SourceSubscriptionRow | null;
  patch: Record<string, unknown>;
  nowIso?: string;
}) {
  const nowIso = normalizeIsoDateOrNull(input.nowIso) || new Date().toISOString();
  const current = input.current || null;
  return normalizeSourceSubscriptionRow({
    id: pickPatchedValue(input.patch, 'id', current?.id || randomUUID()),
    user_id: pickPatchedValue(input.patch, 'user_id', current?.user_id || ''),
    source_type: pickPatchedValue(input.patch, 'source_type', current?.source_type || 'youtube'),
    source_channel_id: pickPatchedValue(input.patch, 'source_channel_id', current?.source_channel_id || null),
    source_channel_url: pickPatchedValue(input.patch, 'source_channel_url', current?.source_channel_url || null),
    source_channel_title: pickPatchedValue(input.patch, 'source_channel_title', current?.source_channel_title || null),
    source_page_id: pickPatchedValue(input.patch, 'source_page_id', current?.source_page_id || null),
    mode: pickPatchedValue(input.patch, 'mode', current?.mode || null),
    auto_unlock_enabled: pickPatchedValue(input.patch, 'auto_unlock_enabled', current?.auto_unlock_enabled ?? false),
    is_active: pickPatchedValue(input.patch, 'is_active', current?.is_active ?? false),
    last_polled_at: pickPatchedValue(input.patch, 'last_polled_at', current?.last_polled_at || null),
    last_seen_published_at: pickPatchedValue(input.patch, 'last_seen_published_at', current?.last_seen_published_at || null),
    last_seen_video_id: pickPatchedValue(input.patch, 'last_seen_video_id', current?.last_seen_video_id || null),
    last_sync_error: pickPatchedValue(input.patch, 'last_sync_error', current?.last_sync_error || null),
    created_at: pickPatchedValue(input.patch, 'created_at', current?.created_at || nowIso),
    updated_at: pickPatchedValue(input.patch, 'updated_at', nowIso),
  }, nowIso);
}

async function readSupabaseSourceSubscriptionById(
  db: ReturnType<typeof createClient>,
  input: { subscriptionId: string; userId?: string | null },
) {
  const subscriptionId = String(input.subscriptionId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!subscriptionId) return null;

  let query = db
    .from('user_source_subscriptions')
    .select(SOURCE_SUBSCRIPTION_SELECT)
    .eq('id', subscriptionId);
  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? normalizeSourceSubscriptionRow(data as Record<string, unknown>) : null;
}

async function readSupabaseSourceSubscriptionByUserChannel(
  db: ReturnType<typeof createClient>,
  input: { userId: string; sourceType: string; sourceChannelId: string },
) {
  const userId = String(input.userId || '').trim();
  const sourceType = String(input.sourceType || '').trim();
  const sourceChannelId = String(input.sourceChannelId || '').trim();
  if (!userId || !sourceType || !sourceChannelId) return null;

  const { data, error } = await db
    .from('user_source_subscriptions')
    .select(SOURCE_SUBSCRIPTION_SELECT)
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_channel_id', sourceChannelId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeSourceSubscriptionRow(data as Record<string, unknown>) : null;
}

async function listSupabaseSourceSubscriptionsForUser(
  db: ReturnType<typeof createClient>,
  userId: string,
) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [] as SourceSubscriptionRow[];

  const { data, error } = await db
    .from('user_source_subscriptions')
    .select(SOURCE_SUBSCRIPTION_SELECT)
    .eq('user_id', normalizedUserId)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((row) => normalizeSourceSubscriptionRow(row as Record<string, unknown>));
}

async function listSupabaseSourceSubscriptionsPageForUser(
  db: ReturnType<typeof createClient>,
  input: { userId: string; limit?: number; offset?: number },
) {
  const normalizedUserId = String(input.userId || '').trim();
  const limit = Math.max(1, Math.min(Math.floor(Number(input.limit || 50)), 50));
  const offset = Math.max(0, Math.floor(Number(input.offset || 0)));
  if (!normalizedUserId) {
    return {
      items: [] as SourceSubscriptionRow[],
      next_offset: null as number | null,
    };
  }

  const { data, error } = await db
    .from('user_source_subscriptions')
    .select(SOURCE_SUBSCRIPTION_SELECT)
    .eq('user_id', normalizedUserId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit);
  if (error) throw error;

  const rows = (data || []).map((row) => normalizeSourceSubscriptionRow(row as Record<string, unknown>));
  return {
    items: rows.slice(0, limit),
    next_offset: rows.length > limit ? offset + limit : null,
  };
}

const SOURCE_ITEM_UNLOCK_SELECT = [
  'id',
  'source_item_id',
  'source_page_id',
  'status',
  'estimated_cost',
  'reserved_by_user_id',
  'reservation_expires_at',
  'reserved_ledger_id',
  'auto_unlock_intent_id',
  'blueprint_id',
  'job_id',
  'last_error_code',
  'last_error_message',
  'transcript_status',
  'transcript_attempt_count',
  'transcript_no_caption_hits',
  'transcript_last_probe_at',
  'transcript_retry_after',
  'transcript_probe_meta',
  'created_at',
  'updated_at',
].join(', ');

function normalizeSourceItemUnlockRow(
  input: Record<string, unknown>,
  fallbackIso?: string,
): SourceItemUnlockRow {
  const nowIso = new Date().toISOString();
  const createdAt = normalizeIsoDateOrNull(input.created_at) || fallbackIso || nowIso;
  const updatedAt = normalizeIsoDateOrNull(input.updated_at) || fallbackIso || createdAt;
  const normalizeText = (value: unknown) => {
    const normalized = String(value || '').trim();
    return normalized || null;
  };
  const normalizeNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const normalizeCount = (value: unknown) => Math.max(0, Math.floor(normalizeNumber(value, 0)));
  const normalizeObject = (value: unknown) => (
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  );
  return {
    id: String(input.id || '').trim(),
    source_item_id: String(input.source_item_id || '').trim(),
    source_page_id: normalizeText(input.source_page_id),
    status: String(input.status || '').trim() || 'available',
    estimated_cost: normalizeNumber(input.estimated_cost),
    reserved_by_user_id: normalizeText(input.reserved_by_user_id),
    reservation_expires_at: normalizeIsoDateOrNull(input.reservation_expires_at),
    reserved_ledger_id: normalizeText(input.reserved_ledger_id),
    auto_unlock_intent_id: normalizeText(input.auto_unlock_intent_id),
    blueprint_id: normalizeText(input.blueprint_id),
    job_id: normalizeText(input.job_id),
    last_error_code: normalizeText(input.last_error_code),
    last_error_message: normalizeText(input.last_error_message),
    transcript_status: normalizeText(input.transcript_status) || 'unknown',
    transcript_attempt_count: normalizeCount(input.transcript_attempt_count),
    transcript_no_caption_hits: normalizeCount(input.transcript_no_caption_hits),
    transcript_last_probe_at: normalizeIsoDateOrNull(input.transcript_last_probe_at),
    transcript_retry_after: normalizeIsoDateOrNull(input.transcript_retry_after),
    transcript_probe_meta: normalizeObject(input.transcript_probe_meta) || {},
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function buildPatchedSourceItemUnlockRow(input: {
  current?: SourceItemUnlockRow | null;
  patch: Record<string, unknown>;
  nowIso?: string;
}) {
  const nowIso = normalizeIsoDateOrNull(input.nowIso) || new Date().toISOString();
  const current = input.current || null;
  return normalizeSourceItemUnlockRow({
    id: pickPatchedValue(input.patch, 'id', current?.id || randomUUID()),
    source_item_id: pickPatchedValue(input.patch, 'source_item_id', current?.source_item_id || ''),
    source_page_id: pickPatchedValue(input.patch, 'source_page_id', current?.source_page_id || null),
    status: pickPatchedValue(input.patch, 'status', current?.status || 'available'),
    estimated_cost: pickPatchedValue(input.patch, 'estimated_cost', current?.estimated_cost || 0),
    reserved_by_user_id: pickPatchedValue(input.patch, 'reserved_by_user_id', current?.reserved_by_user_id || null),
    reservation_expires_at: pickPatchedValue(input.patch, 'reservation_expires_at', current?.reservation_expires_at || null),
    reserved_ledger_id: pickPatchedValue(input.patch, 'reserved_ledger_id', current?.reserved_ledger_id || null),
    auto_unlock_intent_id: pickPatchedValue(input.patch, 'auto_unlock_intent_id', current?.auto_unlock_intent_id || null),
    blueprint_id: pickPatchedValue(input.patch, 'blueprint_id', current?.blueprint_id || null),
    job_id: pickPatchedValue(input.patch, 'job_id', current?.job_id || null),
    last_error_code: pickPatchedValue(input.patch, 'last_error_code', current?.last_error_code || null),
    last_error_message: pickPatchedValue(input.patch, 'last_error_message', current?.last_error_message || null),
    transcript_status: pickPatchedValue(input.patch, 'transcript_status', current?.transcript_status || 'unknown'),
    transcript_attempt_count: pickPatchedValue(input.patch, 'transcript_attempt_count', current?.transcript_attempt_count || 0),
    transcript_no_caption_hits: pickPatchedValue(input.patch, 'transcript_no_caption_hits', current?.transcript_no_caption_hits || 0),
    transcript_last_probe_at: pickPatchedValue(input.patch, 'transcript_last_probe_at', current?.transcript_last_probe_at || null),
    transcript_retry_after: pickPatchedValue(input.patch, 'transcript_retry_after', current?.transcript_retry_after || null),
    transcript_probe_meta: pickPatchedValue(input.patch, 'transcript_probe_meta', current?.transcript_probe_meta || {}),
    created_at: pickPatchedValue(input.patch, 'created_at', current?.created_at || nowIso),
    updated_at: pickPatchedValue(input.patch, 'updated_at', nowIso),
  }, nowIso);
}

function describeUnknownOracleControlPlaneError(error: unknown) {
  if (error instanceof Error) {
    const message = String(error.message || '').trim();
    return message || error.name || 'Unknown error';
  }
  if (error && typeof error === 'object') {
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      return '[unserializable_error_object]';
    }
    return '[error_object]';
  }
  return String(error || 'Unknown error');
}

async function readSupabaseSourceItemUnlockById(
  db: ReturnType<typeof createClient>,
  unlockId: string,
) {
  const normalizedUnlockId = String(unlockId || '').trim();
  if (!normalizedUnlockId) return null;

  const { data, error } = await db
    .from('source_item_unlocks')
    .select(SOURCE_ITEM_UNLOCK_SELECT)
    .eq('id', normalizedUnlockId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeSourceItemUnlockRow(data as Record<string, unknown>) : null;
}

async function readSupabaseSourceItemUnlockBySourceItemId(
  db: ReturnType<typeof createClient>,
  sourceItemId: string,
) {
  const normalizedSourceItemId = String(sourceItemId || '').trim();
  if (!normalizedSourceItemId) return null;

  const { data, error } = await db
    .from('source_item_unlocks')
    .select(SOURCE_ITEM_UNLOCK_SELECT)
    .eq('source_item_id', normalizedSourceItemId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeSourceItemUnlockRow(data as Record<string, unknown>) : null;
}

async function listSupabaseSourceItemUnlocksBySourceItemIds(
  db: ReturnType<typeof createClient>,
  sourceItemIds: string[],
) {
  const normalizedSourceItemIds = [...new Set(
    (sourceItemIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  if (normalizedSourceItemIds.length === 0) return [] as SourceItemUnlockRow[];

  const { data, error } = await db
    .from('source_item_unlocks')
    .select(SOURCE_ITEM_UNLOCK_SELECT)
    .in('source_item_id', normalizedSourceItemIds);
  if (error) throw error;
  return (data || []).map((row) => normalizeSourceItemUnlockRow(row as Record<string, unknown>));
}

async function upsertOracleUnlockLedgerFromKnownRow(
  row: Record<string, unknown> | null | undefined,
  action: string,
) {
  if (!oracleUnlockLedgerEnabled || !oracleControlPlane || !row?.id) {
    return;
  }

  try {
    await upsertOracleUnlockLedgerRow({
      controlDb: oracleControlPlane,
      row,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
      action,
      unlock_id: String(row.id || '').trim() || null,
      error: error instanceof Error ? error.message : String(error),
    }));
    throw error;
  }
}

async function getSourceItemUnlockByIdForPrimaryMutation(
  db: ReturnType<typeof createClient>,
  unlockId: string,
  action: string,
) {
  const normalizedUnlockId = String(unlockId || '').trim();
  if (!normalizedUnlockId) return null;

  if (!oracleUnlockLedgerPrimaryEnabled || !oracleControlPlane) {
    return getSourceItemUnlockByIdOracleFirst(db, normalizedUnlockId);
  }

  try {
    const durable = await getOracleUnlockLedgerById({
      controlDb: oracleControlPlane,
      unlockId: normalizedUnlockId,
    });
    if (durable) {
      return normalizeSourceItemUnlockRow(durable as unknown as Record<string, unknown>);
    }
  } catch (error) {
    console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
      action,
      unlock_id: normalizedUnlockId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return oracleUnlockLedgerPrimaryEnabled ? null : readSupabaseSourceItemUnlockById(db, normalizedUnlockId);
}

async function getSourceItemUnlockBySourceItemIdForPrimaryMutation(
  db: ReturnType<typeof createClient>,
  sourceItemId: string,
  action: string,
) {
  const normalizedSourceItemId = String(sourceItemId || '').trim();
  if (!normalizedSourceItemId) return null;

  if (!oracleUnlockLedgerPrimaryEnabled || !oracleControlPlane) {
    return getSourceItemUnlockBySourceItemIdOracleFirst(db, normalizedSourceItemId);
  }

  try {
    const durable = await getOracleUnlockLedgerBySourceItemId({
      controlDb: oracleControlPlane,
      sourceItemId: normalizedSourceItemId,
    });
    if (durable) {
      return normalizeSourceItemUnlockRow(durable as unknown as Record<string, unknown>);
    }
  } catch (error) {
    console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
      action,
      source_item_id: normalizedSourceItemId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return oracleUnlockLedgerPrimaryEnabled ? null : readSupabaseSourceItemUnlockBySourceItemId(db, normalizedSourceItemId);
}

async function writeSupabaseSourceItemUnlockShadow(
  db: ReturnType<typeof createClient>,
  row: SourceItemUnlockRow,
) {
  const existing = await readSupabaseSourceItemUnlockBySourceItemId(db, row.source_item_id);

  if (existing) {
    if (existing.id !== row.id) {
      throw new Error(`UNLOCK_SHADOW_ID_MISMATCH:${existing.id}:${row.id}`);
    }

    const { data, error } = await db
      .from('source_item_unlocks')
      .update({
        source_page_id: row.source_page_id,
        status: row.status,
        estimated_cost: row.estimated_cost,
        reserved_by_user_id: row.reserved_by_user_id,
        reservation_expires_at: row.reservation_expires_at,
        reserved_ledger_id: row.reserved_ledger_id,
        auto_unlock_intent_id: row.auto_unlock_intent_id,
        blueprint_id: row.blueprint_id,
        job_id: row.job_id,
        last_error_code: row.last_error_code,
        last_error_message: row.last_error_message,
        transcript_status: row.transcript_status,
        transcript_attempt_count: row.transcript_attempt_count,
        transcript_no_caption_hits: row.transcript_no_caption_hits,
        transcript_last_probe_at: row.transcript_last_probe_at,
        transcript_retry_after: row.transcript_retry_after,
        transcript_probe_meta: row.transcript_probe_meta,
        updated_at: row.updated_at,
      })
      .eq('id', existing.id)
      .select(SOURCE_ITEM_UNLOCK_SELECT)
      .single();
    if (error) throw error;
    return normalizeSourceItemUnlockRow(data as Record<string, unknown>);
  }

  const { data, error } = await db
    .from('source_item_unlocks')
    .insert({
      ...row,
      transcript_probe_meta: row.transcript_probe_meta,
    })
    .select(SOURCE_ITEM_UNLOCK_SELECT)
    .single();

  if (error) {
    const code = String((error as { code?: string }).code || '').trim();
    if (code === '23505') {
      const reloaded = await readSupabaseSourceItemUnlockBySourceItemId(db, row.source_item_id);
      if (reloaded) return reloaded;
    }
    throw error;
  }

  return normalizeSourceItemUnlockRow(data as Record<string, unknown>);
}

async function persistSourceItemUnlockRowOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    row: SourceItemUnlockRow;
    action: string;
    expectedCurrent?: SourceItemUnlockRow | null;
  },
) {
  const normalizedRow = normalizeSourceItemUnlockRow(input.row as unknown as Record<string, unknown>);
  const previousOracle = (
    oracleUnlockLedgerEnabled && oracleControlPlane
      ? await getOracleUnlockLedgerById({
          controlDb: oracleControlPlane,
          unlockId: normalizedRow.id,
        })
      : null
  );

  if (oracleUnlockLedgerEnabled && oracleControlPlane) {
    const expectedUpdatedAt = oracleUnlockLedgerPrimaryEnabled
      ? String(input.expectedCurrent?.updated_at || '').trim() || undefined
      : undefined;

    const applied = oracleUnlockLedgerPrimaryEnabled
      ? await replaceOracleUnlockLedgerRow({
          controlDb: oracleControlPlane,
          row: normalizedRow,
          expectedUpdatedAt,
        })
      : (await upsertOracleUnlockLedgerFromKnownRow(normalizedRow, input.action), true);

    if (!applied) {
      const latest = await getOracleUnlockLedgerById({
        controlDb: oracleControlPlane,
        unlockId: normalizedRow.id,
      });
      if (latest) {
        return normalizeSourceItemUnlockRow(latest as unknown as Record<string, unknown>);
      }
      throw new Error(`UNLOCK_LEDGER_CONFLICT:${normalizedRow.id}`);
    }
  }

  if (oracleUnlockLedgerPrimaryEnabled) {
    await upsertOracleProductUnlocksFromKnownRows([normalizedRow], input.action);
    return normalizedRow;
  }

  try {
    const shadowInput = normalizeSupabaseUnlockShadowRow({
      row: normalizedRow,
      oracleQueuePrimaryEnabled: oracleQueueLedgerPrimaryEnabled,
    });
    const shadowRow = await writeSupabaseSourceItemUnlockShadow(db, shadowInput);
    await upsertOracleProductUnlocksFromKnownRows([shadowRow], input.action);
    return shadowRow;
  } catch (error) {
    if (oracleUnlockLedgerEnabled && oracleControlPlane) {
      if (previousOracle) {
        await upsertOracleUnlockLedgerFromKnownRow(previousOracle, `${input.action}_rollback`);
      } else {
        await deleteOracleUnlockLedgerRow({
          controlDb: oracleControlPlane,
          unlockId: normalizedRow.id,
        });
      }
    }
    throw error;
  }
}

async function patchSourceItemUnlockOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    unlockId: string;
    patch: Record<string, unknown>;
    action: string;
    current?: SourceItemUnlockRow | null;
  },
) {
  const current = input.current ?? await getSourceItemUnlockByIdForPrimaryMutation(
    db,
    input.unlockId,
    `${input.action}_current`,
  );
  if (!current) return null;

  return persistSourceItemUnlockRowOracleAware(db, {
    row: buildPatchedSourceItemUnlockRow({
      current,
      patch: input.patch,
    }),
    action: input.action,
    expectedCurrent: current,
  });
}

async function upsertOracleSubscriptionLedgerFromKnownRow(
  row: Record<string, unknown> | null | undefined,
  action: string,
) {
  if (!oracleSubscriptionLedgerEnabled || !oracleControlPlane || !row?.id) {
    return;
  }

  try {
    await upsertOracleSubscriptionLedgerRow({
      controlDb: oracleControlPlane,
      row,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
      action,
      subscription_id: String(row.id || '').trim() || null,
      error: error instanceof Error ? error.message : String(error),
    }));
    throw error;
  }
}

async function writeSupabaseSourceSubscriptionShadow(
  db: ReturnType<typeof createClient>,
  row: SourceSubscriptionRow,
  options?: { current?: SourceSubscriptionRow | null; action?: string },
) {
  const current = options?.current || null;
  const action = String(options?.action || 'subscription_shadow_write').trim() || 'subscription_shadow_write';
  const changedFields = getSubscriptionShadowChangedFields(current, row);

  if (current?.id === row.id && sourceSubscriptionRowsEquivalent(current, row)) {
    logSubscriptionShadowWriteSkipped({
      action,
      subscriptionId: row.id,
      userId: row.user_id,
      reason: 'unchanged_oracle_material_fields',
      changedFields,
    });
    return row;
  }

  if (shouldSkipSupabaseSubscriptionShadowWrite({
    action,
    primaryEnabled: oracleSubscriptionLedgerPrimaryEnabled,
    changedFields,
  })) {
    logSubscriptionShadowWriteSkipped({
      action,
      subscriptionId: row.id,
      userId: row.user_id,
      reason: 'oracle_primary_hot_sync_fields_only',
      changedFields,
    });
    return row;
  }

  const { data: updatedById, error: updateByIdError } = await db
    .from('user_source_subscriptions')
    .update({
      source_channel_url: row.source_channel_url,
      source_channel_title: row.source_channel_title,
      source_page_id: row.source_page_id,
      mode: row.mode,
      auto_unlock_enabled: row.auto_unlock_enabled,
      is_active: row.is_active,
      last_polled_at: row.last_polled_at,
      last_seen_published_at: row.last_seen_published_at,
      last_seen_video_id: row.last_seen_video_id,
      last_sync_error: row.last_sync_error,
      updated_at: row.updated_at,
    })
    .eq('id', row.id)
    .eq('user_id', row.user_id)
    .select(SOURCE_SUBSCRIPTION_SELECT)
    .maybeSingle();
  if (updateByIdError) throw updateByIdError;
  if (updatedById) {
    return normalizeSourceSubscriptionRow(updatedById as Record<string, unknown>);
  }

  const existing = String(row.source_channel_id || '').trim()
    ? await readSupabaseSourceSubscriptionByUserChannel(db, {
        userId: row.user_id,
        sourceType: row.source_type,
        sourceChannelId: String(row.source_channel_id || '').trim(),
      })
    : null;

  if (existing) {
    if (existing.id !== row.id) {
      throw new Error(`SUBSCRIPTION_SHADOW_ID_MISMATCH:${existing.id}:${row.id}`);
    }

    const unchanged = sourceSubscriptionRowsEquivalent(existing, row);
    if (unchanged) {
      logSubscriptionShadowWriteSkipped({
        action,
        subscriptionId: existing.id,
        userId: existing.user_id,
        reason: 'unchanged_material_fields',
        changedFields: getSubscriptionShadowChangedFields(existing, row),
      });
      return existing;
    }

    const { data, error } = await db
      .from('user_source_subscriptions')
      .update({
        source_channel_url: row.source_channel_url,
        source_channel_title: row.source_channel_title,
        source_page_id: row.source_page_id,
        mode: row.mode,
        auto_unlock_enabled: row.auto_unlock_enabled,
        is_active: row.is_active,
        last_polled_at: row.last_polled_at,
        last_seen_published_at: row.last_seen_published_at,
        last_seen_video_id: row.last_seen_video_id,
        last_sync_error: row.last_sync_error,
        updated_at: row.updated_at,
      })
      .eq('id', existing.id)
      .select(SOURCE_SUBSCRIPTION_SELECT)
      .single();
    if (error) throw error;
    return normalizeSourceSubscriptionRow(data as Record<string, unknown>);
  }

  const { data, error } = await db
    .from('user_source_subscriptions')
    .insert({
      ...row,
      auto_unlock_enabled: row.auto_unlock_enabled,
      is_active: row.is_active,
    })
    .select(SOURCE_SUBSCRIPTION_SELECT)
    .single();
  if (error) throw error;
  return normalizeSourceSubscriptionRow(data as Record<string, unknown>);
}

async function persistSourceSubscriptionRowOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    row: SourceSubscriptionRow;
    action: string;
    current?: SourceSubscriptionRow | null;
  },
) {
  const normalizedRow = normalizeSourceSubscriptionRow(input.row as unknown as Record<string, unknown>);
  const previousOracle = input.current || (
    oracleSubscriptionLedgerEnabled && oracleControlPlane
      ? await getOracleSubscriptionLedgerById({
          controlDb: oracleControlPlane,
          subscriptionId: normalizedRow.id,
        })
      : null
  );

  if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
    await upsertOracleSubscriptionLedgerFromKnownRow(normalizedRow, input.action);
  }

  try {
    const shadowRow = await writeSupabaseSourceSubscriptionShadow(db, normalizedRow, {
      current: previousOracle,
      action: input.action,
    });
    await upsertOracleProductSubscriptionsFromKnownRows([shadowRow], input.action);
    return shadowRow;
  } catch (error) {
    if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
      if (previousOracle) {
        await upsertOracleSubscriptionLedgerFromKnownRow(previousOracle, `${input.action}_rollback`);
      } else {
        await deleteOracleSubscriptionLedgerRow({
          controlDb: oracleControlPlane,
          subscriptionId: normalizedRow.id,
        });
      }
    }
    throw error;
  }
}

async function getUserSourceSubscriptionByIdOracleFirst(
  db: ReturnType<typeof createClient>,
  input: { subscriptionId: string; userId?: string | null },
) {
  if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
    try {
      const ledgerRow = await getOracleSubscriptionLedgerById({
        controlDb: oracleControlPlane,
        subscriptionId: input.subscriptionId,
        userId: input.userId,
      });
      if (ledgerRow || oracleSubscriptionLedgerPrimaryEnabled) {
        return ledgerRow || null;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
        action: 'get_subscription_by_id',
        subscription_id: input.subscriptionId,
        user_id: input.userId || null,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleSubscriptionLedgerPrimaryEnabled) {
    logSubscriptionSupabaseFallbackRead({
      action: 'get_subscription_by_id',
      userId: input.userId || null,
      subscriptionId: input.subscriptionId,
    });
  }
  return readSupabaseSourceSubscriptionById(db, input);
}

async function getUserSourceSubscriptionByUserChannelOracleFirst(
  db: ReturnType<typeof createClient>,
  input: { userId: string; sourceType: string; sourceChannelId: string },
) {
  if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
    try {
      const ledgerRow = await getOracleSubscriptionLedgerByUserChannel({
        controlDb: oracleControlPlane,
        userId: input.userId,
        sourceType: input.sourceType,
        sourceChannelId: input.sourceChannelId,
      });
      if (ledgerRow || oracleSubscriptionLedgerPrimaryEnabled) {
        return ledgerRow || null;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
        action: 'get_subscription_by_user_channel',
        user_id: input.userId,
        source_type: input.sourceType,
        source_channel_id: input.sourceChannelId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleSubscriptionLedgerPrimaryEnabled) {
    logSubscriptionSupabaseFallbackRead({
      action: 'get_subscription_by_user_channel',
      userId: input.userId,
      sourceType: input.sourceType,
      sourceChannelId: input.sourceChannelId,
    });
  }
  return readSupabaseSourceSubscriptionByUserChannel(db, input);
}

async function listUserSourceSubscriptionsForUserOracleFirst(
  db: ReturnType<typeof createClient>,
  userId: string,
) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [] as SourceSubscriptionRow[];

  if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
    try {
      const ledgerRows = await listOracleSubscriptionLedgerRowsForUser({
        controlDb: oracleControlPlane,
        userId: normalizedUserId,
      });
      if (ledgerRows.length > 0 || oracleSubscriptionLedgerPrimaryEnabled) {
        return ledgerRows;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
        action: 'list_subscriptions_for_user',
        user_id: normalizedUserId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleSubscriptionLedgerPrimaryEnabled) {
    logSubscriptionSupabaseFallbackRead({
      action: 'list_subscriptions_for_user',
      userId: normalizedUserId,
    });
  }
  return listSupabaseSourceSubscriptionsForUser(db, normalizedUserId);
}

async function listUserSourceSubscriptionsPageForUserOracleFirst(
  db: ReturnType<typeof createClient>,
  input: { userId: string; limit?: number; offset?: number },
) {
  const normalizedUserId = String(input.userId || '').trim();
  const limit = Math.max(1, Math.min(Math.floor(Number(input.limit || 50)), 50));
  const offset = Math.max(0, Math.floor(Number(input.offset || 0)));
  if (!normalizedUserId) {
    return {
      items: [] as SourceSubscriptionRow[],
      next_offset: null as number | null,
    };
  }

  if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
    try {
      const ledgerPage = await listOracleSubscriptionLedgerRowsPageForUser({
        controlDb: oracleControlPlane,
        userId: normalizedUserId,
        limit,
        offset,
      });
      if (ledgerPage.items.length > 0 || oracleSubscriptionLedgerPrimaryEnabled) {
        return ledgerPage;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
        action: 'list_subscriptions_page_for_user',
        user_id: normalizedUserId,
        limit,
        offset,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleSubscriptionLedgerPrimaryEnabled) {
    logSubscriptionSupabaseFallbackRead({
      action: 'list_subscriptions_page_for_user',
      userId: normalizedUserId,
    });
  }
  return listSupabaseSourceSubscriptionsPageForUser(db, {
    userId: normalizedUserId,
    limit,
    offset,
  });
}

async function upsertUserSourceSubscriptionOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    userId: string;
    sourceType: string;
    sourceChannelId: string;
    sourceChannelUrl?: string | null;
    sourceChannelTitle?: string | null;
    sourcePageId?: string | null;
    mode?: string | null;
    autoUnlockEnabled?: boolean;
    isActive?: boolean;
    lastSyncError?: string | null;
  },
) {
  const current = await getUserSourceSubscriptionByUserChannelOracleFirst(db, {
    userId: input.userId,
    sourceType: input.sourceType,
    sourceChannelId: input.sourceChannelId,
  });
  const row = buildPatchedSourceSubscriptionRow({
    current,
    patch: {
      id: current?.id || randomUUID(),
      user_id: input.userId,
      source_type: input.sourceType,
      source_channel_id: input.sourceChannelId,
      source_channel_url: input.sourceChannelUrl ?? current?.source_channel_url ?? null,
      source_channel_title: input.sourceChannelTitle ?? current?.source_channel_title ?? null,
      source_page_id: input.sourcePageId ?? current?.source_page_id ?? null,
      mode: input.mode ?? current?.mode ?? null,
      auto_unlock_enabled: input.autoUnlockEnabled ?? current?.auto_unlock_enabled ?? false,
      is_active: input.isActive ?? true,
      last_sync_error: Object.prototype.hasOwnProperty.call(input, 'lastSyncError')
        ? input.lastSyncError
        : current?.last_sync_error ?? null,
    },
  });

  const persisted = await persistSourceSubscriptionRowOracleAware(db, {
    row,
    action: 'subscription_write',
    current,
  });

  return {
    current,
    row: persisted,
  };
}

async function patchUserSourceSubscriptionOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    subscriptionId: string;
    userId: string;
    patch: Record<string, unknown>;
    action: string;
  },
) {
  const current = await getUserSourceSubscriptionByIdOracleFirst(db, {
    subscriptionId: input.subscriptionId,
    userId: input.userId,
  });
  if (!current) return null;

  const row = buildPatchedSourceSubscriptionRow({
    current,
    patch: input.patch,
  });
  return persistSourceSubscriptionRowOracleAware(db, {
    row,
    action: input.action,
    current,
  });
}

async function deactivateUserSourceSubscriptionByChannelOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    userId: string;
    sourceType: string;
    sourceChannelId: string;
    action: string;
  },
) {
  const current = await getUserSourceSubscriptionByUserChannelOracleFirst(db, input);
  if (!current) return null;

  const row = buildPatchedSourceSubscriptionRow({
    current,
    patch: {
      is_active: false,
    },
  });
  return persistSourceSubscriptionRowOracleAware(db, {
    row,
    action: input.action,
    current,
  });
}

async function upsertOracleProductSubscriptionsFromKnownRows(
  rows: Array<Record<string, unknown> | null | undefined>,
  action: string,
) {
  const normalizedRows = rows.filter((row): row is Record<string, unknown> => Boolean(row?.id));
  if (!oracleProductMirrorEnabled || !oracleControlPlane || normalizedRows.length === 0) {
    return;
  }

  try {
    await upsertOracleProductSubscriptionRows({
      controlDb: oracleControlPlane,
      rows: normalizedRows,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
      action,
      table: 'product_subscription_state',
      count: normalizedRows.length,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function upsertOracleProductSourceItemsFromKnownRows(
  rows: Array<Record<string, unknown> | null | undefined>,
  action: string,
  options?: { strict?: boolean },
) {
  const normalizedRows = rows.filter((row): row is Record<string, unknown> => Boolean(row?.id));
  if (!oracleProductMirrorEnabled || !oracleControlPlane || normalizedRows.length === 0) {
    return;
  }

  try {
    await upsertOracleProductSourceItemRows({
      controlDb: oracleControlPlane,
      rows: normalizedRows,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
      action,
      table: 'product_source_item_state',
      count: normalizedRows.length,
      error: error instanceof Error ? error.message : String(error),
    }));
    if (options?.strict) {
      throw error;
    }
  }
}

async function upsertOracleSourceItemLedgerFromKnownRow(
  row: Record<string, unknown> | null | undefined,
  action: string,
) {
  if (!oracleSourceItemLedgerEnabled || !oracleControlPlane || !row?.id) {
    return;
  }

  try {
    await upsertOracleSourceItemLedgerRow({
      controlDb: oracleControlPlane,
      row,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] source_item_ledger_failed', JSON.stringify({
      action,
      source_item_id: String(row.id || '').trim() || null,
      error: error instanceof Error ? error.message : String(error),
    }));
    throw error;
  }
}

async function upsertOracleProductUnlocksFromKnownRows(
  rows: Array<Record<string, unknown> | null | undefined>,
  action: string,
) {
  const normalizedRows = rows.filter((row): row is Record<string, unknown> => Boolean(row?.id));
  if (!oracleProductMirrorEnabled || !oracleControlPlane || normalizedRows.length === 0) {
    return;
  }

  try {
    await upsertOracleProductUnlockRows({
      controlDb: oracleControlPlane,
      rows: normalizedRows,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
      action,
      table: 'product_unlock_state',
      count: normalizedRows.length,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function upsertOracleProductFeedRowsFromKnownRows(
  rows: Array<Record<string, unknown> | null | undefined>,
  action: string,
) {
  const normalizedRows = rows.filter((row): row is Record<string, unknown> => Boolean(row?.id));
  if (!oracleProductMirrorEnabled || !oracleControlPlane || normalizedRows.length === 0) {
    return;
  }

  try {
    await upsertOracleProductFeedRows({
      controlDb: oracleControlPlane,
      rows: normalizedRows,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
      action,
      table: 'product_feed_state',
      count: normalizedRows.length,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function upsertOracleFeedLedgerRowsFromKnownRows(
  rows: Array<Record<string, unknown> | null | undefined>,
  action: string,
) {
  const normalizedRows = rows.filter((row): row is Record<string, unknown> => Boolean(row?.id));
  if (!oracleFeedLedgerEnabled || !oracleControlPlane || normalizedRows.length === 0) {
    return;
  }

  try {
    await upsertOracleFeedLedgerRows({
      controlDb: oracleControlPlane,
      rows: normalizedRows,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] feed_ledger_failed', JSON.stringify({
      action,
      table: 'feed_ledger_state',
      count: normalizedRows.length,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function getUserSubscriptionStateForSourcePageOracleFirst(
  db: ReturnType<typeof createClient>,
  input: { userId: string; sourcePageId: string; sourceChannelId?: string | null },
) {
  if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
    try {
      const durable = await getOracleSubscriptionLedgerState({
        controlDb: oracleControlPlane,
        userId: input.userId,
        sourcePageId: input.sourcePageId,
        sourceChannelId: input.sourceChannelId,
      });
      if (durable || oracleSubscriptionLedgerPrimaryEnabled) {
        if (!durable) {
          return {
            subscribed: false,
            subscription_id: null,
            is_active: false,
          };
        }
        return {
          subscribed: Boolean(durable.is_active),
          subscription_id: durable.id || null,
          is_active: Boolean(durable.is_active),
        };
      }
    } catch (error) {
      console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
        action: 'get_user_subscription_state_for_source_page',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleSubscriptionLedgerPrimaryEnabled) {
    logSubscriptionSupabaseFallbackRead({
      action: 'get_user_subscription_state_for_source_page',
      userId: input.userId,
      sourcePageId: input.sourcePageId,
      sourceChannelId: input.sourceChannelId || null,
    });
  }
  if (oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      const mirrored = await getOracleProductSubscriptionState({
        controlDb: oracleControlPlane,
        userId: input.userId,
        sourcePageId: input.sourcePageId,
        sourceChannelId: input.sourceChannelId,
      });
      if (mirrored) {
        return {
          subscribed: Boolean(mirrored.is_active),
          subscription_id: mirrored.id || null,
          is_active: Boolean(mirrored.is_active),
        };
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action: 'get_user_subscription_state_for_source_page',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return getUserSubscriptionStateForSourcePage(db, {
    userId: input.userId,
    sourcePageId: input.sourcePageId,
  });
}

async function countActiveSubscribersForSourcePageOracleFirst(
  db: ReturnType<typeof createClient>,
  input: { sourcePageId?: string | null; sourceChannelId?: string | null },
) {
  const sourcePageId = String(input.sourcePageId || '').trim();
  const sourceChannelId = String(input.sourceChannelId || '').trim();
  if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
    try {
      const durableCount = await countOracleSubscriptionLedgerActiveSubscriptions({
        controlDb: oracleControlPlane,
        sourcePageId,
        sourceChannelId,
      });
      if (durableCount > 0 || oracleSubscriptionLedgerPrimaryEnabled) {
        return durableCount;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
        action: 'count_active_subscribers_for_source_page',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleSubscriptionLedgerPrimaryEnabled) {
    logSubscriptionSupabaseFallbackRead({
      action: 'count_active_subscribers_for_source_page',
      sourcePageId,
      sourceChannelId,
    });
  }
  if (oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      const mirroredCount = await countOracleProductActiveSubscriptions({
        controlDb: oracleControlPlane,
        sourcePageId,
        sourceChannelId,
      });
      if (mirroredCount > 0) {
        return mirroredCount;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action: 'count_active_subscribers_for_source_page',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const pageCount = await countActiveSubscribersForSourcePage(db, sourcePageId);
  if (pageCount > 0 || !sourceChannelId) {
    return pageCount;
  }

  const { count, error } = await db
    .from('user_source_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'youtube')
    .eq('source_channel_id', sourceChannelId)
    .eq('is_active', true);
  if (error) throw error;
  return Number(count || 0);
}

async function getSourceItemUnlockByIdOracleFirst(
  db: ReturnType<typeof createClient>,
  unlockId: string,
) {
  const normalizedUnlockId = String(unlockId || '').trim();
  if (!normalizedUnlockId) return null;

  if (oracleUnlockLedgerEnabled && oracleControlPlane) {
    try {
      const durable = await getOracleUnlockLedgerById({
        controlDb: oracleControlPlane,
        unlockId: normalizedUnlockId,
      });
      if (durable) {
        return normalizeSourceItemUnlockRow(durable as unknown as Record<string, unknown>);
      }
    } catch (error) {
      console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
        action: 'get_source_item_unlock_by_id',
        unlock_id: normalizedUnlockId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleUnlockLedgerPrimaryEnabled) {
    return null;
  }
  return readSupabaseSourceItemUnlockById(db, normalizedUnlockId);
}

async function getSourceItemUnlockBySourceItemIdOracleFirst(
  db: ReturnType<typeof createClient>,
  sourceItemId: string,
) {
  const normalizedSourceItemId = String(sourceItemId || '').trim();
  if (!normalizedSourceItemId) return null;

  if (oracleUnlockLedgerEnabled && oracleControlPlane) {
    try {
      const durable = await getOracleUnlockLedgerBySourceItemId({
        controlDb: oracleControlPlane,
        sourceItemId: normalizedSourceItemId,
      });
      if (durable) {
        return normalizeSourceItemUnlockRow(durable as unknown as Record<string, unknown>);
      }
    } catch (error) {
      console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
        action: 'get_source_item_unlock_by_source_item_id',
        source_item_id: normalizedSourceItemId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleUnlockLedgerPrimaryEnabled) {
    return null;
  }
  if (!oracleUnlockLedgerEnabled && oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      const mirrored = await getOracleProductUnlockBySourceItemId({
        controlDb: oracleControlPlane,
        sourceItemId: normalizedSourceItemId,
      });
      if (mirrored) {
        return mirrored;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action: 'get_source_item_unlock_by_source_item_id',
        source_item_id: normalizedSourceItemId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return getSourceItemUnlockBySourceItemId(db, normalizedSourceItemId);
}

async function getSourceItemUnlocksBySourceItemIdsOracleFirst(
  db: ReturnType<typeof createClient>,
  sourceItemIds: string[],
) {
  const normalizedIds = [...new Set(
    (Array.isArray(sourceItemIds) ? sourceItemIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  if (normalizedIds.length === 0) return [] as SourceItemUnlockRow[];

  if (oracleUnlockLedgerEnabled && oracleControlPlane) {
    try {
      const durable = await listOracleUnlockLedgerRowsBySourceItemIds({
        controlDb: oracleControlPlane,
        sourceItemIds: normalizedIds,
      });
      const durableIds = new Set(
        durable
          .map((row) => String(row.source_item_id || '').trim())
          .filter(Boolean),
      );
      if (durableIds.size >= normalizedIds.length || oracleUnlockLedgerPrimaryEnabled) {
        return durable.map((row) => normalizeSourceItemUnlockRow(row as unknown as Record<string, unknown>));
      }

      const missingIds = normalizedIds.filter((id) => !durableIds.has(id));
      if (missingIds.length === 0) {
        return durable.map((row) => normalizeSourceItemUnlockRow(row as unknown as Record<string, unknown>));
      }

      const fallbackRows = await listSupabaseSourceItemUnlocksBySourceItemIds(db, missingIds);
      return [
        ...durable.map((row) => normalizeSourceItemUnlockRow(row as unknown as Record<string, unknown>)),
        ...fallbackRows,
      ];
    } catch (error) {
      console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
        action: 'get_source_item_unlocks_by_source_item_ids',
        count: normalizedIds.length,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleUnlockLedgerPrimaryEnabled) {
    return [] as SourceItemUnlockRow[];
  }
  if (!oracleUnlockLedgerEnabled && oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      const mirrored = await listOracleProductUnlocks({
        controlDb: oracleControlPlane,
        sourceItemIds: normalizedIds,
      });
      const mirroredIds = new Set(
        mirrored
          .map((row) => String(row.source_item_id || '').trim())
          .filter(Boolean),
      );
      if (mirroredIds.size >= normalizedIds.length) {
        return mirrored as SourceItemUnlockRow[];
      }

      const missingIds = normalizedIds.filter((id) => !mirroredIds.has(id));
      if (missingIds.length === 0) {
        return mirrored as SourceItemUnlockRow[];
      }

      const fallbackRows = await getSourceItemUnlocksBySourceItemIds(db, missingIds);
      return [...mirrored as SourceItemUnlockRow[], ...fallbackRows];
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action: 'get_source_item_unlocks_by_source_item_ids',
        count: normalizedIds.length,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return listSupabaseSourceItemUnlocksBySourceItemIds(db, normalizedIds);
}

async function findExpiredReservedUnlocksOracleFirst(
  db: ReturnType<typeof createClient>,
  limit = 100,
) {
  if (oracleUnlockLedgerEnabled && oracleControlPlane) {
    try {
      const rows = await listOracleUnlockLedgerExpiredReservedRows({
        controlDb: oracleControlPlane,
        limit,
        nowIso: new Date().toISOString(),
      });
      return rows.map((row) => normalizeSourceItemUnlockRow(row as unknown as Record<string, unknown>));
    } catch (error) {
      console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
        action: 'find_expired_reserved_unlocks',
        limit,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleUnlockLedgerPrimaryEnabled) {
    return [] as SourceItemUnlockRow[];
  }
  return findExpiredReservedUnlocks(db, limit);
}

async function listProcessingUnlockRowsOracleFirst(
  db: ReturnType<typeof createClient>,
  limit: number,
) {
  const normalizedLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 0)));

  if (oracleUnlockLedgerEnabled && oracleControlPlane) {
    try {
      const rows = await listOracleUnlockLedgerProcessingRows({
        controlDb: oracleControlPlane,
        limit: normalizedLimit,
      });
      return rows.map((row) => normalizeSourceItemUnlockRow(row as unknown as Record<string, unknown>));
    } catch (error) {
      console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
        action: 'list_processing_unlock_rows',
        limit: normalizedLimit,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleUnlockLedgerPrimaryEnabled) {
    return [] as SourceItemUnlockRow[];
  }
  const { data, error } = await db
    .from('source_item_unlocks')
    .select(SOURCE_ITEM_UNLOCK_SELECT)
    .eq('status', 'processing')
    .order('updated_at', { ascending: true })
    .limit(normalizedLimit);
  if (error) throw error;
  return (data || []).map((row) => normalizeSourceItemUnlockRow(row as Record<string, unknown>));
}

async function countActiveUnlockLinksForJobsOracleFirst(
  db: ReturnType<typeof createClient>,
  jobIds: string[],
) {
  const normalizedJobIds = [...new Set(
    (Array.isArray(jobIds) ? jobIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  if (normalizedJobIds.length === 0) return new Map<string, number>();

  if (oracleUnlockLedgerEnabled && oracleControlPlane) {
    try {
      return await countOracleUnlockLedgerActiveLinksForJobs({
        controlDb: oracleControlPlane,
        jobIds: normalizedJobIds,
      });
    } catch (error) {
      console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
        action: 'count_active_unlock_links_for_jobs',
        count: normalizedJobIds.length,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleUnlockLedgerPrimaryEnabled) {
    return new Map<string, number>();
  }
  const map = new Map<string, number>();
  const { data, error } = await db
    .from('source_item_unlocks')
    .select('job_id, status')
    .in('job_id', normalizedJobIds)
    .in('status', ['reserved', 'processing']);
  if (error) throw error;

  for (const row of data || []) {
    const jobId = String((row as { job_id?: string | null }).job_id || '').trim();
    if (!jobId) continue;
    map.set(jobId, (map.get(jobId) || 0) + 1);
  }
  return map;
}

type SourceItemRow = {
  id: string;
  source_type: string | null;
  source_native_id: string | null;
  canonical_key: string | null;
  source_url: string | null;
  title: string | null;
  published_at: string | null;
  ingest_status: string | null;
  source_channel_id: string | null;
  source_channel_title: string | null;
  source_page_id: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const SOURCE_ITEM_SELECT = [
  'id',
  'source_type',
  'source_native_id',
  'canonical_key',
  'source_url',
  'title',
  'published_at',
  'ingest_status',
  'source_channel_id',
  'source_channel_title',
  'source_page_id',
  'thumbnail_url',
  'metadata',
  'created_at',
  'updated_at',
].join(', ');

function normalizeSourceItemRow(row: Record<string, unknown>, nowIso?: string): SourceItemRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim() || randomUUID(),
    source_type: normalizeStringOrNull(row.source_type),
    source_native_id: normalizeStringOrNull(row.source_native_id),
    canonical_key: normalizeStringOrNull(row.canonical_key),
    source_url: normalizeStringOrNull(row.source_url),
    title: normalizeStringOrNull(row.title),
    published_at: normalizeIsoOrNull(row.published_at),
    ingest_status: normalizeStringOrNull(row.ingest_status),
    source_channel_id: normalizeStringOrNull(row.source_channel_id),
    source_channel_title: normalizeStringOrNull(row.source_channel_title),
    source_page_id: normalizeStringOrNull(row.source_page_id),
    thumbnail_url: normalizeStringOrNull(row.thumbnail_url),
    metadata: normalizeObject(row.metadata),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function mergeSourceItemRows(rows: Array<Record<string, unknown> | null | undefined>) {
  return mergeNormalizedSourceItemRows(
    rows
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .map((row) => normalizeSourceItemRow(row)),
  );
}

function mergeNormalizedSourceItemRows(rows: Array<SourceItemRow | null | undefined>) {
  const merged = new Map<string, SourceItemRow>();
  for (const normalized of rows) {
    if (!normalized) continue;
    if (!normalized.id) continue;
    const existing = merged.get(normalized.id);
    if (!existing || normalized.updated_at > existing.updated_at) {
      merged.set(normalized.id, normalized);
    }
  }
  return [...merged.values()];
}

function logSourceItemSupabaseFallbackRead(input: {
  action: string;
  reason: string;
  sourceItemId?: string | null;
  ids?: string[];
  canonicalKeys?: string[];
  sourceNativeId?: string | null;
}) {
  console.log('[oracle-control-plane] source_item_fallback_read', JSON.stringify({
    action: input.action,
    reason: input.reason,
    source_item_id: input.sourceItemId || null,
    ids: Array.isArray(input.ids) && input.ids.length > 0 ? input.ids : null,
    canonical_keys: Array.isArray(input.canonicalKeys) && input.canonicalKeys.length > 0 ? input.canonicalKeys : null,
    source_native_id: input.sourceNativeId || null,
  }));
}

function logSourceItemShadowWriteSkipped(input: {
  action: string;
  sourceItemId?: string | null;
  canonicalKey?: string | null;
  reason: string;
}) {
  console.log('[oracle-control-plane] source_item_shadow_write_skipped', JSON.stringify({
    action: input.action,
    source_item_id: input.sourceItemId || null,
    canonical_key: input.canonicalKey || null,
    reason: input.reason,
  }));
}

async function readSupabaseSourceItemById(
  db: ReturnType<typeof createClient>,
  input: { sourceItemId: string },
) {
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!sourceItemId) return null;

  const { data, error } = await db
    .from('source_items')
    .select(SOURCE_ITEM_SELECT)
    .eq('id', sourceItemId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? normalizeSourceItemRow(data as Record<string, unknown>)
    : null;
}

async function readSupabaseSourceItemByCanonicalKey(
  db: ReturnType<typeof createClient>,
  input: { canonicalKey: string },
) {
  const canonicalKey = String(input.canonicalKey || '').trim();
  if (!canonicalKey) return null;

  const { data, error } = await db
    .from('source_items')
    .select(SOURCE_ITEM_SELECT)
    .eq('canonical_key', canonicalKey)
    .maybeSingle();
  if (error) throw error;
  return data
    ? normalizeSourceItemRow(data as Record<string, unknown>)
    : null;
}

async function listSupabaseSourceItems(
  db: ReturnType<typeof createClient>,
  input: { ids?: string[]; sourceNativeId?: string | null; canonicalKeys?: string[] },
) {
  const ids = [...new Set((input.ids || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const sourceNativeId = String(input.sourceNativeId || '').trim();
  const canonicalKeys = [...new Set((input.canonicalKeys || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (ids.length === 0 && !sourceNativeId && canonicalKeys.length === 0) {
    return [] as SourceItemRow[];
  }

  const queries: Array<Promise<{ data: any[] | null; error: any }>> = [];
  if (ids.length > 0) {
    queries.push(
      db
        .from('source_items')
        .select(SOURCE_ITEM_SELECT)
        .in('id', ids),
    );
  }
  if (sourceNativeId) {
    queries.push(
      db
        .from('source_items')
        .select(SOURCE_ITEM_SELECT)
        .eq('source_native_id', sourceNativeId),
    );
  }
  if (canonicalKeys.length > 0) {
    queries.push(
      db
        .from('source_items')
        .select(SOURCE_ITEM_SELECT)
        .in('canonical_key', canonicalKeys),
    );
  }

  const settled = await Promise.all(queries);
  const rows: Array<Record<string, unknown>> = [];
  for (const result of settled) {
    if (result.error) throw result.error;
    rows.push(...((result.data || []) as Array<Record<string, unknown>>));
  }

  return mergeSourceItemRows(rows);
}

function mapSourceItemToSupabaseShadowValues(row: SourceItemRow) {
  return {
    id: row.id,
    source_type: row.source_type,
    source_native_id: row.source_native_id,
    canonical_key: row.canonical_key,
    source_url: row.source_url,
    title: row.title,
    published_at: row.published_at,
    ingest_status: row.ingest_status,
    source_channel_id: row.source_channel_id,
    source_channel_title: row.source_channel_title,
    source_page_id: row.source_page_id,
    thumbnail_url: row.thumbnail_url,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function writeSupabaseSourceItemShadow(
  db: ReturnType<typeof createClient>,
  row: SourceItemRow,
  options?: { current?: SourceItemRow | null; action?: string },
) {
  const action = String(options?.action || 'source_item_shadow_update').trim() || 'source_item_shadow_update';
  const current = options?.current || null;
  const changedFields = current?.id === row.id
    ? getSourceItemShadowChangedFields(current, row)
    : null;

  if (current?.id === row.id && changedFields && changedFields.length === 0) {
    logSourceItemShadowWriteSkipped({
      action,
      sourceItemId: current.id,
      canonicalKey: current.canonical_key,
      reason: 'unchanged_material_fields',
    });
    return current;
  }

  const { data: updatedById, error: updateByIdError } = await db
    .from('source_items')
    .update(mapSourceItemShadowUpdateValues(row))
    .eq('id', row.id)
    .select(SOURCE_ITEM_SELECT)
    .maybeSingle();
  if (updateByIdError) throw updateByIdError;
  if (updatedById) {
    return normalizeSourceItemRow(updatedById as Record<string, unknown>);
  }

  const { data, error } = await db
    .from('source_items')
    .insert(mapSourceItemToSupabaseShadowValues(row))
    .select(SOURCE_ITEM_SELECT)
    .single();
  if (error) {
    const code = String((error as { code?: string }).code || '').trim();
    if (code === '23505' && row.canonical_key) {
      const reloaded = await readSupabaseSourceItemByCanonicalKey(db, {
        canonicalKey: row.canonical_key,
      });
      if (reloaded) {
        if (reloaded.id !== row.id) {
          throw new Error(`SOURCE_ITEM_SHADOW_ID_MISMATCH:${reloaded.id}:${row.id}`);
        }
        return reloaded;
      }
    }
    throw error;
  }

  return normalizeSourceItemRow(data as Record<string, unknown>);
}

async function restoreSupabaseSourceItemShadow(
  db: ReturnType<typeof createClient>,
  input: {
    currentRow: SourceItemRow;
    previousShadow: SourceItemRow | null;
  },
) {
  if (input.previousShadow) {
    await writeSupabaseSourceItemShadow(db, input.previousShadow, {
      current: input.currentRow,
      action: 'source_item_shadow_restore',
    });
    return;
  }

  const { error } = await db
    .from('source_items')
    .delete()
    .eq('id', input.currentRow.id);
  if (error) throw error;
}

async function getSourceItemByIdOracleFirst(
  db: ReturnType<typeof createClient>,
  input: { sourceItemId: string; action?: string },
) {
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!sourceItemId) return null;
  const action = String(input.action || 'get_source_item_by_id').trim() || 'get_source_item_by_id';

  if (oracleSourceItemLedgerEnabled && oracleControlPlane) {
    try {
      const durable = await getOracleSourceItemLedgerById({
        controlDb: oracleControlPlane,
        sourceItemId,
      });
      if (durable) {
        return normalizeSourceItemRow(durable as unknown as Record<string, unknown>);
      }
      if (oracleSourceItemLedgerPrimaryEnabled) {
        return null;
      }
      return await readSupabaseSourceItemById(db, { sourceItemId });
    } catch (error) {
      console.warn('[oracle-control-plane] source_item_ledger_failed', JSON.stringify({
        action,
        source_item_id: sourceItemId,
        error: error instanceof Error ? error.message : String(error),
      }));
      if (oracleSourceItemLedgerPrimaryEnabled) {
        throw error;
      }
      return await readSupabaseSourceItemById(db, { sourceItemId });
    }
  }

  if (!oracleSourceItemLedgerEnabled && oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      const mirrored = await listOracleProductSourceItems({
        controlDb: oracleControlPlane,
        ids: [sourceItemId],
      });
      if (mirrored.length > 0) {
        return normalizeSourceItemRow(mirrored[0] as unknown as Record<string, unknown>);
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action,
        source_item_id: sourceItemId,
        error: error instanceof Error ? error.message : String(error),
      }));
      return readSupabaseFallback('oracle_product_source_item_mirror_failed');
    }
  }

  return readSupabaseFallback('supabase_only');
}

async function persistSourceItemRowOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    row: SourceItemRow;
    action: string;
  },
) {
  const normalizedBase = normalizeSourceItemRow(input.row as unknown as Record<string, unknown>);
  let existingOracleById: SourceItemRow | null = null;
  let existingOracleByCanonical: SourceItemRow | null = null;
  if (oracleSourceItemLedgerEnabled && oracleControlPlane) {
    try {
      existingOracleById = await getOracleSourceItemLedgerById({
        controlDb: oracleControlPlane,
        sourceItemId: normalizedBase.id,
      });
      if (!existingOracleById && normalizedBase.canonical_key) {
        existingOracleByCanonical = await getOracleSourceItemLedgerByCanonicalKey({
          controlDb: oracleControlPlane,
          canonicalKey: normalizedBase.canonical_key,
        });
      }
    } catch (error) {
      console.warn('[oracle-control-plane] source_item_ledger_failed', JSON.stringify({
        action: `${input.action}_lookup_existing`,
        source_item_id: normalizedBase.id,
        canonical_key: normalizedBase.canonical_key || null,
        error: error instanceof Error ? error.message : String(error),
      }));
      if (oracleSourceItemLedgerPrimaryEnabled) {
        throw error;
      }
    }
  }
  const allowSupabaseCurrentLookup = shouldLookupSupabaseSourceItemCurrent({
    primaryEnabled: oracleSourceItemLedgerPrimaryEnabled,
    hasOracleCurrent: Boolean(existingOracleById || existingOracleByCanonical),
  });
  const existingSupabaseById = !existingOracleById && !existingOracleByCanonical
    && allowSupabaseCurrentLookup
    ? await readSupabaseSourceItemById(db, {
        sourceItemId: normalizedBase.id,
      })
    : null;
  const existingSupabaseByCanonical = (
    !existingOracleById
    && !existingOracleByCanonical
    && !existingSupabaseById
    && allowSupabaseCurrentLookup
    && normalizedBase.canonical_key
  )
    ? await readSupabaseSourceItemByCanonicalKey(db, {
        canonicalKey: normalizedBase.canonical_key,
      })
    : null;
  const existing = existingOracleById
    || existingOracleByCanonical
    || existingSupabaseById
    || existingSupabaseByCanonical;

  const normalizedRow = normalizeSourceItemRow({
    ...normalizedBase,
    id: existing?.id || normalizedBase.id,
    created_at: existing?.created_at || normalizedBase.created_at,
  }, existing?.created_at || normalizedBase.created_at);
  const writeSupabaseShadow = shouldWriteSupabaseSourceItemShadow({
    primaryEnabled: oracleSourceItemLedgerPrimaryEnabled,
  });
  const previousSupabase = writeSupabaseShadow
    ? await readSupabaseSourceItemById(db, {
        sourceItemId: normalizedRow.id,
      }) || (
        normalizedRow.canonical_key
          ? await readSupabaseSourceItemByCanonicalKey(db, {
              canonicalKey: normalizedRow.canonical_key,
            })
          : null
      )
    : null;

  if (oracleSourceItemLedgerEnabled && oracleControlPlane) {
    try {
      await upsertOracleSourceItemLedgerFromKnownRow(normalizedRow, input.action);
    } catch (error) {
      if (oracleSourceItemLedgerPrimaryEnabled) {
        throw error;
      }
      console.warn('[oracle-control-plane] source_item_ledger_shadow_failed', JSON.stringify({
        action: input.action,
        source_item_id: normalizedRow.id,
        canonical_key: normalizedRow.canonical_key || null,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  try {
    if (writeSupabaseShadow) {
      const shadowRow = await writeSupabaseSourceItemShadow(db, normalizedRow, {
        current: previousSupabase || existing || null,
        action: input.action,
      });
      await upsertOracleProductSourceItemsFromKnownRows([shadowRow], input.action, {
        strict: true,
      });
      return shadowRow;
    }
    await upsertOracleProductSourceItemsFromKnownRows([normalizedRow], input.action, {
      strict: true,
    });
    return normalizedRow;
  } catch (error) {
    if (writeSupabaseShadow) {
      try {
        await restoreSupabaseSourceItemShadow(db, {
          currentRow: normalizedRow,
          previousShadow: previousSupabase,
        });
      } catch (restoreError) {
        console.warn('[oracle-control-plane] source_item_shadow_restore_failed', JSON.stringify({
          action: input.action,
          source_item_id: normalizedRow.id,
          canonical_key: normalizedRow.canonical_key || null,
          error: restoreError instanceof Error ? restoreError.message : String(restoreError),
        }));
      }
    }
    if (oracleSourceItemLedgerEnabled && oracleControlPlane) {
      if (existing) {
        await upsertOracleSourceItemLedgerFromKnownRow(existing, `${input.action}_rollback`);
      } else {
        await deleteOracleSourceItemLedgerRows({
          controlDb: oracleControlPlane,
          ids: [normalizedRow.id],
        });
      }
    }
    throw error;
  }
}

async function storeSourceItemViewCountOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    sourceItemId: string;
    viewCount: number | null;
  },
) {
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!sourceItemId || input.viewCount == null) return false;

  const current = await getSourceItemByIdOracleFirst(db, {
    sourceItemId,
    action: 'store_source_item_view_count_current',
  });
  if (!current) return false;

  const currentMetadata = current.metadata && typeof current.metadata === 'object' && !Array.isArray(current.metadata)
    ? current.metadata
    : {};
  const currentViewCount = (() => {
    const parsed = Number(currentMetadata.view_count);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
  })();
  if (currentViewCount === input.viewCount) return false;

  const nextRow = normalizeSourceItemRow({
    ...current,
    metadata: {
      ...currentMetadata,
      view_count: input.viewCount,
      view_count_fetched_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  }, current.created_at);

  await persistSourceItemRowOracleAware(db, {
    row: nextRow,
    action: 'store_source_item_view_count',
  });
  return true;
}

async function storeBlueprintYouTubeCommentsOracleAware(
  _db: ReturnType<typeof createClient>,
  input: {
    blueprintId: string;
    videoId: string;
    sortMode: 'top' | 'new';
    comments: Array<{
      source_comment_id: string;
      display_order: number;
      author_name: string | null;
      author_avatar_url: string | null;
      content: string;
      published_at: string | null;
      like_count: number | null;
    }>;
  },
) {
  if (!oracleControlPlane) {
    return {
      changed: false,
      skipped: true,
      previous_count: 0,
      next_count: Array.isArray(input.comments) ? input.comments.length : 0,
    };
  }
  return replaceOracleBlueprintYoutubeCommentsSnapshot({
    controlDb: oracleControlPlane,
    blueprintId: input.blueprintId,
    youtubeVideoId: input.videoId,
    sortMode: input.sortMode,
    comments: input.comments,
  });
}

async function listBlueprintYouTubeCommentsOracleAware(
  _db: ReturnType<typeof createClient>,
  input: {
    blueprintId: string;
    sortMode: 'top' | 'new';
  },
) {
  if (!oracleControlPlane) return [];
  return listOracleBlueprintYoutubeComments({
    controlDb: oracleControlPlane,
    blueprintId: input.blueprintId,
    sortMode: input.sortMode,
  });
}

async function readSupabaseBlueprintTagRows(
  db: ReturnType<typeof createClient>,
  input: {
    blueprintIds: string[];
    action?: string;
  },
) {
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (blueprintIds.length === 0) {
    return [] as Array<{
      blueprint_id: string;
      tag_id: string;
      tag_slug: string;
    }>;
  }

  console.log('[blueprint_tags_remaining_read]', JSON.stringify({
    action: String(input.action || 'read_supabase_blueprint_tag_rows'),
    blueprint_id_count: blueprintIds.length,
    oracle_control_plane_enabled: Boolean(oracleControlPlane),
  }));

  const { data, error } = await db
    .from('blueprint_tags')
    .select('blueprint_id, tag_id, tags(slug)')
    .in('blueprint_id', blueprintIds);
  if (error) throw error;

  const rows: Array<{
    blueprint_id: string;
    tag_id: string;
    tag_slug: string;
  }> = [];
  for (const row of data || []) {
    const blueprintId = String((row as { blueprint_id?: unknown }).blueprint_id || '').trim();
    const tagId = String((row as { tag_id?: unknown }).tag_id || '').trim();
    const joined = (row as {
      tags?: { slug?: string } | Array<{ slug?: string }> | null;
    }).tags;
    const tagCandidates = Array.isArray(joined) ? joined : joined ? [joined] : [];
    for (const candidate of tagCandidates) {
      const tagSlug = String(candidate?.slug || '').trim().toLowerCase();
      if (!blueprintId || !tagId || !tagSlug) continue;
      rows.push({
        blueprint_id: blueprintId,
        tag_id: tagId,
        tag_slug: tagSlug,
      });
    }
  }

  return rows;
}

async function listBlueprintTagRowsOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    blueprintIds: string[];
  },
) {
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (blueprintIds.length === 0) {
    return [] as Array<{
      blueprint_id: string;
      tag_id: string;
      tag_slug: string;
    }>;
  }

  if (!oracleControlPlane) {
    return readSupabaseBlueprintTagRows(db, {
      blueprintIds,
      action: 'list_blueprint_tag_rows_oracle_aware_fallback',
    });
  }

  const oracleRows = await listOracleBlueprintTagRows({
    controlDb: oracleControlPlane,
    blueprintIds,
  });

  return oracleRows.map((row) => ({
    blueprint_id: row.blueprint_id,
    tag_id: row.tag_id,
    tag_slug: row.tag_slug,
  }));
}

async function listBlueprintTagSlugsOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    blueprintId: string;
  },
) {
  const blueprintId = String(input.blueprintId || '').trim();
  if (!blueprintId) return [] as string[];

  if (oracleControlPlane) {
    const oracleSlugs = await listOracleBlueprintTagSlugs({
      controlDb: oracleControlPlane,
      blueprintId,
    });
    return oracleSlugs;
  }

  const rows = await readSupabaseBlueprintTagRows(db, {
    blueprintIds: [blueprintId],
    action: 'list_blueprint_tag_slugs_oracle_aware_fallback',
  });
  return Array.from(new Set(
    rows
      .map((row) => String(row.tag_slug || '').trim().toLowerCase())
      .filter(Boolean),
  ));
}

async function listBlueprintTagRowsByFiltersOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    tagIds?: string[];
    tagSlugs?: string[];
  },
) {
  const tagIds = [...new Set((input.tagIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const tagSlugs = [...new Set((input.tagSlugs || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
  if (tagIds.length === 0 && tagSlugs.length === 0) {
    return [] as Array<{
      blueprint_id: string;
      tag_id: string;
      tag_slug: string;
    }>;
  }

  if (!oracleControlPlane) {
    console.log('[blueprint_tags_remaining_read]', JSON.stringify({
      action: 'list_blueprint_tag_rows_by_filters_oracle_aware_fallback',
      tag_id_count: tagIds.length,
      tag_slug_count: tagSlugs.length,
      oracle_control_plane_enabled: Boolean(oracleControlPlane),
    }));
    let resolvedTagIds = [...tagIds];
    if (tagSlugs.length > 0) {
      const { data: tagRows, error: tagError } = await db
        .from('tags')
        .select('id, slug')
        .in('slug', tagSlugs);
      if (tagError) throw tagError;
      resolvedTagIds = Array.from(new Set([
        ...resolvedTagIds,
        ...(tagRows || []).map((row: any) => String(row.id || '').trim()).filter(Boolean),
      ]));
    }
    if (resolvedTagIds.length === 0) return [];
    const { data, error } = await db
      .from('blueprint_tags')
      .select('blueprint_id, tag_id, tags(slug)')
      .in('tag_id', resolvedTagIds);
    if (error) throw error;
    const rows: Array<{ blueprint_id: string; tag_id: string; tag_slug: string }> = [];
    for (const row of data || []) {
      const blueprintId = String((row as any).blueprint_id || '').trim();
      const tagId = String((row as any).tag_id || '').trim();
      const joined = (row as any).tags;
      const tagCandidates = Array.isArray(joined) ? joined : joined ? [joined] : [];
      for (const candidate of tagCandidates) {
        const tagSlug = String(candidate?.slug || '').trim().toLowerCase();
        if (!blueprintId || !tagId || !tagSlug) continue;
        rows.push({ blueprint_id: blueprintId, tag_id: tagId, tag_slug: tagSlug });
      }
    }
    return rows;
  }

  const [rowsById, rowsBySlug] = await Promise.all([
    tagIds.length > 0
      ? listOracleBlueprintTagRowsByTagIds({
        controlDb: oracleControlPlane,
        tagIds,
      })
      : Promise.resolve([]),
    tagSlugs.length > 0
      ? listOracleBlueprintTagRowsByTagSlugs({
        controlDb: oracleControlPlane,
        tagSlugs,
      })
      : Promise.resolve([]),
  ]);

  const deduped = new Map<string, { blueprint_id: string; tag_id: string; tag_slug: string }>();
  for (const row of [...rowsById, ...rowsBySlug]) {
    deduped.set(`${row.blueprint_id}:${row.tag_id}`, {
      blueprint_id: row.blueprint_id,
      tag_id: row.tag_id,
      tag_slug: row.tag_slug,
    });
  }
  return Array.from(deduped.values());
}

async function attachBlueprintTagOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    blueprintId: string;
    tagId: string;
    tagSlug: string;
  },
) {
  const blueprintId = String(input.blueprintId || '').trim();
  const tagId = String(input.tagId || '').trim();
  const tagSlug = String(input.tagSlug || '').trim().toLowerCase();
  if (!blueprintId || !tagId || !tagSlug) return;

  if (oracleControlPlane) {
    await upsertOracleBlueprintTagRow({
      controlDb: oracleControlPlane,
      row: {
        blueprint_id: blueprintId,
        tag_id: tagId,
        tag_slug: tagSlug,
      },
    });
    return;
  }

  const { error } = await db
    .from('blueprint_tags')
    .upsert({ blueprint_id: blueprintId, tag_id: tagId }, { onConflict: 'blueprint_id,tag_id' });
  if (error) throw error;
}

async function syncOracleTagRowFromSupabaseBySlug(slug: string) {
  const normalizedSlug = normalizeRouteString(slug).toLowerCase();
  if (!oracleControlPlane || !normalizedSlug) return null;

  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client is not configured');
  }

  const { data, error } = await db
    .from('tags')
    .select('id, slug, follower_count, created_at')
    .eq('slug', normalizedSlug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return upsertOracleTagRow({
    controlDb: oracleControlPlane,
    row: data as Record<string, unknown>,
  });
}

async function syncOracleTagRowFromSupabaseById(tagId: string) {
  const normalizedTagId = normalizeRouteString(tagId);
  if (!oracleControlPlane || !normalizedTagId) return null;

  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client is not configured');
  }

  const { data, error } = await db
    .from('tags')
    .select('id, slug, follower_count, created_at')
    .eq('id', normalizedTagId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return upsertOracleTagRow({
    controlDb: oracleControlPlane,
    row: data as Record<string, unknown>,
  });
}

type FeedItemRow = {
  id: string;
  user_id: string;
  source_item_id: string | null;
  blueprint_id: string | null;
  state: string;
  last_decision_code: string | null;
  generated_at_on_wall: string | null;
  created_at: string;
  updated_at: string;
};

const FEED_ITEM_SELECT = 'id, user_id, source_item_id, blueprint_id, state, last_decision_code, generated_at_on_wall, created_at, updated_at';

function normalizeFeedItemRow(row: Record<string, unknown>, nowIso?: string): FeedItemRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim() || randomUUID(),
    user_id: String(row.user_id || '').trim(),
    source_item_id: normalizeStringOrNull(row.source_item_id),
    blueprint_id: normalizeStringOrNull(row.blueprint_id),
    state: String(row.state || '').trim() || 'my_feed_unlockable',
    last_decision_code: normalizeStringOrNull(row.last_decision_code),
    generated_at_on_wall: normalizeIsoOrNull(row.generated_at_on_wall),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function readSupabaseFeedItemById(
  db: ReturnType<typeof createClient>,
  input: { feedItemId: string; userId?: string | null },
) {
  const feedItemId = String(input.feedItemId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!feedItemId) return null;

  let query = db
    .from('user_feed_items')
    .select(FEED_ITEM_SELECT)
    .eq('id', feedItemId);
  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data
    ? normalizeFeedItemRow(data as Record<string, unknown>)
    : null;
}

async function readSupabaseFeedItemByUserSourceItem(
  db: ReturnType<typeof createClient>,
  input: { userId: string; sourceItemId: string },
) {
  const userId = String(input.userId || '').trim();
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!userId || !sourceItemId) return null;

  const { data, error } = await db
    .from('user_feed_items')
    .select(FEED_ITEM_SELECT)
    .eq('user_id', userId)
    .eq('source_item_id', sourceItemId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? normalizeFeedItemRow(data as Record<string, unknown>)
    : null;
}

async function getFeedItemByIdOracleFirst(
  db: ReturnType<typeof createClient>,
  input: { feedItemId: string; userId?: string | null },
) {
  const feedItemId = String(input.feedItemId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!feedItemId) return null;

  if (oracleFeedLedgerEnabled && oracleControlPlane) {
    try {
      const durable = await getOracleFeedLedgerById({
        controlDb: oracleControlPlane,
        feedItemId,
        userId,
      });
      if (durable) {
        return normalizeFeedItemRow(durable as unknown as Record<string, unknown>);
      }
    } catch (error) {
      console.warn('[oracle-control-plane] feed_ledger_failed', JSON.stringify({
        action: 'get_feed_item_by_id',
        feed_item_id: feedItemId,
        user_id: userId || null,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleFeedLedgerPrimaryEnabled && oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      const mirrored = await listOracleProductFeedRows({
        controlDb: oracleControlPlane,
        ids: [feedItemId],
        userId: userId || null,
        limit: 1,
      });
      if (mirrored[0]) {
        return normalizeFeedItemRow(mirrored[0] as unknown as Record<string, unknown>);
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action: 'get_feed_item_by_id',
        feed_item_id: feedItemId,
        user_id: userId || null,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
    return null;
  }

  return readSupabaseFeedItemById(db, { feedItemId, userId });
}

async function getFeedItemByIdForPrimaryMutation(
  db: ReturnType<typeof createClient>,
  input: { feedItemId: string; action: string; userId?: string | null },
) {
  const feedItemId = String(input.feedItemId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!feedItemId) return null;

  if (!oracleFeedLedgerPrimaryEnabled || !oracleControlPlane) {
    return getFeedItemByIdOracleFirst(db, { feedItemId, userId });
  }

  try {
    const durable = await getOracleFeedLedgerById({
      controlDb: oracleControlPlane,
      feedItemId,
      userId,
    });
    if (durable) {
      return normalizeFeedItemRow(durable as unknown as Record<string, unknown>);
    }
  } catch (error) {
    console.warn('[oracle-control-plane] feed_ledger_failed', JSON.stringify({
      action: input.action,
      feed_item_id: feedItemId,
      user_id: userId || null,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  if (oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      const mirrored = await listOracleProductFeedRows({
        controlDb: oracleControlPlane,
        ids: [feedItemId],
        userId: userId || null,
        limit: 1,
      });
      if (mirrored[0]) {
        return normalizeFeedItemRow(mirrored[0] as unknown as Record<string, unknown>);
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action: input.action,
        feed_item_id: feedItemId,
        user_id: userId || null,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return null;
}

function buildPatchedFeedItemRow(input: {
  current: FeedItemRow;
  patch: {
    blueprint_id?: string | null;
    state?: string;
    last_decision_code?: string | null;
    generated_at_on_wall?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
}) {
  const updatedAt = normalizeRequiredIso(input.patch.updated_at, new Date().toISOString());
  return normalizeFeedItemRow({
    ...input.current,
    ...input.patch,
    id: input.current.id,
    user_id: input.current.user_id,
    source_item_id: input.current.source_item_id,
    generated_at_on_wall: input.patch.generated_at_on_wall ?? input.current.generated_at_on_wall,
    created_at: input.patch.created_at ?? input.current.created_at,
    updated_at: updatedAt,
  }, input.current.created_at);
}

async function writeSupabaseFeedItemShadow(
  db: ReturnType<typeof createClient>,
  row: FeedItemRow,
) {
  const existingById = await readSupabaseFeedItemById(db, {
    feedItemId: row.id,
    userId: row.user_id,
  });

  if (existingById) {
    const { data, error } = await db
      .from('user_feed_items')
      .update(mapFeedItemToSupabaseShadowValues(row))
      .eq('id', existingById.id)
      .select(FEED_ITEM_SELECT)
      .single();
    if (error) throw error;
    return normalizeFeedItemRow(data as Record<string, unknown>);
  }

  const existingByUserSource = row.source_item_id
    ? await readSupabaseFeedItemByUserSourceItem(db, {
        userId: row.user_id,
        sourceItemId: row.source_item_id,
      })
    : null;
  if (existingByUserSource && existingByUserSource.id !== row.id) {
    throw new Error(`FEED_SHADOW_ID_MISMATCH:${existingByUserSource.id}:${row.id}`);
  }

  const { data, error } = await db
    .from('user_feed_items')
    .insert(mapFeedItemToSupabaseShadowValues(row))
    .select(FEED_ITEM_SELECT)
    .single();
  if (error) {
    const code = String((error as { code?: string }).code || '').trim();
    if (code === '23505') {
      const reloaded = await readSupabaseFeedItemById(db, {
        feedItemId: row.id,
        userId: row.user_id,
      }) || (
        row.source_item_id
          ? await readSupabaseFeedItemByUserSourceItem(db, {
              userId: row.user_id,
              sourceItemId: row.source_item_id,
            })
          : null
      );
      if (reloaded) return reloaded;
    }
    throw error;
  }

  return normalizeFeedItemRow(data as Record<string, unknown>);
}

async function restoreSupabaseFeedItemShadow(
  db: ReturnType<typeof createClient>,
  input: {
    currentRow: FeedItemRow;
    previousShadow: FeedItemRow | null;
  },
) {
  if (input.previousShadow) {
    await writeSupabaseFeedItemShadow(db, input.previousShadow);
    return;
  }

  const { error } = await db
    .from('user_feed_items')
    .delete()
    .eq('id', input.currentRow.id)
    .eq('user_id', input.currentRow.user_id);
  if (error) throw error;
}

async function persistFeedItemRowOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    row: FeedItemRow;
    action: string;
  },
) {
  const normalizedRow = normalizeFeedItemRow(input.row as unknown as Record<string, unknown>);
  const writeSupabaseShadow = shouldWriteSupabaseFeedItemShadow({
    primaryEnabled: oracleFeedLedgerPrimaryEnabled,
  });
  const previousOracle = (
    oracleFeedLedgerEnabled && oracleControlPlane
      ? await getOracleFeedLedgerById({
          controlDb: oracleControlPlane,
          feedItemId: normalizedRow.id,
        })
      : null
  );
  const previousSupabase = writeSupabaseShadow
    ? await readSupabaseFeedItemById(db, {
        feedItemId: normalizedRow.id,
        userId: normalizedRow.user_id,
      }) || (
        normalizedRow.source_item_id
          ? await readSupabaseFeedItemByUserSourceItem(db, {
              userId: normalizedRow.user_id,
              sourceItemId: normalizedRow.source_item_id,
            })
          : null
      )
    : null;

  if (oracleFeedLedgerEnabled && oracleControlPlane) {
    await upsertOracleFeedLedgerRow({
      controlDb: oracleControlPlane,
      row: normalizedRow,
    });
  }

  try {
    if (writeSupabaseShadow) {
      await writeSupabaseFeedItemShadow(db, normalizedRow);
    }
    await upsertOracleProductFeedRowsFromKnownRows([normalizedRow], input.action);
    return normalizedRow;
  } catch (error) {
    if (writeSupabaseShadow) {
      try {
        await restoreSupabaseFeedItemShadow(db, {
          currentRow: normalizedRow,
          previousShadow: previousSupabase,
        });
      } catch (restoreError) {
        console.warn('[oracle-control-plane] feed_shadow_restore_failed', JSON.stringify({
          action: input.action,
          feed_item_id: normalizedRow.id,
          user_id: normalizedRow.user_id,
          error: restoreError instanceof Error ? restoreError.message : String(restoreError),
        }));
      }
    }
    if (oracleFeedLedgerEnabled && oracleControlPlane) {
      if (previousOracle) {
        await upsertOracleFeedLedgerRow({
          controlDb: oracleControlPlane,
          row: previousOracle,
        });
      } else {
        await deleteOracleFeedLedgerRows({
          controlDb: oracleControlPlane,
          ids: [normalizedRow.id],
        });
      }
    }
    throw error;
  }
}

async function patchFeedItemByIdOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    feedItemId: string;
    userId?: string | null;
    patch: {
      blueprint_id?: string | null;
      state?: string;
      last_decision_code?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    action: string;
    current?: FeedItemRow | null;
  },
) {
  const current = input.current ?? await getFeedItemByIdForPrimaryMutation(db, {
    feedItemId: input.feedItemId,
    userId: input.userId,
    action: `${input.action}_current`,
  });
  if (!current) return null;

  return persistFeedItemRowOracleAware(db, {
    row: buildPatchedFeedItemRow({
      current,
      patch: input.patch,
    }),
    action: input.action,
  });
}

async function patchFeedRowsBySourceItemIdsOracleAware(
  db: ReturnType<typeof createClient>,
  input: {
    sourceItemIds: string[];
    expectedStates?: string[];
    requireBlueprintNull?: boolean;
    patch: {
      state?: string;
      last_decision_code?: string | null;
    };
    action: string;
  },
) {
  if (!oracleFeedLedgerPrimaryEnabled || !oracleControlPlane) {
    throw new Error('FEED_LEDGER_PRIMARY_REQUIRED');
  }

  const sourceItemIds = [...new Set(
    (input.sourceItemIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  if (sourceItemIds.length === 0) return 0;

  const currentRows = await listOracleFeedLedgerRows({
    controlDb: oracleControlPlane,
    sourceItemIds,
    limit: 5000,
  });

  let patchedCount = 0;
  for (const currentRow of currentRows) {
    const current = normalizeFeedItemRow(currentRow as unknown as Record<string, unknown>);
    if (input.requireBlueprintNull && current.blueprint_id) continue;
    if ((input.expectedStates || []).length > 0 && !(input.expectedStates || []).includes(current.state)) continue;

    await persistFeedItemRowOracleAware(db, {
      row: buildPatchedFeedItemRow({
        current,
        patch: input.patch,
      }),
      action: input.action,
    });
    patchedCount += 1;
  }

  return patchedCount;
}

async function listProductFeedRowsForUserOracleFirst(
  db: ReturnType<typeof createClient>,
  input: { userId: string; limit: number; sourceItemIds?: string[]; requireBlueprint?: boolean },
) {
  const normalizedLimit = Math.max(1, Math.min(5000, Number(input.limit || 0) || 200));
  const normalizedSourceItemIds = [...new Set(
    (input.sourceItemIds || [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  let durableRows: any[] = [];
  let mirroredRows: any[] = [];

  if (oracleFeedLedgerEnabled && oracleControlPlane) {
    try {
      durableRows = await listOracleFeedLedgerRows({
        controlDb: oracleControlPlane,
        userId: input.userId,
        limit: normalizedLimit,
        sourceItemIds: normalizedSourceItemIds,
        requireBlueprint: input.requireBlueprint,
        orderByWallActivity: true,
      });
      const ledgerLooksComplete = normalizedSourceItemIds.length > 0
        ? new Set(
          durableRows
            .map((row) => String(row.source_item_id || '').trim())
            .filter(Boolean),
        ).size >= normalizedSourceItemIds.length
        : durableRows.length >= normalizedLimit;
      if (ledgerLooksComplete) {
        return durableRows;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] feed_ledger_failed', JSON.stringify({
        action: 'list_product_feed_rows_for_user',
        user_id: input.userId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      mirroredRows = await listOracleProductFeedRows({
        controlDb: oracleControlPlane,
        userId: input.userId,
        limit: normalizedLimit,
        sourceItemIds: normalizedSourceItemIds,
        requireBlueprint: input.requireBlueprint,
        orderByWallActivity: true,
      });
      const mirrorLooksComplete = normalizedSourceItemIds.length > 0
        ? new Set(
          mirroredRows
            .map((row) => String(row.source_item_id || '').trim())
            .filter(Boolean),
        ).size >= normalizedSourceItemIds.length
        : mirroredRows.length >= normalizedLimit;
      if (mirrorLooksComplete) {
        return mergePersonalProductFeedRows([...(durableRows || []), ...mirroredRows]).slice(0, normalizedLimit);
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action: 'list_product_feed_rows_for_user',
        user_id: input.userId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleFeedLedgerPrimaryEnabled) {
    return mergePersonalProductFeedRows([...(durableRows || []), ...(mirroredRows || [])]).slice(0, normalizedLimit);
  }

  let query = db
    .from('user_feed_items')
    .select(FEED_ITEM_SELECT)
    .eq('user_id', input.userId)
    .order('generated_at_on_wall', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(normalizedLimit);

  if (normalizedSourceItemIds.length > 0) {
    query = query.in('source_item_id', normalizedSourceItemIds);
  }
  if (input.requireBlueprint) {
    query = query.not('blueprint_id', 'is', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function getPersonalFeedRowSortTimestamp(row: any) {
  return resolveFeedItemWallDisplayAt({
    blueprintId: row?.blueprint_id,
    createdAt: row?.created_at,
    generatedAtOnWall: row?.generated_at_on_wall,
  });
}

function sortMergedPersonalProductFeedRows(rows: any[]) {
  return [...rows].sort((left, right) => {
    const leftDisplayAt = Date.parse(String(getPersonalFeedRowSortTimestamp(left) || ''));
    const rightDisplayAt = Date.parse(String(getPersonalFeedRowSortTimestamp(right) || ''));
    const safeLeftDisplayAt = Number.isFinite(leftDisplayAt) ? leftDisplayAt : 0;
    const safeRightDisplayAt = Number.isFinite(rightDisplayAt) ? rightDisplayAt : 0;
    if (safeRightDisplayAt !== safeLeftDisplayAt) {
      return safeRightDisplayAt - safeLeftDisplayAt;
    }
    const leftCreatedAt = Date.parse(String(left?.created_at || ''));
    const rightCreatedAt = Date.parse(String(right?.created_at || ''));
    const safeLeftCreatedAt = Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0;
    const safeRightCreatedAt = Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0;
    if (safeRightCreatedAt !== safeLeftCreatedAt) {
      return safeRightCreatedAt - safeLeftCreatedAt;
    }
    const leftId = String(left?.id || '');
    const rightId = String(right?.id || '');
    return rightId.localeCompare(leftId);
  });
}

function mergePersonalProductFeedRows(rows: any[]) {
  const rowsById = new Map<string, any>();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (!id || rowsById.has(id)) continue;
    rowsById.set(id, row);
  }
  return sortMergedPersonalProductFeedRows([...rowsById.values()]);
}

function normalizePublicProductFeedCursor(input: { createdAt?: string | null; feedItemId?: string | null } | null | undefined) {
  const createdAt = String(input?.createdAt || '').trim();
  const feedItemId = String(input?.feedItemId || '').trim();
  if (!createdAt || !feedItemId) return null;
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return null;
  return {
    createdAt: new Date(createdAtMs).toISOString(),
    feedItemId,
  };
}

function buildPublicProductFeedCursorFilter(input: { createdAt: string; feedItemId: string }) {
  return `created_at.lt.${input.createdAt},and(created_at.eq.${input.createdAt},id.lt.${input.feedItemId})`;
}

function sortMergedProductFeedRows(rows: any[]) {
  return [...rows].sort((left, right) => {
    const leftCreatedAt = Date.parse(String(left?.created_at || ''));
    const rightCreatedAt = Date.parse(String(right?.created_at || ''));
    const safeLeftCreatedAt = Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0;
    const safeRightCreatedAt = Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0;
    if (safeRightCreatedAt !== safeLeftCreatedAt) {
      return safeRightCreatedAt - safeLeftCreatedAt;
    }
    const leftId = String(left?.id || '');
    const rightId = String(right?.id || '');
    return rightId.localeCompare(leftId);
  });
}

function mergeProductFeedRows(rows: any[]) {
  const rowsById = new Map<string, any>();
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (!id || rowsById.has(id)) continue;
    rowsById.set(id, row);
  }
  return sortMergedProductFeedRows([...rowsById.values()]);
}

async function listPublicProductFeedRowsFromSupabase(
  db: ReturnType<typeof createClient>,
  input: {
    blueprintIds?: string[];
    state?: string | null;
    limit?: number;
    cursor?: { createdAt?: string | null; feedItemId?: string | null } | null;
    requireBlueprint?: boolean;
  },
) {
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const state = String(input.state || '').trim();
  const normalizedLimit = Math.max(1, Math.min(5000, Number(input.limit || 0) || 200));
  const cursor = normalizePublicProductFeedCursor(input.cursor);

  let query = db
    .from('user_feed_items')
    .select('id, user_id, source_item_id, blueprint_id, state, last_decision_code, created_at, updated_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(normalizedLimit);

  if (blueprintIds.length > 0) {
    query = query.in('blueprint_id', blueprintIds);
  }
  if (state) {
    query = query.eq('state', state);
  }
  if (input.requireBlueprint) {
    query = query.not('blueprint_id', 'is', null);
  }
  if (cursor) {
    query = query.or(buildPublicProductFeedCursorFilter(cursor));
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function listPublicProductFeedRowsOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    blueprintIds?: string[];
    state?: string | null;
    limit?: number;
    cursor?: { createdAt?: string | null; feedItemId?: string | null } | null;
    requireBlueprint?: boolean;
  },
) {
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const state = String(input.state || '').trim();
  const normalizedLimit = Math.max(1, Math.min(5000, Number(input.limit || 0) || (blueprintIds.length > 0 ? 5000 : 200)));
  const cursor = normalizePublicProductFeedCursor(input.cursor);
  let durableRows: any[] = [];
  let mirroredRows: any[] = [];

  if (oracleFeedLedgerEnabled && oracleControlPlane) {
    try {
      durableRows = await listOracleFeedLedgerRows({
        controlDb: oracleControlPlane,
        blueprintIds,
        state,
        limit: normalizedLimit,
        cursor,
        requireBlueprint: input.requireBlueprint,
      });
      const ledgerLooksComplete = blueprintIds.length > 0
        ? new Set(
          durableRows
            .map((row) => String(row.blueprint_id || '').trim())
            .filter(Boolean),
        ).size >= blueprintIds.length
        : durableRows.length >= normalizedLimit;
      if (ledgerLooksComplete) {
        return sortMergedProductFeedRows(durableRows).slice(0, normalizedLimit);
      }
    } catch (error) {
      console.warn('[oracle-control-plane] feed_ledger_failed', JSON.stringify({
        action: 'list_public_product_feed_rows',
        state: state || null,
        blueprint_count: blueprintIds.length,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      mirroredRows = await listOracleProductFeedRows({
        controlDb: oracleControlPlane,
        blueprintIds,
        state,
        limit: normalizedLimit,
        cursor,
        requireBlueprint: input.requireBlueprint,
      });

      const mirrorLooksComplete = blueprintIds.length > 0
        ? new Set(
          mirroredRows
            .map((row) => String(row.blueprint_id || '').trim())
            .filter(Boolean),
        ).size >= blueprintIds.length
        : mirroredRows.length >= normalizedLimit;

      if (mirrorLooksComplete) {
        return mergeProductFeedRows([...(durableRows || []), ...mirroredRows]).slice(0, normalizedLimit);
      }

      if (oracleFeedLedgerPrimaryEnabled) {
        return mergeProductFeedRows([...(durableRows || []), ...mirroredRows]).slice(0, normalizedLimit);
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action: 'list_public_product_feed_rows',
        state: state || null,
        blueprint_count: blueprintIds.length,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleFeedLedgerPrimaryEnabled) {
    return mergeProductFeedRows([...(durableRows || []), ...(mirroredRows || [])]).slice(0, normalizedLimit);
  }

  return listPublicProductFeedRowsFromSupabase(db, {
    blueprintIds,
    state,
    limit: normalizedLimit,
    cursor,
    requireBlueprint: input.requireBlueprint,
  });
}

async function listProductSourceItemsOracleFirst(
  db: ReturnType<typeof createClient>,
  input: { ids?: string[]; sourceNativeId?: string | null; canonicalKeys?: string[]; action?: string },
) {
  const ids = [...new Set((input.ids || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const sourceNativeId = String(input.sourceNativeId || '').trim();
  const canonicalKeys = [...new Set((input.canonicalKeys || []).map((value) => String(value || '').trim()).filter(Boolean))];
  const action = String(input.action || 'list_product_source_items').trim() || 'list_product_source_items';

  if (oracleSourceItemLedgerEnabled && oracleControlPlane) {
    try {
      const durable = await listOracleSourceItemLedgerRows({
        controlDb: oracleControlPlane,
        ids,
        sourceNativeId,
        canonicalKeys,
        limit: Math.max(
          10,
          ids.length,
          canonicalKeys.length,
          sourceNativeId ? 25 : 0,
        ),
      });
      const durableRows = durable.map((row) => normalizeSourceItemRow(row as unknown as Record<string, unknown>));
      const durableIdSet = new Set(durableRows.map((row) => row.id).filter(Boolean));
      const durableCanonicalKeySet = new Set(durableRows.map((row) => row.canonical_key).filter(Boolean));
      const missingIds = ids.filter((id) => !durableIdSet.has(id));
      const missingCanonicalKeys = canonicalKeys.filter((canonicalKey) => !durableCanonicalKeySet.has(canonicalKey));

      if (oracleSourceItemLedgerPrimaryEnabled) {
        return durableRows;
      }

      if (!sourceNativeId && missingIds.length === 0 && missingCanonicalKeys.length === 0) {
        return durableRows;
      }

      const fallbackRows = await listSupabaseSourceItems(db, {
        ids,
        sourceNativeId,
        canonicalKeys,
      });
      return mergeNormalizedSourceItemRows([...durableRows, ...fallbackRows]);
    } catch (error) {
      console.warn('[oracle-control-plane] source_item_ledger_failed', JSON.stringify({
        action,
        error: error instanceof Error ? error.message : String(error),
      }));
      if (oracleSourceItemLedgerPrimaryEnabled) {
        throw error;
      }
      return await listSupabaseSourceItems(db, {
        ids,
        sourceNativeId,
        canonicalKeys,
      });
    }
  }

  if (!oracleSourceItemLedgerEnabled && oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      const mirrored = await listOracleProductSourceItems({
        controlDb: oracleControlPlane,
        ids,
        sourceNativeId,
      });
      if (ids.length > 0 && canonicalKeys.length === 0) {
        const mirroredIds = new Set(mirrored.map((row) => String(row.id || '').trim()).filter(Boolean));
        if (mirroredIds.size >= ids.length) {
          return mirrored;
        }
        const missingIds = ids.filter((id) => !mirroredIds.has(id));
        if (missingIds.length > 0) {
          const fallbackRows = await listSupabaseFallback('oracle_product_source_item_mirror_incomplete_ids');
          return mergeNormalizedSourceItemRows([...mirrored, ...fallbackRows]);
        }
        return mirrored;
      }
      if (mirrored.length > 0 && !canonicalKeys.length) {
        const fallbackRows = sourceNativeId
          ? await listSupabaseFallback('oracle_product_source_item_mirror_source_native_id')
          : [];
        return mergeNormalizedSourceItemRows([...mirrored, ...fallbackRows]);
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action,
        error: error instanceof Error ? error.message : String(error),
      }));
      return listSupabaseFallback('oracle_product_source_item_mirror_failed');
    }
  }

  return listSupabaseFallback('supabase_only');
}

async function listActiveSubscriptionsForUserOracleFirst(
  db: ReturnType<typeof createClient>,
  userId: string,
) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return [];

  if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
    try {
      const durable = await listOracleSubscriptionLedgerActiveSubscriptionsForUser({
        controlDb: oracleControlPlane,
        userId: normalizedUserId,
      });
      if (durable.length > 0 || oracleSubscriptionLedgerPrimaryEnabled) {
        return durable;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
        action: 'list_active_subscriptions_for_user',
        user_id: normalizedUserId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleSubscriptionLedgerPrimaryEnabled) {
    logSubscriptionSupabaseFallbackRead({
      action: 'list_active_subscriptions_for_user',
      userId: normalizedUserId,
    });
  }
  if (oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      const mirrored = await listOracleProductActiveSubscriptionsForUser({
        controlDb: oracleControlPlane,
        userId: normalizedUserId,
      });
      if (mirrored.length > 0) {
        return mirrored;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action: 'list_active_subscriptions_for_user',
        user_id: normalizedUserId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const { data, error } = await db
    .from('user_source_subscriptions')
    .select('source_page_id, source_channel_id')
    .eq('user_id', normalizedUserId)
    .eq('is_active', true);
  if (error) throw error;
  return data || [];
}

async function listUserSourceSubscriptionsByIdsOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    subscriptionIds: string[];
    userId?: string | null;
    activeOnly?: boolean;
    sourceType?: string | null;
  },
) {
  const subscriptionIds = [...new Set(
    (Array.isArray(input.subscriptionIds) ? input.subscriptionIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  if (subscriptionIds.length === 0) return [] as SourceSubscriptionRow[];

  if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
    try {
      const ledgerRows = await listOracleSubscriptionLedgerRowsByIds({
        controlDb: oracleControlPlane,
        subscriptionIds,
        userId: input.userId || null,
      });
      const filteredRows = ledgerRows.filter((row) => (
        (!input.activeOnly || row.is_active)
        && (!input.sourceType || row.source_type === String(input.sourceType || '').trim())
      ));
      if (filteredRows.length > 0 || oracleSubscriptionLedgerPrimaryEnabled) {
        return filteredRows;
      }
    } catch (error) {
      console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
        action: 'list_subscriptions_by_ids',
        user_id: input.userId || null,
        count: subscriptionIds.length,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleSubscriptionLedgerPrimaryEnabled) {
    logSubscriptionSupabaseFallbackRead({
      action: 'list_subscriptions_by_ids',
      userId: input.userId || null,
    });
  }

  let query = db
    .from('user_source_subscriptions')
    .select(SOURCE_SUBSCRIPTION_SELECT)
    .in('id', subscriptionIds);
  if (input.userId) {
    query = query.eq('user_id', String(input.userId || '').trim());
  }
  if (input.activeOnly) {
    query = query.eq('is_active', true);
  }
  if (input.sourceType) {
    query = query.eq('source_type', String(input.sourceType || '').trim());
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => normalizeSourceSubscriptionRow(row as Record<string, unknown>));
}

async function getBlueprintAvailabilityForVideoOracleFirst(
  db: ReturnType<typeof createClient>,
  videoId: string,
) {
  return readBlueprintAvailabilityForVideo(db, videoId, {
    listSourceItemsByVideoId: async (sourceNativeId) => (
      await listProductSourceItemsOracleFirst(db, {
        sourceNativeId,
        action: 'blueprint_availability_list_source_items_by_video_id',
      })
    ).map((row) => ({ id: row.id || null })),
    listUnlockRowsBySourceItemIds: async (sourceItemIds) => (
      await getSourceItemUnlocksBySourceItemIdsOracleFirst(db, sourceItemIds)
    ).map((row) => ({
      updated_at: String((row as any)?.updated_at || '').trim() || null,
      last_error_code: String((row as any)?.last_error_code || '').trim() || null,
      last_error_message: String((row as any)?.last_error_message || '').trim() || null,
    })),
    listFailedGenerationRunsByVideoId: async (videoIdValue) => (
      await listFailedGenerationRunsByVideoIdOracleFirst(db, videoIdValue)
    ),
  });
}

async function syncOracleProductFeedRowsByIds(
  db: ReturnType<typeof createClient>,
  feedItemIds: string[],
  action: string,
) {
  const normalizedIds = [...new Set(feedItemIds.map((value) => String(value || '').trim()).filter(Boolean))];
  if ((!oracleProductMirrorEnabled && !oracleFeedLedgerEnabled) || !oracleControlPlane || normalizedIds.length === 0) {
    return;
  }

  try {
    const { data, error } = await db
      .from('user_feed_items')
      .select('id, user_id, source_item_id, blueprint_id, state, last_decision_code, created_at, updated_at')
      .in('id', normalizedIds);
    if (error) throw error;
    const rows = (data || []) as Array<Record<string, unknown>>;
    await upsertOracleFeedLedgerRowsFromKnownRows(rows, action);
    await upsertOracleProductFeedRowsFromKnownRows(rows, action);
  } catch (error) {
    console.warn('[oracle-control-plane] feed_sync_failed', JSON.stringify({
      action,
      table: oracleFeedLedgerEnabled ? 'feed_ledger_state' : 'product_feed_state',
      count: normalizedIds.length,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function syncOracleSuppressedFeedRowsForSourceItemIds(
  db: ReturnType<typeof createClient>,
  sourceItemIds: string[],
  decisionCode: string,
  action: string,
) {
  const normalizedIds = [...new Set(sourceItemIds.map((value) => String(value || '').trim()).filter(Boolean))];
  if ((!oracleProductMirrorEnabled && !oracleFeedLedgerEnabled) || !oracleControlPlane || normalizedIds.length === 0) {
    return;
  }

  try {
    const { data, error } = await db
      .from('user_feed_items')
      .select('id, user_id, source_item_id, blueprint_id, state, last_decision_code, created_at, updated_at')
      .in('source_item_id', normalizedIds)
      .is('blueprint_id', null)
      .eq('state', 'my_feed_skipped')
      .eq('last_decision_code', String(decisionCode || '').trim());
    if (error) throw error;
    const rows = (data || []) as Array<Record<string, unknown>>;
    await upsertOracleFeedLedgerRowsFromKnownRows(rows, action);
    await upsertOracleProductFeedRowsFromKnownRows(rows, action);
  } catch (error) {
    console.warn('[oracle-control-plane] feed_sync_failed', JSON.stringify({
      action,
      table: oracleFeedLedgerEnabled ? 'feed_ledger_state' : 'product_feed_state',
      count: normalizedIds.length,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function deleteOracleProductFeedRowsForSubscriptionNotice(
  input: { userId: string; sourceItemId: string },
) {
  if ((!oracleProductMirrorEnabled && !oracleFeedLedgerEnabled) || !oracleControlPlane) {
    return;
  }

  try {
    if (oracleFeedLedgerEnabled) {
      await deleteOracleFeedLedgerRows({
        controlDb: oracleControlPlane,
        userId: input.userId,
        sourceItemId: input.sourceItemId,
        state: 'subscription_notice',
      });
    }
    await deleteOracleProductFeedRows({
      controlDb: oracleControlPlane,
      userId: input.userId,
      sourceItemId: input.sourceItemId,
      state: 'subscription_notice',
    });
  } catch (error) {
    console.warn('[oracle-control-plane] feed_sync_failed', JSON.stringify({
      action: 'delete_subscription_notice_feed_rows',
      table: oracleFeedLedgerEnabled ? 'feed_ledger_state' : 'product_feed_state',
      user_id: input.userId,
      source_item_id: input.sourceItemId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

async function syncOracleProductUnlockById(
  db: ReturnType<typeof createClient>,
  unlockId: string,
  action: string,
) {
  const normalizedUnlockId = String(unlockId || '').trim();
  if (!oracleProductMirrorEnabled || !oracleControlPlane || !normalizedUnlockId) {
    return;
  }

  try {
    const unlock = await getSourceItemUnlockByIdForPrimaryMutation(
      db,
      normalizedUnlockId,
      'sync_product_unlock_by_id',
    );
    if (!unlock) return;
    await upsertOracleProductUnlocksFromKnownRows([unlock as unknown as Record<string, unknown>], action);
  } catch (error) {
    console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
      action,
      table: 'product_unlock_state',
      unlock_id: normalizedUnlockId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

function logUnlockPrimaryMutationFailure(input: {
  action: string;
  unlockId?: string | null;
  sourceItemId?: string | null;
  error: unknown;
}) {
  console.warn('[oracle-control-plane] unlock_ledger_primary_failed', JSON.stringify({
    action: input.action,
    unlock_id: String(input.unlockId || '').trim() || null,
    source_item_id: String(input.sourceItemId || '').trim() || null,
    error: describeUnknownOracleControlPlaneError(input.error),
  }));
}

async function ensureSourceItemUnlockWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    sourceItemId: string;
    sourcePageId?: string | null;
    estimatedCost: number;
  },
) {
  if (!oracleUnlockLedgerPrimaryEnabled || !oracleControlPlane) {
    const unlock = await ensureSourceItemUnlock(db, input);
    await upsertOracleUnlockLedgerFromKnownRow(unlock as unknown as Record<string, unknown>, 'ensure_source_item_unlock');
    await upsertOracleProductUnlocksFromKnownRows([unlock as unknown as Record<string, unknown>], 'ensure_source_item_unlock');
    return unlock;
  }

  try {
    const current = await getSourceItemUnlockBySourceItemIdForPrimaryMutation(
      db,
      input.sourceItemId,
      'ensure_source_item_unlock_current',
    );
    if (current) {
      const nextCost = Number(input.estimatedCost);
      const currentCost = Number(current.estimated_cost || 0);
      const nextSourcePageId = input.sourcePageId || current.source_page_id || null;
      if (currentCost === nextCost && nextSourcePageId === current.source_page_id) {
        return current;
      }

      return persistSourceItemUnlockRowOracleAware(db, {
        row: buildPatchedSourceItemUnlockRow({
          current,
          patch: {
            estimated_cost: nextCost,
            source_page_id: nextSourcePageId,
          },
        }),
        action: 'ensure_source_item_unlock',
        expectedCurrent: current,
      });
    }

    return persistSourceItemUnlockRowOracleAware(db, {
      row: buildPatchedSourceItemUnlockRow({
        patch: {
          id: randomUUID(),
          source_item_id: input.sourceItemId,
          source_page_id: input.sourcePageId || null,
          status: 'available',
          estimated_cost: Number(input.estimatedCost),
        },
      }),
      action: 'ensure_source_item_unlock',
    });
  } catch (error) {
    logUnlockPrimaryMutationFailure({
      action: 'ensure_source_item_unlock',
      sourceItemId: input.sourceItemId,
      error,
    });
    throw error;
  }
}

async function reserveUnlockWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    unlock: SourceItemUnlockRow;
    userId: string;
    estimatedCost: number;
    reservationSeconds: number;
  },
) {
  if (!oracleUnlockLedgerPrimaryEnabled || !oracleControlPlane) {
    const result = await reserveUnlock(db, input);
    await upsertOracleUnlockLedgerFromKnownRow(result.unlock as unknown as Record<string, unknown>, 'reserve_unlock');
    await upsertOracleProductUnlocksFromKnownRows([result.unlock as unknown as Record<string, unknown>], 'reserve_unlock');
    return result;
  }

  try {
    let unlock = await getSourceItemUnlockByIdForPrimaryMutation(
      db,
      input.unlock.id,
      'reserve_unlock_current',
    );
    if (!unlock) {
      unlock = await getSourceItemUnlockBySourceItemIdForPrimaryMutation(
        db,
        input.unlock.source_item_id,
        'reserve_unlock_source_item_current',
      );
    }
    if (!unlock) {
      throw new Error('UNLOCK_NOT_FOUND');
    }

    if (unlock.status === 'ready' && unlock.blueprint_id) {
      return { ok: true as const, state: 'ready' as const, unlock, reservedNow: false };
    }

    const reservationExpiresAt = new Date(
      Date.now() + Math.max(30, input.reservationSeconds) * 1000,
    ).toISOString();
    const isExpiredReservation = (() => {
      const parsed = Date.parse(String(unlock.reservation_expires_at || ''));
      return Number.isFinite(parsed) && parsed <= Date.now();
    })();

    if (unlock.status === 'reserved' && !isExpiredReservation) {
      if (unlock.reserved_by_user_id === input.userId) {
        return { ok: true as const, state: 'reserved' as const, unlock, reservedNow: false };
      }
      return { ok: true as const, state: 'in_progress' as const, unlock, reservedNow: false };
    }

    if (unlock.status === 'processing' && !isExpiredReservation) {
      return { ok: true as const, state: 'in_progress' as const, unlock, reservedNow: false };
    }

    if ((unlock.status === 'reserved' || unlock.status === 'processing') && isExpiredReservation) {
      unlock = await persistSourceItemUnlockRowOracleAware(db, {
        row: buildPatchedSourceItemUnlockRow({
          current: unlock,
          patch: {
            status: 'available',
            reserved_by_user_id: null,
            reservation_expires_at: null,
            reserved_ledger_id: null,
            auto_unlock_intent_id: null,
            job_id: null,
          },
        }),
        action: 'unlock_transition_to_available',
        expectedCurrent: unlock,
      });
    }

    if (unlock.status === 'ready' && unlock.blueprint_id) {
      return { ok: true as const, state: 'ready' as const, unlock, reservedNow: false };
    }
    if (unlock.status === 'processing') {
      return { ok: true as const, state: 'in_progress' as const, unlock, reservedNow: false };
    }
    if (unlock.status === 'reserved' && unlock.reserved_by_user_id === input.userId) {
      return { ok: true as const, state: 'reserved' as const, unlock, reservedNow: false };
    }
    if (unlock.status === 'reserved') {
      return { ok: true as const, state: 'in_progress' as const, unlock, reservedNow: false };
    }

    const nextRow = buildPatchedSourceItemUnlockRow({
      current: unlock,
      patch: {
        status: 'reserved',
        estimated_cost: Number(input.estimatedCost),
        reserved_by_user_id: input.userId,
        reservation_expires_at: reservationExpiresAt,
        auto_unlock_intent_id: unlock.auto_unlock_intent_id || null,
        last_error_code: null,
        last_error_message: null,
      },
    });
    const persisted = await persistSourceItemUnlockRowOracleAware(db, {
      row: nextRow,
      action: 'reserve_unlock',
      expectedCurrent: unlock,
    });

    if (persisted.status === 'ready' && persisted.blueprint_id) {
      return { ok: true as const, state: 'ready' as const, unlock: persisted, reservedNow: false };
    }
    if (persisted.status === 'reserved' && persisted.reserved_by_user_id === input.userId) {
      return {
        ok: true as const,
        state: 'reserved' as const,
        unlock: persisted,
        reservedNow: persisted.updated_at === nextRow.updated_at,
      };
    }
    if (persisted.status === 'reserved' || persisted.status === 'processing') {
      return { ok: true as const, state: 'in_progress' as const, unlock: persisted, reservedNow: false };
    }

    logUnlockPrimaryMutationFailure({
      action: 'reserve_unlock_reconcile',
      unlockId: input.unlock.id,
      sourceItemId: input.unlock.source_item_id,
      error: `UNEXPECTED_POST_RESERVE_STATE:${persisted.status}`,
    });
    throw new Error(`UNEXPECTED_POST_RESERVE_STATE:${persisted.status}`);
  } catch (error) {
    logUnlockPrimaryMutationFailure({
      action: 'reserve_unlock',
      unlockId: input.unlock.id,
      sourceItemId: input.unlock.source_item_id,
      error,
    });
    throw error;
  }
}

async function attachReservationLedgerWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    unlockId: string;
    userId: string;
    ledgerId: string | null;
    amount: number;
  },
) {
  if (!oracleUnlockLedgerPrimaryEnabled || !oracleControlPlane) {
    const unlock = await attachReservationLedger(db, input);
    await upsertOracleUnlockLedgerFromKnownRow(unlock as unknown as Record<string, unknown>, 'attach_reservation_ledger');
    await upsertOracleProductUnlocksFromKnownRows([unlock as unknown as Record<string, unknown>], 'attach_reservation_ledger');
    return unlock;
  }

  try {
    const current = await getSourceItemUnlockByIdForPrimaryMutation(
      db,
      input.unlockId,
      'attach_reservation_ledger_current',
    );
    if (!current) throw new Error('UNLOCK_NOT_FOUND');

    return persistSourceItemUnlockRowOracleAware(db, {
      row: buildPatchedSourceItemUnlockRow({
        current,
        patch: {
          reserved_ledger_id: input.ledgerId,
          estimated_cost: Number(input.amount),
          status: 'reserved',
          reserved_by_user_id: input.userId,
          auto_unlock_intent_id: null,
        },
      }),
      action: 'attach_reservation_ledger',
      expectedCurrent: current,
    });
  } catch (error) {
    logUnlockPrimaryMutationFailure({
      action: 'attach_reservation_ledger',
      unlockId: input.unlockId,
      error,
    });
    throw error;
  }
}

async function attachAutoUnlockIntentWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    unlockId: string;
    userId: string;
    intentId: string | null;
    amount: number;
  },
) {
  if (!oracleUnlockLedgerPrimaryEnabled || !oracleControlPlane) {
    const unlock = await attachAutoUnlockIntent(db, input);
    await upsertOracleUnlockLedgerFromKnownRow(unlock as unknown as Record<string, unknown>, 'attach_auto_unlock_intent');
    await upsertOracleProductUnlocksFromKnownRows([unlock as unknown as Record<string, unknown>], 'attach_auto_unlock_intent');
    return unlock;
  }

  try {
    const current = await getSourceItemUnlockByIdForPrimaryMutation(
      db,
      input.unlockId,
      'attach_auto_unlock_intent_current',
    );
    if (!current) throw new Error('UNLOCK_NOT_FOUND');

    return persistSourceItemUnlockRowOracleAware(db, {
      row: buildPatchedSourceItemUnlockRow({
        current,
        patch: {
          auto_unlock_intent_id: input.intentId,
          estimated_cost: Number(input.amount),
          status: 'reserved',
          reserved_by_user_id: input.userId,
          reserved_ledger_id: null,
        },
      }),
      action: 'attach_auto_unlock_intent',
      expectedCurrent: current,
    });
  } catch (error) {
    logUnlockPrimaryMutationFailure({
      action: 'attach_auto_unlock_intent',
      unlockId: input.unlockId,
      error,
    });
    throw error;
  }
}

async function markUnlockProcessingWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    unlockId: string;
    userId: string;
    jobId: string;
    reservationSeconds?: number;
  },
) {
  if (!oracleUnlockLedgerPrimaryEnabled || !oracleControlPlane) {
    const unlock = await markUnlockProcessing(db, input);
    await upsertOracleUnlockLedgerFromKnownRow(unlock as unknown as Record<string, unknown>, 'mark_unlock_processing');
    await upsertOracleProductUnlocksFromKnownRows(unlock ? [unlock as unknown as Record<string, unknown>] : [], 'mark_unlock_processing');
    return unlock;
  }

  try {
    const current = await getSourceItemUnlockByIdForPrimaryMutation(
      db,
      input.unlockId,
      'mark_unlock_processing_current',
    );
    if (!current) return null;
    if (current.reserved_by_user_id !== input.userId || current.status !== 'reserved') {
      return null;
    }

    const unlock = await persistSourceItemUnlockRowOracleAware(db, {
      row: buildPatchedSourceItemUnlockRow({
        current,
        patch: {
          status: 'processing',
          job_id: input.jobId,
          reservation_expires_at: new Date(
            Date.now() + Math.max(30, input.reservationSeconds || 300) * 1000,
          ).toISOString(),
        },
      }),
      action: 'mark_unlock_processing',
      expectedCurrent: current,
    });

    if (unlock.status !== 'processing' || unlock.job_id !== input.jobId) {
      return null;
    }
    return unlock;
  } catch (error) {
    logUnlockPrimaryMutationFailure({
      action: 'mark_unlock_processing',
      unlockId: input.unlockId,
      error,
    });
    throw error;
  }
}

async function completeUnlockWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    unlockId: string;
    blueprintId: string;
    jobId: string;
    expectedJobId?: string;
  },
) {
  if (!oracleUnlockLedgerPrimaryEnabled || !oracleControlPlane) {
    const unlock = await completeUnlock(db, input);
    await upsertOracleUnlockLedgerFromKnownRow(unlock as unknown as Record<string, unknown>, 'complete_unlock');
    await upsertOracleProductUnlocksFromKnownRows([unlock as unknown as Record<string, unknown>], 'complete_unlock');
    return unlock;
  }

  try {
    const current = await getSourceItemUnlockByIdForPrimaryMutation(
      db,
      input.unlockId,
      'complete_unlock_current',
    );
    if (!current) throw new Error('UNLOCK_NOT_FOUND');

    if (current.status === 'processing' && current.job_id === (input.expectedJobId || input.jobId)) {
      return persistSourceItemUnlockRowOracleAware(db, {
        row: buildPatchedSourceItemUnlockRow({
          current,
          patch: {
            status: 'ready',
            blueprint_id: input.blueprintId,
            job_id: input.jobId,
            reserved_by_user_id: null,
            reservation_expires_at: null,
            reserved_ledger_id: null,
            auto_unlock_intent_id: null,
            last_error_code: null,
            last_error_message: null,
          },
        }),
        action: 'complete_unlock',
        expectedCurrent: current,
      });
    }

    return current;
  } catch (error) {
    logUnlockPrimaryMutationFailure({
      action: 'complete_unlock',
      unlockId: input.unlockId,
      error,
    });
    throw error;
  }
}

async function failUnlockWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    unlockId: string;
    errorCode: string;
    errorMessage: string;
    expectedJobId?: string;
  },
) {
  if (!oracleUnlockLedgerPrimaryEnabled || !oracleControlPlane) {
    const unlock = await failUnlock(db, input);
    await upsertOracleUnlockLedgerFromKnownRow(unlock as unknown as Record<string, unknown>, 'fail_unlock');
    await upsertOracleProductUnlocksFromKnownRows([unlock as unknown as Record<string, unknown>], 'fail_unlock');
    return unlock;
  }

  try {
    const current = await getSourceItemUnlockByIdForPrimaryMutation(
      db,
      input.unlockId,
      'fail_unlock_current',
    );
    if (!current) throw new Error('UNLOCK_NOT_FOUND');

    if (
      (current.status === 'processing' || current.status === 'reserved')
      && (!input.expectedJobId || current.job_id === input.expectedJobId)
    ) {
      return persistSourceItemUnlockRowOracleAware(db, {
        row: buildPatchedSourceItemUnlockRow({
          current,
          patch: {
            status: 'available',
            reserved_by_user_id: null,
            reservation_expires_at: null,
            reserved_ledger_id: null,
            auto_unlock_intent_id: null,
            job_id: null,
            last_error_code: String(input.errorCode || '').slice(0, 120) || 'UNLOCK_GENERATION_FAILED',
            last_error_message: String(input.errorMessage || '').slice(0, 500),
          },
        }),
        action: 'fail_unlock',
        expectedCurrent: current,
      });
    }

    return current;
  } catch (error) {
    logUnlockPrimaryMutationFailure({
      action: 'fail_unlock',
      unlockId: input.unlockId,
      error,
    });
    throw error;
  }
}

type UnlockTranscriptSweepRow = Pick<
  SourceItemUnlockRow,
  'id' | 'source_item_id' | 'source_page_id' | 'status' | 'last_error_code' | 'transcript_status' | 'updated_at'
>;

function mapOracleUnlockTranscriptSweepRow(row: OracleUnlockLedgerRow): UnlockTranscriptSweepRow {
  return {
    id: row.id,
    source_item_id: row.source_item_id,
    source_page_id: row.source_page_id,
    status: row.status,
    last_error_code: row.last_error_code,
    transcript_status: row.transcript_status,
    updated_at: row.updated_at,
  };
}

async function listTranscriptSuppressedUnlockRowsOracleFirst(
  db: ReturnType<typeof createClient>,
  limit: number,
) {
  const normalizedLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 0)));
  if (oracleUnlockLedgerEnabled && oracleControlPlane) {
    try {
      const rows = await oracleControlPlane.db
        .selectFrom('unlock_ledger_state')
        .select([
          'id',
          'source_item_id',
          'source_page_id',
          'status',
          'last_error_code',
          'transcript_status',
          'updated_at',
        ])
        .where((eb) => eb.or([
          eb('transcript_status', '=', 'retrying'),
          eb('transcript_status', '=', 'confirmed_no_speech'),
          eb('last_error_code', '=', 'NO_TRANSCRIPT_PERMANENT'),
          eb('last_error_code', '=', 'TRANSCRIPT_UNAVAILABLE'),
        ]))
        .orderBy('updated_at', 'desc')
        .limit(normalizedLimit)
        .execute();
      return rows.map((row) => mapOracleUnlockTranscriptSweepRow(row as unknown as OracleUnlockLedgerRow));
    } catch (error) {
      console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
        action: 'list_transcript_suppressed_unlock_rows',
        limit: normalizedLimit,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleUnlockLedgerPrimaryEnabled) {
    return [] as UnlockTranscriptSweepRow[];
  }

  const { data, error } = await db
    .from('source_item_unlocks')
    .select('id, source_item_id, source_page_id, status, transcript_status, last_error_code, updated_at')
    .or('transcript_status.eq.retrying,transcript_status.eq.confirmed_no_speech,last_error_code.eq.NO_TRANSCRIPT_PERMANENT,last_error_code.eq.TRANSCRIPT_UNAVAILABLE')
    .order('updated_at', { ascending: false })
    .limit(normalizedLimit);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: String((row as any).id || '').trim(),
    source_item_id: String((row as any).source_item_id || '').trim(),
    source_page_id: String((row as any).source_page_id || '').trim() || null,
    status: String((row as any).status || '').trim() || 'available',
    transcript_status: normalizeStringOrNull((row as any).transcript_status),
    last_error_code: normalizeStringOrNull((row as any).last_error_code),
    updated_at: normalizeIsoOrNull((row as any).updated_at),
  }));
}

async function listPermanentTranscriptAvailableUnlockRowsOracleFirst(
  db: ReturnType<typeof createClient>,
  limit: number,
) {
  const normalizedLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 0)));
  if (oracleUnlockLedgerEnabled && oracleControlPlane) {
    try {
      const rows = await oracleControlPlane.db
        .selectFrom('unlock_ledger_state')
        .select([
          'id',
          'source_item_id',
          'source_page_id',
          'status',
          'last_error_code',
          'transcript_status',
          'updated_at',
        ])
        .where('status', '=', 'available')
        .where('last_error_code', '=', 'NO_TRANSCRIPT_PERMANENT')
        .orderBy('updated_at', 'asc')
        .limit(normalizedLimit)
        .execute();
      return rows.map((row) => mapOracleUnlockTranscriptSweepRow(row as unknown as OracleUnlockLedgerRow));
    } catch (error) {
      console.warn('[oracle-control-plane] unlock_ledger_failed', JSON.stringify({
        action: 'list_permanent_transcript_available_unlock_rows',
        limit: normalizedLimit,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleUnlockLedgerPrimaryEnabled) {
    return [] as UnlockTranscriptSweepRow[];
  }

  const { data, error } = await db
    .from('source_item_unlocks')
    .select('id, source_item_id, source_page_id, status, last_error_code, transcript_status, updated_at')
    .eq('status', 'available')
    .eq('last_error_code', 'NO_TRANSCRIPT_PERMANENT')
    .order('updated_at', { ascending: true })
    .limit(normalizedLimit);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: String((row as any).id || '').trim(),
    source_item_id: String((row as any).source_item_id || '').trim(),
    source_page_id: String((row as any).source_page_id || '').trim() || null,
    status: String((row as any).status || '').trim() || 'available',
    transcript_status: normalizeStringOrNull((row as any).transcript_status),
    last_error_code: normalizeStringOrNull((row as any).last_error_code),
    updated_at: normalizeIsoOrNull((row as any).updated_at),
  }));
}

async function suppressUnlockableFeedRowsForSourceItemWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    sourceItemId: string;
    decisionCode: string;
    traceId?: string;
    sourceChannelId?: string | null;
    videoId?: string | null;
  },
) {
  const hiddenCount = await suppressUnlockableFeedRowsForSourceItem(db, {
    ...input,
    applyPatch: oracleFeedLedgerPrimaryEnabled
      ? async (sourceItemIds, decisionCode) => patchFeedRowsBySourceItemIdsOracleAware(db, {
          sourceItemIds,
          expectedStates: ['my_feed_unlockable', 'my_feed_unlocking'],
          requireBlueprintNull: true,
          patch: {
            state: 'my_feed_skipped',
            last_decision_code: decisionCode,
          },
          action: 'suppress_unlockable_feed_rows_single',
        })
      : undefined,
  });
  if (hiddenCount > 0 && !oracleFeedLedgerPrimaryEnabled) {
    await syncOracleSuppressedFeedRowsForSourceItemIds(
      db,
      [input.sourceItemId],
      input.decisionCode,
      'suppress_unlockable_feed_rows_single',
    );
  }
  return hiddenCount;
}

async function suppressUnlockableFeedRowsForSourceItemsWithMirror(
  db: ReturnType<typeof createClient>,
  input: {
    sourceItemIds: string[];
    decisionCode: string;
    traceId?: string;
    chunkSize?: number;
  },
) {
  const hiddenCount = await suppressUnlockableFeedRowsForSourceItems(db, {
    ...input,
    applyPatch: oracleFeedLedgerPrimaryEnabled
      ? async (sourceItemIds, decisionCode) => patchFeedRowsBySourceItemIdsOracleAware(db, {
          sourceItemIds,
          expectedStates: ['my_feed_unlockable', 'my_feed_unlocking'],
          requireBlueprintNull: true,
          patch: {
            state: 'my_feed_skipped',
            last_decision_code: decisionCode,
          },
          action: 'suppress_unlockable_feed_rows_bulk',
        })
      : undefined,
  });
  if (hiddenCount > 0 && !oracleFeedLedgerPrimaryEnabled) {
    await syncOracleSuppressedFeedRowsForSourceItemIds(
      db,
      input.sourceItemIds,
      input.decisionCode,
      'suppress_unlockable_feed_rows_bulk',
    );
  }
  return hiddenCount;
}

async function listActiveScopeJobsOracleFirst(input: {
  scope: string;
  limit?: number;
}) {
  const queueLedgerRows = await listOracleQueueLedgerJobsSafe({
    action: 'list_active_for_scope_queue_ledger',
    scope: input.scope,
    statuses: ['queued', 'running'],
    limit: input.limit,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows) {
    return queueLedgerRows;
  }

  if (!oracleJobActivityMirrorEnabled || !oracleControlPlane) {
    return null;
  }

  try {
    return await listOracleActiveJobsForScope({
      controlDb: oracleControlPlane,
      scope: input.scope,
      limit: input.limit,
    });
  } catch (error) {
    console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
      action: 'list_active_for_scope',
      scope: input.scope,
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

async function hasOraclePendingScopeJobByPayloadField(input: {
  scope: string;
  payloadField: string;
  payloadValue: string;
  limit?: number;
}) {
  const normalizedValue = String(input.payloadValue || '').trim();
  if (!normalizedValue) return null;

  const rows = await listActiveScopeJobsOracleFirst({
    scope: input.scope,
    limit: input.limit ?? 250,
  });
  if (!rows) return null;

  return rows.some((row) => String(normalizeOracleJobPayload(row.payload)?.[input.payloadField] || '').trim() === normalizedValue);
}

function extractPendingRefreshJobPayload(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const blueprintId = String(record.blueprint_id || '').trim();
  const refreshKindRaw = String(record.refresh_kind || '').trim().toLowerCase();
  const refreshKind = refreshKindRaw === 'view_count'
    ? 'view_count'
    : refreshKindRaw === 'comments'
      ? 'comments'
      : null;
  if (!blueprintId || !refreshKind) return null;
  return {
    blueprint_id: blueprintId,
    refresh_kind: refreshKind,
  };
}

async function listPendingRefreshBlueprintIdsOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    blueprintIds: string[];
    kind: 'view_count' | 'comments';
  },
) {
  const normalizedIds = [...new Set(
    (Array.isArray(input.blueprintIds) ? input.blueprintIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
  if (normalizedIds.length === 0) return new Set<string>();

  const activeRows = await listActiveScopeJobsOracleFirst({
    scope: 'blueprint_youtube_refresh',
    limit: Math.max(normalizedIds.length * 2, 50),
  });
  if (activeRows) {
    const allowedIds = new Set(normalizedIds);
    const pendingIds = new Set<string>();
    for (const row of activeRows) {
      const payload = extractPendingRefreshJobPayload(row?.payload);
      if (!payload || payload.refresh_kind !== input.kind || !allowedIds.has(payload.blueprint_id)) continue;
      pendingIds.add(payload.blueprint_id);
    }
    return pendingIds;
  }

  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'list_pending_refresh_blueprint_ids',
      scope: 'blueprint_youtube_refresh',
      reason: 'oracle_only_primary',
    });
    return new Set<string>();
  }
  let query = db
    .from('ingestion_jobs')
    .select('payload')
    .eq('scope', 'blueprint_youtube_refresh')
    .in('status', ['queued', 'running']);

  if (typeof query.contains === 'function') {
    query = query.contains('payload', { refresh_kind: input.kind });
  }

  const { data, error } = await query.limit(Math.max(normalizedIds.length * 2, 50));
  if (error) throw error;

  const allowedIds = new Set(normalizedIds);
  const pendingIds = new Set<string>();
  for (const row of data || []) {
    const payload = extractPendingRefreshJobPayload((row as { payload?: unknown }).payload);
    if (!payload || payload.refresh_kind !== input.kind || !allowedIds.has(payload.blueprint_id)) continue;
    pendingIds.add(payload.blueprint_id);
  }
  return pendingIds;
}

async function getLatestIngestionJobOracleFirst() {
  if (oracleQueueLedgerEnabled && oracleControlPlane) {
    try {
      const mirrored = await getOracleLatestQueueJob({
        controlDb: oracleControlPlane,
      });
      if (mirrored || oracleQueueLedgerPrimaryEnabled) return mirrored || null;
    } catch (error) {
      console.warn('[oracle-control-plane] queue_ledger_mirror_failed', JSON.stringify({
        action: 'get_latest_ingestion_job',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleJobActivityMirrorEnabled && oracleControlPlane) {
    try {
      const mirrored = await getOracleLatestIngestionJob({
        controlDb: oracleControlPlane,
      });
      if (mirrored) return mirrored;
    } catch (error) {
      console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
        action: 'get_latest_ingestion_job',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'get_latest_ingestion_job',
      reason: 'oracle_only_primary',
    });
    return null;
  }
  const serviceDb = getServiceSupabaseClient();
  if (!serviceDb) {
    return null;
  }
  const latestResult = await serviceDb
    .from('ingestion_jobs')
    .select('id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestResult.error) throw latestResult.error;
  return latestResult.data || null;
}

async function getLatestIngestionJobForScopeOracleFirst(input: {
  scope: string;
}) {
  const normalizedScope = String(input.scope || '').trim();
  if (!normalizedScope) {
    return null;
  }

  if (oracleQueueLedgerEnabled && oracleControlPlane) {
    try {
      const mirrored = await getOracleLatestQueueJobForScope({
        controlDb: oracleControlPlane,
        scope: normalizedScope,
      });
      if (mirrored || oracleQueueLedgerPrimaryEnabled) {
        if (!mirrored) return null;
        return {
          id: mirrored.id,
          status: mirrored.status,
          created_at: mirrored.created_at,
          started_at: mirrored.started_at,
        };
      }
    } catch (error) {
      console.warn('[oracle-control-plane] queue_ledger_mirror_failed', JSON.stringify({
        action: 'get_latest_ingestion_job_for_scope',
        scope: normalizedScope,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'get_latest_ingestion_job_for_scope',
      scope: normalizedScope,
      reason: 'oracle_only_primary',
    });
    return null;
  }
  const serviceDb = getServiceSupabaseClient();
  if (!serviceDb) {
    return null;
  }
  const latestResult = await serviceDb
    .from('ingestion_jobs')
    .select('id, status, created_at, started_at')
    .eq('scope', normalizedScope)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestResult.error) throw latestResult.error;
  return latestResult.data || null;
}

async function getUnlockJobsByIdsOracleFirst(
  db: ReturnType<typeof createClient>,
  ids: string[],
) {
  const normalizedIds = [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map((jobId) => String(jobId || '').trim())
      .filter(Boolean),
  )];
  if (normalizedIds.length === 0) {
    return new Map<string, {
      id: string;
      status: string;
      scope: string;
      started_at: string | null;
      updated_at: string | null;
    }>();
  }

  const queueLedgerRows = await listOracleQueueLedgerJobsSafe({
    action: 'get_unlock_jobs_by_ids_queue_ledger',
    jobIds: normalizedIds,
    limit: normalizedIds.length,
  });
  if (queueLedgerRows) {
    const map = new Map<string, {
      id: string;
      status: string;
      scope: string;
      started_at: string | null;
      updated_at: string | null;
    }>();
    for (const row of queueLedgerRows) {
      map.set(row.id, {
        id: row.id,
        status: row.status,
        scope: row.scope,
        started_at: row.started_at,
        updated_at: row.updated_at,
      });
    }
    return map;
  }

  if (oracleJobActivityMirrorEnabled && oracleControlPlane) {
    try {
      const rows = await listOracleJobsByIds({
        controlDb: oracleControlPlane,
        jobIds: normalizedIds,
      });
      const map = new Map<string, {
        id: string;
        status: string;
        scope: string;
        started_at: string | null;
        updated_at: string | null;
      }>();
      for (const row of rows) {
        map.set(row.id, {
          id: row.id,
          status: row.status,
          scope: row.scope,
          started_at: row.started_at,
          updated_at: row.updated_at,
        });
      }
      return map;
    } catch (error) {
      console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
        action: 'get_unlock_jobs_by_ids',
        count: normalizedIds.length,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'get_unlock_jobs_by_ids',
      jobId: normalizedIds.length === 1 ? normalizedIds[0] : null,
      reason: 'oracle_only_primary',
    });
    return new Map<string, {
      id: string;
      status: string;
      scope: string;
      started_at: string | null;
      updated_at: string | null;
    }>();
  }
  const { data, error } = await db
    .from('ingestion_jobs')
    .select('id, status, scope, started_at, updated_at')
    .in('id', normalizedIds);
  if (error) throw error;

  const map = new Map<string, {
    id: string;
    status: string;
    scope: string;
    started_at: string | null;
    updated_at: string | null;
  }>();
  for (const row of data || []) {
    const jobId = String((row as { id?: string }).id || '').trim();
    if (!jobId) continue;
    map.set(jobId, {
      id: jobId,
      status: String((row as { status?: string }).status || '').trim(),
      scope: String((row as { scope?: string }).scope || '').trim(),
      started_at: ((row as { started_at?: string | null }).started_at ?? null),
      updated_at: ((row as { updated_at?: string | null }).updated_at ?? null),
    });
  }
  return map;
}

async function listRunningUnlockJobsOracleFirst(
  db: ReturnType<typeof createClient>,
  limit: number,
  staleBeforeIso: string,
) {
  const queueLedgerRows = await listOracleQueueLedgerJobsSafe({
    action: 'list_running_unlock_jobs_queue_ledger',
    scope: 'source_item_unlock_generation',
    statuses: ['running'],
    startedBeforeIso: staleBeforeIso,
    limit,
    orderBy: 'started_asc',
  });
  if (queueLedgerRows) {
    return queueLedgerRows.map((row) => ({
      id: row.id,
      status: row.status,
      scope: row.scope,
      started_at: row.started_at,
      updated_at: row.updated_at,
    }));
  }

  if (oracleJobActivityMirrorEnabled && oracleControlPlane) {
    try {
      const rows = await listOracleRunningJobsByScope({
        controlDb: oracleControlPlane,
        scope: 'source_item_unlock_generation',
        staleBeforeIso,
        limit,
      });
      return rows.map((row) => ({
        id: row.id,
        status: row.status,
        scope: row.scope,
        started_at: row.started_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
        action: 'list_running_unlock_jobs',
        limit,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'list_running_unlock_jobs',
      scope: 'source_item_unlock_generation',
      reason: 'oracle_only_primary',
    });
    return [];
  }
  const { data, error } = await db
    .from('ingestion_jobs')
    .select('id, status, scope, started_at, updated_at')
    .eq('scope', 'source_item_unlock_generation')
    .eq('status', 'running')
    .not('started_at', 'is', null)
    .lt('started_at', staleBeforeIso)
    .order('started_at', { ascending: true })
    .limit(Math.max(1, Math.min(1000, limit)));
  if (error) throw error;

  return (data || []).map((row) => ({
    id: String((row as { id?: string }).id || '').trim(),
    status: String((row as { status?: string }).status || '').trim(),
    scope: String((row as { scope?: string }).scope || '').trim(),
    started_at: (row as { started_at?: string | null }).started_at ?? null,
    updated_at: (row as { updated_at?: string | null }).updated_at ?? null,
  }));
}

async function getQueueHealthSnapshotOracleFirst(input: {
  snapshotAtIso: string;
  runningHeartbeatFreshMs: number;
}) {
  const snapshotMs = Date.parse(input.snapshotAtIso);
  const queueLedgerRows = await listOracleQueueLedgerJobsSafe({
    action: 'get_queue_health_snapshot_queue_ledger',
    scopes: [...QUEUED_INGESTION_SCOPES],
    statuses: ['queued', 'running'],
    limit: 5000,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows) {
    const byScope: Record<string, {
      queued: number;
      running: number;
      queued_work_items: number;
      running_work_items: number;
      oldest_queued_age_ms: number | null;
      oldest_running_age_ms: number | null;
      priority: string;
    }> = {};
    for (const scope of QUEUED_INGESTION_SCOPES) {
      byScope[scope] = {
        queued: 0,
        running: 0,
        queued_work_items: 0,
        running_work_items: 0,
        oldest_queued_age_ms: null,
        oldest_running_age_ms: null,
        priority: getQueuePriorityTierForScope(scope),
      };
    }

    let queueDepth = 0;
    let runningDepth = 0;
    let queueWorkItems = 0;
    let runningWorkItems = 0;
    let staleLeases = 0;
    let oldestQueuedCreatedAt: string | null = null;
    let oldestQueuedAgeMs: number | null = null;
    let oldestRunningStartedAt: string | null = null;
    let oldestRunningAgeMs: number | null = null;
    let activeRunningJobs = 0;

    for (const row of queueLedgerRows) {
      const scope = String(row.scope || '').trim();
      if (!isQueuedIngestionScope(scope) || !byScope[scope]) continue;
      const workItemCount = getQueuedJobWorkItemCount({
        scope,
        payload: normalizeOracleJobPayload(row.payload),
      });

      if (row.status === 'queued') {
        queueDepth += 1;
        queueWorkItems += workItemCount;
        byScope[scope].queued += 1;
        byScope[scope].queued_work_items += workItemCount;
        const createdAtMs = row.created_at ? Date.parse(row.created_at) : Number.NaN;
        if (row.created_at && Number.isFinite(createdAtMs) && Number.isFinite(snapshotMs)) {
          const ageMs = Math.max(0, snapshotMs - createdAtMs);
          if (oldestQueuedAgeMs == null || ageMs > oldestQueuedAgeMs) {
            oldestQueuedAgeMs = ageMs;
            oldestQueuedCreatedAt = row.created_at;
          }
          if (byScope[scope].oldest_queued_age_ms == null || ageMs > byScope[scope].oldest_queued_age_ms) {
            byScope[scope].oldest_queued_age_ms = ageMs;
          }
        }
        continue;
      }

      if (row.status === 'running') {
        runningDepth += 1;
        runningWorkItems += workItemCount;
        byScope[scope].running += 1;
        byScope[scope].running_work_items += workItemCount;
        const startedAtMs = row.started_at ? Date.parse(row.started_at) : Number.NaN;
        if (row.started_at && Number.isFinite(startedAtMs) && Number.isFinite(snapshotMs)) {
          const ageMs = Math.max(0, snapshotMs - startedAtMs);
          if (oldestRunningAgeMs == null || ageMs > oldestRunningAgeMs) {
            oldestRunningAgeMs = ageMs;
            oldestRunningStartedAt = row.started_at;
          }
          if (byScope[scope].oldest_running_age_ms == null || ageMs > byScope[scope].oldest_running_age_ms) {
            byScope[scope].oldest_running_age_ms = ageMs;
          }
        }

        const leaseExpiresAtMs = row.lease_expires_at ? Date.parse(row.lease_expires_at) : Number.NaN;
        const heartbeatAtMs = row.last_heartbeat_at ? Date.parse(row.last_heartbeat_at) : Number.NaN;
        const hasFreshLease = Number.isFinite(leaseExpiresAtMs) && Number.isFinite(snapshotMs) && leaseExpiresAtMs > snapshotMs;
        const hasFreshHeartbeat = Number.isFinite(heartbeatAtMs) && Number.isFinite(snapshotMs)
          && (snapshotMs - heartbeatAtMs) <= input.runningHeartbeatFreshMs;
        if (hasFreshLease || hasFreshHeartbeat) {
          activeRunningJobs += 1;
        }
        if (Number.isFinite(leaseExpiresAtMs) && Number.isFinite(snapshotMs) && leaseExpiresAtMs <= snapshotMs) {
          staleLeases += 1;
        }
      }
    }

    return {
      worker_running: activeRunningJobs > 0,
      queue_depth: queueDepth,
      running_depth: runningDepth,
      queue_work_items: queueWorkItems,
      running_work_items: runningWorkItems,
      oldest_queued_created_at: oldestQueuedCreatedAt,
      oldest_queued_age_ms: oldestQueuedAgeMs,
      oldest_running_started_at: oldestRunningStartedAt,
      oldest_running_age_ms: oldestRunningAgeMs,
      stale_leases: staleLeases,
      by_scope: byScope,
    };
  }

  if (oracleJobActivityMirrorEnabled && oracleControlPlane) {
    try {
      const rows = await listOracleActiveJobsForScopes({
        controlDb: oracleControlPlane,
        scopes: QUEUED_INGESTION_SCOPES,
        limit: 5000,
      });
      const byScope: Record<string, {
        queued: number;
        running: number;
        queued_work_items: number;
        running_work_items: number;
        oldest_queued_age_ms: number | null;
        oldest_running_age_ms: number | null;
        priority: string;
      }> = {};
      for (const scope of QUEUED_INGESTION_SCOPES) {
        byScope[scope] = {
          queued: 0,
          running: 0,
          queued_work_items: 0,
          running_work_items: 0,
          oldest_queued_age_ms: null,
          oldest_running_age_ms: null,
          priority: getQueuePriorityTierForScope(scope),
        };
      }

      let queueDepth = 0;
      let runningDepth = 0;
      let queueWorkItems = 0;
      let runningWorkItems = 0;
      let staleLeases = 0;
      let oldestQueuedCreatedAt: string | null = null;
      let oldestQueuedAgeMs: number | null = null;
      let oldestRunningStartedAt: string | null = null;
      let oldestRunningAgeMs: number | null = null;
      let activeRunningJobs = 0;

      for (const row of rows) {
        const scope = String(row.scope || '').trim();
        if (!isQueuedIngestionScope(scope) || !byScope[scope]) continue;
        const payload = normalizeOracleJobPayload(row.payload);
        const workItemCount = getQueuedJobWorkItemCount({ scope, payload });

        if (row.status === 'queued') {
          queueDepth += 1;
          queueWorkItems += workItemCount;
          byScope[scope].queued += 1;
          byScope[scope].queued_work_items += workItemCount;
          const createdAtMs = row.created_at ? Date.parse(row.created_at) : Number.NaN;
          if (row.created_at && Number.isFinite(createdAtMs) && Number.isFinite(snapshotMs)) {
            const ageMs = Math.max(0, snapshotMs - createdAtMs);
            if (oldestQueuedAgeMs == null || ageMs > oldestQueuedAgeMs) {
              oldestQueuedAgeMs = ageMs;
              oldestQueuedCreatedAt = row.created_at;
            }
            if (byScope[scope].oldest_queued_age_ms == null || ageMs > byScope[scope].oldest_queued_age_ms) {
              byScope[scope].oldest_queued_age_ms = ageMs;
            }
          }
          continue;
        }

        if (row.status === 'running') {
          runningDepth += 1;
          runningWorkItems += workItemCount;
          byScope[scope].running += 1;
          byScope[scope].running_work_items += workItemCount;
          const startedAtMs = row.started_at ? Date.parse(row.started_at) : Number.NaN;
          if (row.started_at && Number.isFinite(startedAtMs) && Number.isFinite(snapshotMs)) {
            const ageMs = Math.max(0, snapshotMs - startedAtMs);
            if (oldestRunningAgeMs == null || ageMs > oldestRunningAgeMs) {
              oldestRunningAgeMs = ageMs;
              oldestRunningStartedAt = row.started_at;
            }
            if (byScope[scope].oldest_running_age_ms == null || ageMs > byScope[scope].oldest_running_age_ms) {
              byScope[scope].oldest_running_age_ms = ageMs;
            }
          }

          const leaseExpiresAtMs = row.lease_expires_at ? Date.parse(row.lease_expires_at) : Number.NaN;
          const updatedAtMs = row.updated_at ? Date.parse(row.updated_at) : Number.NaN;
          const hasFreshLease = Number.isFinite(leaseExpiresAtMs) && Number.isFinite(snapshotMs) && leaseExpiresAtMs > snapshotMs;
          const hasFreshUpdate = Number.isFinite(updatedAtMs) && Number.isFinite(snapshotMs)
            && (snapshotMs - updatedAtMs) <= input.runningHeartbeatFreshMs;
          if (hasFreshLease || hasFreshUpdate) {
            activeRunningJobs += 1;
          }
          if (Number.isFinite(leaseExpiresAtMs) && Number.isFinite(snapshotMs) && leaseExpiresAtMs <= snapshotMs) {
            staleLeases += 1;
          }
        }
      }

      return {
        worker_running: activeRunningJobs > 0,
        queue_depth: queueDepth,
        running_depth: runningDepth,
        queue_work_items: queueWorkItems,
        running_work_items: runningWorkItems,
        oldest_queued_created_at: oldestQueuedCreatedAt,
        oldest_queued_age_ms: oldestQueuedAgeMs,
        oldest_running_started_at: oldestRunningStartedAt,
        oldest_running_age_ms: oldestRunningAgeMs,
        stale_leases: staleLeases,
        by_scope: byScope,
      };
    } catch (error) {
      console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
        action: 'get_queue_health_snapshot',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'get_queue_health_snapshot',
      scopes: [...QUEUED_INGESTION_SCOPES],
      reason: 'oracle_only_primary',
    });
    return null;
  }
  const serviceDb = getServiceSupabaseClient();
  if (!serviceDb) {
    return null;
  }

  const [resolvedQueuedDepth, resolvedRunningDepth, resolvedQueuedWorkItems, resolvedRunningWorkItems] = await Promise.all([
    countQueueDepthForAdmission(serviceDb, { statuses: ['queued'] }),
    countQueueDepthForAdmission(serviceDb, { statuses: ['queued', 'running'] }),
    countQueueWorkItemsForAdmission(serviceDb, { statuses: ['queued'] }),
    countQueueWorkItemsForAdmission(serviceDb, { statuses: ['running'] }),
  ]);

  const staleLeaseResult = await serviceDb
    .from('ingestion_jobs')
    .select('id', { head: true, count: 'exact' })
    .eq('status', 'running')
    .not('lease_expires_at', 'is', null)
    .lt('lease_expires_at', input.snapshotAtIso);
  if (staleLeaseResult.error) throw staleLeaseResult.error;

  const byScopeResult = await serviceDb
    .from('ingestion_jobs')
    .select('scope, status, payload, created_at, started_at, lease_expires_at, last_heartbeat_at')
    .in('status', ['queued', 'running'])
    .in('scope', [...QUEUED_INGESTION_SCOPES]);
  if (byScopeResult.error) throw byScopeResult.error;

  const byScope: Record<string, {
    queued: number;
    running: number;
    queued_work_items: number;
    running_work_items: number;
    oldest_queued_age_ms: number | null;
    oldest_running_age_ms: number | null;
    priority: string;
  }> = {};
  for (const scope of QUEUED_INGESTION_SCOPES) {
    byScope[scope] = {
      queued: 0,
      running: 0,
      queued_work_items: 0,
      running_work_items: 0,
      oldest_queued_age_ms: null,
      oldest_running_age_ms: null,
      priority: getQueuePriorityTierForScope(scope),
    };
  }

  let oldestQueuedCreatedAt: string | null = null;
  let oldestQueuedAgeMs: number | null = null;
  let oldestRunningStartedAt: string | null = null;
  let oldestRunningAgeMs: number | null = null;
  let activeRunningJobs = 0;
  for (const row of byScopeResult.data || []) {
    const normalized = row as {
      scope?: string;
      status?: string;
      created_at?: string | null;
      started_at?: string | null;
      lease_expires_at?: string | null;
      last_heartbeat_at?: string | null;
      payload?: unknown;
    };
    const scope = String(normalized.scope || '').trim();
    const status = String(normalized.status || '').trim();
    if (!isQueuedIngestionScope(scope) || !byScope[scope]) continue;

    if (status === 'queued') {
      byScope[scope].queued += 1;
      byScope[scope].queued_work_items += getQueuedJobWorkItemCount({
        scope,
        payload: normalized.payload && typeof normalized.payload === 'object' && !Array.isArray(normalized.payload)
          ? normalized.payload as Record<string, unknown>
          : null,
      });
      const createdAt = typeof normalized.created_at === 'string' ? normalized.created_at : null;
      const createdAtMs = createdAt ? Date.parse(createdAt) : Number.NaN;
      if (createdAt && Number.isFinite(createdAtMs) && Number.isFinite(snapshotMs)) {
        const ageMs = Math.max(0, snapshotMs - createdAtMs);
        if (oldestQueuedAgeMs == null || ageMs > oldestQueuedAgeMs) {
          oldestQueuedAgeMs = ageMs;
          oldestQueuedCreatedAt = createdAt;
        }
        if (byScope[scope].oldest_queued_age_ms == null || ageMs > byScope[scope].oldest_queued_age_ms) {
          byScope[scope].oldest_queued_age_ms = ageMs;
        }
      }
      continue;
    }

    if (status === 'running') {
      byScope[scope].running += 1;
      byScope[scope].running_work_items += getQueuedJobWorkItemCount({
        scope,
        payload: normalized.payload && typeof normalized.payload === 'object' && !Array.isArray(normalized.payload)
          ? normalized.payload as Record<string, unknown>
          : null,
      });
      const startedAt = typeof normalized.started_at === 'string' ? normalized.started_at : null;
      const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
      if (startedAt && Number.isFinite(startedAtMs) && Number.isFinite(snapshotMs)) {
        const ageMs = Math.max(0, snapshotMs - startedAtMs);
        if (oldestRunningAgeMs == null || ageMs > oldestRunningAgeMs) {
          oldestRunningAgeMs = ageMs;
          oldestRunningStartedAt = startedAt;
        }
        if (byScope[scope].oldest_running_age_ms == null || ageMs > byScope[scope].oldest_running_age_ms) {
          byScope[scope].oldest_running_age_ms = ageMs;
        }
      }
      const leaseExpiresAt = typeof normalized.lease_expires_at === 'string' ? normalized.lease_expires_at : null;
      const leaseExpiresAtMs = leaseExpiresAt ? Date.parse(leaseExpiresAt) : Number.NaN;
      const heartbeatAt = typeof normalized.last_heartbeat_at === 'string' ? normalized.last_heartbeat_at : null;
      const heartbeatAtMs = heartbeatAt ? Date.parse(heartbeatAt) : Number.NaN;
      const hasFreshLease = leaseExpiresAt && Number.isFinite(leaseExpiresAtMs) && Number.isFinite(snapshotMs) && leaseExpiresAtMs > snapshotMs;
      const hasFreshHeartbeat = heartbeatAt && Number.isFinite(heartbeatAtMs) && Number.isFinite(snapshotMs)
        && (snapshotMs - heartbeatAtMs) <= input.runningHeartbeatFreshMs;
      if (hasFreshLease || hasFreshHeartbeat) {
        activeRunningJobs += 1;
      }
    }
  }

  return {
    worker_running: activeRunningJobs > 0,
    queue_depth: resolvedQueuedDepth,
    running_depth: Math.max(0, resolvedRunningDepth - resolvedQueuedDepth),
    queue_work_items: resolvedQueuedWorkItems,
    running_work_items: resolvedRunningWorkItems,
    oldest_queued_created_at: oldestQueuedCreatedAt,
    oldest_queued_age_ms: oldestQueuedAgeMs,
    oldest_running_started_at: oldestRunningStartedAt,
    oldest_running_age_ms: oldestRunningAgeMs,
    stale_leases: Number(staleLeaseResult.count || 0),
    by_scope: byScope,
  };
}

const queuedWorkerId = `ingestion-worker-${process.pid}`;
let activeQueuedClaimedJobs = 0;
let activeTranscriptBoundQueuedClaimedJobs = 0;

function isTranscriptBoundQueuedScope(scope: string | null | undefined) {
  const normalizedScope = String(scope || '').trim();
  return normalizedScope === 'search_video_generate'
    || normalizedScope === 'manual_refresh_selection'
    || normalizedScope === 'source_item_unlock_generation'
    || normalizedScope === 'all_active_subscriptions';
}

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
  const isPublicBlueprintTagsRoute = req.method === 'GET' && req.path === '/api/blueprint-tags';
  const isPublicBlueprintCommentsRoute = req.method === 'GET' && /^\/api\/blueprints\/[^/]+\/comments$/.test(req.path);
  const isPublicBlueprintChannelRoute = req.method === 'GET' && /^\/api\/blueprints\/[^/]+\/channel$/.test(req.path);
  const isPublicBlueprintReadRoute = req.method === 'GET' && /^\/api\/blueprints\/[^/]+$/.test(req.path);
  const isPublicProfileReadRoute = req.method === 'GET' && /^\/api\/profile\/[^/]+$/.test(req.path);
  const isPublicProfileCommentsRoute = req.method === 'GET' && /^\/api\/profile\/[^/]+\/comments$/.test(req.path);
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
    || isPublicBlueprintTagsRoute
    || isPublicBlueprintCommentsRoute
    || isPublicBlueprintChannelRoute
    || isPublicBlueprintReadRoute
    || isPublicProfileReadRoute
    || isPublicProfileCommentsRoute
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
  readFeedRows: ({ db, userId, limit, sourceItemIds, requireBlueprint }: any) => listProductFeedRowsForUserOracleFirst(db, {
    userId,
    limit,
    sourceItemIds,
    requireBlueprint,
  }),
  readSourceRows: ({ db, sourceIds }: any) => listProductSourceItemsOracleFirst(db, {
    ids: sourceIds,
    action: 'profile_history_read_source_rows',
  }),
  readUnlockRows: ({ db, sourceIds }: any) => getSourceItemUnlocksBySourceItemIdsOracleFirst(db, sourceIds),
  readChannelCandidateRows: ({ db, feedItemIds, statuses }: any) => listChannelCandidateRowsOracleFirst(db, {
    feedItemIds,
    statuses,
  }),
  readBlueprintRows: async ({ blueprintIds }: any) => ensureOracleBlueprintRowsByIds(blueprintIds || []),
  readVariantRows: async ({ sourceIds }: any) => {
    const normalizedSourceIds = [...new Set(
      (Array.isArray(sourceIds) ? sourceIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    )];
    const rows = await Promise.all(
      normalizedSourceIds.map(async (sourceItemId) => (
        await listVariantsForSourceItem(sourceItemId)
      )),
    );
    return rows
      .flat()
      .filter((row: any) => String(row?.status || '').trim().toLowerCase() === 'ready');
  },
});

registerProfileReadRoutes(app, {
  getServiceSupabaseClient,
  getProfileRow: async ({ userId }) => {
    const profile = await ensureOracleProfileReadStateByUserId(userId);
    return profile || null;
  },
  syncProfileRowFromSupabase: async ({ userId }) => {
    if (!oracleControlPlane) {
      throw new Error('Oracle control plane is not configured');
    }
    const db = getServiceSupabaseClient();
    if (!db) {
      throw new Error('Service role client is not configured');
    }
    const synced = await syncOracleProfileRowFromSupabase({
      controlDb: oracleControlPlane,
      db,
      userId,
    });
    return synced ? mapProfileReadRouteRow(synced) : null;
  },
  updateOwnProfile: async ({ userId, updates }) => {
    if (!oracleControlPlane) {
      throw new Error('Oracle control plane is not configured');
    }
    const db = getServiceSupabaseClient();
    if (!db) {
      throw new Error('Service role client is not configured');
    }

    const patch: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'display_name')) {
      patch.display_name = updates.display_name ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'avatar_url')) {
      patch.avatar_url = updates.avatar_url ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'bio')) {
      patch.bio = updates.bio ?? null;
    }
    if (typeof updates.is_public === 'boolean') {
      patch.is_public = updates.is_public;
    }

    const { data, error } = await db
      .from('profiles')
      .update(patch)
      .eq('user_id', userId)
      .select('id, user_id, display_name, avatar_url, bio, is_public, follower_count, following_count, unlocked_blueprints_count, created_at, updated_at')
      .maybeSingle();
    if (error) throw error;
    if (!data?.user_id) return null;

    const upserted = await upsertOracleProfileRow({
      controlDb: oracleControlPlane,
      row: mapProfileReadRouteRow(data as Record<string, unknown>),
    });
    return mapProfileReadRouteRow(upserted);
  },
  listProfileBlueprints: async ({ userId, limit }) => listProfileBlueprintListItems({ userId, limit }),
  listProfileLikedBlueprints: async ({ userId, limit }) => listProfileLikedBlueprintListItems({ userId, limit }),
  listProfileActivity: async ({ userId, limit }) => listProfileActivityItems({ userId, limit }),
});

registerWallRoutes(app, {
  getServiceSupabaseClient,
  normalizeTranscriptTruthStatus,
  readLikedBlueprintIds: async ({ userId, blueprintIds }: any) => listOracleLikedBlueprintIds({
    userId,
    blueprintIds,
  }),
  listBlueprintTagRows: ({ blueprintIds }: any) => listBlueprintTagRowsOracleAware(getServiceSupabaseClient()!, { blueprintIds }),
  readPublicFeedRows: ({ db, blueprintIds, state, limit, cursor, requireBlueprint }: any) => listPublicProductFeedRowsOracleFirst(db, {
    blueprintIds,
    state,
    limit,
    cursor,
    requireBlueprint,
  }),
  readFeedRows: ({ db, userId, limit, sourceItemIds, requireBlueprint }: any) => listProductFeedRowsForUserOracleFirst(db, {
    userId,
    limit,
    sourceItemIds,
    requireBlueprint,
  }),
  readChannelCandidateRows: ({ db, feedItemIds, statuses }: any) => listChannelCandidateRowsOracleFirst(db, {
    feedItemIds,
    statuses,
  }),
  readBlueprintRows: async ({ blueprintIds, limit, isPublic }: any) => {
    if (blueprintIds && blueprintIds.length > 0) {
      return ensureOracleBlueprintRowsByIds(blueprintIds);
    }
    if (!oracleControlPlane) return [];
    const rows = await listOracleBlueprintRows({
      controlDb: oracleControlPlane,
      isPublic: typeof isPublic === 'boolean' ? isPublic : true,
      limit,
    });
    const creatorProfiles = await ensureOracleProfileReadStateByUserIds(rows.map((row) => row.creator_user_id));
    const creatorProfileByUserId = new Map(creatorProfiles.map((row) => [row.user_id, row]));
    return rows.map((row) => mapBlueprintReadRouteRow(row, (() => {
      const creatorProfile = creatorProfileByUserId.get(row.creator_user_id);
      return creatorProfile
        ? {
            display_name: creatorProfile.display_name,
            avatar_url: creatorProfile.avatar_url,
          }
        : null;
    })()));
  },
  readProfileRows: async ({ userIds }: any) => ensureOracleProfileReadStateByUserIds(userIds || []),
  readFollowedTagSlugs: async ({ userId }: any) => {
    if (!oracleControlPlane) return [];
    return listOracleFollowedTagSlugs({
      controlDb: oracleControlPlane,
      userId,
      limit: 5000,
    });
  },
  readSourceRows: ({ db, sourceIds }: any) => listProductSourceItemsOracleFirst(db, {
    ids: sourceIds,
    action: 'wall_feed_read_source_rows',
  }),
  readUnlockRows: ({ db, sourceIds }: any) => getSourceItemUnlocksBySourceItemIdsOracleFirst(db, sourceIds),
  readActiveSubscriptions: ({ db, userId }: any) => listActiveSubscriptionsForUserOracleFirst(db, userId),
});

registerBlueprintCommentRoutes(app, {
  getServiceSupabaseClient,
  getBlueprintRow: async ({ blueprintId }) => getOracleBlueprintRouteRowById(blueprintId),
  readBlueprintRows: async ({ blueprintIds }) => ensureOracleBlueprintRowsByIds(blueprintIds || []),
  listBlueprintCommentRows: ({ blueprintId, sortMode, limit }) => {
    if (!oracleControlPlane) {
      throw new Error('Oracle control plane is not configured');
    }
    return listOracleBlueprintCommentRows({
      controlDb: oracleControlPlane,
      blueprintId,
      sortMode,
      limit,
    });
  },
  createBlueprintCommentRow: ({ blueprintId, userId, content }) => {
    if (!oracleControlPlane) {
      throw new Error('Oracle control plane is not configured');
    }
    return insertOracleBlueprintCommentRow({
      controlDb: oracleControlPlane,
      row: {
        blueprint_id: blueprintId,
        user_id: userId,
        content,
      },
    });
  },
  listUserBlueprintCommentRows: ({ userId, limit }) => {
    if (!oracleControlPlane) {
      throw new Error('Oracle control plane is not configured');
    }
    return listOracleBlueprintCommentRowsByUser({
      controlDb: oracleControlPlane,
      userId,
      limit,
    });
  },
});

registerBlueprintLikeRoutes(app, {
  getBlueprintRow: async ({ blueprintId }) => getOracleBlueprintRouteRowById(blueprintId),
  getBlueprintLikeState: async ({ blueprintId, userId }) => getOracleBlueprintLikeState({
    blueprintId,
    userId,
  }),
  setBlueprintLiked: async ({ blueprintId, userId, liked }) => setOracleBlueprintLikeState({
    blueprintId,
    userId,
    liked,
  }),
  listBlueprintLikeStates: async ({ blueprintIds, userId }) => {
    const likedIds = userId
      ? new Set(await listOracleLikedBlueprintIds({
          userId,
          blueprintIds,
        }))
      : new Set<string>();
    return blueprintIds.map((blueprintId) => ({
      blueprint_id: blueprintId,
      user_liked: likedIds.has(blueprintId),
    }));
  },
  listLikedBlueprintIds: async ({ userId, limit }) => listOracleLikedBlueprintIds({
    userId,
    limit,
  }),
});

registerBlueprintReadRoutes(app, {
  getServiceSupabaseClient,
  getBlueprintRow: async ({ blueprintId }) => getOracleBlueprintRouteRowById(blueprintId),
  syncBlueprintReadState: async ({ blueprintId, userId }) => {
    if (!oracleControlPlane) {
      throw new Error('Oracle control plane is not configured');
    }
    const row = await readSupabaseBlueprintRouteRowById(blueprintId);
    if (!row) return null;
    if (row.creator_user_id !== userId) {
      throw new Error('Only the blueprint owner can sync blueprint state.');
    }

    const synced = await upsertOracleBlueprintRow({
      controlDb: oracleControlPlane,
      row,
    });
    const creatorProfile = await ensureOracleProfileReadStateByUserId(synced.creator_user_id);
    return mapBlueprintReadRouteRow(synced, creatorProfile
      ? {
          display_name: creatorProfile.display_name,
          avatar_url: creatorProfile.avatar_url,
        }
      : null);
  },
});

registerBlueprintTagReadRoutes(app, {
  getServiceSupabaseClient,
  listBlueprintTagRows: ({ blueprintIds }) => listBlueprintTagRowsOracleAware(getServiceSupabaseClient()!, { blueprintIds }),
  listBlueprintTagRowsByFilters: ({ tagIds, tagSlugs }) => listBlueprintTagRowsByFiltersOracleAware(getServiceSupabaseClient()!, {
    tagIds,
    tagSlugs,
  }),
});

registerTagRoutes(app, {
  listTags: ({ viewerUserId, limit }) => listOracleTagRouteItems({
    viewerUserId,
    limit,
  }),
  listTagsBySlugs: ({ slugs, viewerUserId }) => listOracleTagRouteItemsBySlugs({
    slugs,
    viewerUserId,
  }),
  listFollowedTags: ({ userId, limit }) => listOracleFollowedTagRouteItems({
    userId,
    limit,
  }),
  setTagFollowed: ({ tagId, userId, followed }) => setOracleTagFollowState({
    tagId,
    userId,
    followed,
  }),
  clearTagFollows: ({ tagIds, userId }) => clearOracleTagFollowStates({
    tagIds,
    userId,
  }),
  createTag: ({ slug, userId, follow }) => createOracleTag({
    slug,
    userId,
    follow,
  }),
});

app.get('/api/blueprints/:id/channel', async (req, res) => {
  const db = getServiceSupabaseClient();
  if (!db) {
    return res.status(500).json({
      ok: false,
      error_code: 'CONFIG_ERROR',
      message: 'Service role client is not configured',
      data: null,
    });
  }

  const blueprintId = String(req.params.id || '').trim();
  if (!blueprintId) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'Blueprint id required.',
      data: null,
    });
  }

  try {
    const publishedChannelByBlueprint = await fetchPublishedChannelSlugMapForBlueprints(db, [blueprintId]);
    return res.json({
      ok: true,
      error_code: null,
      message: 'blueprint channel',
      data: {
        blueprint_id: blueprintId,
        published_channel_slug: publishedChannelByBlueprint.get(blueprintId) || null,
      },
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Failed to load blueprint channel.',
      data: null,
    });
  }
});

const blueprintVariantsService = createBlueprintVariantsService({
  getServiceSupabaseClient,
  findLatestFeedRowByBlueprintId: async (blueprintId) => {
    const db = getServiceSupabaseClient();
    if (!db) return null;
    const rows = await listPublicProductFeedRowsOracleFirst(db, {
      blueprintIds: [blueprintId],
      limit: 1,
      requireBlueprint: true,
    });
    const row = rows[0];
    if (!row) return null;
    return {
      source_item_id: String(row.source_item_id || '').trim() || null,
      created_at: String(row.created_at || '').trim() || null,
    };
  },
});
const {
  claimVariantForGeneration: claimVariantForGenerationSupabase,
  markVariantReady: markVariantReadySupabase,
  markVariantFailed: markVariantFailedSupabase,
  listVariantsForSourceItem: listVariantsForSourceItemSupabase,
  findVariantsByBlueprintId: findVariantsByBlueprintIdSupabase,
  resolveVariantOrReady: resolveVariantOrReadySupabase,
} = blueprintVariantsService;

function logOracleGenerationStateError(input: {
  action: string;
  error: unknown;
  sourceItemId?: string | null;
  generationTier?: string | null;
  runId?: string | null;
  blueprintId?: string | null;
  videoId?: string | null;
}) {
  console.warn('[oracle-control-plane] generation_state_failed', JSON.stringify({
    action: input.action,
    source_item_id: String(input.sourceItemId || '').trim() || null,
    generation_tier: String(input.generationTier || '').trim() || null,
    run_id: String(input.runId || '').trim() || null,
    blueprint_id: String(input.blueprintId || '').trim() || null,
    video_id: String(input.videoId || '').trim() || null,
    error: input.error instanceof Error ? input.error.message : String(input.error),
  }));
}

function logOracleGenerationStateShadowError(input: {
  action: string;
  error: unknown;
  sourceItemId?: string | null;
  generationTier?: string | null;
  runId?: string | null;
  blueprintId?: string | null;
  videoId?: string | null;
}) {
  console.warn('[oracle-control-plane] generation_state_shadow_failed', JSON.stringify({
    action: input.action,
    source_item_id: String(input.sourceItemId || '').trim() || null,
    generation_tier: String(input.generationTier || '').trim() || null,
    run_id: String(input.runId || '').trim() || null,
    blueprint_id: String(input.blueprintId || '').trim() || null,
    video_id: String(input.videoId || '').trim() || null,
    error: input.error instanceof Error ? input.error.message : String(input.error),
  }));
}

async function resolveVariantOrReady(input: Parameters<typeof resolveVariantOrReadySupabase>[0]) {
  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      const durable = await resolveOracleGenerationVariantOrReady({
        controlDb: oracleControlPlane,
        sourceItemId: input.sourceItemId,
        generationTier: input.generationTier,
        jobId: input.jobId || null,
      });
      if (durable.state !== 'needs_generation' || oracleGenerationStatePrimaryEnabled) {
        return durable;
      }
    } catch (error) {
      logOracleGenerationStateError({
        action: 'resolve_variant_or_ready',
        sourceItemId: input.sourceItemId,
        generationTier: input.generationTier,
        error,
      });
      if (oracleGenerationStatePrimaryEnabled) {
        return { state: 'needs_generation', variant: null };
      }
    }
  }

  if (oracleGenerationStatePrimaryEnabled) {
    return { state: 'needs_generation', variant: null };
  }
  return resolveVariantOrReadySupabase(input);
}

async function claimVariantForGeneration(input: Parameters<typeof claimVariantForGenerationSupabase>[0]) {
  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      const durable = await claimOracleGenerationVariantForGeneration({
        controlDb: oracleControlPlane,
        sourceItemId: input.sourceItemId,
        generationTier: input.generationTier,
        userId: input.userId || null,
        jobId: input.jobId || null,
        targetStatus: input.targetStatus,
      });

      if (durable.outcome === 'claimed' && !oracleGenerationStatePrimaryEnabled) {
        try {
          await claimVariantForGenerationSupabase({
            ...input,
            variantId: durable.variant?.id || null,
          });
        } catch (error) {
          logOracleGenerationStateShadowError({
            action: 'claim_variant_for_generation',
            sourceItemId: input.sourceItemId,
            generationTier: input.generationTier,
            error,
          });
        }
      }

      return durable;
    } catch (error) {
      logOracleGenerationStateError({
        action: 'claim_variant_for_generation',
        sourceItemId: input.sourceItemId,
        generationTier: input.generationTier,
        error,
      });
    }
  }

  return claimVariantForGenerationSupabase(input);
}

async function markVariantReady(input: Parameters<typeof markVariantReadySupabase>[0]) {
  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      const durable = await markOracleGenerationVariantReady({
        controlDb: oracleControlPlane,
        sourceItemId: input.sourceItemId,
        generationTier: input.generationTier,
        blueprintId: input.blueprintId,
      });
      if (!oracleGenerationStatePrimaryEnabled) {
        try {
          await markVariantReadySupabase(input);
        } catch (error) {
          logOracleGenerationStateShadowError({
            action: 'mark_variant_ready',
            sourceItemId: input.sourceItemId,
            generationTier: input.generationTier,
            blueprintId: input.blueprintId,
            error,
          });
        }
      }
      return durable;
    } catch (error) {
      logOracleGenerationStateError({
        action: 'mark_variant_ready',
        sourceItemId: input.sourceItemId,
        generationTier: input.generationTier,
        blueprintId: input.blueprintId,
        error,
      });
    }
  }

  return markVariantReadySupabase(input);
}

async function markVariantFailed(input: Parameters<typeof markVariantFailedSupabase>[0]) {
  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      const durable = await markOracleGenerationVariantFailed({
        controlDb: oracleControlPlane,
        sourceItemId: input.sourceItemId,
        generationTier: input.generationTier,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      });
      if (!oracleGenerationStatePrimaryEnabled) {
        try {
          await markVariantFailedSupabase(input);
        } catch (error) {
          logOracleGenerationStateShadowError({
            action: 'mark_variant_failed',
            sourceItemId: input.sourceItemId,
            generationTier: input.generationTier,
            error,
          });
        }
      }
      return durable;
    } catch (error) {
      logOracleGenerationStateError({
        action: 'mark_variant_failed',
        sourceItemId: input.sourceItemId,
        generationTier: input.generationTier,
        error,
      });
    }
  }

  return markVariantFailedSupabase(input);
}

async function listVariantsForSourceItem(sourceItemId: string) {
  const normalizedSourceItemId = String(sourceItemId || '').trim();
  if (!normalizedSourceItemId) {
    return [] as Awaited<ReturnType<typeof listVariantsForSourceItemSupabase>>;
  }

  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      const durable = await listOracleGenerationVariantsForSourceItem({
        controlDb: oracleControlPlane,
        sourceItemId: normalizedSourceItemId,
      });
      if (durable.length > 0 || oracleGenerationStatePrimaryEnabled) {
        return durable as Awaited<ReturnType<typeof listVariantsForSourceItemSupabase>>;
      }
    } catch (error) {
      logOracleGenerationStateError({
        action: 'list_variants_for_source_item',
        sourceItemId: normalizedSourceItemId,
        error,
      });
    }
  }

  if (oracleGenerationStatePrimaryEnabled) {
    return [] as Awaited<ReturnType<typeof listVariantsForSourceItemSupabase>>;
  }
  return listVariantsForSourceItemSupabase(normalizedSourceItemId);
}

async function findVariantsByBlueprintId(blueprintId: string) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) return null;

  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      const durable = await findOracleGenerationVariantsByBlueprintId({
        controlDb: oracleControlPlane,
        blueprintId: normalizedBlueprintId,
      });
      if (durable || oracleGenerationStatePrimaryEnabled) {
        return durable;
      }
    } catch (error) {
      logOracleGenerationStateError({
        action: 'find_variants_by_blueprint_id',
        blueprintId: normalizedBlueprintId,
        error,
      });
    }
  }

  if (oracleGenerationStatePrimaryEnabled) {
    return null;
  }
  return findVariantsByBlueprintIdSupabase(normalizedBlueprintId);
}

async function startGenerationRun(
  db: ReturnType<typeof createClient>,
  input: Parameters<typeof startGenerationRunSupabase>[1],
) {
  const shouldShadowSupabase = !(oracleGenerationStateEnabled && oracleControlPlane && oracleGenerationStatePrimaryEnabled);
  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      clearOracleGenerationTraceSeqCursor(input.runId);
      await startOracleGenerationRun({
        controlDb: oracleControlPlane,
        runId: input.runId,
        userId: input.userId,
        sourceScope: input.sourceScope || null,
        sourceTag: input.sourceTag || null,
        videoId: input.videoId || null,
        videoUrl: input.videoUrl || null,
        modelPrimary: input.modelPrimary || null,
        reasoningEffort: input.reasoningEffort || null,
        traceVersion: input.traceVersion || null,
      });
    } catch (error) {
      logOracleGenerationStateError({
        action: 'start_generation_run',
        runId: input.runId,
        videoId: input.videoId || null,
        error,
      });
    }
  }

  if (!shouldShadowSupabase) {
    return null;
  }

  try {
    return await startGenerationRunSupabase(db, input);
  } catch (error) {
    if (oracleGenerationStateEnabled && oracleControlPlane) {
      logOracleGenerationStateShadowError({
        action: 'start_generation_run',
        runId: input.runId,
        videoId: input.videoId || null,
        error,
      });
      return null;
    }
    throw error;
  }
}

async function updateGenerationModelInfo(
  db: ReturnType<typeof createClient>,
  input: Parameters<typeof updateGenerationModelInfoSupabase>[1],
) {
  const shouldShadowSupabase = !(oracleGenerationStateEnabled && oracleControlPlane && oracleGenerationStatePrimaryEnabled);
  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      await updateOracleGenerationRunModelInfo({
        controlDb: oracleControlPlane,
        runId: input.runId,
        modelPrimary: input.modelPrimary,
        modelUsed: input.modelUsed,
        fallbackUsed: input.fallbackUsed,
        fallbackModel: input.fallbackModel,
        reasoningEffort: input.reasoningEffort,
      });
    } catch (error) {
      logOracleGenerationStateError({
        action: 'update_generation_model_info',
        runId: input.runId,
        error,
      });
    }
  }

  if (!shouldShadowSupabase) {
    return null;
  }

  try {
    return await updateGenerationModelInfoSupabase(db, input);
  } catch (error) {
    if (oracleGenerationStateEnabled && oracleControlPlane) {
      logOracleGenerationStateShadowError({
        action: 'update_generation_model_info',
        runId: input.runId,
        error,
      });
      return null;
    }
    throw error;
  }
}

async function attachBlueprintToRun(
  db: ReturnType<typeof createClient>,
  input: Parameters<typeof attachBlueprintToRunSupabase>[1],
) {
  const shouldShadowSupabase = !(oracleGenerationStateEnabled && oracleControlPlane && oracleGenerationStatePrimaryEnabled);
  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      await attachOracleBlueprintToGenerationRun({
        controlDb: oracleControlPlane,
        runId: input.runId,
        blueprintId: input.blueprintId || '',
      });
    } catch (error) {
      logOracleGenerationStateError({
        action: 'attach_blueprint_to_run',
        runId: input.runId,
        blueprintId: input.blueprintId || null,
        error,
      });
    }
  }

  if (!shouldShadowSupabase) {
    return null;
  }

  try {
    return await attachBlueprintToRunSupabase(db, input);
  } catch (error) {
    if (oracleGenerationStateEnabled && oracleControlPlane) {
      logOracleGenerationStateShadowError({
        action: 'attach_blueprint_to_run',
        runId: input.runId,
        blueprintId: input.blueprintId || null,
        error,
      });
      return null;
    }
    throw error;
  }
}

async function finalizeGenerationRunSuccess(
  db: ReturnType<typeof createClient>,
  input: Parameters<typeof finalizeGenerationRunSuccessSupabase>[1],
) {
  const shouldShadowSupabase = !(oracleGenerationStateEnabled && oracleControlPlane && oracleGenerationStatePrimaryEnabled);
  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      await finalizeOracleGenerationRunSuccess({
        controlDb: oracleControlPlane,
        runId: input.runId,
        qualityOk: input.qualityOk,
        qualityIssues: input.qualityIssues,
        qualityRetriesUsed: input.qualityRetriesUsed,
        qualityFinalMode: input.qualityFinalMode,
        traceVersion: input.traceVersion || null,
        summary: input.summary || null,
      });
    } catch (error) {
      logOracleGenerationStateError({
        action: 'finalize_generation_run_success',
        runId: input.runId,
        error,
      });
    }
  }

  if (!shouldShadowSupabase) {
    return null;
  }

  try {
    return await finalizeGenerationRunSuccessSupabase(db, input);
  } catch (error) {
    if (oracleGenerationStateEnabled && oracleControlPlane) {
      logOracleGenerationStateShadowError({
        action: 'finalize_generation_run_success',
        runId: input.runId,
        error,
      });
      return null;
    }
    throw error;
  }
}

async function finalizeGenerationRunFailure(
  db: ReturnType<typeof createClient>,
  input: Parameters<typeof finalizeGenerationRunFailureSupabase>[1],
) {
  const shouldShadowSupabase = !(oracleGenerationStateEnabled && oracleControlPlane && oracleGenerationStatePrimaryEnabled);
  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      await finalizeOracleGenerationRunFailure({
        controlDb: oracleControlPlane,
        runId: input.runId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        traceVersion: input.traceVersion || null,
        summary: input.summary || null,
      });
    } catch (error) {
      logOracleGenerationStateError({
        action: 'finalize_generation_run_failure',
        runId: input.runId,
        error,
      });
    }
  }

  if (!shouldShadowSupabase) {
    return null;
  }

  try {
    return await finalizeGenerationRunFailureSupabase(db, input);
  } catch (error) {
    if (oracleGenerationStateEnabled && oracleControlPlane) {
      logOracleGenerationStateShadowError({
        action: 'finalize_generation_run_failure',
        runId: input.runId,
        error,
      });
      return null;
    }
    throw error;
  }
}

async function getGenerationRunByRunId(
  db: ReturnType<typeof createClient>,
  runId: string,
) {
  const normalizedRunId = String(runId || '').trim();
  if (!normalizedRunId) return null;

  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      const durable = await getOracleGenerationRunByRunId({
        controlDb: oracleControlPlane,
        runId: normalizedRunId,
      });
      if (durable) return durable;
    } catch (error) {
      logOracleGenerationStateError({
        action: 'get_generation_run_by_run_id',
        runId: normalizedRunId,
        error,
      });
    }
  }

  if (oracleGenerationStatePrimaryEnabled) {
    return null;
  }
  return getGenerationRunByRunIdSupabase(db, normalizedRunId);
}

async function getLatestGenerationRunByBlueprintId(
  db: ReturnType<typeof createClient>,
  blueprintId: string,
) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) return null;

  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      const durable = await getOracleLatestGenerationRunByBlueprintId({
        controlDb: oracleControlPlane,
        blueprintId: normalizedBlueprintId,
      });
      if (durable) return durable;
    } catch (error) {
      logOracleGenerationStateError({
        action: 'get_latest_generation_run_by_blueprint_id',
        blueprintId: normalizedBlueprintId,
        error,
      });
    }
  }

  if (oracleGenerationStatePrimaryEnabled) {
    return null;
  }
  return getLatestGenerationRunByBlueprintIdSupabase(db, normalizedBlueprintId);
}

async function listFailedGenerationRunsByVideoIdOracleFirst(
  db: ReturnType<typeof createClient>,
  videoId: string,
) {
  const normalizedVideoId = String(videoId || '').trim();
  if (!normalizedVideoId) return [] as Array<{
    updated_at: string | null;
    error_code: string | null;
    error_message: string | null;
  }>;

  if (oracleGenerationStateEnabled && oracleControlPlane) {
    try {
      const durable = await listOracleFailedGenerationRunsByVideoId({
        controlDb: oracleControlPlane,
        videoId: normalizedVideoId,
      });
      if (durable.length > 0 || oracleGenerationStatePrimaryEnabled) {
        return durable.map((row) => ({
          updated_at: String(row.updated_at || '').trim() || null,
          error_code: String(row.error_code || '').trim() || null,
          error_message: String(row.error_message || '').trim() || null,
        }));
      }
    } catch (error) {
      logOracleGenerationStateError({
        action: 'list_failed_generation_runs_by_video_id',
        videoId: normalizedVideoId,
        error,
      });
    }
  }

  if (oracleGenerationStatePrimaryEnabled) {
    return [] as Array<{
      updated_at: string | null;
      error_code: string | null;
      error_message: string | null;
    }>;
  }
  const { data, error } = await db
    .from('generation_runs')
    .select('updated_at, error_code, error_message')
    .eq('video_id', normalizedVideoId)
    .eq('status', 'failed');
  if (error) throw error;
  return (data || []).map((row: any) => ({
    updated_at: String(row?.updated_at || '').trim() || null,
    error_code: String(row?.error_code || '').trim() || null,
    error_message: String(row?.error_message || '').trim() || null,
  }));
}
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
  getBlueprintAvailabilityForVideo: getBlueprintAvailabilityForVideoOracleFirst,
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
  countQueueDepth: countQueueDepthForAdmission,
  countQueueWorkItems: countQueueWorkItemsForAdmission,
  emitGenerationStartedNotification,
  getGenerationNotificationLinkPath,
  scheduleQueuedIngestionProcessing,
  enqueueIngestionJob: enqueueIngestionJobWithMirror,
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
  upsertFeedItemWithBlueprint,
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
  listBlueprintYouTubeComments: async ({ db, blueprintId, sortMode }) => (
    blueprintYouTubeCommentsService.listBlueprintYouTubeComments({
      db,
      blueprintId,
      sortMode,
    })
  ),
  getBlueprintRow: async ({ blueprintId }) => getOracleBlueprintRouteRowById(blueprintId),
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

function normalizeRouteString(value: unknown) {
  return String(value || '').trim();
}

function normalizeRouteNullableString(value: unknown) {
  const normalized = normalizeRouteString(value);
  return normalized || null;
}

function normalizeRouteBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = normalizeRouteString(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 't';
}

function normalizeRouteInt(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : 0;
}

function mapBlueprintReadRouteRow(row: Record<string, unknown>, creatorProfile?: {
  display_name: string | null;
  avatar_url: string | null;
} | null) {
  return {
    id: normalizeRouteString(row.id),
    inventory_id: normalizeRouteNullableString(row.inventory_id),
    creator_user_id: normalizeRouteString(row.creator_user_id),
    title: normalizeRouteString(row.title),
    sections_json: (row.sections_json ?? null) as unknown,
    mix_notes: normalizeRouteNullableString(row.mix_notes),
    review_prompt: normalizeRouteNullableString(row.review_prompt),
    banner_url: normalizeRouteNullableString(row.banner_url),
    llm_review: normalizeRouteNullableString(row.llm_review),
    preview_summary: normalizeRouteNullableString(row.preview_summary),
    is_public: normalizeRouteBoolean(row.is_public),
    likes_count: normalizeRouteInt(row.likes_count),
    source_blueprint_id: normalizeRouteNullableString(row.source_blueprint_id),
    created_at: normalizeRouteString(row.created_at),
    updated_at: normalizeRouteString(row.updated_at),
    creator_profile: creatorProfile || null,
  };
}

function mapProfileReadRouteRow(row: Record<string, unknown>) {
  return {
    id: normalizeRouteNullableString(row.id ?? row.profile_id),
    user_id: normalizeRouteString(row.user_id),
    display_name: normalizeRouteNullableString(row.display_name),
    avatar_url: normalizeRouteNullableString(row.avatar_url),
    bio: normalizeRouteNullableString(row.bio),
    is_public: normalizeRouteBoolean(row.is_public),
    follower_count: normalizeRouteInt(row.follower_count),
    following_count: normalizeRouteInt(row.following_count),
    unlocked_blueprints_count: normalizeRouteInt(row.unlocked_blueprints_count),
    created_at: normalizeRouteString(row.created_at),
    updated_at: normalizeRouteString(row.updated_at),
  };
}

async function ensureOracleProfileReadStateByUserId(userId: string) {
  const normalizedUserId = normalizeRouteString(userId);
  if (!oracleControlPlane || !normalizedUserId) return null;

  const existing = await getOracleProfileRow({
    controlDb: oracleControlPlane,
    userId: normalizedUserId,
  });
  if (existing) return mapProfileReadRouteRow(existing);

  const db = getServiceSupabaseClient();
  if (!db) return null;
  const synced = await syncOracleProfileRowFromSupabase({
    controlDb: oracleControlPlane,
    db,
    userId: normalizedUserId,
  });
  return synced ? mapProfileReadRouteRow(synced) : null;
}

async function ensureOracleProfileReadStateByUserIds(userIds: string[]) {
  const normalizedUserIds = [...new Set((userIds || []).map((value) => normalizeRouteString(value)).filter(Boolean))];
  if (!oracleControlPlane || normalizedUserIds.length === 0) return [] as Array<ReturnType<typeof mapProfileReadRouteRow>>;

  const existingRows = await listOracleProfileRows({
    controlDb: oracleControlPlane,
    userIds: normalizedUserIds,
    limit: normalizedUserIds.length,
  });
  const byUserId = new Map(existingRows.map((row) => [row.user_id, row]));

  const missingUserIds = normalizedUserIds.filter((userId) => !byUserId.has(userId));
  if (missingUserIds.length > 0) {
    const db = getServiceSupabaseClient();
    if (db) {
      for (const userId of missingUserIds) {
        const synced = await syncOracleProfileRowFromSupabase({
          controlDb: oracleControlPlane,
          db,
          userId,
        });
        if (synced) byUserId.set(userId, synced);
      }
    }
  }

  return normalizedUserIds
    .map((userId) => byUserId.get(userId))
    .filter(Boolean)
    .map((row) => mapProfileReadRouteRow(row as Record<string, unknown>));
}

async function ensureOracleBlueprintRowsByIds(blueprintIds: string[]) {
  const normalizedBlueprintIds = [...new Set((blueprintIds || []).map((value) => normalizeRouteString(value)).filter(Boolean))];
  if (!oracleControlPlane || normalizedBlueprintIds.length === 0) return [] as Array<ReturnType<typeof mapBlueprintReadRouteRow>>;

  const existingRows = await listOracleBlueprintRows({
    controlDb: oracleControlPlane,
    blueprintIds: normalizedBlueprintIds,
    limit: normalizedBlueprintIds.length,
  });
  const byBlueprintId = new Map(existingRows.map((row) => [row.id, row]));
  const rows = normalizedBlueprintIds
    .map((blueprintId) => byBlueprintId.get(blueprintId))
    .filter(Boolean);
  const creatorProfiles = await ensureOracleProfileReadStateByUserIds(
    rows.map((row) => String((row as { creator_user_id?: unknown }).creator_user_id || '')).filter(Boolean),
  );
  const creatorProfileByUserId = new Map(creatorProfiles.map((row) => [row.user_id, row]));

  return rows.map((row) => {
    const creatorUserId = normalizeRouteString((row as { creator_user_id?: unknown }).creator_user_id);
    const creatorProfile = creatorProfileByUserId.get(creatorUserId);
    return mapBlueprintReadRouteRow(row as Record<string, unknown>, creatorProfile
      ? {
          display_name: creatorProfile.display_name,
          avatar_url: creatorProfile.avatar_url,
        }
      : null);
  });
}

async function getOracleBlueprintRouteRowById(blueprintId: string) {
  const normalizedBlueprintId = normalizeRouteString(blueprintId);
  if (!oracleControlPlane || !normalizedBlueprintId) return null;

  const blueprint = await getOracleBlueprintRow({
    controlDb: oracleControlPlane,
    blueprintId: normalizedBlueprintId,
  });
  if (!blueprint) return null;

  const creatorProfile = await ensureOracleProfileReadStateByUserId(blueprint.creator_user_id);
  return mapBlueprintReadRouteRow(blueprint, creatorProfile
    ? {
        display_name: creatorProfile.display_name,
        avatar_url: creatorProfile.avatar_url,
      }
    : null);
}

async function listOracleBlueprintRowsByCreatorUserId(input: {
  creatorUserId: string;
  isPublic?: boolean;
  limit?: number;
}) {
  const creatorUserId = normalizeRouteString(input.creatorUserId);
  if (!oracleControlPlane || !creatorUserId) return [] as Array<ReturnType<typeof mapBlueprintReadRouteRow>>;

  const rows = await listOracleBlueprintRows({
    controlDb: oracleControlPlane,
    creatorUserId,
    isPublic: input.isPublic,
    limit: input.limit,
  });
  if (rows.length === 0) return [];

  const creatorProfile = await ensureOracleProfileReadStateByUserId(creatorUserId);
  return rows.map((row) => mapBlueprintReadRouteRow(row, creatorProfile
    ? {
        display_name: creatorProfile.display_name,
        avatar_url: creatorProfile.avatar_url,
      }
    : null));
}

async function readSupabaseBlueprintRouteRowById(blueprintId: string) {
  const db = getServiceSupabaseClient();
  if (!db) return null;
  const { data, error } = await db
    .from('blueprints')
    .select('id, inventory_id, creator_user_id, title, sections_json, mix_notes, review_prompt, banner_url, llm_review, preview_summary, is_public, likes_count, source_blueprint_id, created_at, updated_at')
    .eq('id', blueprintId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBlueprintReadRouteRow(data as Record<string, unknown>) : null;
}

async function buildSourceChannelByBlueprintId(blueprintIds: string[]) {
  const db = getServiceSupabaseClient();
  const normalizedBlueprintIds = [...new Set((blueprintIds || []).map((value) => normalizeRouteString(value)).filter(Boolean))];
  const result = new Map<string, { title: string | null; avatar_url: string | null }>();
  if (!db || normalizedBlueprintIds.length === 0) return result;

  const feedRows = await listPublicProductFeedRowsOracleFirst(db, {
    blueprintIds: normalizedBlueprintIds,
    limit: 5000,
  });
  const sourceItemIdByBlueprintId = new Map<string, string>();
  for (const row of feedRows) {
    const blueprintId = normalizeRouteString((row as { blueprint_id?: unknown }).blueprint_id);
    const sourceItemId = normalizeRouteString((row as { source_item_id?: unknown }).source_item_id);
    if (!blueprintId || !sourceItemId || sourceItemIdByBlueprintId.has(blueprintId)) continue;
    sourceItemIdByBlueprintId.set(blueprintId, sourceItemId);
  }

  const sourceRows = await listProductSourceItemsOracleFirst(db, {
    ids: [...new Set(Array.from(sourceItemIdByBlueprintId.values()))],
    action: 'profile_route_source_channel_lookup',
  });
  const sourceById = new Map(sourceRows.map((row: any) => [String(row.id || '').trim(), row]));

  for (const [blueprintId, sourceItemId] of sourceItemIdByBlueprintId.entries()) {
    const source = sourceById.get(sourceItemId);
    const metadata = source && typeof source.metadata === 'object' && source.metadata !== null
      ? source.metadata as Record<string, unknown>
      : null;
    const metadataTitle =
      metadata && typeof metadata.source_channel_title === 'string'
        ? String(metadata.source_channel_title || '').trim() || null
        : (
          metadata && typeof metadata.channel_title === 'string'
            ? String(metadata.channel_title || '').trim() || null
            : null
        );
    const metadataAvatar =
      metadata && typeof metadata.source_channel_avatar_url === 'string'
        ? String(metadata.source_channel_avatar_url || '').trim() || null
        : (
          metadata && typeof metadata.channel_avatar_url === 'string'
            ? String(metadata.channel_avatar_url || '').trim() || null
            : null
        );
    result.set(blueprintId, {
      title: String(source?.source_channel_title || '').trim() || metadataTitle || null,
      avatar_url: metadataAvatar || null,
    });
  }

  return result;
}

async function listProfileBlueprintListItems(input: {
  userId: string;
  limit?: number;
}) {
  const blueprints = await listOracleBlueprintRowsByCreatorUserId({
    creatorUserId: input.userId,
    isPublic: true,
    limit: input.limit,
  });
  const sourceChannelByBlueprintId = await buildSourceChannelByBlueprintId(blueprints.map((row) => row.id));
  return blueprints.map((blueprint) => ({
    id: blueprint.id,
    title: blueprint.title,
    creator_user_id: blueprint.creator_user_id,
    likes_count: blueprint.likes_count,
    created_at: blueprint.created_at,
    creator_profile: blueprint.creator_profile,
    source_channel: sourceChannelByBlueprintId.get(blueprint.id) || null,
  }));
}

async function listOracleTagRouteItems(input: {
  viewerUserId: string | null;
  limit?: number;
}) {
  if (!oracleControlPlane) return [] as Array<{
    id: string;
    slug: string;
    follower_count: number;
    created_at: string;
    is_following?: boolean;
  }>;

  const rows = await listOracleTagRows({
    controlDb: oracleControlPlane,
    limit: input.limit,
  });
  const viewerUserId = normalizeRouteString(input.viewerUserId);
  const followedIds = viewerUserId
    ? new Set((await listOracleTagFollowRows({
        controlDb: oracleControlPlane,
        userId: viewerUserId,
        limit: 5000,
      })).map((row) => normalizeRouteString(row.tag_id)).filter(Boolean))
    : new Set<string>();

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    follower_count: row.follower_count,
    created_at: row.created_at,
    is_following: viewerUserId ? followedIds.has(row.id) : undefined,
  }));
}

async function listOracleTagRouteItemsBySlugs(input: {
  slugs: string[];
  viewerUserId: string | null;
}) {
  if (!oracleControlPlane) return [] as Array<{
    id: string;
    slug: string;
    follower_count: number;
    created_at: string;
    is_following?: boolean;
  }>;

  const rows = await listOracleTagRows({
    controlDb: oracleControlPlane,
    slugs: input.slugs,
    limit: input.slugs.length,
  });
  const viewerUserId = normalizeRouteString(input.viewerUserId);
  const followedIds = viewerUserId
    ? new Set((await listOracleTagFollowRows({
        controlDb: oracleControlPlane,
        userId: viewerUserId,
        tagIds: rows.map((row) => row.id),
        limit: rows.length || 5000,
      })).map((row) => normalizeRouteString(row.tag_id)).filter(Boolean))
    : new Set<string>();

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    follower_count: row.follower_count,
    created_at: row.created_at,
    is_following: viewerUserId ? followedIds.has(row.id) : undefined,
  }));
}

async function listOracleFollowedTagRouteItems(input: {
  userId: string;
  limit?: number;
}) {
  if (!oracleControlPlane) return [] as Array<{
    id: string;
    slug: string;
    created_at: string;
  }>;

  const rows = await listOracleTagFollowRows({
    controlDb: oracleControlPlane,
    userId: input.userId,
    limit: input.limit,
  });

  return rows.map((row) => ({
    id: row.tag_id,
    slug: row.tag_slug,
    created_at: row.created_at,
  }));
}

async function createOracleTag(input: {
  slug: string;
  userId: string;
  follow?: boolean;
}) {
  const slug = normalizeRouteString(input.slug).toLowerCase();
  const userId = normalizeRouteString(input.userId);
  if (!oracleControlPlane || !slug || !userId) return null;

  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client is not configured');
  }

  let supabaseTag = null as null | {
    id: string;
    slug: string;
    follower_count: number | null;
    created_at: string;
  };

  const { data: existing, error: existingError } = await db
    .from('tags')
    .select('id, slug, follower_count, created_at')
    .eq('slug', slug)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    supabaseTag = existing;
  } else {
    const { data: created, error: createError } = await db
      .from('tags')
      .insert({
        slug,
        created_by: userId,
      })
      .select('id, slug, follower_count, created_at')
      .single();
    if (createError) throw createError;
    supabaseTag = created;
  }

  const tag = await upsertOracleTagRow({
    controlDb: oracleControlPlane,
    row: supabaseTag as Record<string, unknown>,
  });

  if (input.follow !== false) {
    return setOracleTagFollowState({
      tagId: tag.id,
      userId,
      followed: true,
    });
  }

  return {
    id: tag.id,
    slug: tag.slug,
    follower_count: tag.follower_count,
    created_at: tag.created_at,
    is_following: false,
  };
}

async function setOracleTagFollowState(input: {
  tagId: string;
  userId: string;
  followed: boolean;
}) {
  const tagId = normalizeRouteString(input.tagId);
  const userId = normalizeRouteString(input.userId);
  if (!oracleControlPlane || !tagId || !userId) return null;

  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client is not configured');
  }

  const tag = await getOracleTagRowById({
    controlDb: oracleControlPlane,
    tagId,
  }) || await syncOracleTagRowFromSupabaseById(tagId);
  if (!tag) return null;

  const existingFollow = await getOracleTagFollowRow({
    controlDb: oracleControlPlane,
    tagId,
    userId,
  });
  const nextFollowed = Boolean(input.followed);
  const previousFollowed = Boolean(existingFollow);

  if (previousFollowed === nextFollowed) {
    return {
      id: tag.id,
      slug: tag.slug,
      follower_count: tag.follower_count,
      created_at: tag.created_at,
      is_following: nextFollowed,
    };
  }

  if (nextFollowed) {
    const { error } = await db
      .from('tag_follows')
      .upsert({
        tag_id: tag.id,
        user_id: userId,
      }, {
        onConflict: 'tag_id,user_id',
      });
    if (error) throw error;
  } else {
    const { error } = await db
      .from('tag_follows')
      .delete()
      .eq('tag_id', tag.id)
      .eq('user_id', userId);
    if (error) throw error;
  }

  if (nextFollowed) {
    await upsertOracleTagFollowRow({
      controlDb: oracleControlPlane,
      row: {
        tag_id: tag.id,
        tag_slug: tag.slug,
        user_id: userId,
      },
    });
  } else {
    await deleteOracleTagFollowRow({
      controlDb: oracleControlPlane,
      tagId: tag.id,
      userId,
    });
  }

  const refreshedTag = await syncOracleTagRowFromSupabaseById(tag.id)
    || await getOracleTagRowById({
      controlDb: oracleControlPlane,
      tagId: tag.id,
    });
  if (!refreshedTag) return null;

  return {
    id: refreshedTag.id,
    slug: refreshedTag.slug,
    follower_count: refreshedTag.follower_count,
    created_at: refreshedTag.created_at,
    is_following: nextFollowed,
  };
}

async function clearOracleTagFollowStates(input: {
  tagIds: string[];
  userId: string;
}) {
  const tagIds = [...new Set((input.tagIds || []).map((value) => normalizeRouteString(value)).filter(Boolean))];
  const userId = normalizeRouteString(input.userId);
  if (!oracleControlPlane || !userId || tagIds.length === 0) {
    return { removedCount: 0 };
  }

  let removedCount = 0;
  for (const tagId of tagIds) {
    const existing = await getOracleTagFollowRow({
      controlDb: oracleControlPlane,
      tagId,
      userId,
    });
    await setOracleTagFollowState({
      tagId,
      userId,
      followed: false,
    });
    if (existing) removedCount += 1;
  }

  return { removedCount };
}

async function listOracleLikedBlueprintIds(input: {
  userId: string;
  blueprintIds?: string[];
  limit?: number;
}) {
  const userId = normalizeRouteString(input.userId);
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => normalizeRouteString(value)).filter(Boolean))];
  if (!oracleControlPlane || !userId) return [] as string[];

  const rows = await listOracleBlueprintLikeRows({
    controlDb: oracleControlPlane,
    userId,
    blueprintIds,
    limit: blueprintIds.length > 0 ? blueprintIds.length : input.limit,
  });

  const ids = rows.map((row) => normalizeRouteString(row.blueprint_id)).filter(Boolean);
  if (blueprintIds.length === 0) return ids;
  const allowed = new Set(ids);
  return blueprintIds.filter((blueprintId) => allowed.has(blueprintId));
}

async function getOracleBlueprintLikeState(input: {
  blueprintId: string;
  userId: string | null;
}) {
  const blueprintId = normalizeRouteString(input.blueprintId);
  if (!oracleControlPlane || !blueprintId) return null;

  const blueprint = await getOracleBlueprintRow({
    controlDb: oracleControlPlane,
    blueprintId,
  });
  if (!blueprint) return null;

  const userId = normalizeRouteString(input.userId);
  const likeRow = userId
    ? await getOracleBlueprintLikeRow({
        controlDb: oracleControlPlane,
        blueprintId,
        userId,
      })
    : null;

  return {
    blueprint_id: blueprint.id,
    user_liked: Boolean(likeRow),
    likes_count: Math.max(0, Math.floor(Number(blueprint.likes_count || 0))),
  };
}

async function setOracleBlueprintLikeState(input: {
  blueprintId: string;
  userId: string;
  liked: boolean;
}) {
  const blueprintId = normalizeRouteString(input.blueprintId);
  const userId = normalizeRouteString(input.userId);
  if (!oracleControlPlane || !blueprintId || !userId) return null;

  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client is not configured');
  }

  const blueprint = await getOracleBlueprintRow({
    controlDb: oracleControlPlane,
    blueprintId,
  });
  if (!blueprint) return null;

  const existingLike = await getOracleBlueprintLikeRow({
    controlDb: oracleControlPlane,
    blueprintId,
    userId,
  });
  const nextLiked = Boolean(input.liked);
  const previousLiked = Boolean(existingLike);
  const previousCount = Math.max(0, Math.floor(Number(blueprint.likes_count || 0)));
  const nextCount = previousLiked === nextLiked
    ? previousCount
    : Math.max(0, previousCount + (nextLiked ? 1 : -1));

  if (previousLiked === nextLiked) {
    return {
      blueprint_id: blueprintId,
      user_liked: nextLiked,
      likes_count: previousCount,
    };
  }

  const nowIso = new Date().toISOString();
  const rollbackOracleMutation = async () => {
    if (nextLiked && !existingLike) {
      await deleteOracleBlueprintLikeRow({
        controlDb: oracleControlPlane,
        blueprintId,
        userId,
      });
    } else if (!nextLiked && existingLike) {
      await upsertOracleBlueprintLikeRow({
        controlDb: oracleControlPlane,
        row: {
          id: existingLike.id,
          blueprint_id: existingLike.blueprint_id,
          user_id: existingLike.user_id,
          created_at: existingLike.created_at,
          updated_at: existingLike.updated_at,
        },
      });
    }

    await upsertOracleBlueprintRow({
      controlDb: oracleControlPlane,
      row: {
        ...blueprint,
        likes_count: previousCount,
        updated_at: blueprint.updated_at,
      },
    });
  };

  try {
    if (nextLiked) {
      await upsertOracleBlueprintLikeRow({
        controlDb: oracleControlPlane,
        row: {
          blueprint_id: blueprintId,
          user_id: userId,
          created_at: existingLike?.created_at || nowIso,
          updated_at: nowIso,
        },
      });
    } else {
      await deleteOracleBlueprintLikeRow({
        controlDb: oracleControlPlane,
        blueprintId,
        userId,
      });
    }

    await upsertOracleBlueprintRow({
      controlDb: oracleControlPlane,
      row: {
        ...blueprint,
        likes_count: nextCount,
        updated_at: blueprint.updated_at,
      },
    });
  } catch (error) {
    await rollbackOracleMutation();
    throw error;
  }

  const { error: shadowError } = await db
    .from('blueprints')
    .update({
      likes_count: nextCount,
    })
    .eq('id', blueprintId);
  if (shadowError) {
    await rollbackOracleMutation();
    throw shadowError;
  }

  return {
    blueprint_id: blueprintId,
    user_liked: nextLiked,
    likes_count: nextCount,
  };
}

async function listProfileLikedBlueprintListItems(input: {
  userId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit || 12))));
  if (!oracleControlPlane) return [];

  const likes = await listOracleBlueprintLikeRows({
    controlDb: oracleControlPlane,
    userId: input.userId,
    limit,
  });
  if (!likes.length) return [];

  const blueprintIds = likes.map((row) => normalizeRouteString(row.blueprint_id)).filter(Boolean);
  const blueprints = await ensureOracleBlueprintRowsByIds(blueprintIds);
  const publicBlueprints = blueprints.filter((row) => row.is_public);
  const sourceChannelByBlueprintId = await buildSourceChannelByBlueprintId(publicBlueprints.map((row) => row.id));
  const byId = new Map(publicBlueprints.map((row) => [row.id, row]));

  return blueprintIds
    .map((blueprintId) => {
      const blueprint = byId.get(blueprintId);
      if (!blueprint) return null;
      const likeRow = likes.find((row) => normalizeRouteString(row.blueprint_id) === blueprintId) || null;
      return {
        id: blueprint.id,
        title: blueprint.title,
        creator_user_id: blueprint.creator_user_id,
        likes_count: blueprint.likes_count,
        created_at: blueprint.created_at,
        liked_at: likeRow ? normalizeRouteString(likeRow.created_at) || likeRow.created_at || null : null,
        creator_profile: blueprint.creator_profile,
        source_channel: sourceChannelByBlueprintId.get(blueprint.id) || null,
      };
    })
    .filter(Boolean);
}

async function listProfileActivityItems(input: {
  userId: string;
  limit?: number;
}) {
  const db = getServiceSupabaseClient();
  if (!db) throw new Error('Service role client is not configured');

  const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit || 12))));
  const [createdBlueprints, profileLikedBlueprints, comments] = await Promise.all([
    listProfileBlueprintListItems({ userId: input.userId, limit }),
    listProfileLikedBlueprintListItems({ userId: input.userId, limit }),
    oracleControlPlane
      ? listOracleBlueprintCommentRowsByUser({
          controlDb: oracleControlPlane,
          userId: input.userId,
          limit,
        })
      : Promise.resolve([]),
  ]);

  const commentBlueprintIds = [...new Set(comments.map((row) => normalizeRouteString(row.blueprint_id)).filter(Boolean))];
  const commentBlueprints = await ensureOracleBlueprintRowsByIds(commentBlueprintIds);
  const commentTitleByBlueprintId = new Map(commentBlueprints.map((row) => [row.id, row.title]));

  const items = [
    ...createdBlueprints.map((bp) => ({
      type: 'blueprint_created' as const,
      id: bp.id,
      title: `Created "${bp.title}"`,
      created_at: bp.created_at,
      target_id: bp.id,
    })),
    ...profileLikedBlueprints.map((bp) => ({
      type: 'blueprint_liked' as const,
      id: `liked:${bp.id}`,
      title: `Liked "${bp.title}"`,
      created_at: bp.liked_at || bp.created_at,
      target_id: bp.id,
    })),
    ...comments
      .filter((row) => commentTitleByBlueprintId.has(normalizeRouteString(row.blueprint_id)))
      .map((row) => ({
        type: 'comment' as const,
        id: row.id,
        title: `Commented on "${commentTitleByBlueprintId.get(normalizeRouteString(row.blueprint_id))}"`,
        created_at: row.created_at,
        target_id: normalizeRouteString(row.blueprint_id),
      })),
  ];

  return items
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, limit);
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
    listBlueprintTagSlugs: ({ blueprintId }) => listBlueprintTagSlugsOracleAware(input.db, { blueprintId }),
    attachBlueprintTag: ({ blueprintId, tagId, tagSlug }) => attachBlueprintTagOracleAware(input.db, {
      blueprintId,
      tagId,
      tagSlug,
    }),
    getChannelCandidateById: ({ candidateId }) => getChannelCandidateByIdOracleFirst(input.db, { candidateId }),
    getChannelCandidateByFeedChannel: ({ userFeedItemId, channelSlug }) => getChannelCandidateByFeedChannelOracleFirst(input.db, {
      userFeedItemId,
      channelSlug,
    }),
    upsertChannelCandidate: ({ row }) => upsertChannelCandidateOracleFirst(input.db, { row }),
    updateChannelCandidateStatus: ({ candidateId, status }) => updateChannelCandidateStatusOracleFirst(input.db, {
      candidateId,
      status,
    }),
    insertChannelGateDecisions: ({ candidateId, decisions }) => insertChannelGateDecisionRowsOracleFirst(input.db, {
      candidateId,
      decisions,
    }),
    patchFeedItemById: async ({ db, feedItemId, userId, patch, action }) => {
      await patchFeedItemByIdOracleAware(db, {
        feedItemId,
        userId,
        patch,
        action,
      });
    },
  });
  if (oracleControlPlane && result.decision === 'published') {
    await patchOracleBlueprintRow({
      controlDb: oracleControlPlane,
      blueprintId: input.blueprintId,
      patch: {
        is_public: true,
      },
    });
  }
  if (!oracleFeedLedgerPrimaryEnabled) {
    await syncOracleProductFeedRowsByIds(input.db, [input.userFeedItemId], 'run_auto_channel_for_feed_item');
  }

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
    'caveats',
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

function buildYouTubeThumbnailUrlForVideo(videoId: string) {
  const normalized = String(videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,15}$/.test(normalized)) return null;
  return `https://i.ytimg.com/vi/${normalized}/hqdefault.jpg`;
}

async function upsertSourceItemFromVideo(db: ReturnType<typeof createClient>, input: {
  video: YouTubeFeedVideo;
  channelId: string;
  channelTitle: string | null;
  channelUrl?: string | null;
  sourcePageId?: string | null;
}) {
  const canonicalKey = `youtube:${input.video.videoId}`;
  const existing = (
    await listProductSourceItemsOracleFirst(db, {
      canonicalKeys: [canonicalKey],
      action: 'upsert_source_item_from_video_lookup_existing',
    })
  )[0] || null;
  const existingMetadata = existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
    ? existing.metadata
    : {};

  return persistSourceItemRowOracleAware(db, {
    row: {
      id: existing?.id || randomUUID(),
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
        ...existingMetadata,
        provider: 'youtube_rss',
        duration_seconds: toDurationSeconds((input.video as { durationSeconds?: unknown }).durationSeconds),
      },
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    action: 'upsert_source_item_from_video',
  });
}

async function ensureSourceItemForYouTubeManualSave(db: ReturnType<typeof createClient>, input: {
  videoUrl: string;
  title: string;
  sourceChannelId?: string | null;
  sourceChannelTitle?: string | null;
  sourceChannelUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const videoId = extractYouTubeVideoIdFromUrl(input.videoUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube URL.');
  }

  const canonicalKey = `youtube:${videoId}`;
  const existing = (
    await listProductSourceItemsOracleFirst(db, {
      canonicalKeys: [canonicalKey],
      action: 'ensure_source_item_for_youtube_manual_save_lookup_existing',
    })
  )[0] || null;
  const existingMetadata = existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
    ? existing.metadata
    : {};
  const effectiveSourceChannelId = String(input.sourceChannelId || existing?.source_channel_id || '').trim() || null;
  const effectiveSourceChannelTitle = String(input.sourceChannelTitle || existing?.source_channel_title || '').trim() || null;
  const effectiveThumbnailUrl = String(existing?.thumbnail_url || '').trim() || buildYouTubeThumbnailUrlForVideo(videoId);
  const metadata: Record<string, unknown> = {
    ...existingMetadata,
    ...((input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)) ? input.metadata : {}),
  };
  if (effectiveSourceChannelId) metadata.source_channel_id = effectiveSourceChannelId;
  if (effectiveSourceChannelTitle) metadata.source_channel_title = effectiveSourceChannelTitle;
  if (input.sourceChannelUrl) metadata.source_channel_url = input.sourceChannelUrl;

  return persistSourceItemRowOracleAware(db, {
    row: {
      id: existing?.id || randomUUID(),
      source_type: 'youtube',
      source_native_id: videoId,
      canonical_key: canonicalKey,
      source_url: String(input.videoUrl || '').trim(),
      title: String(input.title || '').trim(),
      published_at: existing?.published_at || null,
      ingest_status: 'ready',
      source_channel_id: effectiveSourceChannelId,
      source_channel_title: effectiveSourceChannelTitle,
      source_page_id: existing?.source_page_id || null,
      thumbnail_url: effectiveThumbnailUrl,
      metadata,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    action: 'ensure_source_item_for_youtube_manual_save',
  });
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
  const existing = (
    await listProductSourceItemsOracleFirst(db, {
      canonicalKeys: [canonicalKey],
      action: 'upsert_subscription_notice_source_item_lookup_existing',
    })
  )[0] || null;
  const existingMetadata = existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
    ? existing.metadata
    : {};

  return persistSourceItemRowOracleAware(db, {
    row: {
      id: existing?.id || randomUUID(),
      source_type: 'subscription_notice',
      source_native_id: input.channelId,
      canonical_key: canonicalKey,
      source_url: input.channelUrl || `https://www.youtube.com/channel/${input.channelId}`,
      title: `You are now subscribing to ${safeTitle}`,
      published_at: existing?.published_at || null,
      ingest_status: 'ready',
      source_channel_id: input.channelId,
      source_channel_title: safeTitle,
      source_page_id: existing?.source_page_id || null,
      thumbnail_url: input.channelAvatarUrl,
      metadata: {
        ...existingMetadata,
        notice_kind: 'subscription_created',
        channel_title: safeTitle,
        channel_avatar_url: input.channelAvatarUrl,
        channel_banner_url: input.channelBannerUrl,
      },
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    action: 'upsert_subscription_notice_source_item',
  });
}

async function getExistingFeedItem(db: ReturnType<typeof createClient>, userId: string, sourceItemId: string) {
  if (oracleFeedLedgerEnabled && oracleControlPlane) {
    try {
      const durable = await getOracleFeedLedgerByUserSourceItem({
        controlDb: oracleControlPlane,
        userId,
        sourceItemId,
      });
      if (durable) {
        return {
          id: durable.id,
          state: durable.state,
          blueprint_id: durable.blueprint_id,
        };
      }
    } catch (error) {
      console.warn('[oracle-control-plane] feed_ledger_failed', JSON.stringify({
        action: 'get_existing_feed_item',
        user_id: userId,
        source_item_id: sourceItemId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (oracleFeedLedgerPrimaryEnabled && oracleProductMirrorEnabled && oracleControlPlane) {
    try {
      const mirrored = await listOracleProductFeedRows({
        controlDb: oracleControlPlane,
        userId,
        sourceItemIds: [sourceItemId],
        limit: 1,
      });
      const row = mirrored[0];
      if (row) {
        return {
          id: row.id,
          state: row.state,
          blueprint_id: row.blueprint_id,
        };
      }
    } catch (error) {
      console.warn('[oracle-control-plane] product_mirror_failed', JSON.stringify({
        action: 'get_existing_feed_item',
        user_id: userId,
        source_item_id: sourceItemId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
    return null;
  }

  const { data, error } = await db
    .from('user_feed_items')
    .select('id, state, blueprint_id')
    .eq('user_id', userId)
    .eq('source_item_id', sourceItemId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function mapFeedItemToSupabaseShadowValues(row: {
  id: string;
  user_id: string;
  source_item_id: string;
  blueprint_id: string | null;
  state: string;
  last_decision_code: string | null;
  generated_at_on_wall: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    user_id: row.user_id,
    source_item_id: row.source_item_id,
    blueprint_id: row.blueprint_id,
    state: row.state,
    last_decision_code: row.last_decision_code,
    generated_at_on_wall: row.generated_at_on_wall,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function insertFeedItem(db: ReturnType<typeof createClient>, input: {
  userId: string;
  sourceItemId: string;
  blueprintId: string | null;
  state: string;
  wallCreatedAt?: string | null;
}) {
  const nowIso = new Date().toISOString();
  const createdAt = resolveFeedItemWallCreatedAt({
    existingCreatedAt: null,
    nextCreatedAt: input.wallCreatedAt || null,
    nowIso,
  });
  const feedRow = {
    id: randomUUID(),
    user_id: input.userId,
    source_item_id: input.sourceItemId,
    blueprint_id: input.blueprintId,
    state: input.state,
    last_decision_code: null,
    generated_at_on_wall: input.blueprintId ? nowIso : null,
    created_at: createdAt,
    updated_at: nowIso,
  };

  if (oracleFeedLedgerPrimaryEnabled && oracleControlPlane) {
    const persistedRow = await persistFeedItemRowOracleAware(db, {
      row: feedRow,
      action: 'insert_feed_item',
    });
    return { id: persistedRow.id };
  }

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
  await upsertOracleFeedLedgerRowsFromKnownRows([{
    id: data.id,
    user_id: input.userId,
    source_item_id: input.sourceItemId,
    blueprint_id: input.blueprintId,
    state: input.state,
    last_decision_code: null,
    generated_at_on_wall: input.blueprintId ? nowIso : null,
    created_at: createdAt,
    updated_at: nowIso,
  }], 'insert_feed_item');
  await upsertOracleProductFeedRowsFromKnownRows([{
    id: data.id,
    user_id: input.userId,
    source_item_id: input.sourceItemId,
    blueprint_id: input.blueprintId,
    state: input.state,
    last_decision_code: null,
    generated_at_on_wall: input.blueprintId ? nowIso : null,
    created_at: createdAt,
    updated_at: nowIso,
  }], 'insert_feed_item');
  return data;
}

async function upsertFeedItemWithBlueprint(db: ReturnType<typeof createClient>, input: {
  userId: string;
  sourceItemId: string;
  blueprintId: string;
  state: string;
}) {
  const nowIso = new Date().toISOString();
  if (oracleFeedLedgerPrimaryEnabled && oracleControlPlane) {
    const current = await getOracleFeedLedgerByUserSourceItem({
      controlDb: oracleControlPlane,
      userId: input.userId,
      sourceItemId: input.sourceItemId,
    });
    const createdAt = resolveFeedItemWallCreatedAt({
      existingCreatedAt: current?.created_at || null,
      nextCreatedAt: null,
      nowIso,
    });
    const generatedAtOnWall = resolveFeedItemGeneratedAtOnWall({
      existingGeneratedAtOnWall: current?.generated_at_on_wall || null,
      existingBlueprintId: current?.blueprint_id || null,
      nextBlueprintId: input.blueprintId,
      nowIso,
    });
    const nextRow = {
      id: current?.id || randomUUID(),
      user_id: input.userId,
      source_item_id: input.sourceItemId,
      blueprint_id: input.blueprintId,
      state: input.state,
      last_decision_code: null,
      generated_at_on_wall: generatedAtOnWall,
      created_at: createdAt,
      updated_at: nowIso,
    };
    const persistedRow = await persistFeedItemRowOracleAware(db, {
      row: nextRow,
      action: 'upsert_feed_item_with_blueprint',
    });
    return { id: persistedRow.id, user_id: persistedRow.user_id };
  }

  const current = await readSupabaseFeedItemByUserSourceItem(db, {
    userId: input.userId,
    sourceItemId: input.sourceItemId,
  });
  const createdAt = resolveFeedItemWallCreatedAt({
    existingCreatedAt: current?.created_at || null,
    nextCreatedAt: null,
    nowIso,
  });
  const generatedAtOnWall = resolveFeedItemGeneratedAtOnWall({
    existingGeneratedAtOnWall: current?.generated_at_on_wall || null,
    existingBlueprintId: current?.blueprint_id || null,
    nextBlueprintId: input.blueprintId,
    nowIso,
  });
  const { data, error } = await db
    .from('user_feed_items')
    .upsert(
      {
        user_id: input.userId,
        source_item_id: input.sourceItemId,
        blueprint_id: input.blueprintId,
        state: input.state,
        last_decision_code: null,
        generated_at_on_wall: generatedAtOnWall,
        created_at: createdAt,
      },
      { onConflict: 'user_id,source_item_id' },
    )
    .select('id, user_id')
    .single();
  if (error) throw error;
  await upsertOracleFeedLedgerRowsFromKnownRows([{
    id: data.id,
    user_id: data.user_id,
    source_item_id: input.sourceItemId,
    blueprint_id: input.blueprintId,
    state: input.state,
    last_decision_code: null,
    generated_at_on_wall: generatedAtOnWall,
    created_at: createdAt,
    updated_at: nowIso,
  }], 'upsert_feed_item_with_blueprint');
  await upsertOracleProductFeedRowsFromKnownRows([{
    id: data.id,
    user_id: data.user_id,
    source_item_id: input.sourceItemId,
    blueprint_id: input.blueprintId,
    state: input.state,
    last_decision_code: null,
    generated_at_on_wall: generatedAtOnWall,
    created_at: createdAt,
    updated_at: nowIso,
  }], 'upsert_feed_item_with_blueprint');
  return data as { id: string; user_id: string };
}

async function saveGeneratedYouTubeBlueprintToFeed(db: ReturnType<typeof createClient>, input: {
  userId: string;
  videoUrl: string;
  title: string;
  blueprintId?: string | null;
  sourceChannelId?: string | null;
  sourceChannelTitle?: string | null;
  sourceChannelUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  state?: string | null;
}) {
  const sourceItem = await ensureSourceItemForYouTubeManualSave(db, {
    videoUrl: input.videoUrl,
    title: input.title,
    sourceChannelId: input.sourceChannelId,
    sourceChannelTitle: input.sourceChannelTitle,
    sourceChannelUrl: input.sourceChannelUrl,
    metadata: input.metadata || null,
  });

  const existing = await getExistingFeedItem(db, input.userId, sourceItem.id);
  if (existing) {
    return {
      sourceItem: {
        id: sourceItem.id,
        canonical_key: sourceItem.canonical_key,
        thumbnail_url: sourceItem.thumbnail_url,
      },
      feedItem: {
        id: String(existing.id || '').trim(),
        blueprint_id: String(existing.blueprint_id || '').trim() || null,
        state: String(existing.state || '').trim() || 'my_feed_published',
      },
      existing: true,
    };
  }

  const blueprintId = String(input.blueprintId || '').trim();
  if (!blueprintId) {
    return {
      sourceItem: {
        id: sourceItem.id,
        canonical_key: sourceItem.canonical_key,
        thumbnail_url: sourceItem.thumbnail_url,
      },
      feedItem: null,
      existing: false,
    };
  }

  const feedItem = await upsertFeedItemWithBlueprint(db, {
    userId: input.userId,
    sourceItemId: sourceItem.id,
    blueprintId,
    state: String(input.state || '').trim() || 'my_feed_published',
  });

  return {
    sourceItem: {
      id: sourceItem.id,
      canonical_key: sourceItem.canonical_key,
      thumbnail_url: sourceItem.thumbnail_url,
    },
      feedItem: {
        id: String(feedItem.id || '').trim(),
        blueprint_id: blueprintId,
        state: String(input.state || '').trim() || 'my_feed_published',
      },
    existing: false,
  };
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
    if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
      try {
        const userIds = await listOracleSubscriptionLedgerActiveUserIdsForSource({
          controlDb: oracleControlPlane,
          sourcePageId: input.sourcePageId,
        });
        for (const userId of userIds) {
          if (userId) targetUsers.add(userId);
        }
      } catch (error) {
        console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
          action: 'attach_blueprint_to_subscribed_users_by_page',
          source_page_id: input.sourcePageId,
          error: error instanceof Error ? error.message : String(error),
        }));
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
    } else {
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
  }

  const sourceChannelId = String(input.sourceChannelId || '').trim();
  if (sourceChannelId) {
    if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
      try {
        const userIds = await listOracleSubscriptionLedgerActiveUserIdsForSource({
          controlDb: oracleControlPlane,
          sourceChannelId,
        });
        for (const userId of userIds) {
          if (userId) targetUsers.add(userId);
        }
      } catch (error) {
        console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
          action: 'attach_blueprint_to_subscribed_users_by_channel',
          source_channel_id: sourceChannelId,
          error: error instanceof Error ? error.message : String(error),
        }));
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
    } else {
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

type OracleFirstChannelCandidateRow = {
  id: string;
  user_feed_item_id: string;
  channel_slug: string;
  status: string;
  submitted_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type OracleFirstChannelGateDecisionRow = {
  id: string;
  candidate_id: string;
  gate_id: string;
  outcome: string;
  reason_code: string;
  score: number | null;
  policy_version: string;
  method_version: string | null;
  created_at: string;
};

async function listChannelCandidateRowsOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    feedItemIds?: string[];
    candidateIds?: string[];
    channelSlug?: string | null;
    statuses?: string[];
    limit?: number;
  },
) {
  const feedItemIds = Array.from(new Set((input.feedItemIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
  const candidateIds = Array.from(new Set((input.candidateIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
  const statuses = Array.from(new Set((input.statuses || []).map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)));
  const channelSlug = String(input.channelSlug || '').trim().toLowerCase();

  if (oracleControlPlane) {
    return listOracleChannelCandidateRows({
      controlDb: oracleControlPlane,
      feedItemIds,
      candidateIds,
      channelSlug: channelSlug || null,
      statuses,
      limit: input.limit,
    }) as Promise<OracleFirstChannelCandidateRow[]>;
  }

  let query = db
    .from('channel_candidates')
    .select('id, user_feed_item_id, channel_slug, status, submitted_by_user_id, created_at, updated_at');

  if (feedItemIds.length > 0) {
    query = query.in('user_feed_item_id', feedItemIds);
  }
  if (candidateIds.length > 0) {
    query = query.in('id', candidateIds);
  }
  if (channelSlug) {
    query = query.eq('channel_slug', channelSlug);
  }
  if (statuses.length === 1) {
    query = query.eq('status', statuses[0]);
  } else if (statuses.length > 1) {
    query = query.in('status', statuses);
  }
  query = query.order('created_at', { ascending: false }).limit(Math.max(1, Math.floor(Number(input.limit || 5000))));

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as OracleFirstChannelCandidateRow[];
}

async function getChannelCandidateByIdOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    candidateId: string;
  },
) {
  const candidateId = String(input.candidateId || '').trim();
  if (!candidateId) return null;

  if (oracleControlPlane) {
    return getOracleChannelCandidateById({
      controlDb: oracleControlPlane,
      candidateId,
    }) as Promise<OracleFirstChannelCandidateRow | null>;
  }

  const { data, error } = await db
    .from('channel_candidates')
    .select('id, user_feed_item_id, channel_slug, status, submitted_by_user_id, created_at, updated_at')
    .eq('id', candidateId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as OracleFirstChannelCandidateRow | null;
}

async function getChannelCandidateByFeedChannelOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    userFeedItemId: string;
    channelSlug: string;
  },
) {
  const userFeedItemId = String(input.userFeedItemId || '').trim();
  const channelSlug = String(input.channelSlug || '').trim().toLowerCase();
  if (!userFeedItemId || !channelSlug) return null;

  if (oracleControlPlane) {
    return getOracleChannelCandidateByFeedChannel({
      controlDb: oracleControlPlane,
      userFeedItemId,
      channelSlug,
    }) as Promise<OracleFirstChannelCandidateRow | null>;
  }

  const { data, error } = await db
    .from('channel_candidates')
    .select('id, user_feed_item_id, channel_slug, status, submitted_by_user_id, created_at, updated_at')
    .eq('user_feed_item_id', userFeedItemId)
    .eq('channel_slug', channelSlug)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as OracleFirstChannelCandidateRow | null;
}

async function upsertChannelCandidateOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    row: Partial<OracleFirstChannelCandidateRow> & {
      user_feed_item_id: string;
      channel_slug: string;
      submitted_by_user_id: string;
      status?: string;
    };
  },
) {
  const row = {
    ...input.row,
    channel_slug: String(input.row.channel_slug || '').trim().toLowerCase(),
    status: String(input.row.status || 'pending').trim().toLowerCase(),
  };

  if (oracleControlPlane) {
    return upsertOracleChannelCandidateRow({
      controlDb: oracleControlPlane,
      row: {
        id: row.id,
        user_feed_item_id: row.user_feed_item_id,
        channel_slug: row.channel_slug,
        submitted_by_user_id: row.submitted_by_user_id,
        status: row.status as any,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    }) as Promise<OracleFirstChannelCandidateRow>;
  }

  const { data, error } = await db
    .from('channel_candidates')
    .upsert(
      {
        id: row.id,
        user_feed_item_id: row.user_feed_item_id,
        channel_slug: row.channel_slug,
        submitted_by_user_id: row.submitted_by_user_id,
        status: row.status,
      },
      { onConflict: 'user_feed_item_id,channel_slug' },
    )
    .select('id, user_feed_item_id, channel_slug, status, submitted_by_user_id, created_at, updated_at')
    .single();
  if (error) throw error;
  return data as OracleFirstChannelCandidateRow;
}

async function updateChannelCandidateStatusOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    candidateId: string;
    status: string;
  },
) {
  const candidateId = String(input.candidateId || '').trim();
  const status = String(input.status || '').trim().toLowerCase();
  if (!candidateId || !status) return null;

  if (oracleControlPlane) {
    return updateOracleChannelCandidateStatus({
      controlDb: oracleControlPlane,
      candidateId,
      status: status as any,
    }) as Promise<OracleFirstChannelCandidateRow | null>;
  }

  const { data, error } = await db
    .from('channel_candidates')
    .update({ status })
    .eq('id', candidateId)
    .select('id, user_feed_item_id, channel_slug, status, submitted_by_user_id, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  return (data || null) as OracleFirstChannelCandidateRow | null;
}

async function listChannelGateDecisionRowsOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    candidateId: string;
  },
) {
  const candidateId = String(input.candidateId || '').trim();
  if (!candidateId) return [] as OracleFirstChannelGateDecisionRow[];

  if (oracleControlPlane) {
    return listOracleChannelGateDecisions({
      controlDb: oracleControlPlane,
      candidateId,
    }) as Promise<OracleFirstChannelGateDecisionRow[]>;
  }

  const { data, error } = await db
    .from('channel_gate_decisions')
    .select('id, candidate_id, gate_id, outcome, reason_code, score, policy_version, method_version, created_at')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as OracleFirstChannelGateDecisionRow[];
}

async function insertChannelGateDecisionRowsOracleFirst(
  db: ReturnType<typeof createClient>,
  input: {
    candidateId: string;
    decisions: Array<{
      gate_id: string;
      outcome: 'pass' | 'warn' | 'block';
      reason_code: string;
      score?: number | null;
      policy_version?: string;
      method_version?: string | null;
    }>;
  },
) {
  if (oracleControlPlane) {
    await insertOracleChannelGateDecisionRows({
      controlDb: oracleControlPlane,
      rows: mapChannelGateDecisionRowsFromEvaluation({
        candidateId: input.candidateId,
        decisions: input.decisions as any,
      }),
    });
    return;
  }

  const payload = (input.decisions || []).map((decision) => ({
    candidate_id: input.candidateId,
    gate_id: decision.gate_id,
    outcome: decision.outcome,
    reason_code: decision.reason_code,
    score: decision.score ?? null,
    policy_version: decision.policy_version || 'bleuv1-gate-policy-v1.0',
    method_version: decision.method_version || 'gate-v1',
  }));
  if (payload.length === 0) return;
  const { error } = await db.from('channel_gate_decisions').insert(payload);
  if (error) throw error;
}

async function fetchPublishedChannelSlugMapForBlueprints(db: ReturnType<typeof createClient>, blueprintIds: string[]) {
  const map = new Map<string, string>();
  const uniqueBlueprintIds = Array.from(new Set(blueprintIds.filter(Boolean)));
  if (!uniqueBlueprintIds.length) return map;

  const feedItems = await listPublicProductFeedRowsOracleFirst(db, {
    blueprintIds: uniqueBlueprintIds,
    limit: 5000,
    requireBlueprint: true,
  });

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

  const candidates = await listChannelCandidateRowsOracleFirst(db, {
    feedItemIds: feedIds,
    statuses: ['published'],
    limit: 5000,
  });

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
    if (!error) {
      restoredToGenerated += 1;
      if (oracleControlPlane) {
        await patchOracleBlueprintRow({
          controlDb: oracleControlPlane,
          blueprintId: row.id,
          patch: {
            banner_url: row.banner_generated_url,
            updated_at: nowIso,
          },
        });
      }
    }
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
      if (oracleControlPlane) {
        await patchOracleBlueprintRow({
          controlDb: oracleControlPlane,
          blueprintId: row.id,
          patch: {
            banner_url: nextBanner,
            updated_at: nowIso,
          },
        });
      }
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

  const tags = await listBlueprintTagSlugsOracleAware(db, {
    blueprintId: blueprint.id,
  });

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
  if (oracleControlPlane) {
    await patchOracleBlueprintRow({
      controlDb: oracleControlPlane,
      blueprintId: blueprint.id,
      patch: {
        banner_url: bannerUrl,
        updated_at: nowIso,
      },
    });
  }

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
  storeSourceItemViewCountOracleAware: async ({ db, sourceItemId, viewCount }) => (
    storeSourceItemViewCountOracleAware(db, {
      sourceItemId,
      viewCount,
    })
  ),
  listPendingRefreshBlueprintIdsOracleFirst: async ({ db, blueprintIds, kind }) => (
    listPendingRefreshBlueprintIdsOracleFirst(db, {
      blueprintIds,
      kind,
    })
  ),
  ...(oracleControlPlane ? {
    storeBlueprintYouTubeCommentsOracleAware: async ({ db, blueprintId, videoId, sortMode, comments }) => (
      storeBlueprintYouTubeCommentsOracleAware(db, {
        blueprintId,
        videoId,
        sortMode,
        comments,
      })
    ),
    listBlueprintYouTubeCommentsOracleAware: async ({ db, blueprintId, sortMode }) => (
      listBlueprintYouTubeCommentsOracleAware(db, {
        blueprintId,
        sortMode,
      })
    ),
  } : {}),
});

const blueprintCreationService = createBlueprintCreationService({
  getServiceSupabaseClient,
  safeGenerationTraceWrite,
  startGenerationRun,
  runYouTubePipeline: (pipelineInput: any) => runYouTubePipeline(pipelineInput),
  toTagSlug,
  ensureTagId,
  getSourceItemById: (db, { sourceItemId }) => getSourceItemByIdOracleFirst(db, {
    sourceItemId,
    action: 'blueprint_creation_get_source_item_by_id',
  }),
  attachBlueprintTag: (db, input) => attachBlueprintTagOracleAware(db, input),
  upsertBlueprintReadState: async (input) => {
    if (!oracleControlPlane) return;
    await upsertOracleBlueprintRow({
      controlDb: oracleControlPlane,
      row: {
        id: input.blueprintId,
        creator_user_id: input.creatorUserId,
        title: input.title,
        sections_json: input.sectionsJson,
        mix_notes: input.mixNotes,
        review_prompt: input.reviewPrompt,
        banner_url: input.bannerUrl,
        llm_review: input.llmReview,
        preview_summary: input.previewSummary,
        is_public: input.isPublic,
        source_blueprint_id: input.sourceBlueprintId || null,
      },
    });
  },
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
  const sourceRows = await listProductSourceItemsOracleFirst(db, {
    canonicalKeys,
    action: 'load_existing_source_video_state_for_user',
  });

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
    const feedRows = await listProductFeedRowsForUserOracleFirst(db, {
      userId,
      limit: Math.max(sourceIds.length, 1),
      sourceItemIds: sourceIds,
      requireBlueprint: true,
    });

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
    }, {
      findExpiredReservedUnlocks: (workerDb, limit) => findExpiredReservedUnlocksOracleFirst(workerDb, limit),
      failUnlock: (workerDb, sweepInput) => failUnlockWithMirror(workerDb, sweepInput),
      listProcessingUnlocks: (workerDb, limit) => listProcessingUnlockRowsOracleFirst(workerDb, limit),
      getJobsByIds: (workerDb, ids) => getUnlockJobsByIdsOracleFirst(workerDb, ids),
      listRunningUnlockJobs: (workerDb, limit, staleBeforeIso) => (
        listRunningUnlockJobsOracleFirst(workerDb, limit, staleBeforeIso)
      ),
      countActiveUnlockLinksForJobs: (workerDb, jobIds) => (
        countActiveUnlockLinksForJobsOracleFirst(workerDb, jobIds)
      ),
      markJobsFailed: (workerDb, sweepInput) => markRunningIngestionJobsFailedWithMirror(workerDb, {
        ...sweepInput,
        action: 'unlock_reliability_orphan_jobs_failed',
      }),
    });
    const recoveredAny = (
      sweepResult.expired_recovered
      + sweepResult.processing_recovered
      + sweepResult.orphan_jobs_recovered
    ) > 0;
    if (Boolean(input?.force) || recoveredAny) {
      await runTranscriptFeedSuppressionSweep(db, {
        traceId: input?.traceId,
        force: Boolean(input?.force),
      });
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

let transcriptFeedSuppressionSweepLastRunMs = 0;

async function runTranscriptFeedSuppressionSweep(
  db: ReturnType<typeof createClient>,
  input?: { traceId?: string; force?: boolean },
) {
  const nowMs = Date.now();
  if (!input?.force && nowMs - transcriptFeedSuppressionSweepLastRunMs < transcriptFeedSuppressionSweepMinIntervalMs) {
    return;
  }
  transcriptFeedSuppressionSweepLastRunMs = nowMs;

  let rows: UnlockTranscriptSweepRow[];
  try {
    rows = await listTranscriptSuppressedUnlockRowsOracleFirst(
      db,
      Math.min(15, Math.max(10, Math.floor(sourceUnlockSweepBatch / 2))),
    );
  } catch (error) {
    logUnlockEvent(
      'transcript_feed_sweep_failed',
      { trace_id: String(input?.traceId || '').trim() || createUnlockTraceId() },
      { error: error instanceof Error ? error.message : String(error) },
    );
    return;
  }

  const permanentSourceItemIds = new Set<string>();
  const transientSourceItemIds = new Set<string>();

  for (const row of rows) {
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
    hiddenRows += await suppressUnlockableFeedRowsForSourceItemsWithMirror(db, {
      sourceItemIds: [...permanentSourceItemIds],
      decisionCode: 'NO_TRANSCRIPT_PERMANENT_AUTO',
      traceId: input?.traceId,
    });
  }
  if (transientSourceItemIds.size > 0) {
    hiddenRows += await suppressUnlockableFeedRowsForSourceItemsWithMirror(db, {
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

  const status = getEffectiveUnlockDisplayStatus({
    status: unlock.status,
    reservation_expires_at: unlock.reservation_expires_at,
  });
  const cost = status === 'ready'
    ? Math.max(0, Number(unlock.estimated_cost || input.fallbackCost))
    : Math.max(0, Number(input.fallbackCost));
  return {
    unlock_status: status,
    unlock_cost: cost,
    unlock_in_progress: isEffectiveUnlockDisplayInProgress({
      status: unlock.status,
      reservation_expires_at: unlock.reservation_expires_at,
    }),
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
  await patchSourceItemUnlockOracleAware(db, {
    unlockId,
    patch: {
      transcript_status: 'unknown',
      transcript_attempt_count: 0,
      transcript_no_caption_hits: 0,
      transcript_last_probe_at: null,
      transcript_retry_after: null,
      transcript_probe_meta: {},
    },
    action: 'mark_unlock_transcript_success',
  });
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

  await patchSourceItemUnlockOracleAware(input.db, {
    unlockId: input.unlock.id,
    current: input.unlock,
    patch: {
      transcript_status: transcriptStatus,
      transcript_attempt_count: nextAttemptCount,
      transcript_no_caption_hits: nextNoCaptionHits,
      transcript_last_probe_at: new Date().toISOString(),
      transcript_retry_after: retryAfterSeconds > 0 ? buildTranscriptRetryAfterIso(retryAfterSeconds) : null,
      transcript_probe_meta: probeMeta,
    },
    action: 'classify_transcript_failure_for_unlock',
  });

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

const autoUnlockEligibleUsersCache = new Map<string, { expiresAtMs: number; value: string[] }>();
const autoUnlockQueueDepthCache = new Map<string, { expiresAtMs: number; value: number }>();

function readExpiringCacheValue<T>(cache: Map<string, { expiresAtMs: number; value: T }>, key: string) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAtMs <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function writeExpiringCacheValue<T>(cache: Map<string, { expiresAtMs: number; value: T }>, key: string, value: T, ttlMs: number) {
  cache.set(key, {
    expiresAtMs: Date.now() + Math.max(1_000, ttlMs),
    value,
  });
  return value;
}

function buildAutoUnlockEligibleUsersCacheKey(input: { sourcePageId: string | null; sourceChannelId: string | null }) {
  return `page:${String(input.sourcePageId || '').trim()}::channel:${String(input.sourceChannelId || '').trim()}`;
}

async function listEligibleAutoUnlockUsers(
  db: ReturnType<typeof createClient>,
  input: {
    sourcePageId: string | null;
    sourceChannelId: string | null;
  },
) {
  const cacheKey = buildAutoUnlockEligibleUsersCacheKey(input);
  const cached = readExpiringCacheValue(autoUnlockEligibleUsersCache, cacheKey);
  if (cached) return cached;

  const userIds = new Set<string>();
  const sourcePageId = String(input.sourcePageId || '').trim();
  const sourceChannelId = String(input.sourceChannelId || '').trim();

  if (sourcePageId) {
    if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
      try {
        const ledgerUserIds = await listOracleSubscriptionLedgerActiveUserIdsForSource({
          controlDb: oracleControlPlane,
          sourcePageId,
          autoUnlockEnabled: true,
        });
        for (const userId of ledgerUserIds) {
          if (userId) userIds.add(userId);
        }
      } catch (error) {
        console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
          action: 'get_auto_unlock_eligible_users_by_page',
          source_page_id: sourcePageId,
          error: error instanceof Error ? error.message : String(error),
        }));
        const { data, error: fallbackError } = await db
          .from('user_source_subscriptions')
          .select('user_id')
          .eq('is_active', true)
          .eq('auto_unlock_enabled', true)
          .eq('source_page_id', sourcePageId);
        if (fallbackError) throw fallbackError;
        for (const row of data || []) {
          const userId = String(row.user_id || '').trim();
          if (userId) userIds.add(userId);
        }
      }
    } else {
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
  }

  if (sourceChannelId) {
    if (oracleSubscriptionLedgerEnabled && oracleControlPlane) {
      try {
        const ledgerUserIds = await listOracleSubscriptionLedgerActiveUserIdsForSource({
          controlDb: oracleControlPlane,
          sourceChannelId,
          autoUnlockEnabled: true,
        });
        for (const userId of ledgerUserIds) {
          if (userId) userIds.add(userId);
        }
      } catch (error) {
        console.warn('[oracle-control-plane] subscription_ledger_failed', JSON.stringify({
          action: 'get_auto_unlock_eligible_users_by_channel',
          source_channel_id: sourceChannelId,
          error: error instanceof Error ? error.message : String(error),
        }));
        const { data, error: fallbackError } = await db
          .from('user_source_subscriptions')
          .select('user_id')
          .eq('source_type', 'youtube')
          .eq('is_active', true)
          .eq('auto_unlock_enabled', true)
          .eq('source_channel_id', sourceChannelId);
        if (fallbackError) throw fallbackError;
        for (const row of data || []) {
          const userId = String(row.user_id || '').trim();
          if (userId) userIds.add(userId);
        }
      }
    } else {
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
  }

  return writeExpiringCacheValue(autoUnlockEligibleUsersCache, cacheKey, Array.from(userIds), autoUnlockEligibleUsersCacheMs);
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

  const reserveResult = await reserveUnlockWithMirror(db, {
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
  reservedUnlock = await attachAutoUnlockIntentWithMirror(db, {
    unlockId: reservedUnlock.id,
    userId: ownerUserId,
    intentId: autoIntent.id,
    amount: computeUnlockCost(1),
  });

  const globalQueueDepthCacheKey = 'scope:source_item_unlock_generation::global';
  const ownerQueueDepthCacheKey = `scope:source_item_unlock_generation::owner:${ownerUserId}`;
  const cachedQueueDepth = readExpiringCacheValue(autoUnlockQueueDepthCache, globalQueueDepthCacheKey);
  const cachedOwnerQueueDepth = readExpiringCacheValue(autoUnlockQueueDepthCache, ownerQueueDepthCacheKey);
  const queueDepth = cachedQueueDepth ?? writeExpiringCacheValue(
    autoUnlockQueueDepthCache,
    globalQueueDepthCacheKey,
    await countQueueDepthForAdmission(db, {
      scope: 'source_item_unlock_generation',
      includeRunning: true,
    }),
    autoUnlockQueueDepthCacheMs,
  );
  const ownerQueueDepth = cachedOwnerQueueDepth ?? writeExpiringCacheValue(
    autoUnlockQueueDepthCache,
    ownerQueueDepthCacheKey,
    await countQueueDepthForAdmission(db, {
      scope: 'source_item_unlock_generation',
      userId: ownerUserId,
      includeRunning: true,
    }),
    autoUnlockQueueDepthCacheMs,
  );

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
    await failUnlockWithMirror(db, {
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
  const { data: job, error: jobError } = await enqueueIngestionJobWithMirror(db, {
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
  });

  if (jobError || !job?.id) {
    if (reservation.reservedNow) {
      await releaseAutoUnlockIntent(db, {
        intentId: autoIntent.id,
        reasonCode: 'QUEUE_INSERT_FAILED',
        lastErrorCode: 'QUEUE_INSERT_FAILED',
        lastErrorMessage: jobError?.message || 'Could not enqueue auto-unlock job.',
      });
    }
    await failUnlockWithMirror(db, {
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

  const oraclePending = await hasOraclePendingScopeJobByPayloadField({
    scope: 'source_auto_unlock_retry',
    payloadField: 'source_item_id',
    payloadValue: normalizedSourceItemId,
  });
  if (oraclePending != null) {
    return oraclePending;
  }

  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'has_pending_source_auto_unlock_retry_job',
      scope: 'source_auto_unlock_retry',
      reason: 'oracle_only_primary',
    });
    return false;
  }
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
  const { data: job, error: jobError } = await enqueueIngestionJobWithMirror(db, {
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
  });
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

  const oraclePending = await hasOraclePendingScopeJobByPayloadField({
    scope: 'source_transcript_revalidate',
    payloadField: 'unlock_id',
    payloadValue: normalizedUnlockId,
  });
  if (oraclePending != null) {
    return oraclePending;
  }

  if (oracleQueueLedgerPrimaryEnabled) {
    logQueueOracleOnlyBypass({
      action: 'has_pending_source_transcript_revalidate_job',
      scope: 'source_transcript_revalidate',
      reason: 'oracle_only_primary',
    });
    return false;
  }
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
  const { data: job, error: jobError } = await enqueueIngestionJobWithMirror(db, {
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
  });

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
  const queueDepth = await countQueueDepthForAdmission(input.db, { includeRunning: true });
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
  const { data: job, error: jobError } = await enqueueIngestionJobWithMirror(writeDb, {
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
  });
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
  const { data: job, error: jobError } = await enqueueIngestionJobWithMirror(input.db, {
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
  });
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

  const hasPendingComments = await blueprintYouTubeCommentsService.hasPendingRefreshJob({
    db: input.db,
    blueprintId,
    kind: 'comments',
  });
  const hasPendingViewCount = await blueprintYouTubeCommentsService.hasPendingRefreshJob({
    db: input.db,
    blueprintId,
    kind: 'view_count',
  });
  if (hasPendingComments && hasPendingViewCount) {
    return {
      ok: true,
      status: 'already_pending',
      cooldown_until: refreshState.comments_manual_cooldown_until,
      queue_depth: null,
    };
  }

  const queueDepth = await countQueueDepthForAdmission(input.db, {
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
    let queuedAny = false;

    if (!hasPendingComments) {
      const commentsEnqueueResult = await enqueueBlueprintYouTubeRefreshJob({
        db: input.db,
        blueprintId,
        refreshKind: 'comments',
        refreshTrigger: 'manual',
        requestedByUserId,
        youtubeVideoId: refreshState.youtube_video_id,
        sourceItemId: refreshState.source_item_id,
      });
      if (commentsEnqueueResult.suppressed) {
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
          queue_depth: commentsEnqueueResult.queue_depth ?? queueDepth,
        };
      }
      queuedAny = true;
    }

    if (!hasPendingViewCount) {
      const viewEnqueueResult = await enqueueBlueprintYouTubeRefreshJob({
        db: input.db,
        blueprintId,
        refreshKind: 'view_count',
        refreshTrigger: 'manual',
        requestedByUserId,
        youtubeVideoId: refreshState.youtube_video_id,
        sourceItemId: refreshState.source_item_id,
      });
      if (viewEnqueueResult.suppressed) {
        if (queuedAny) {
          return {
            ok: true,
            status: 'queued',
            cooldown_until: claimedCooldown.cooldownUntil,
            queue_depth: queueDepth,
          };
        }
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
          queue_depth: viewEnqueueResult.queue_depth ?? queueDepth,
        };
      }
      queuedAny = true;
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
    throw new Error('Could not enqueue manual YouTube refresh.');
  }
}

async function seedSourceTranscriptRevalidateJobs(
  db: ReturnType<typeof createClient>,
  limit = 50,
) {
  const cappedLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 50)));
  const unlockRows = await listPermanentTranscriptAvailableUnlockRowsOracleFirst(db, cappedLimit);

  const pending = (unlockRows || [])
    .filter((row) => normalizeTranscriptTruthStatus((row as { transcript_status?: unknown }).transcript_status) !== 'confirmed_no_speech');
  if (pending.length === 0) return { scanned: 0, enqueued: 0 };

  const sourceItemIds = Array.from(new Set(
    pending.map((row) => String((row as { source_item_id?: string }).source_item_id || '').trim()).filter(Boolean),
  ));
  const sourceRows = await listProductSourceItemsOracleFirst(db, {
    ids: sourceItemIds,
    action: 'seed_source_transcript_revalidate_jobs',
  });
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

async function recoverStaleIngestionJobsFromSupabase(
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

  const { data, error } = await query.select('*');
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  await upsertOracleJobActivityFromKnownRows((data || []) as IngestionJobRow[], 'recover_stale_jobs_supabase');
  return data || [];
}

async function recoverStaleIngestionJobs(
  db: ReturnType<typeof createClient>,
  input?: { scope?: string; requestedByUserId?: string; olderThanMs?: number },
) {
  if ((!oracleJobActivityMirrorEnabled && !oracleQueueLedgerEnabled) || !oracleControlPlane) {
    return recoverStaleIngestionJobsFromSupabase(db, input);
  }

  try {
    const staleRows = await findOracleStaleRunningJobs({
      controlDb: oracleControlPlane,
      olderThanMs: Math.max(60_000, input?.olderThanMs || ingestionStaleRunningMs),
      scope: input?.scope,
      userId: input?.requestedByUserId,
    });
    const staleIds = staleRows.map((row) => String(row.id || '').trim()).filter(Boolean);
    if (staleIds.length === 0) {
      return [];
    }

    if (oracleQueueLedgerPrimaryEnabled) {
      const nowIso = new Date().toISOString();
      const updatedRows = await markOracleRunningJobsFailed({
        controlDb: oracleControlPlane,
        jobIds: staleIds,
        errorCode: 'STALE_RUNNING_RECOVERY',
        errorMessage: 'Recovered stale running job',
        finishedAt: nowIso,
      });
      await upsertOracleJobActivityFromKnownRows(updatedRows, 'recover_stale_jobs_oracle_only');
      return updatedRows;
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await db
      .from('ingestion_jobs')
      .update({
        status: 'failed',
        finished_at: nowIso,
        error_code: 'STALE_RUNNING_RECOVERY',
        error_message: 'Recovered stale running job',
      })
      .in('id', staleIds)
      .select('*');
    if (error) throw error;

    await upsertOracleJobActivityFromKnownRows((data || []) as IngestionJobRow[], 'recover_stale_jobs_oracle');
    return data || [];
  } catch (error) {
    console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
      action: 'recover_stale_jobs',
      scope: input?.scope || null,
      requested_by_user_id: input?.requestedByUserId || null,
      error: error instanceof Error ? error.message : String(error),
    }));
    if (oracleQueueLedgerPrimaryEnabled) {
      logQueueOracleOnlyBypass({
        action: 'recover_stale_jobs',
        scope: input?.scope || null,
        userId: input?.requestedByUserId || null,
        reason: 'oracle_only_primary',
      });
      return [];
    }
    return recoverStaleIngestionJobsFromSupabase(db, input);
  }
}

async function getActiveManualRefreshJobFromSupabase(db: ReturnType<typeof createClient>, userId: string) {
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

async function getActiveManualRefreshJob(db: ReturnType<typeof createClient>, userId: string) {
  if ((!oracleJobActivityMirrorEnabled && !oracleQueueLedgerEnabled) || !oracleControlPlane) {
    return getActiveManualRefreshJobFromSupabase(db, userId);
  }

  try {
    const job = await getOracleActiveJobForUserScope({
      controlDb: oracleControlPlane,
      userId,
      scope: 'manual_refresh_selection',
    });
    return job
      ? {
          id: job.id,
          status: job.status,
          started_at: job.started_at,
        }
      : null;
  } catch (error) {
    console.warn('[oracle-control-plane] job_activity_mirror_failed', JSON.stringify({
      action: 'get_active_manual_refresh_job',
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    if (oracleQueueLedgerPrimaryEnabled) {
      logQueueOracleOnlyBypass({
        action: 'get_active_manual_refresh_job',
        userId,
        scope: 'manual_refresh_selection',
        reason: 'oracle_only_primary',
      });
      return null;
    }
    return getActiveManualRefreshJobFromSupabase(db, userId);
  }
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

async function collectRefreshCandidatesForUser(db: ReturnType<typeof createClient>, userId: string, options?: {
  maxPerSubscription?: number;
  maxTotal?: number;
}) {
  const maxPerSubscription = Math.max(1, Math.min(20, options?.maxPerSubscription || ingestionMaxPerSubscription));
  const maxTotal = Math.max(1, Math.min(200, options?.maxTotal || 100));

  const subscriptions = await listUserSourceSubscriptionsForUserOracleFirst(db, userId);
  const activeYoutubeSubscriptions = subscriptions
    .filter((subscription) => subscription.is_active && subscription.source_type === 'youtube');

  const scanErrors: Array<{ subscription_id: string; error: string }> = [];
  const rawCandidates: RefreshScanCandidate[] = [];
  let durationFilteredCount = 0;
  let durationFilteredReasons: { too_long: number; unknown: number } = {
    too_long: 0,
    unknown: 0,
  };

  for (const subscription of activeYoutubeSubscriptions) {
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
    const existingSources = await listProductSourceItemsOracleFirst(db, {
      canonicalKeys,
      action: 'collect_refresh_candidates_for_user_existing_sources',
    });

    const sourceIds = (existingSources || []).map((row) => row.id);
    const sourceIdsWithFeedItems = new Set<string>();
    if (sourceIds.length > 0) {
      const existingFeedRows = await listProductFeedRowsForUserOracleFirst(db, {
        userId,
        limit: Math.max(200, sourceIds.length * 3),
        sourceItemIds: sourceIds,
        requireBlueprint: true,
      });
      for (const row of existingFeedRows || []) {
        if (row.source_item_id) sourceIdsWithFeedItems.add(String(row.source_item_id).trim());
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
    cooldownFiltered: 0,
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
    retryAction?: import('./services/notifications').RetrySourceUnlockNotificationAction | null;
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
      retryAction: params.retryAction || null,
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
          jobId: input.jobId,
          generationTier,
          requestClass: 'background',
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

  await finalizeIngestionJobWithMirror(db, {
    jobId: input.jobId,
    status: failures.length ? 'failed' : 'succeeded',
    processedCount: processed,
    insertedCount: inserted,
    skippedCount: skipped,
    errorCode: failures.length ? 'PARTIAL_FAILURE' : null,
    errorMessage: failures.length ? JSON.stringify(failures).slice(0, 1000) : null,
    action: 'search_video_generate_terminal',
  });

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
  const subscriptions = await listUserSourceSubscriptionsByIdsOracleFirst(db, {
    subscriptionIds,
    userId: input.userId,
    activeOnly: true,
    sourceType: 'youtube',
  });
  const subscriptionById = new Map(subscriptions.map((row) => [row.id, row]));
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
          jobId: input.jobId,
          generationTier,
          requestClass: 'background',
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

    try {
      await patchUserSourceSubscriptionOracleAware(db, {
        subscriptionId,
        userId: input.userId,
        patch: {
          last_seen_published_at: checkpoint.publishedAt,
          last_seen_video_id: checkpoint.videoId,
          last_polled_at: checkpointUpdatedAt,
          last_sync_error: null,
        },
        action: 'subscription_manual_refresh_checkpoint',
      });
    } catch (checkpointError) {
      console.log('[subscription_manual_refresh_checkpoint_update_failed]', JSON.stringify({
        job_id: input.jobId,
        user_id: input.userId,
        subscription_id: subscriptionId,
        error: checkpointError instanceof Error ? checkpointError.message : String(checkpointError),
      }));
    }
  }

  await finalizeIngestionJobWithMirror(db, {
    jobId: input.jobId,
    status: failures.length ? 'failed' : 'succeeded',
    processedCount: processed,
    insertedCount: inserted,
    skippedCount: skipped,
    errorCode: failures.length ? 'PARTIAL_FAILURE' : null,
    errorMessage: failures.length ? JSON.stringify(failures).slice(0, 1000) : null,
    action: 'manual_refresh_selection_terminal',
  });

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
        jobId: input.jobId,
        requestClass: 'background',
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

  await finalizeIngestionJobWithMirror(db, {
    jobId: input.jobId,
    status: failures.length ? 'failed' : 'succeeded',
    processedCount: processed,
    insertedCount: inserted,
    skippedCount: skipped,
    errorCode: failures.length ? 'PARTIAL_FAILURE' : null,
    errorMessage: failures.length ? JSON.stringify(failures).slice(0, 1000) : null,
    action: 'source_page_video_library_terminal',
  });

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
      const processingUnlock = await markUnlockProcessingWithMirror(db, {
        unlockId: item.unlock_id,
        userId: item.reserved_by_user_id,
        jobId: input.jobId,
        reservationSeconds: sourceUnlockReservationSeconds,
      });
      processingUnlockRow = processingUnlock;

      if (!processingUnlock) {
        const current = await getSourceItemUnlockBySourceItemIdOracleFirst(db, item.source_item_id);
        const variantState = await resolveVariantOrReady({
          sourceItemId: item.source_item_id,
          generationTier: itemGenerationTier,
          jobId: input.jobId,
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
        const currentJobOwnsVariant = variantState.state === 'in_progress' && variantState.ownedByCurrentJob;
        if (variantState.state === 'in_progress' && !currentJobOwnsVariant) {
          if (dualGenerateEnabled) {
            const sourceForMirror = await getSourceItemByIdOracleFirst(db, {
              sourceItemId: item.source_item_id,
              action: 'source_item_unlock_generation_variant_in_progress',
            });
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
        } else if (currentJobOwnsVariant) {
          // Retrying the same job should fall through to the normal generation path.
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
          jobId: input.jobId,
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
        if (variantState.state === 'in_progress' && !variantState.ownedByCurrentJob) {
          if (dualGenerateEnabled) {
            const sourceForMirror = await getSourceItemByIdOracleFirst(db, {
              sourceItemId: item.source_item_id,
              action: 'source_item_unlock_generation_processing_variant',
            });
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

      const sourceRow = await getSourceItemByIdOracleFirst(db, {
        sourceItemId: item.source_item_id,
        action: 'source_item_unlock_generation_load',
      });
      if (!sourceRow) {
        throw new Error('SOURCE_ITEM_NOT_FOUND');
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
          jobId: input.jobId,
          generationTier: itemGenerationTier,
          requestClass: 'background',
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
        await completeUnlockWithMirror(db, {
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
            await failUnlockWithMirror(db, {
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
      const message = describeUnknownOracleControlPlaneError(error);
      const retryableGenerationFailure = classifyRetryableGenerationProviderFailure(error);
      if (retryableGenerationFailure) {
        logUnlockEvent(
          'unlock_item_generation_retry_scheduled',
          {
            trace_id: input.traceId,
            job_id: input.jobId,
            unlock_id: item.unlock_id,
            source_item_id: item.source_item_id,
            video_id: item.video_id,
          },
          {
            error_code: retryableGenerationFailure.errorCode,
            error: retryableGenerationFailure.message.slice(0, 220),
            retry_delay_seconds: retryableGenerationFailure.retryAfterSeconds,
          },
        );
        throw new PipelineError(
          retryableGenerationFailure.errorCode,
          retryableGenerationFailure.message,
          { retryAfterSeconds: retryableGenerationFailure.retryAfterSeconds },
        );
      }

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
          unlockForDecision = await getSourceItemUnlockBySourceItemIdOracleFirst(db, item.source_item_id);
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
          await patchSourceItemUnlockOracleAware(db, {
            unlockId: item.unlock_id,
            current: processingUnlockRow,
            patch: {
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
            },
            action: 'subscription_auto_unlock_retry_exhausted',
          });
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

      await releaseAutoIntentIfPending({
        reasonCode: errorCode,
        lastErrorCode: errorCode,
        lastErrorMessage: message,
      });

      let unlockRowForFailure = processingUnlockRow;
      if (!unlockRowForFailure) {
        try {
          const currentUnlock = await getSourceItemUnlockBySourceItemIdOracleFirst(db, item.source_item_id);
          if (
            currentUnlock
            && currentUnlock.id === item.unlock_id
            && (currentUnlock.status === 'reserved' || currentUnlock.status === 'processing')
            && (!currentUnlock.reserved_by_user_id || currentUnlock.reserved_by_user_id === item.reserved_by_user_id)
          ) {
            unlockRowForFailure = currentUnlock;
          }
        } catch (unlockReadError) {
          logUnlockEvent(
            'source_unlock_fail_transition_lookup_failed',
            { trace_id: input.traceId, job_id: input.jobId, unlock_id: item.unlock_id },
            {
              error: unlockReadError instanceof Error ? unlockReadError.message : String(unlockReadError),
            },
          );
        }
      }

      if (unlockRowForFailure) {
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
          await failUnlockWithMirror(db, {
            unlockId: item.unlock_id,
            errorCode,
            errorMessage: message,
            expectedJobId: unlockRowForFailure.status === 'processing' ? input.jobId : undefined,
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
          await suppressUnlockableFeedRowsForSourceItemWithMirror(db, {
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

  await finalizeIngestionJobWithMirror(db, {
    jobId: input.jobId,
    status: failures.length ? 'failed' : 'succeeded',
    processedCount: processed,
    insertedCount: inserted,
    skippedCount: skipped,
    errorCode: failures.length ? 'PARTIAL_FAILURE' : null,
    errorMessage: failures.length ? JSON.stringify(failures).slice(0, 1000) : null,
    action: 'source_item_unlock_generation_terminal',
  });

  await emitGenerationTerminalNotification(db, {
    userId: input.userId,
    jobId: input.jobId,
    scope: 'source_item_unlock_generation',
    inserted,
    skipped,
    failed: failures.length,
    itemTitle: firstItemTitle,
    blueprintTitle: firstBlueprintTitle,
    failureSummary: summarizeGenerationFailure({
      errorCode: failures[0]?.error_code,
      errorMessage: failures[0]?.error,
    }),
    traceId: input.traceId,
    linkPath: getGenerationNotificationLinkPath({ scope: 'source_item_unlock_generation' }),
    firstBlueprintId,
    retryAction: (() => {
      const firstFailure = failures[0];
      if (!firstFailure || firstFailure.error_code !== 'TRANSCRIPT_UNAVAILABLE') return null;
      const retryItem = input.items.find((item) => item.unlock_id === firstFailure.unlock_id);
      const externalId = String(retryItem?.source_channel_id || '').trim();
      const videoId = String(retryItem?.video_id || '').trim();
      const videoUrl = String(retryItem?.video_url || '').trim();
      const title = String(retryItem?.title || '').trim();
      if (!retryItem || !externalId || !videoId || !videoUrl || !title) return null;
      return {
        kind: 'retry_source_unlock' as const,
        platform: 'youtube' as const,
        external_id: externalId,
        item: {
          video_id: videoId,
          video_url: videoUrl,
          title,
          duration_seconds: retryItem.duration_seconds ?? null,
        },
      };
    })(),
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

  const unlock = await getSourceItemUnlockBySourceItemIdOracleFirst(db, input.payload.source_item_id);
  if (!unlock || unlock.id !== input.payload.unlock_id) {
    await finalizeIngestionJobWithMirror(db, {
      jobId: input.jobId,
      status: 'succeeded',
      processedCount: 1,
      insertedCount: 0,
      skippedCount: 1,
      action: 'source_transcript_revalidate_missing_unlock',
    });
    return;
  }

  if (isConfirmedNoTranscriptUnlock(unlock)) {
    const probe = await probeTranscriptProvidersWithThrottle(input.payload.video_id, {
      requestClass: 'background',
      reason: 'source_transcript_revalidate_probe',
    });
    if (probe.all_no_captions) {
      await patchSourceItemUnlockOracleAware(db, {
        unlockId: unlock.id,
        current: unlock,
        patch: {
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
        },
        action: 'source_transcript_revalidate_confirmed_no_speech',
      });
      logUnlockEvent('transcript_probe_result', { trace_id: input.traceId, unlock_id: unlock.id }, {
        source_item_id: unlock.source_item_id,
        video_id: input.payload.video_id,
        all_no_captions: true,
      });
    } else {
      await patchSourceItemUnlockOracleAware(db, {
        unlockId: unlock.id,
        current: unlock,
        patch: {
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
        },
        action: 'source_transcript_revalidate_retrying',
      });
      logUnlockEvent('transcript_revalidated_to_retryable', { trace_id: input.traceId, unlock_id: unlock.id }, {
        source_item_id: unlock.source_item_id,
        video_id: input.payload.video_id,
      });
    }
  } else {
    await finalizeIngestionJobWithMirror(db, {
      jobId: input.jobId,
      status: 'succeeded',
      processedCount: 1,
      insertedCount: 0,
      skippedCount: 1,
      action: 'source_transcript_revalidate_skip',
    });
    return;
  }

  await finalizeIngestionJobWithMirror(db, {
    jobId: input.jobId,
    status: 'succeeded',
    processedCount: 1,
    insertedCount: 1,
    skippedCount: 0,
    action: 'source_transcript_revalidate_terminal',
  });
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
  const unlock = await ensureSourceItemUnlockWithMirror(db, {
    sourceItemId,
    sourcePageId: input.payload.source_page_id || null,
    estimatedCost: estimatedUnlockCost,
  });

  if (unlock.status !== 'available') {
    await finalizeIngestionJobWithMirror(db, {
      jobId: input.jobId,
      status: 'succeeded',
      processedCount: 1,
      insertedCount: 0,
      skippedCount: 1,
      action: 'source_auto_unlock_retry_unavailable',
    });

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
    await patchSourceItemUnlockOracleAware(db, {
      unlockId: unlock.id,
      current: unlock,
      patch: {
        transcript_status: 'confirmed_no_speech',
        transcript_attempt_count: Math.max(sourceTranscriptMaxAttempts, transcriptAttempts),
        transcript_no_caption_hits: Math.max(sourceTranscriptMaxAttempts, getUnlockTranscriptNoCaptionHits(unlock)),
        transcript_retry_after: null,
        last_error_code: 'NO_TRANSCRIPT_PERMANENT',
        last_error_message: 'Transcript unavailable after max retry attempts.',
      },
      action: 'source_auto_unlock_retry_confirmed_no_speech',
    });
    await suppressUnlockableFeedRowsForSourceItemWithMirror(db, {
      sourceItemId,
      decisionCode: 'NO_TRANSCRIPT_PERMANENT_AUTO',
      traceId: input.traceId,
      sourceChannelId,
      videoId: input.payload.video_id,
    });
    await finalizeIngestionJobWithMirror(db, {
      jobId: input.jobId,
      status: 'succeeded',
      processedCount: 1,
      insertedCount: 0,
      skippedCount: 1,
      action: 'source_auto_unlock_retry_no_transcript_terminal',
    });

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
    await patchSourceItemUnlockOracleAware(db, {
      unlockId: unlock.id,
      current: unlock,
      patch: {
        transcript_status: 'transient_error',
        transcript_attempt_count: Math.max(sourceTranscriptMaxAttempts, transcriptAttempts),
        transcript_retry_after: null,
        last_error_code: 'TRANSCRIPT_UNAVAILABLE',
        last_error_message: 'Transcript temporarily unavailable after max retry attempts.',
      },
      action: 'source_auto_unlock_retry_transient_error',
    });
    await suppressUnlockableFeedRowsForSourceItemWithMirror(db, {
      sourceItemId,
      decisionCode: 'TRANSCRIPT_UNAVAILABLE_AUTO',
      traceId: input.traceId,
      sourceChannelId,
      videoId: input.payload.video_id,
    });
    await finalizeIngestionJobWithMirror(db, {
      jobId: input.jobId,
      status: 'succeeded',
      processedCount: 1,
      insertedCount: 0,
      skippedCount: 1,
      action: 'source_auto_unlock_retry_transient_terminal',
    });

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
      const currentUnlock = await getSourceItemUnlockBySourceItemIdOracleFirst(db, sourceItemId);
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

    await finalizeIngestionJobWithMirror(db, {
      jobId: input.jobId,
      status: 'succeeded',
      processedCount: 1,
      insertedCount: 0,
      skippedCount: 1,
      action: 'source_auto_unlock_retry_not_queued',
    });

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

  await finalizeIngestionJobWithMirror(db, {
    jobId: input.jobId,
    status: 'succeeded',
    processedCount: 1,
    insertedCount: 1,
    skippedCount: 0,
    action: 'source_auto_unlock_retry_terminal',
  });

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

function getErrorHttpStatus(error: unknown) {
  const raw = Number(
    (error as { status?: unknown } | null)?.status
    || (error as { response?: { status?: unknown } } | null)?.response?.status
    || 0,
  );
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
}

function getErrorRetryAfterSeconds(error: unknown) {
  const raw = Number((error as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds || 0);
  return Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : null;
}

function classifyRetryableGenerationProviderFailure(error: unknown) {
  const provider = String((error as { provider?: unknown } | null)?.provider || '').trim().toLowerCase();
  const status = getErrorHttpStatus(error);
  const code = String((error as { code?: unknown } | null)?.code || '').trim().toLowerCase();
  const message = error instanceof Error ? String(error.message || '').trim() : String(error || '').trim();
  const normalizedMessage = message.toLowerCase();
  const looksLikeOpenAiGeneration =
    provider === 'openai_api'
    || provider === 'openai'
    || normalizedMessage.includes("we're currently processing too many requests")
    || normalizedMessage.includes('openai generation request failed');

  if (!looksLikeOpenAiGeneration) return null;

  if (
    status === 429
    || code === 'rate_limit_exceeded'
    || code === 'rate_limited'
    || code === 'too_many_requests'
    || normalizedMessage.includes('too many requests')
    || normalizedMessage.includes('rate limit')
  ) {
    return {
      errorCode: 'RATE_LIMITED' as const,
      message: message || 'Generation provider is rate-limited. Please retry shortly.',
      retryAfterSeconds: getErrorRetryAfterSeconds(error) || getRetryDelayForErrorCode('RATE_LIMITED'),
    };
  }

  if (
    status === 408
    || code === 'timeout'
    || normalizedMessage.includes('timeout')
    || normalizedMessage.includes('timed out')
  ) {
    return {
      errorCode: 'TIMEOUT' as const,
      message: message || 'Generation provider timed out. Please retry shortly.',
      retryAfterSeconds: getErrorRetryAfterSeconds(error) || getRetryDelayForErrorCode('TIMEOUT'),
    };
  }

  if (
    status === 502
    || status === 503
    || status === 504
    || code === 'service_unavailable'
    || code === 'server_error'
    || normalizedMessage.includes('capacity')
    || normalizedMessage.includes('overloaded')
    || normalizedMessage.includes('try again later')
  ) {
    return {
      errorCode: 'PROVIDER_DEGRADED' as const,
      message: message || 'Generation provider is temporarily degraded. Please retry shortly.',
      retryAfterSeconds: getErrorRetryAfterSeconds(error) || getRetryDelayForErrorCode('PROVIDER_DEGRADED'),
    };
  }

  return null;
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
      retryDelaySeconds: error.retryAfterSeconds || getRetryDelayForErrorCode(error.errorCode),
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

async function loadAllActiveSubscriptionsBatchForRun(db: ReturnType<typeof getServiceSupabaseClient>) {
  const selectColumns = 'id, user_id, mode, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, auto_unlock_enabled, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, is_active, created_at, updated_at';
  if (
    oracleControlPlaneConfig.enabled
    && oracleControlPlane
    && oracleControlPlaneConfig.subscriptionSchedulerMode === 'primary'
  ) {
    try {
      const dueSnapshot = await listOracleDueSubscriptions({
        controlDb: oracleControlPlane,
        limit: oracleControlPlaneConfig.primaryBatchLimit,
        lookaheadMs: oracleControlPlaneConfig.shadowLookaheadMs,
      });
      const dueSubscriptionIds = dueSnapshot.rows.map((row) => row.subscriptionId);
      if (dueSubscriptionIds.length === 0) {
        console.log('[oracle-control-plane] primary_due_batch_empty', JSON.stringify({
          due_subscription_count: dueSnapshot.dueCount,
          next_due_at: dueSnapshot.nextDueAt,
        }));
        return {
          source: 'oracle_primary_due' as const,
          dueCount: dueSnapshot.dueCount,
          nextDueAt: dueSnapshot.nextDueAt,
          subscriptions: [],
        };
      }

      const data = await listUserSourceSubscriptionsByIdsOracleFirst(db, {
        subscriptionIds: dueSubscriptionIds,
        activeOnly: true,
        sourceType: 'youtube',
      });
      const rowMap = new Map(data.map((row) => [row.id, row]));
      const orderedSubscriptions = dueSubscriptionIds
        .map((subscriptionId) => rowMap.get(subscriptionId))
        .filter((subscription): subscription is NonNullable<(typeof data)[number]> => Boolean(subscription));

      console.log('[oracle-control-plane] primary_due_batch_selected', JSON.stringify({
        due_subscription_count: dueSnapshot.dueCount,
        selected_count: orderedSubscriptions.length,
        missing_count: Math.max(0, dueSubscriptionIds.length - orderedSubscriptions.length),
        next_due_at: dueSnapshot.nextDueAt,
        subscription_ids: dueSubscriptionIds.slice(0, 10),
      }));

      return {
        source: 'oracle_primary_due' as const,
        dueCount: dueSnapshot.dueCount,
        nextDueAt: dueSnapshot.nextDueAt,
        subscriptions: orderedSubscriptions,
      };
    } catch (error) {
      console.warn('[oracle-control-plane] primary_due_batch_fallback', JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const { data: subscriptions, error: subscriptionsError } = await db
    .from('user_source_subscriptions')
    .select(selectColumns)
    .eq('is_active', true)
    .eq('source_type', 'youtube')
    .order('last_polled_at', { ascending: true, nullsFirst: true })
    .order('updated_at', { ascending: false })
    .limit(
      oracleControlPlaneConfig.enabled
        && oracleControlPlane
        && oracleControlPlaneConfig.subscriptionSchedulerMode === 'primary'
        ? oracleControlPlaneConfig.primaryBatchLimit
        : allActiveSubscriptionsMaxPerRun,
    );
  if (subscriptionsError) throw subscriptionsError;
  return {
    source: 'supabase_fallback' as const,
    dueCount: null,
    nextDueAt: null,
    subscriptions: subscriptions || [],
  };
}

async function processAllActiveSubscriptionsJob(input: {
  jobId: string;
  traceId: string;
}) {
  const db = getServiceSupabaseClient();
  if (!db) throw new Error('Service role client not configured');
  if (oracleControlPlaneConfig.enabled && oracleControlPlane) {
    await markOracleAllActiveSubscriptionsRunStarted({
      controlDb: oracleControlPlane,
    });
  }
  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  let batchCount = 0;
  let completedSubscriptionCount = 0;
  let softFailureCount = 0;
  const softFailureSamples: Array<{ subscription_id: string; error: string }> = [];
  const failures: Array<{ subscription_id: string; error: string }> = [];
  try {
    const maxBatchRuns = (
      oracleControlPlaneConfig.enabled
      && oracleControlPlane
      && oracleControlPlaneConfig.subscriptionSchedulerMode === 'primary'
    )
      ? oracleControlPlaneConfig.primaryMaxBatchesPerRun
      : 1;

    for (let batchIndex = 0; batchIndex < maxBatchRuns; batchIndex += 1) {
      const batchLoad = await loadAllActiveSubscriptionsBatchForRun(db);
      const subscriptions = batchLoad.subscriptions;
      if (subscriptions.length === 0) break;
      batchCount += 1;

      for (const subscription of subscriptions) {
        try {
          const sync = await syncSingleSubscription(db, subscription, { trigger: 'service_cron' });
          processed += sync.processed;
          inserted += sync.inserted;
          skipped += sync.skipped;
          if (isFeedSoftFailureResultCode(sync.resultCode)) {
            softFailureCount += 1;
            if (softFailureSamples.length < 10) {
              softFailureSamples.push({
                subscription_id: subscription.id,
                error: String(sync.errorMessage || sync.resultCode),
              });
            }
          } else {
            completedSubscriptionCount += 1;
          }
          if (oracleControlPlaneConfig.enabled && oracleControlPlane) {
            await recordOracleSubscriptionSyncOutcome({
              controlDb: oracleControlPlane,
              subscriptionId: subscription.id,
              resultCode: sync.resultCode,
              activeRevisitMs: oracleControlPlaneConfig.activeRevisitMs,
              normalRevisitMs: oracleControlPlaneConfig.normalRevisitMs,
              quietRevisitMs: oracleControlPlaneConfig.quietRevisitMs,
              errorRetryMs: oracleControlPlaneConfig.errorRetryMs,
              processed: sync.processed,
              inserted: sync.inserted,
              skipped: sync.skipped,
              trigger: 'service_cron',
              errorMessage: sync.errorMessage,
            });
          }
        } catch (error) {
          const errorMessage = formatSubscriptionSyncErrorMessage(error);
          failures.push({
            subscription_id: subscription.id,
            error: errorMessage,
          });
          console.log('[subscription_sync_hard_failed]', JSON.stringify({
            subscription_id: subscription.id,
            user_id: subscription.user_id,
            source_channel_id: subscription.source_channel_id,
            source_channel_title: subscription.source_channel_title || null,
            trigger: 'service_cron',
            error: summarizeSubscriptionSyncError(error),
          }));
          await markSubscriptionSyncError(db, subscription, error);
          if (oracleControlPlaneConfig.enabled && oracleControlPlane) {
            await recordOracleSubscriptionSyncOutcome({
              controlDb: oracleControlPlane,
              subscriptionId: subscription.id,
              resultCode: 'error',
              activeRevisitMs: oracleControlPlaneConfig.activeRevisitMs,
              normalRevisitMs: oracleControlPlaneConfig.normalRevisitMs,
              quietRevisitMs: oracleControlPlaneConfig.quietRevisitMs,
              errorRetryMs: oracleControlPlaneConfig.errorRetryMs,
              trigger: 'service_cron',
              errorMessage,
            });
          }
        }
      }

      if (batchLoad.source !== 'oracle_primary_due') {
        break;
      }
      if (batchCount >= maxBatchRuns) {
        console.log('[oracle-control-plane] primary_multi_batch_cap_reached', JSON.stringify({
          batch_count: batchCount,
          max_batches_per_run: maxBatchRuns,
          last_due_count: batchLoad.dueCount,
          last_next_due_at: batchLoad.nextDueAt,
        }));
        break;
      }
    }

    const shouldFailBatch = failures.length > 0;
    await finalizeIngestionJobWithMirror(db, {
      jobId: input.jobId,
      status: shouldFailBatch ? 'failed' : 'succeeded',
      processedCount: processed,
      insertedCount: inserted,
      skippedCount: skipped,
      errorCode: shouldFailBatch ? 'PARTIAL_FAILURE' : null,
      errorMessage: shouldFailBatch
        ? JSON.stringify(failures.length > 0 ? failures : softFailureSamples).slice(0, 1000)
        : null,
      action: 'all_active_subscriptions_terminal',
    });

    if (softFailureCount > 0) {
      console.log('[subscription_batch_soft_failure_summary]', JSON.stringify({
        job_id: input.jobId,
        batch_count: batchCount,
        completed_subscription_count: completedSubscriptionCount,
        soft_failure_count: softFailureCount,
        hard_failure_count: failures.length,
        soft_failure_samples: softFailureSamples,
      }));
    }
    if (failures.length > 0) {
      console.log('[subscription_batch_hard_failure_summary]', JSON.stringify({
        job_id: input.jobId,
        batch_count: batchCount,
        hard_failure_count: failures.length,
        hard_failure_samples: failures.slice(0, 10),
      }));
    }
  } catch (error) {
    if (oracleControlPlaneConfig.enabled && oracleControlPlane) {
      await markOracleAllActiveSubscriptionsRunFinished({
        controlDb: oracleControlPlane,
        processed,
        inserted,
        skipped,
        failureCount: Math.max(1, failures.length),
        softFailureCount,
      });
    }
    throw error;
  }

  if (oracleControlPlaneConfig.enabled && oracleControlPlane) {
    await markOracleAllActiveSubscriptionsRunFinished({
      controlDb: oracleControlPlane,
      processed,
      inserted,
      skipped,
      failureCount: failures.length,
      softFailureCount,
    });
  }

  if (batchCount > 1) {
    console.log('[oracle-control-plane] primary_multi_batch_summary', JSON.stringify({
      batch_count: batchCount,
      max_batches_per_run: oracleControlPlaneConfig.primaryMaxBatchesPerRun,
      processed,
      inserted,
      skipped,
      failures: failures.length,
      soft_failures: softFailureCount,
    }));
  }

  logUnlockEvent('unlock_job_terminal', { trace_id: input.traceId, job_id: input.jobId }, {
    scope: 'all_active_subscriptions',
    processed,
    inserted,
    skipped,
    failures: failures.length,
    soft_failures: softFailureCount,
  });
}

async function processClaimedIngestionJob(db: ReturnType<typeof createClient>, job: IngestionJobRow) {
  const scope = String(job.scope || '').trim();
  if (!isQueuedIngestionScope(scope)) {
    await failClaimedIngestionJobWithMirror(db, {
      job,
      errorCode: 'UNSUPPORTED_SCOPE',
      errorMessage: `Unsupported queued scope: ${scope}`,
      scheduleRetryInSeconds: 0,
      maxAttempts: Number(job.max_attempts || 3),
      action: 'queued_job_fail_unsupported_scope',
    });
    return;
  }

  const payload = asObjectPayload(job.payload);
  const traceId = String(job.trace_id || payload.trace_id || '').trim() || createUnlockTraceId();
  const jobStartMs = Date.now();
  const queuedAtMs = Date.parse(String(job.created_at || '').trim());
  const queueWaitMs = Number.isFinite(queuedAtMs)
    ? Math.max(0, jobStartMs - queuedAtMs)
    : null;
  const leaseSeconds = Math.max(5, Math.ceil(workerLeaseMs / 1000));
  const initialHeartbeatDelayMs = resolveWorkerLeaseHeartbeatStartupDelayMs({
    scope,
    workerLeaseMs,
    heartbeatMs: effectiveWorkerHeartbeatMs,
  });
  let heartbeatError: unknown = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let mirrorHeartbeatActive = true;
  const runHeartbeat = () => {
    const heartbeatAtIso = new Date().toISOString();
    void touchClaimedIngestionJobLeaseWithMirror(db, {
      job,
      workerId: queuedWorkerId,
      leaseSeconds,
      heartbeatAtIso,
    }).then((ok) => {
      if (!ok && !heartbeatError) {
        heartbeatError = new Error('LEASE_HEARTBEAT_REJECTED');
      }
    }).catch((error) => {
      if (!heartbeatError) heartbeatError = error;
    });
  };
  heartbeatTimer = setTimeout(() => {
    heartbeatTimer = null;
    runHeartbeat();
    heartbeatInterval = setInterval(runHeartbeat, effectiveWorkerHeartbeatMs);
  }, initialHeartbeatDelayMs);

  try {
    console.log('[queued_job_claim_started]', JSON.stringify({
      job_id: job.id,
      scope,
      trace_id: traceId,
      requested_by_user_id: job.requested_by_user_id || null,
      queued_at: job.created_at || null,
      queue_wait_ms: queueWaitMs,
    }));
    await upsertOracleJobActivityFromKnownRow(job, 'queued_job_claim_start');
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
          await finalizeIngestionJobWithMirror(db, {
            jobId: job.id,
            status: 'succeeded',
            processedCount: 1,
            insertedCount: 1,
            skippedCount: 0,
            action: 'blueprint_youtube_enrichment_terminal',
          });
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
          await finalizeIngestionJobWithMirror(db, {
            jobId: job.id,
            status: 'succeeded',
            processedCount: 1,
            insertedCount: 1,
            skippedCount: 0,
            action: 'blueprint_youtube_refresh_terminal',
          });
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
    const failedJob = await failClaimedIngestionJobWithMirror(db, {
      job,
      errorCode: classified.errorCode,
      errorMessage: classified.message,
      scheduleRetryInSeconds: nextRetryDelay,
      maxAttempts: Number(job.max_attempts || 3),
      action: 'queued_job_fail_transition',
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

    if (
      scope === 'source_item_unlock_generation'
      && (nextRetryDelay === 0 || failedJob?.status === 'failed')
    ) {
      await runUnlockSweeps(db, { mode: 'cron', force: true, traceId });
    }
  } finally {
    mirrorHeartbeatActive = false;
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
  }
}

async function processClaimedIngestionJobs(db: ReturnType<typeof createClient>, jobs: IngestionJobRow[]) {
  const queue = jobs.slice();
  const transcriptBoundBatch = queue.length > 0 && queue.every((job) => isTranscriptBoundQueuedScope(job.scope));
  const concurrencyCap = transcriptBoundBatch
    ? effectiveQueuedTranscriptBoundSlotCapacity
    : workerConcurrency;
  const concurrency = Math.max(1, Math.min(concurrencyCap, queue.length));
  const incrementActiveClaimedJobs = () => {
    activeQueuedClaimedJobs += 1;
  };
  const decrementActiveClaimedJobs = () => {
    activeQueuedClaimedJobs = Math.max(0, activeQueuedClaimedJobs - 1);
  };
  const incrementActiveTranscriptBoundJobs = () => {
    activeTranscriptBoundQueuedClaimedJobs += 1;
  };
  const decrementActiveTranscriptBoundJobs = () => {
    activeTranscriptBoundQueuedClaimedJobs = Math.max(0, activeTranscriptBoundQueuedClaimedJobs - 1);
  };
  const workers = Array.from({ length: concurrency }, () => (async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      incrementActiveClaimedJobs();
      const transcriptBoundJob = isTranscriptBoundQueuedScope(next.scope);
      if (transcriptBoundJob) {
        incrementActiveTranscriptBoundJobs();
      }
      try {
        await processClaimedIngestionJob(db, next);
      } finally {
        if (transcriptBoundJob) {
          decrementActiveTranscriptBoundJobs();
        }
        decrementActiveClaimedJobs();
      }
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
  workerConcurrency,
  transcriptBoundSlotCapacity: effectiveQueuedTranscriptBoundSlotCapacity,
  getActiveClaimedJobCount: () => activeQueuedClaimedJobs,
  getActiveTranscriptBoundJobCount: () => activeTranscriptBoundQueuedClaimedJobs,
  isTranscriptBoundScope: isTranscriptBoundQueuedScope,
  keepAliveEnabled: runIngestionWorker,
  keepAliveDelayMs: workerKeepAliveDelayMs,
  keepAliveIdleBaseDelayMs: workerIdleBackoffBaseMs,
  keepAliveIdleMaxDelayMs: workerIdleBackoffMaxMs,
  maintenanceMinIntervalMs: workerMaintenanceMinIntervalMs,
  unlockSweepsEnabled: workerRuntimeControls.runUnlockSweeps,
  staleJobRecoveryEnabled: workerRuntimeControls.runStaleJobRecovery,
  queueSweepControlEnabled: workerRuntimeControls.runQueueSweepControl,
  memoryLoggingEnabled: workerRuntimeControls.memoryLoggingEnabled,
  getQueueSweepPlan,
  selectQueueSweepPlan: oracleQueueSweepControlEnabled && oracleControlPlane
    ? async ({ basePlan, nowIso }) => selectDueOracleQueueSweeps({
        controlDb: oracleControlPlane,
        config: oracleControlPlaneConfig,
        basePlan,
        nowIso,
      })
    : undefined,
  claimQueuedIngestionJobs: (db, input) => claimQueuedIngestionJobsWithLedger(db, input, {
    afterClaimedJobs: async (claimed) => {
      await upsertOracleJobActivityFromKnownRows(claimed, 'queued_job_claim_batch');
    },
  }),
  shouldAttemptQueueClaim: oracleQueueClaimControlEnabled && oracleControlPlane
    ? async ({ tier, scopes, maxJobs, nowIso }) => shouldAttemptOracleQueueClaim({
        controlDb: oracleControlPlane,
        tier,
        scopes,
        maxJobs,
        nowIso,
      })
    : undefined,
  recordQueueClaimResult: oracleQueueClaimControlEnabled && oracleControlPlane
    ? async ({ tier, scopes, maxJobs, claimedCount, nowIso }) => recordOracleQueueClaimResult({
        controlDb: oracleControlPlane,
        config: {
          emptyBackoffMinMs: oracleControlPlaneConfig.queueEmptyBackoffMinMs,
          emptyBackoffMaxMs: oracleControlPlaneConfig.queueEmptyBackoffMaxMs,
          mediumPriorityMultiplier: oracleControlPlaneConfig.queueMediumPriorityBackoffMultiplier,
          lowPriorityMultiplier: oracleControlPlaneConfig.queueLowPriorityBackoffMultiplier,
        },
        tier,
        scopes,
        maxJobs,
        claimedCount,
        nowIso,
      })
    : undefined,
  recordQueueSweepResult: oracleQueueSweepControlEnabled && oracleControlPlane
    ? async ({ tier, scopes, maxJobs, claimedCount, nowIso }) => recordOracleQueueSweepResult({
        controlDb: oracleControlPlane,
        config: oracleControlPlaneConfig,
        tier,
        scopes,
        maxJobs,
        claimedCount,
        nowIso,
      })
    : undefined,
  getKeepAliveDelayOverrideMs: oracleQueueSweepControlEnabled && oracleControlPlane
    ? async ({ baseIdleDelayMs, nowIso }) => getOracleQueueSweepNextDelayMs({
        controlDb: oracleControlPlane,
        basePlan: getQueueSweepPlan(),
        fallbackMs: baseIdleDelayMs,
        minDelayMs: workerKeepAliveDelayMs,
        nowIso,
      })
    : undefined,
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

type QueuedIngestionScheduleInput =
  | number
  | {
    delayMs?: number;
    scopes?: readonly string[];
    expedite?: boolean;
    reason?: string;
  };

function normalizeQueuedIngestionScheduleInput(input?: QueuedIngestionScheduleInput) {
  if (typeof input === 'number') {
    return {
      delayMs: Math.max(0, Math.floor(input)),
      scopes: [] as string[],
      expedite: false,
      reason: null as string | null,
    };
  }

  const delayMs = Math.max(0, Math.floor(Number(input?.delayMs) || 0));
  const scopes = Array.from(new Set(
    (input?.scopes || [])
      .map((scope) => String(scope || '').trim())
      .filter(Boolean),
  ));
  return {
    delayMs,
    scopes,
    expedite: Boolean(input?.expedite),
    reason: String(input?.reason || '').trim() || null,
  };
}

function scheduleQueuedIngestionProcessing(input?: QueuedIngestionScheduleInput) {
  const normalized = normalizeQueuedIngestionScheduleInput(input);
  const runSchedule = () => {
    if (!runIngestionWorker) {
      if (normalized.scopes.length > 0 || normalized.reason) {
        console.log('[queued_ingestion_local_schedule_skipped]', JSON.stringify({
          scopes: normalized.scopes,
          reason: normalized.reason,
          runtime_mode: runtimeMode,
        }));
      }
      return;
    }
    const shouldRequestInteractiveRefill = (
      normalized.delayMs === 0
      && normalized.scopes.length > 0
      && normalized.scopes.every((scope) => INTERACTIVE_QUEUE_REFILL_SCOPES.has(scope as QueuedIngestionScope))
    );
    if (shouldRequestInteractiveRefill) {
      queuedIngestionWorkerController.requestRefill({
        delayMs: normalized.delayMs,
        scopes: normalized.scopes,
        reason: normalized.reason,
      });
      return;
    }
    queuedIngestionWorkerController.schedule(normalized.delayMs);
  };

  if (
    !normalized.expedite
    || normalized.delayMs > 0
    || normalized.scopes.length === 0
    || !oracleControlPlane
    || (!oracleQueueSweepControlEnabled && !oracleQueueClaimControlEnabled)
  ) {
    runSchedule();
    return;
  }

  const planEntries = resolveQueueSweepPlanEntriesForScopes(normalized.scopes);
  if (planEntries.length === 0) {
    runSchedule();
    return;
  }

  void (async () => {
    const nowIso = new Date().toISOString();

    if (oracleQueueSweepControlEnabled) {
      await expediteOracleQueueSweeps({
        controlDb: oracleControlPlane,
        planEntries,
        nowIso,
      });
    }

    if (oracleQueueClaimControlEnabled) {
      for (const planEntry of planEntries) {
        await clearOracleQueueClaimCooldowns({
          controlDb: oracleControlPlane,
          tier: planEntry.tier,
          scopes: planEntry.scopes,
          maxJobs: planEntry.maxJobs,
          nowIso,
        });
      }
    }

    console.log('[queued_ingestion_expedited]', JSON.stringify({
      scopes: normalized.scopes,
      reason: normalized.reason,
      queue_sweep_control_enabled: oracleQueueSweepControlEnabled,
      queue_claim_control_enabled: oracleQueueClaimControlEnabled,
      expedited_plan_count: planEntries.length,
    }));
  })().catch((error) => {
    console.warn('[queued_ingestion_expedite_failed]', JSON.stringify({
      scopes: normalized.scopes,
      reason: normalized.reason,
      error: error instanceof Error ? error.message : String(error),
    }));
  }).finally(runSchedule);
}

async function runOraclePrimarySubscriptionSchedulerCycle() {
  if (
    !runOraclePrimarySubscriptionScheduler
    || !oracleControlPlane
  ) {
    return;
  }
  if (!ingestionServiceToken) {
    console.warn('[oracle-control-plane] primary_scheduler_tick_skipped', JSON.stringify({
      reason: 'missing_service_token',
    }));
    return;
  }

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ingestion/jobs/trigger`, {
      method: 'POST',
      headers: {
        'x-service-token': ingestionServiceToken,
        'x-oracle-primary-scheduler': '1',
      },
      signal: AbortSignal.timeout(Math.max(5_000, Math.min(30_000, oracleControlPlaneConfig.schedulerTickMs))),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let payload: any = null;
      try {
        payload = body ? JSON.parse(body) : null;
      } catch {
        payload = null;
      }
      if (response.status === 409 && payload?.error_code === 'JOB_ALREADY_RUNNING') {
        console.log('[oracle-control-plane] primary_scheduler_existing_job', JSON.stringify({
          status: response.status,
          job_id: payload?.data?.job_id || null,
          job_status: payload?.data?.status || null,
        }));
        return;
      }
      console.warn('[oracle-control-plane] primary_scheduler_tick_failed', JSON.stringify({
        status: response.status,
        body: body.slice(0, 500),
      }));
    }
  } catch (error) {
    console.warn('[oracle-control-plane] primary_scheduler_tick_failed', JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

const oracleSubscriptionSchedulerController = createOracleSubscriptionSchedulerController({
  enabled: runOraclePrimarySubscriptionScheduler,
  intervalMs: oracleControlPlaneConfig.schedulerTickMs,
  runCycle: runOraclePrimarySubscriptionSchedulerCycle,
});

function mapActualAllActiveSubscriptionsDecisionToShadowCode(
  actualDecisionCode:
    | 'actual_existing_job'
    | 'actual_min_interval'
    | 'actual_queue_backpressure'
    | 'actual_low_priority_suppressed'
    | 'actual_no_due_subscriptions'
    | 'actual_enqueued',
) {
  if (actualDecisionCode === 'actual_existing_job') return 'shadow_existing_job' as const;
  if (actualDecisionCode === 'actual_min_interval') return 'shadow_min_interval' as const;
  if (actualDecisionCode === 'actual_queue_backpressure') return 'shadow_queue_backpressure' as const;
  if (actualDecisionCode === 'actual_low_priority_suppressed') return 'shadow_low_priority_suppressed' as const;
  if (actualDecisionCode === 'actual_no_due_subscriptions') return 'shadow_no_due_subscriptions' as const;
  return 'shadow_enqueue' as const;
}

async function resolveOracleAllActiveSubscriptionsPrimaryDecision() {
  if (
    !oracleControlPlaneConfig.enabled
    || !oracleControlPlane
    || oracleControlPlaneConfig.subscriptionSchedulerMode !== 'primary'
  ) {
    return null;
  }

  return evaluateOraclePrimarySchedulerDecision({
    controlDb: oracleControlPlane,
    config: oracleControlPlaneConfig,
  });
}

async function observeOracleAllActiveSubscriptionsTrigger(input: {
  actualDecisionCode:
    | 'actual_existing_job'
    | 'actual_min_interval'
    | 'actual_queue_backpressure'
    | 'actual_low_priority_suppressed'
    | 'actual_no_due_subscriptions'
    | 'actual_enqueued';
  oracleDecisionCode?: OracleScopeDecisionCode | null;
  queueDepth?: number | null;
  dueSubscriptionCount?: number;
  dueSubscriptionIds?: string[];
  nextDueAt?: string | null;
  minIntervalUntil?: string | null;
  suppressionUntil?: string | null;
  latestJobId?: string | null;
  latestJobStatus?: string | null;
  latestActivityAt?: string | null;
  existingJobId?: string | null;
  existingJobStatus?: string | null;
  enqueuedJobId?: string | null;
}) {
  if (
    !oracleControlPlaneConfig.enabled
    || !oracleControlPlane
    || (
      oracleControlPlaneConfig.subscriptionSchedulerMode !== 'shadow'
      && oracleControlPlaneConfig.subscriptionSchedulerMode !== 'primary'
    )
  ) {
    return;
  }

  const actualShadowCode = mapActualAllActiveSubscriptionsDecisionToShadowCode(input.actualDecisionCode);
  let oracleDecisionCode = input.oracleDecisionCode || null;
  let dueSubscriptionCount = Math.max(0, Math.floor(Number(input.dueSubscriptionCount) || 0));
  let dueSubscriptionIds = (input.dueSubscriptionIds || []).slice(0, 10);
  let nextDueAt = input.nextDueAt || null;
  let resolvedQueueDepth = input.queueDepth ?? null;

  if (oracleControlPlaneConfig.subscriptionSchedulerMode === 'shadow') {
    const shadowDecision = await evaluateOracleShadowSchedulerDecision({
      controlDb: oracleControlPlane,
      config: oracleControlPlaneConfig,
      queueDepth: input.queueDepth ?? null,
      queueDepthHardLimit,
      queuePrioritySuppressed: input.actualDecisionCode === 'actual_low_priority_suppressed',
      actualExistingJob: input.existingJobId
        ? {
            id: input.existingJobId,
            status: String(input.existingJobStatus || '').trim() || 'queued',
          }
        : null,
    });
    oracleDecisionCode = shadowDecision.oracleDecisionCode;
    dueSubscriptionCount = shadowDecision.dueSubscriptionCount;
    dueSubscriptionIds = shadowDecision.dueSubscriptionIds.slice(0, 10);
    nextDueAt = shadowDecision.nextDueAt;
    resolvedQueueDepth = input.queueDepth ?? shadowDecision.queueDepth;
  } else if (!oracleDecisionCode) {
    oracleDecisionCode = actualShadowCode;
  }
  if (!oracleDecisionCode) {
    oracleDecisionCode = actualShadowCode;
  }

  await recordOracleSubscriptionSchedulerObservation({
    controlDb: oracleControlPlane,
    actualDecisionCode: input.actualDecisionCode,
    oracleDecisionCode,
    queueDepth: resolvedQueueDepth,
    dueSubscriptionCount,
    dueSubscriptionIds,
    nextDueAt,
    minIntervalUntil: input.minIntervalUntil,
    suppressionUntil: input.suppressionUntil,
    latestJobId: input.latestJobId,
    latestJobStatus: input.latestJobStatus,
    latestActivityAt: input.latestActivityAt,
    existingJobId: input.existingJobId,
    existingJobStatus: input.existingJobStatus,
    enqueuedJobId: input.enqueuedJobId,
    minIntervalMs: oracleControlPlaneConfig.primaryMinTriggerIntervalMs,
    suppressionMs: Math.max(60_000, oracleControlPlaneConfig.schedulerTickMs),
  });

  if (oracleControlPlaneConfig.subscriptionSchedulerMode === 'shadow') {
    console.log('[oracle-control-plane] shadow_trigger_observed', JSON.stringify({
      actual_decision_code: input.actualDecisionCode,
      oracle_decision_code: oracleDecisionCode,
      matched: actualShadowCode === oracleDecisionCode,
      due_subscription_count: dueSubscriptionCount,
      due_subscription_ids: dueSubscriptionIds,
      next_due_at: nextDueAt,
      queue_depth: resolvedQueueDepth,
    }));
    return;
  }

  console.log('[oracle-control-plane] primary_trigger_decision', JSON.stringify({
    actual_decision_code: input.actualDecisionCode,
    oracle_decision_code: oracleDecisionCode,
    matched: actualShadowCode === oracleDecisionCode,
    due_subscription_count: dueSubscriptionCount,
    due_subscription_ids: dueSubscriptionIds,
    next_due_at: nextDueAt,
    queue_depth: resolvedQueueDepth,
  }));
}

async function bootstrapOracleControlPlaneState() {
  if (!oracleControlPlaneConfig.enabled || !oracleControlPlane || !runIngestionWorker) {
    return;
  }
  const runReadPlaneBootstrap = workerRuntimeControls.runOracleReadPlaneBootstrap;
  const runMirrorBootstrap = workerRuntimeControls.runOracleMirrorBootstrap;
  logWorkerMemoryCheckpoint('oracle_bootstrap_start', {
    oracle_bootstrap_profile: workerRuntimeControls.oracleBootstrapProfile,
    read_plane_bootstrap: runReadPlaneBootstrap,
    mirror_bootstrap: runMirrorBootstrap,
  });
  const db = getServiceSupabaseClient();
  if (!db) {
    console.warn('[oracle-control-plane] bootstrap skipped: service role client not configured');
    return;
  }

  const subscriptions: Array<{
    id: string;
    user_id: string;
    source_channel_id: string;
    last_polled_at?: string | null;
    is_active?: boolean | null;
  }> = [];
  let from = 0;
  while (true) {
    const to = from + oracleControlPlaneConfig.bootstrapBatch - 1;
    const { data, error } = await db
      .from('user_source_subscriptions')
      .select('id, user_id, source_channel_id, last_polled_at, is_active')
      .eq('is_active', true)
      .eq('source_type', 'youtube')
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    subscriptions.push(...data);
    from += data.length;
    if (data.length < oracleControlPlaneConfig.bootstrapBatch) break;
  }
  logWorkerMemoryCheckpoint('oracle_bootstrap_subscriptions_loaded', {
    subscription_count: subscriptions.length,
  });

  const bootstrapResult = await bootstrapOracleSubscriptionSchedulerState({
    controlDb: oracleControlPlane,
    subscriptions,
    scope: 'all_active_subscriptions',
  });
  logWorkerMemoryCheckpoint('oracle_bootstrap_scheduler_state_complete', {
    subscription_count: bootstrapResult.activeCount,
  });

  let queueLedgerCount: number | null = null;
  let queueLedgerActiveCount: number | null = null;
  if (oracleQueueLedgerEnabled) {
    const queueLedgerBootstrap = oracleQueueLedgerMode === 'primary'
      ? await readOracleQueueLedgerBootstrapSummary({
        controlDb: oracleControlPlane,
      })
      : await syncOracleQueueLedgerFromSupabase({
        controlDb: oracleControlPlane,
        db,
        recentLimit: oracleControlPlaneConfig.queueLedgerBootstrapLimit,
      });
    queueLedgerCount = queueLedgerBootstrap.rowCount;
    queueLedgerActiveCount = queueLedgerBootstrap.activeCount;
  }

  let subscriptionLedgerCount: number | null = null;
  let subscriptionLedgerActiveCount: number | null = null;
  if (oracleSubscriptionLedgerEnabled && runReadPlaneBootstrap) {
    const subscriptionLedgerBootstrap = await syncOracleSubscriptionLedgerFromSupabase({
      controlDb: oracleControlPlane,
      db,
      limit: oracleControlPlaneConfig.subscriptionLedgerBootstrapLimit,
    });
    subscriptionLedgerCount = subscriptionLedgerBootstrap.rowCount;
    subscriptionLedgerActiveCount = subscriptionLedgerBootstrap.activeCount;
  }

  let unlockLedgerCount: number | null = null;
  let unlockLedgerActiveCount: number | null = null;
  if (oracleUnlockLedgerEnabled) {
    const [unlockLedgerCountRow, unlockLedgerActiveCountRow] = await Promise.all([
      oracleControlPlane.db
        .selectFrom('unlock_ledger_state')
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .executeTakeFirst(),
      oracleControlPlane.db
        .selectFrom('unlock_ledger_state')
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .where('status', 'in', ['reserved', 'processing'])
        .executeTakeFirst(),
    ]);
    unlockLedgerCount = Number(unlockLedgerCountRow?.count || 0);
    unlockLedgerActiveCount = Number(unlockLedgerActiveCountRow?.count || 0);
  }

  let feedLedgerCount: number | null = null;
  let feedLedgerActiveCount: number | null = null;
  if (oracleFeedLedgerEnabled && runReadPlaneBootstrap) {
    const [feedLedgerCountRow, feedLedgerActiveCountRow] = await Promise.all([
      oracleControlPlane.db
        .selectFrom('feed_ledger_state')
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .executeTakeFirst(),
      oracleControlPlane.db
        .selectFrom('feed_ledger_state')
        .select(({ fn }) => fn.count<number>('id').as('count'))
        .where('state', 'in', ['my_feed_unlockable', 'my_feed_unlocking'])
        .executeTakeFirst(),
    ]);
    feedLedgerCount = Number(feedLedgerCountRow?.count || 0);
    feedLedgerActiveCount = Number(feedLedgerActiveCountRow?.count || 0);
  }

  let sourceItemLedgerCount: number | null = null;
  if (oracleSourceItemLedgerEnabled && runReadPlaneBootstrap) {
    const sourceItemLedgerCountRow = await oracleControlPlane.db
      .selectFrom('source_item_ledger_state')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .executeTakeFirst();
    sourceItemLedgerCount = Number(sourceItemLedgerCountRow?.count || 0);
  }

  let generationVariantCount: number | null = null;
  let generationVariantActiveCount: number | null = null;
  let generationRunCount: number | null = null;
  let generationRunActiveCount: number | null = null;
  if (oracleGenerationStateEnabled) {
    const generationStateBootstrap = await countOracleGenerationStateRows({
      controlDb: oracleControlPlane,
    });
    generationVariantCount = generationStateBootstrap.variantCount;
    generationVariantActiveCount = generationStateBootstrap.variantActiveCount;
    generationRunCount = generationStateBootstrap.runCount;
    generationRunActiveCount = generationStateBootstrap.runActiveCount;
  }

  let blueprintTagCount: number | null = null;
  if (oracleControlPlane && runReadPlaneBootstrap) {
    blueprintTagCount = await countOracleBlueprintTagRows({
      controlDb: oracleControlPlane,
    });
    if (blueprintTagCount === 0) {
      const blueprintTagBootstrap = await syncOracleBlueprintTagRowsFromSupabase({
        controlDb: oracleControlPlane,
        db,
        batchSize: oracleControlPlaneConfig.bootstrapBatch,
      });
      blueprintTagCount = blueprintTagBootstrap.rowCount;
    }
  }

  let tagCount: number | null = null;
  if (oracleControlPlane && runReadPlaneBootstrap) {
    tagCount = await countOracleTagRows({
      controlDb: oracleControlPlane,
    });
    const tagBootstrapCompleted = await hasOracleTagBootstrapCompleted({
      controlDb: oracleControlPlane,
    });
    if (tagCount === 0 && !tagBootstrapCompleted) {
      const tagBootstrap = await syncOracleTagRowsFromSupabase({
        controlDb: oracleControlPlane,
        db,
        batchSize: oracleControlPlaneConfig.bootstrapBatch,
      });
      tagCount = tagBootstrap.rowCount;
    }
  }

  let tagFollowCount: number | null = null;
  if (oracleControlPlane && runReadPlaneBootstrap) {
    tagFollowCount = await countOracleTagFollowRows({
      controlDb: oracleControlPlane,
    });
    const tagFollowBootstrapCompleted = await hasOracleTagFollowBootstrapCompleted({
      controlDb: oracleControlPlane,
    });
    if (tagFollowCount === 0 && !tagFollowBootstrapCompleted) {
      const tagFollowBootstrap = await syncOracleTagFollowRowsFromSupabase({
        controlDb: oracleControlPlane,
        db,
        batchSize: oracleControlPlaneConfig.bootstrapBatch,
      });
      tagFollowCount = tagFollowBootstrap.rowCount;
    }
  }

  let blueprintCommentCount: number | null = null;
  if (oracleControlPlane && runReadPlaneBootstrap) {
    blueprintCommentCount = await countOracleBlueprintCommentRows({
      controlDb: oracleControlPlane,
    });
    if (blueprintCommentCount === 0) {
      const blueprintCommentBootstrap = await syncOracleBlueprintCommentRowsFromSupabase({
        controlDb: oracleControlPlane,
        db,
        batchSize: oracleControlPlaneConfig.bootstrapBatch,
      });
      blueprintCommentCount = blueprintCommentBootstrap.rowCount;
    }
  }

  let blueprintLikeCount: number | null = null;
  if (oracleControlPlane && runReadPlaneBootstrap) {
    blueprintLikeCount = await countOracleBlueprintLikeRows({
      controlDb: oracleControlPlane,
    });
    const blueprintLikeBootstrapCompleted = await hasOracleBlueprintLikeBootstrapCompleted({
      controlDb: oracleControlPlane,
    });
    if (blueprintLikeCount === 0 && !blueprintLikeBootstrapCompleted) {
      const blueprintLikeBootstrap = await syncOracleBlueprintLikeRowsFromSupabase({
        controlDb: oracleControlPlane,
        db,
        batchSize: oracleControlPlaneConfig.bootstrapBatch,
      });
      blueprintLikeCount = blueprintLikeBootstrap.rowCount;
    }
  }

  let blueprintStateCount: number | null = null;
  if (oracleControlPlane && runReadPlaneBootstrap) {
    blueprintStateCount = await countOracleBlueprintRows({
      controlDb: oracleControlPlane,
    });
    if (blueprintStateCount === 0) {
      const blueprintStateBootstrap = await syncOracleBlueprintRowsFromSupabase({
        controlDb: oracleControlPlane,
        db,
        batchSize: oracleControlPlaneConfig.bootstrapBatch,
      });
      blueprintStateCount = blueprintStateBootstrap.rowCount;
    }
  }

  let profileStateCount: number | null = null;
  if (oracleControlPlane && runReadPlaneBootstrap) {
    profileStateCount = await countOracleProfileRows({
      controlDb: oracleControlPlane,
    });
    if (profileStateCount === 0) {
      const profileStateBootstrap = await syncOracleProfileRowsFromSupabase({
        controlDb: oracleControlPlane,
        db,
        batchSize: oracleControlPlaneConfig.bootstrapBatch,
      });
      profileStateCount = profileStateBootstrap.rowCount;
    }
  }

  let channelCandidateCount: number | null = null;
  let channelGateDecisionCount: number | null = null;
  if (oracleControlPlane && runReadPlaneBootstrap) {
    const channelCandidateBootstrapState = await countOracleChannelCandidateStateRows({
      controlDb: oracleControlPlane,
    });
    channelCandidateCount = channelCandidateBootstrapState.candidateCount;
    channelGateDecisionCount = channelCandidateBootstrapState.decisionCount;
    if (channelCandidateCount === 0) {
      const channelBootstrap = await syncOracleChannelCandidateStateFromSupabase({
        controlDb: oracleControlPlane,
        db,
        batchSize: oracleControlPlaneConfig.bootstrapBatch,
      });
      channelCandidateCount = channelBootstrap.candidateCount;
      channelGateDecisionCount = channelBootstrap.decisionCount;
    }
  }

  let queueAdmissionActiveCount: number | null = null;
  if (oracleControlPlaneConfig.queueAdmissionMirrorEnabled && runMirrorBootstrap) {
    const queueAdmissionBootstrap = await syncOracleQueueAdmissionMirrorFromSupabase({
      controlDb: oracleControlPlane,
      db,
    });
    queueAdmissionActiveCount = queueAdmissionBootstrap.activeCount;
  }

  let jobActivityCount: number | null = null;
  let jobActivityActiveCount: number | null = null;
  if (oracleControlPlaneConfig.jobActivityMirrorEnabled && runMirrorBootstrap) {
    const jobActivityBootstrap = await syncOracleJobActivityMirrorFromSupabase({
      controlDb: oracleControlPlane,
      db,
      recentLimit: oracleControlPlaneConfig.jobActivityBootstrapLimit,
    });
    jobActivityCount = jobActivityBootstrap.rowCount;
    jobActivityActiveCount = jobActivityBootstrap.activeCount;
  }

  let productSubscriptionCount: number | null = null;
  let productSourceItemCount: number | null = null;
  let productUnlockCount: number | null = null;
  let productFeedCount: number | null = null;
  if (oracleProductMirrorEnabled && runMirrorBootstrap) {
    const productBootstrap = await syncOracleProductStateFromSupabase({
      controlDb: oracleControlPlane,
      db,
      recentLimit: oracleControlPlaneConfig.productBootstrapLimit,
    });
    productSubscriptionCount = productBootstrap.subscriptionCount;
    productSourceItemCount = productBootstrap.sourceItemCount;
    productUnlockCount = productBootstrap.unlockCount;
    productFeedCount = productBootstrap.feedCount;
  }

  console.log('[oracle-control-plane] bootstrap complete', JSON.stringify({
    runtime_mode: runtimeMode,
    bootstrap_profile: workerRuntimeControls.oracleBootstrapProfile,
    read_plane_bootstrap: runReadPlaneBootstrap,
    mirror_bootstrap: runMirrorBootstrap,
    scheduler_mode: oracleControlPlaneConfig.subscriptionSchedulerMode,
    queue_ledger_mode: oracleQueueLedgerMode,
    queue_oracle_only_enabled: oracleQueueOracleOnlyEnabled,
    subscription_ledger_mode: oracleSubscriptionLedgerMode,
    unlock_ledger_mode: oracleUnlockLedgerMode,
    feed_ledger_mode: oracleFeedLedgerMode,
    source_item_ledger_mode: oracleSourceItemLedgerMode,
    generation_state_mode: oracleGenerationStateMode,
    sqlite_path: oracleControlPlane.sqlitePath,
    subscription_count: bootstrapResult.activeCount,
    queue_ledger_count: queueLedgerCount,
    queue_ledger_active_count: queueLedgerActiveCount,
    subscription_ledger_count: subscriptionLedgerCount,
    subscription_ledger_active_count: subscriptionLedgerActiveCount,
    unlock_ledger_count: unlockLedgerCount,
    unlock_ledger_active_count: unlockLedgerActiveCount,
    feed_ledger_count: feedLedgerCount,
    feed_ledger_active_count: feedLedgerActiveCount,
    source_item_ledger_count: sourceItemLedgerCount,
    generation_variant_count: generationVariantCount,
    generation_variant_active_count: generationVariantActiveCount,
    generation_run_count: generationRunCount,
    generation_run_active_count: generationRunActiveCount,
    blueprint_tag_count: blueprintTagCount,
    tag_count: tagCount,
    tag_follow_count: tagFollowCount,
    blueprint_comment_count: blueprintCommentCount,
    blueprint_like_count: blueprintLikeCount,
    blueprint_state_count: blueprintStateCount,
    profile_state_count: profileStateCount,
    channel_candidate_count: channelCandidateCount,
    channel_gate_decision_count: channelGateDecisionCount,
    queue_admission_active_count: queueAdmissionActiveCount,
    job_activity_count: jobActivityCount,
    job_activity_active_count: jobActivityActiveCount,
    product_subscription_count: productSubscriptionCount,
    product_source_item_count: productSourceItemCount,
    product_unlock_count: productUnlockCount,
    product_feed_count: productFeedCount,
    bootstrap_batch: oracleControlPlaneConfig.bootstrapBatch,
    queue_ledger_bootstrap_limit: oracleControlPlaneConfig.queueLedgerBootstrapLimit,
    subscription_ledger_bootstrap_limit: oracleControlPlaneConfig.subscriptionLedgerBootstrapLimit,
    unlock_ledger_bootstrap_limit: oracleControlPlaneConfig.unlockLedgerBootstrapLimit,
    feed_ledger_bootstrap_limit: oracleControlPlaneConfig.feedLedgerBootstrapLimit,
    source_item_ledger_bootstrap_limit: oracleControlPlaneConfig.sourceItemLedgerBootstrapLimit,
    generation_state_bootstrap_limit: oracleControlPlaneConfig.generationStateBootstrapLimit,
    job_activity_bootstrap_limit: oracleControlPlaneConfig.jobActivityBootstrapLimit,
    product_bootstrap_limit: oracleControlPlaneConfig.productBootstrapLimit,
  }));
  logWorkerMemoryCheckpoint('oracle_bootstrap_complete', {
    subscription_count: bootstrapResult.activeCount,
    read_plane_bootstrap: runReadPlaneBootstrap,
    mirror_bootstrap: runMirrorBootstrap,
  });
}

async function runYouTubeRefreshSchedulerCycle() {
  if (!youtubeRefreshEnabled || !runIngestionWorker) return;
  const db = getServiceSupabaseClient();
  if (!db) return;

  try {
    const queueDepth = await countQueueDepthForAdmission(db, {
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
  ensureSourceItemUnlock: ensureSourceItemUnlockWithMirror,
  computeUnlockCost,
  attemptAutoUnlockForSourceItem,
  getServiceSupabaseClient,
  enqueueSourceAutoUnlockRetryJob,
  getSourceItemUnlockBySourceItemId: getSourceItemUnlockBySourceItemIdOracleFirst,
  getTranscriptCooldownState,
  isConfirmedNoTranscriptUnlock,
  suppressUnlockableFeedRowsForSourceItem: suppressUnlockableFeedRowsForSourceItemWithMirror,
  insertFeedItem,
  upsertFeedItemWithBlueprint,
  resolveVariantOrReady,
  resolveYouTubeChannel,
  resolveYouTubeChannelByCreatorName: resolveStrongYouTubeChannelByCreatorName,
  syncOracleProductSubscriptions: upsertOracleProductSubscriptionsFromKnownRows,
  persistSourceSubscriptionPatch: (db, input) => patchUserSourceSubscriptionOracleAware(db, {
    subscriptionId: input.subscription.id,
    userId: input.subscription.user_id,
    patch: input.patch,
    action: input.action,
  }),
});
const {
  syncSingleSubscription,
  isFeedSoftFailureResultCode,
} = sourceSubscriptionSyncService;

const DebugSimulateSubscriptionRequestSchema = z.object({
  rewind_days: z.coerce.number().int().min(1).max(365).optional(),
});

async function markSubscriptionSyncError(
  db: ReturnType<typeof createClient>,
  subscription: string | { id: string; last_polled_at?: string | null; last_sync_error?: string | null },
  err: unknown,
) {
  const message = formatSubscriptionSyncErrorMessage(err);
  const nowIso = new Date().toISOString();
  const update = buildSubscriptionSyncErrorUpdate({
    subscription: typeof subscription === 'string' ? null : subscription,
    errorMessage: message,
    nowIso,
  });
  if (!update) return;

  await patchUserSourceSubscriptionOracleAware(db, {
    subscriptionId: typeof subscription === 'string' ? subscription : subscription.id,
    userId: typeof subscription === 'string'
      ? ''
      : String((subscription as { user_id?: unknown } | null)?.user_id || '').trim(),
    patch: update,
    action: 'subscription_sync_error',
  });
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
      if (!oracleFeedLedgerPrimaryEnabled) {
        await db
          .from('user_feed_items')
          .delete()
          .eq('user_id', input.userId)
          .eq('source_item_id', noticeSource.id)
          .eq('state', 'subscription_notice');
      }
      await deleteOracleProductFeedRowsForSubscriptionNotice({
        userId: input.userId,
        sourceItemId: noticeSource.id,
      });
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
  listYouTubeSourceVideos,
  runSourcePageAssetSweep,
  ensureSourcePageFromYouTubeChannel,
  upsertSourceSubscription: upsertUserSourceSubscriptionOracleAware,
  listSourceSubscriptionsForUser: listUserSourceSubscriptionsForUserOracleFirst,
  listSourceSubscriptionsPageForUser: listUserSourceSubscriptionsPageForUserOracleFirst,
  getSourceSubscriptionById: getUserSourceSubscriptionByIdOracleFirst,
  patchSourceSubscriptionById: patchUserSourceSubscriptionOracleAware,
  deactivateSourceSubscriptionById: (db: ReturnType<typeof createClient>, input: {
    subscriptionId: string;
    userId: string;
    action: string;
  }) => patchUserSourceSubscriptionOracleAware(db, {
    subscriptionId: input.subscriptionId,
    userId: input.userId,
    patch: { is_active: false },
    action: input.action,
  }),
  syncSingleSubscription,
  markSubscriptionSyncError,
  upsertSubscriptionNoticeSourceItem,
  insertFeedItem,
  upsertFeedItemWithBlueprint,
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
  countQueueDepth: countQueueDepthForAdmission,
  countQueueWorkItems: countQueueWorkItemsForAdmission,
  queueDepthHardLimit,
  queueDepthPerUserLimit,
  queueWorkItemsHardLimit,
  queueWorkItemsPerUserLimit,
  emitGenerationStartedNotification,
  getGenerationNotificationLinkPath,
  scheduleQueuedIngestionProcessing,
  enqueueIngestionJob: enqueueIngestionJobWithMirror,
  finalizeIngestionJob: finalizeIngestionJobWithMirror,
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
  getUserSubscriptionStateForSourcePage: getUserSubscriptionStateForSourcePageOracleFirst,
  getBlueprintAvailabilityForVideo: getBlueprintAvailabilityForVideoOracleFirst,
  listBlueprintTagRows: ({ blueprintIds }: any) => listBlueprintTagRowsOracleAware(getServiceSupabaseClient()!, { blueprintIds }),
  readBlueprintRows: async ({ blueprintIds }: any) => ensureOracleBlueprintRowsByIds(blueprintIds || []),
  readPublicFeedRows: ({ db, blueprintIds, state, limit, cursor, requireBlueprint }: any) => listPublicProductFeedRowsOracleFirst(db, {
    blueprintIds,
    state,
    limit,
    cursor,
    requireBlueprint,
  }),
  readChannelCandidateRows: ({ db, feedItemIds, statuses }: any) => listChannelCandidateRowsOracleFirst(db, {
    feedItemIds,
    statuses,
  }),
  readSourceRows: ({ db, sourceIds }: any) => listProductSourceItemsOracleFirst(db, {
    ids: sourceIds,
    action: 'source_page_blueprints_read_source_rows',
  }),
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
  countActiveSubscribersForSourcePage: countActiveSubscribersForSourcePageOracleFirst,
  computeUnlockCost,
  getSourceItemUnlocksBySourceItemIds: getSourceItemUnlocksBySourceItemIdsOracleFirst,
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
  ensureSourceItemUnlock: ensureSourceItemUnlockWithMirror,
  getTranscriptCooldownState,
  reserveUnlock: reserveUnlockWithMirror,
  sourceUnlockReservationSeconds,
  reserveCredits,
  refundReservation,
  buildUnlockLedgerIdempotencyKey,
  failUnlock: failUnlockWithMirror,
  attachReservationLedger: attachReservationLedgerWithMirror,
  markUnlockProcessing: markUnlockProcessingWithMirror,
  countQueueDepth: countQueueDepthForAdmission,
  countQueueWorkItems: countQueueWorkItemsForAdmission,
  unlockIntakeEnabled,
  queueDepthHardLimit,
  queueDepthPerUserLimit,
  queueWorkItemsHardLimit,
  queueWorkItemsPerUserLimit,
  workerConcurrency,
  emitGenerationStartedNotification,
  getGenerationNotificationLinkPath,
  scheduleQueuedIngestionProcessing,
  enqueueIngestionJob: enqueueIngestionJobWithMirror,
  settleReservation,
  completeUnlock: completeUnlockWithMirror,
  runYouTubePipeline: (pipelineInput: any) => runYouTubePipeline(pipelineInput),
  getFailureTransition,
  sourceTranscriptMaxAttempts,
  resolveYouTubeChannel,
  fetchYouTubeChannelAssetMap,
  ensureSourcePageFromYouTubeChannel,
  upsertSourceSubscription: upsertUserSourceSubscriptionOracleAware,
  deactivateSourceSubscriptionByChannel: deactivateUserSourceSubscriptionByChannelOracleAware,
  syncSingleSubscription,
  markSubscriptionSyncError,
  upsertSubscriptionNoticeSourceItem,
  insertFeedItem,
  upsertFeedItemWithBlueprint,
  cleanupSubscriptionNoticeForChannel,
  resolveGenerationTierAccess,
  resolveRequestedGenerationTier,
  normalizeRequestedGenerationTier,
  resolveVariantOrReady,
});

registerIngestionUserRoutes(app, {
  getAuthedSupabaseClient,
  getServiceSupabaseClient,
  getUserIngestionJobById: getUserIngestionJobByIdOracleFirst,
  getLatestUserIngestionJobs: listLatestUserIngestionJobsOracleFirst,
  listActiveUserIngestionJobs: listActiveUserIngestionJobsOracleFirst,
  listQueuedJobsForScopes: listQueuedJobsForScopesOracleFirst,
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
  getActiveIngestionJobForScope: getActiveIngestionJobForScopeOracleFirst,
  getLatestIngestionJob: getLatestIngestionJobOracleFirst,
  getLatestIngestionJobForScope: getLatestIngestionJobForScopeOracleFirst,
  getQueueHealthSnapshot: getQueueHealthSnapshotOracleFirst,
  recoverStaleIngestionJobs,
  runUnlockSweeps,
  runSourcePageAssetSweep,
  seedSourceTranscriptRevalidateJobs,
  countQueueDepth: countQueueDepthForAdmission,
  countQueueWorkItems: countQueueWorkItemsForAdmission,
  createUnlockTraceId,
  scheduleQueuedIngestionProcessing,
  enqueueIngestionJob: enqueueIngestionJobWithMirror,
  finalizeIngestionJob: finalizeIngestionJobWithMirror,
  queueDepthHardLimit,
  queueDepthPerUserLimit,
  queueWorkItemsHardLimit,
  queueWorkItemsPerUserLimit,
  queuePriorityEnabled,
  queueLowPrioritySuppressionDepth,
  allActiveSubscriptionsMinTriggerIntervalMs,
  oraclePrimaryMinTriggerIntervalMs: oracleControlPlaneConfig.primaryMinTriggerIntervalMs,
  oraclePrimaryOwnsAllActiveSubscriptionsTrigger: (
    oracleControlPlaneConfig.enabled
    && oracleControlPlaneConfig.subscriptionSchedulerMode === 'primary'
  ),
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
  resolveOracleAllActiveSubscriptionsPrimaryDecision,
  observeOracleAllActiveSubscriptionsTrigger,
});

registerFeedRoutes(app, {
  autoChannelPipelineEnabled,
  getAuthedSupabaseClient,
  getServiceSupabaseClient,
  saveGeneratedYouTubeBlueprintToFeed,
  readChannelCandidateRows: ({ db, feedItemIds, statuses }: any) => listChannelCandidateRowsOracleFirst(db, {
    feedItemIds,
    statuses,
  }),
  readSourceRows: ({ db, sourceIds }: any) => listProductSourceItemsOracleFirst(db, {
    ids: sourceIds,
    action: 'feed_route_read_source_rows',
  }),
  readFeedRows: ({ db, userId, limit, sourceItemIds, requireBlueprint }: any) => listProductFeedRowsForUserOracleFirst(db, {
    userId,
    limit,
    sourceItemIds,
    requireBlueprint,
  }),
  readPublicFeedRows: ({ db, blueprintIds, state, limit, cursor, requireBlueprint }: any) => listPublicProductFeedRowsOracleFirst(db, {
    blueprintIds,
    state,
    limit,
    cursor,
    requireBlueprint,
  }),
  readUnlockRows: (db, sourceIds) => getSourceItemUnlocksBySourceItemIdsOracleFirst(db, sourceIds),
  getFeedItemById: getFeedItemByIdOracleFirst,
  patchFeedItemById: patchFeedItemByIdOracleAware,
  createBlueprintFromVideo,
  runAutoChannelForFeedItem,
});

registerChannelCandidateRoutes(app, {
  rejectLegacyManualFlowIfDisabled,
  getAuthedSupabaseClient,
  getServiceSupabaseClient,
  listBlueprintTagRows: ({ blueprintIds }) => {
    const db = getServiceSupabaseClient();
    if (!db) return Promise.resolve([]);
    return listBlueprintTagRowsOracleAware(db, { blueprintIds });
  },
  listBlueprintTagSlugs: ({ blueprintId }) => {
    const db = getServiceSupabaseClient();
    if (!db) return Promise.resolve([]);
    return listBlueprintTagSlugsOracleAware(db, { blueprintId });
  },
  attachBlueprintTag: ({ blueprintId, tagId, tagSlug }) => {
    const db = getServiceSupabaseClient();
    if (!db) return Promise.resolve();
    return attachBlueprintTagOracleAware(db, { blueprintId, tagId, tagSlug });
  },
  getFeedItemById: getFeedItemByIdOracleFirst,
  patchFeedItemById: patchFeedItemByIdOracleAware,
  listChannelCandidateRows: (db, input) => listChannelCandidateRowsOracleFirst(db, input),
  getChannelCandidateById: (db, { candidateId }) => getChannelCandidateByIdOracleFirst(db, { candidateId }),
  upsertChannelCandidate: (db, { row }) => upsertChannelCandidateOracleFirst(db, { row }),
  updateChannelCandidateStatus: (db, { candidateId, status }) => updateChannelCandidateStatusOracleFirst(db, {
    candidateId,
    status,
  }),
  listChannelGateDecisions: (db, { candidateId }) => listChannelGateDecisionRowsOracleFirst(db, { candidateId }),
  insertChannelGateDecisions: (db, { candidateId, decisions }) => insertChannelGateDecisionRowsOracleFirst(db, {
    candidateId,
    decisions,
  }),
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
  const retryableGenerationFailure = classifyRetryableGenerationProviderFailure(error);
  if (retryableGenerationFailure) {
    return {
      error_code: retryableGenerationFailure.errorCode,
      message: retryableGenerationFailure.message,
      retry_after_seconds: retryableGenerationFailure.retryAfterSeconds,
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
  if (key === 'open questions' || key === 'caveats') return 'open_questions';
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
  maxConcurrency: effectiveTranscriptThrottleConcurrency,
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
  const requestClass = options?.requestClass === 'interactive' ? 'interactive' : 'background';
  const effectiveRetryDefaults = resolveProviderRetryDefaultsForRequestClass(
    requestClass,
    pipelineProviderRetryDefaults,
  );
  return runTranscriptTaskWithThrottle(
    {
      requestClass,
      reason: options?.reason || 'pipeline_transcript_fetch',
      videoId,
    },
    () => getTranscriptForVideo(videoId, {
      db: getServiceSupabaseClient(),
      enableFallback: true,
      retryDefaultsOverride: {
        transcriptAttempts: effectiveRetryDefaults.transcriptAttempts,
        transcriptTimeoutMs: effectiveRetryDefaults.transcriptTimeoutMs,
      },
    }),
  );
}

const getTranscriptForVideoWithCacheBypass = createTranscriptFetchWithCacheBypass({
  getDb: () => getServiceSupabaseClient(),
  fetchWithThrottle: getTranscriptForVideoWithThrottle,
  onCacheHit: ({ videoId, requestClass, reason }) => {
    console.log('[transcript_cache_bypass_hit]', JSON.stringify({
      video_id: videoId,
      request_class: requestClass,
      reason,
    }));
  },
});

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
  providerRetryDefaults: pipelineProviderRetryDefaults,
  getTranscriptForVideo: getTranscriptForVideoWithCacheBypass,
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
logWorkerMemoryCheckpoint('startup_config_loaded', {
  oracle_bootstrap_profile: workerRuntimeControls.oracleBootstrapProfile,
  read_plane_bootstrap: workerRuntimeControls.runOracleReadPlaneBootstrap,
  mirror_bootstrap: workerRuntimeControls.runOracleMirrorBootstrap,
  youtube_refresh_scheduler: workerRuntimeControls.runYoutubeRefreshScheduler,
  notification_push_dispatcher: workerRuntimeControls.runNotificationPushDispatcher,
  unlock_sweeps: workerRuntimeControls.runUnlockSweeps,
  stale_job_recovery: workerRuntimeControls.runStaleJobRecovery,
  queue_sweep_control: workerRuntimeControls.runQueueSweepControl,
});
if (oracleControlPlaneConfig.enabled && oracleControlPlane) {
  console.log('[oracle-control-plane] enabled', JSON.stringify({
    scheduler_mode: oracleControlPlaneConfig.subscriptionSchedulerMode,
    queue_ledger_mode: oracleQueueLedgerMode,
    queue_oracle_only_enabled: oracleQueueOracleOnlyEnabled,
    subscription_ledger_mode: oracleSubscriptionLedgerMode,
    unlock_ledger_mode: oracleUnlockLedgerMode,
    feed_ledger_mode: oracleFeedLedgerMode,
    source_item_ledger_mode: oracleSourceItemLedgerMode,
    generation_state_mode: oracleGenerationStateMode,
    sqlite_path: oracleControlPlane.sqlitePath,
    scheduler_tick_ms: oracleControlPlaneConfig.schedulerTickMs,
    primary_min_trigger_interval_ms: oracleControlPlaneConfig.primaryMinTriggerIntervalMs,
    primary_batch_limit: oracleControlPlaneConfig.primaryBatchLimit,
    primary_max_batches_per_run: oracleControlPlaneConfig.primaryMaxBatchesPerRun,
    queue_control_enabled: oracleControlPlaneConfig.queueControlEnabled,
    queue_sweep_control_enabled: oracleControlPlaneConfig.queueSweepControlEnabled,
    queue_admission_mirror_enabled: oracleControlPlaneConfig.queueAdmissionMirrorEnabled,
    queue_admission_refresh_stale_ms: oracleControlPlaneConfig.queueAdmissionRefreshStaleMs,
    job_activity_mirror_enabled: oracleControlPlaneConfig.jobActivityMirrorEnabled,
    job_activity_bootstrap_limit: oracleControlPlaneConfig.jobActivityBootstrapLimit,
    subscription_ledger_bootstrap_limit: oracleControlPlaneConfig.subscriptionLedgerBootstrapLimit,
    unlock_ledger_bootstrap_limit: oracleControlPlaneConfig.unlockLedgerBootstrapLimit,
    feed_ledger_bootstrap_limit: oracleControlPlaneConfig.feedLedgerBootstrapLimit,
    source_item_ledger_bootstrap_limit: oracleControlPlaneConfig.sourceItemLedgerBootstrapLimit,
    generation_state_bootstrap_limit: oracleControlPlaneConfig.generationStateBootstrapLimit,
    product_mirror_enabled: oracleControlPlaneConfig.productMirrorEnabled,
    product_bootstrap_limit: oracleControlPlaneConfig.productBootstrapLimit,
    queue_sweep_high_interval_ms: oracleControlPlaneConfig.queueSweepHighIntervalMs,
    queue_sweep_medium_interval_ms: oracleControlPlaneConfig.queueSweepMediumIntervalMs,
    queue_sweep_low_interval_ms: oracleControlPlaneConfig.queueSweepLowIntervalMs,
    queue_sweep_high_batch: oracleControlPlaneConfig.queueSweepHighBatch,
    queue_sweep_medium_batch: oracleControlPlaneConfig.queueSweepMediumBatch,
    queue_sweep_low_batch: oracleControlPlaneConfig.queueSweepLowBatch,
    queue_sweep_max_sweeps_per_run: oracleControlPlaneConfig.queueSweepMaxSweepsPerRun,
    queue_empty_backoff_min_ms: oracleControlPlaneConfig.queueEmptyBackoffMinMs,
    queue_empty_backoff_max_ms: oracleControlPlaneConfig.queueEmptyBackoffMaxMs,
    queue_medium_priority_backoff_multiplier: oracleControlPlaneConfig.queueMediumPriorityBackoffMultiplier,
    queue_low_priority_backoff_multiplier: oracleControlPlaneConfig.queueLowPriorityBackoffMultiplier,
    bootstrap_batch: oracleControlPlaneConfig.bootstrapBatch,
    queue_ledger_bootstrap_limit: oracleControlPlaneConfig.queueLedgerBootstrapLimit,
    shadow_batch_limit: oracleControlPlaneConfig.shadowBatchLimit,
    shadow_lookahead_ms: oracleControlPlaneConfig.shadowLookaheadMs,
    active_revisit_ms: oracleControlPlaneConfig.activeRevisitMs,
    normal_revisit_ms: oracleControlPlaneConfig.normalRevisitMs,
    quiet_revisit_ms: oracleControlPlaneConfig.quietRevisitMs,
    error_retry_ms: oracleControlPlaneConfig.errorRetryMs,
  }));
}

if (runHttpServer) {
  app.listen(port, () => {
    console.log(`[agentic-backend] listening on :${port}`);
  });
}

if (runOraclePrimarySubscriptionScheduler) {
  oracleSubscriptionSchedulerController.start(3_000);
  console.log('[oracle-control-plane] oracle_subscription_scheduler_started', JSON.stringify({
    runtime_mode: runtimeMode,
    owner: 'http_server',
  }));
} else if (
  oracleControlPlaneConfig.enabled
  && oracleControlPlaneConfig.subscriptionSchedulerMode === 'primary'
  && runIngestionWorker
  && !runHttpServer
) {
  console.log('[oracle-control-plane] oracle_subscription_scheduler_skipped', JSON.stringify({
    runtime_mode: runtimeMode,
    reason: 'http_server_owner_required',
  }));
}

if (runIngestionWorker) {
  if (oracleControlPlaneConfig.enabled && oracleControlPlane) {
    void bootstrapOracleControlPlaneState().catch((error) => {
      console.error('[oracle-control-plane] bootstrap failed', error);
    });
  }
  logWorkerMemoryCheckpoint('worker_controllers_starting');
  queuedIngestionWorkerController.start(1500);
  logWorkerMemoryCheckpoint('queued_ingestion_worker_started');
  if (youtubeRefreshEnabled && workerRuntimeControls.runYoutubeRefreshScheduler) {
    youtubeRefreshSchedulerController.start(1500);
    logWorkerMemoryCheckpoint('youtube_refresh_scheduler_started');
  } else if (youtubeRefreshEnabled) {
    console.log('[youtube_refresh_scheduler_skipped]', JSON.stringify({
      reason: 'RUNTIME_MODE_DISABLED',
      runtime_mode: runtimeMode,
    }));
  }
  if (notificationPushEnabled && workerRuntimeControls.runNotificationPushDispatcher) {
    notificationPushDispatcherController.start(notificationPushDispatchIntervalMs);
    logWorkerMemoryCheckpoint('notification_push_dispatcher_started');
  } else if (notificationPushEnabled) {
    console.log('[notification_push_dispatcher_skipped]', JSON.stringify({
      reason: 'RUNTIME_MODE_DISABLED',
      runtime_mode: runtimeMode,
    }));
  }
  logWorkerMemoryCheckpoint('worker_startup_complete');
}

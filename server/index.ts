import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import OpenAI from 'openai';
import { z } from 'zod';
import { createLLMClient } from './llm/client';
import { consumeCredit, getCredits } from './credits';
import { getTranscriptForVideo, probeTranscriptProviders } from './transcript/getTranscript';
import { TranscriptProviderError } from './transcript/types';
import { getAdapterForUrl } from './adapters/registry';
import { evaluateCandidateForChannel } from './gates';
import type { GateMode } from './gates/types';
import {
  fetchYouTubeFeed,
  fetchYouTubeVideoStates,
  isNewerThanCheckpoint,
  resolveYouTubeChannel,
  type YouTubeFeedVideo,
} from './services/youtubeSubscriptions';
import {
  clampYouTubeSearchLimit,
  searchYouTubeVideos,
  YouTubeSearchError,
} from './services/youtubeSearch';
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
import { runUnlockReliabilitySweeps } from './services/unlockReliabilitySweeps';
import { createUnlockTraceId, logUnlockEvent } from './services/unlockTrace';
import { ProviderCircuitOpenError, getProviderCircuitSnapshot } from './services/providerCircuit';
import { getProviderRetryDefaults, runWithProviderRetry } from './services/providerResilience';
import {
  claimQueuedIngestionJobs,
  countQueueDepth,
  failIngestionJob,
  touchIngestionJobLease,
  type IngestionJobRow,
} from './services/ingestionQueue';
import {
  clampInt,
  getFailureTransition,
  normalizeAutoBannerMode,
  partitionByBannerCap,
  selectDeterministicDefaultBanner,
  type AutoBannerMode,
  type BannerEffectiveSource,
} from './services/autoBannerPolicy';
import { runAutoChannelPipeline } from './services/autoChannelPipeline';
import type {
  BlueprintAnalysisRequest,
  BlueprintGenerationRequest,
  BlueprintGenerationResult,
  BlueprintSelectedItem,
  InventoryRequest,
} from './llm/types';

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

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();
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
  ),
});

app.use(limiter);

const yt2bpAnonLimitPerMin = Number(process.env.YT2BP_ANON_LIMIT_PER_MIN) || 6;
const yt2bpAuthLimitPerMin = Number(process.env.YT2BP_AUTH_LIMIT_PER_MIN) || 20;
const yt2bpIpLimitPerHour = Number(process.env.YT2BP_IP_LIMIT_PER_HOUR) || 30;
const yt2bpEnabledRaw = String(process.env.YT2BP_ENABLED ?? 'true').trim().toLowerCase();
const yt2bpEnabled = !(yt2bpEnabledRaw === 'false' || yt2bpEnabledRaw === '0' || yt2bpEnabledRaw === 'off');
const yt2bpCoreTimeoutMs = clampInt(process.env.YT2BP_CORE_TIMEOUT_MS, 120_000, 30_000, 300_000);
const ingestionServiceToken = String(process.env.INGESTION_SERVICE_TOKEN || '').trim();
const ingestionMaxPerSubscription = Math.max(1, Number(process.env.INGESTION_MAX_PER_SUBSCRIPTION) || 5);
const refreshScanCooldownMs = clampInt(process.env.REFRESH_SCAN_COOLDOWN_MS, 30_000, 5_000, 300_000);
const refreshGenerateCooldownMs = clampInt(process.env.REFRESH_GENERATE_COOLDOWN_MS, 120_000, 10_000, 900_000);
const refreshGenerateMaxItems = clampInt(process.env.REFRESH_GENERATE_MAX_ITEMS, 20, 1, 200);
const sourceVideoListBurstWindowMs = clampInt(process.env.SOURCE_VIDEO_LIST_BURST_WINDOW_MS, 15_000, 5_000, 300_000);
const sourceVideoListBurstMax = clampInt(process.env.SOURCE_VIDEO_LIST_BURST_MAX, 4, 1, 20);
const sourceVideoListSustainedWindowMs = clampInt(process.env.SOURCE_VIDEO_LIST_SUSTAINED_WINDOW_MS, 10 * 60_000, 60_000, 60 * 60_000);
const sourceVideoListSustainedMax = clampInt(process.env.SOURCE_VIDEO_LIST_SUSTAINED_MAX, 40, 5, 500);
const sourceVideoUnlockBurstWindowMs = clampInt(process.env.SOURCE_VIDEO_UNLOCK_BURST_WINDOW_MS, 10_000, 5_000, 300_000);
const sourceVideoUnlockBurstMax = clampInt(process.env.SOURCE_VIDEO_UNLOCK_BURST_MAX, 8, 1, 100);
const sourceVideoUnlockSustainedWindowMs = clampInt(process.env.SOURCE_VIDEO_UNLOCK_SUSTAINED_WINDOW_MS, 10 * 60_000, 60_000, 60 * 60_000);
const sourceVideoUnlockSustainedMax = clampInt(process.env.SOURCE_VIDEO_UNLOCK_SUSTAINED_MAX, 120, 10, 2_000);
const creditsReadWindowMs = clampInt(process.env.CREDITS_READ_WINDOW_MS, 60_000, 10_000, 10 * 60_000);
const creditsReadMaxPerWindow = clampInt(process.env.CREDITS_READ_MAX_PER_WINDOW, 180, 30, 2_000);
const ingestionLatestMineWindowMs = clampInt(process.env.INGESTION_LATEST_MINE_WINDOW_MS, 60_000, 10_000, 10 * 60_000);
const ingestionLatestMineMaxPerWindow = clampInt(process.env.INGESTION_LATEST_MINE_MAX_PER_WINDOW, 180, 30, 2_000);
const queueDepthHardLimit = clampInt(process.env.QUEUE_DEPTH_HARD_LIMIT, 1000, 10, 200_000);
const queueDepthPerUserLimit = clampInt(process.env.QUEUE_DEPTH_PER_USER_LIMIT, 50, 1, 10_000);
const workerConcurrency = clampInt(process.env.WORKER_CONCURRENCY, 2, 1, 16);
const workerBatchSize = clampInt(process.env.WORKER_BATCH_SIZE, 10, 1, 200);
const workerLeaseMs = clampInt(process.env.WORKER_LEASE_MS, 90_000, 5_000, 15 * 60_000);
const workerHeartbeatMs = clampInt(process.env.WORKER_HEARTBEAT_MS, 10_000, 1_000, 5 * 60_000);
const jobExecutionTimeoutMs = clampInt(process.env.JOB_EXECUTION_TIMEOUT_MS, 120_000, 5_000, 10 * 60_000);
const unlockIntakeEnabledRaw = String(process.env.UNLOCK_INTAKE_ENABLED || 'true').trim().toLowerCase();
const unlockIntakeEnabled = !(unlockIntakeEnabledRaw === 'false' || unlockIntakeEnabledRaw === '0' || unlockIntakeEnabledRaw === 'off');
const sourceUnlockReservationSeconds = clampInt(process.env.SOURCE_UNLOCK_RESERVATION_SECONDS, 300, 60, 3600);
const sourceUnlockGenerateMaxItems = clampInt(process.env.SOURCE_UNLOCK_GENERATE_MAX_ITEMS, 100, 1, 500);
const sourceAutoUnlockSampleSize = clampInt(process.env.SOURCE_AUTO_UNLOCK_SAMPLE_SIZE, 3, 1, 10);
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
const sourceTranscriptMaxAttempts = clampInt(process.env.SOURCE_TRANSCRIPT_MAX_ATTEMPTS, 3, 1, 10);
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
const debugEndpointsEnabledRaw = String(process.env.ENABLE_DEBUG_ENDPOINTS || 'false').trim().toLowerCase();
const debugEndpointsEnabled = debugEndpointsEnabledRaw === 'true' || debugEndpointsEnabledRaw === '1' || debugEndpointsEnabledRaw === 'on';
const youtubeDataApiKey = String(process.env.YOUTUBE_DATA_API_KEY || '').trim();
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
const youtubeOAuthConfig: YouTubeOAuthConfig = {
  clientId: googleOAuthClientId,
  clientSecret: googleOAuthClientSecret,
  redirectUri: youtubeOAuthRedirectUri,
  scopes: youtubeOAuthScopes,
};
const youtubeOAuthConfigured = isYouTubeOAuthConfigured(youtubeOAuthConfig);

if (!youtubeDataApiKey) {
  console.warn('[youtube-search] YOUTUBE_DATA_API_KEY is not configured. /api/youtube-search and /api/youtube-channel-search will return SEARCH_DISABLED.');
}

if (!youtubeOAuthConfigured) {
  console.warn('[youtube-oauth] Google OAuth env is incomplete. /api/youtube/connection* and /api/youtube/subscriptions* will return YT_OAUTH_NOT_CONFIGURED.');
}

if (!tokenEncryptionKey) {
  console.warn('[youtube-oauth] TOKEN_ENCRYPTION_KEY is not configured. YouTube connection endpoints will return YT_OAUTH_NOT_CONFIGURED.');
}

if (autoBannerMode !== 'off' && !String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
  console.warn('[auto-banner] SUBSCRIPTION_AUTO_BANNER_MODE is enabled but SUPABASE_SERVICE_ROLE_KEY is missing. Worker and uploads will be disabled.');
}

const QUEUED_INGESTION_SCOPES = [
  'source_item_unlock_generation',
  'source_auto_unlock_retry',
  'source_transcript_revalidate',
  'manual_refresh_selection',
  'all_active_subscriptions',
] as const;
type QueuedIngestionScope = (typeof QUEUED_INGESTION_SCOPES)[number];

const queuedWorkerId = `ingestion-worker-${process.pid}`;
let queuedWorkerTimer: ReturnType<typeof setTimeout> | null = null;
let queuedWorkerRunning = false;
let queuedWorkerRequested = false;
let sourcePageAssetSweepLastRunMs = 0;

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
  const isPublicProfileFeedRoute = /^\/api\/profile\/[^/]+\/feed$/.test(req.path);
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
    || isPublicSourcePageSearchRoute
    || isPublicSourcePageRoute
    || isPublicSourcePageBlueprintFeedRoute
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

const InventoryRequestSchema = z.object({
  keywords: z.string().min(1),
  title: z.string().optional(),
  customInstructions: z.string().optional(),
  preferredCategories: z.array(z.string()).optional(),
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

const BlueprintGenerationSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  inventoryTitle: z.string().min(1),
  categories: z.array(
    z.object({
      name: z.string().min(1),
      items: z.array(z.string()).min(1),
    })
  ).min(1),
});

const YouTubeToBlueprintRequestSchema = z.object({
  video_url: z.string().min(1),
  generate_review: z.boolean().default(false),
  generate_banner: z.boolean().default(false),
  source: z.literal('youtube_mvp').default('youtube_mvp'),
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
    }),
  ).min(1).max(500),
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
  let jsonText = outputText;
  if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
  if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
  if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

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
  let jsonText = outputText;
  if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
  if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
  if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

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


app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/profile/:userId/feed', async (req, res) => {
  const profileUserId = String(req.params.userId || '').trim();
  if (!profileUserId) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_USER_ID',
      message: 'Missing profile user id',
      data: null,
    });
  }

  const viewerUserId = String((res.locals.user as { id?: string } | undefined)?.id || '').trim() || null;
  const isOwnerView = !!viewerUserId && viewerUserId === profileUserId;
  const db = getServiceSupabaseClient();
  if (!db) {
    return res.status(500).json({
      ok: false,
      error_code: 'CONFIG_ERROR',
      message: 'Service role client is not configured',
      data: null,
    });
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('user_id, is_public')
    .eq('user_id', profileUserId)
    .maybeSingle();
  if (profileError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: profileError.message,
      data: null,
    });
  }
  if (!profile?.user_id) {
    return res.status(404).json({
      ok: false,
      error_code: 'PROFILE_NOT_FOUND',
      message: 'Profile not found',
      data: null,
    });
  }
  if (!profile.is_public && !isOwnerView) {
    return res.status(403).json({
      ok: false,
      error_code: 'PROFILE_PRIVATE',
      message: 'Profile is private',
      data: null,
    });
  }

  const { data: feedRows, error: feedError } = await db
    .from('user_feed_items')
    .select('id, source_item_id, blueprint_id, state, last_decision_code, created_at')
    .eq('user_id', profileUserId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (feedError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: feedError.message,
      data: null,
    });
  }

  const filteredFeedRows = (feedRows || []).filter((row) => {
    const isLegacyPendingWithoutBlueprint =
      !row.blueprint_id && (row.state === 'my_feed_pending_accept' || row.state === 'my_feed_skipped');
    return !isLegacyPendingWithoutBlueprint;
  });
  if (!filteredFeedRows.length) {
    return res.json({
      ok: true,
      error_code: null,
      message: 'profile feed',
      data: {
        profile_user_id: profileUserId,
        is_owner_view: isOwnerView,
        items: [],
      },
    });
  }

  const sourceIds = Array.from(new Set(filteredFeedRows.map((row) => row.source_item_id).filter(Boolean))) as string[];
  const blueprintIds = Array.from(new Set(filteredFeedRows.map((row) => row.blueprint_id).filter(Boolean))) as string[];
  const feedItemIds = filteredFeedRows.map((row) => row.id);

  const [{ data: sources, error: sourcesError }, { data: blueprints, error: blueprintsError }, { data: candidates, error: candidatesError }, { data: unlocks, error: unlocksError }] = await Promise.all([
    db
      .from('source_items')
      .select('id, source_channel_id, source_url, title, source_channel_title, thumbnail_url, metadata')
      .in('id', sourceIds),
    blueprintIds.length
      ? db.from('blueprints').select('id, title, banner_url, llm_review, is_public, steps').in('id', blueprintIds)
      : Promise.resolve({ data: [], error: null }),
    db
      .from('channel_candidates')
      .select('id, user_feed_item_id, channel_slug, status, created_at')
      .in('user_feed_item_id', feedItemIds)
      .order('created_at', { ascending: false }),
    sourceIds.length
      ? db
        .from('source_item_unlocks')
        .select('source_item_id, last_error_code, transcript_status')
        .in('source_item_id', sourceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sourcesError || blueprintsError || candidatesError || unlocksError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: sourcesError?.message || blueprintsError?.message || candidatesError?.message || unlocksError?.message || 'Failed to load feed',
      data: null,
    });
  }

  const { data: tagRows, error: tagRowsError } = blueprintIds.length
    ? await db
      .from('blueprint_tags')
      .select('blueprint_id, tags(slug)')
      .in('blueprint_id', blueprintIds)
    : { data: [] as Array<{ blueprint_id: string; tags: { slug: string } | { slug: string }[] | null }>, error: null };
  if (tagRowsError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: tagRowsError.message,
      data: null,
    });
  }

  const tagsByBlueprint = new Map<string, string[]>();
  (tagRows || []).forEach((row) => {
    const list = tagsByBlueprint.get(row.blueprint_id) || [];
    if (Array.isArray(row.tags)) {
      row.tags.forEach((tag) => {
        if (tag && typeof tag === 'object' && 'slug' in tag) list.push(String((tag as { slug: string }).slug));
      });
    } else if (row.tags && typeof row.tags === 'object' && 'slug' in row.tags) {
      list.push(String((row.tags as { slug: string }).slug));
    }
    tagsByBlueprint.set(row.blueprint_id, list);
  });

  const sourceMap = new Map((sources || []).map((row) => [row.id, row]));
  const blueprintMap = new Map((blueprints || []).map((row) => [row.id, row]));
  const transcriptHiddenSourceIds = new Set(
    (unlocks || [])
      .filter((row) => {
        const status = normalizeTranscriptTruthStatus((row as { transcript_status?: unknown }).transcript_status);
        if (status === 'confirmed_no_speech' || status === 'retrying') return true;
        const normalizedErrorCode = String(row.last_error_code || '').trim().toUpperCase();
        return normalizedErrorCode === 'NO_TRANSCRIPT_PERMANENT' || normalizedErrorCode === 'TRANSCRIPT_UNAVAILABLE';
      })
      .map((row) => String(row.source_item_id || '').trim())
      .filter(Boolean),
  );
  const candidateMap = new Map<string, { id: string; channelSlug: string; status: string }>();
  (candidates || []).forEach((row) => {
    if (candidateMap.has(row.user_feed_item_id)) return;
    candidateMap.set(row.user_feed_item_id, {
      id: row.id,
      channelSlug: row.channel_slug,
      status: row.status,
    });
  });

  const visibleFeedRows = filteredFeedRows.filter((row) => {
    if (row.blueprint_id) return true;
    const sourceItemId = String(row.source_item_id || '').trim();
    return !sourceItemId || !transcriptHiddenSourceIds.has(sourceItemId);
  });

  const items = visibleFeedRows.map((row) => {
    const source = sourceMap.get(row.source_item_id);
    const blueprint = row.blueprint_id ? blueprintMap.get(row.blueprint_id) : null;
    const sourceMetadata =
      source?.metadata
      && typeof source.metadata === 'object'
      && source.metadata !== null
        ? (source.metadata as Record<string, unknown>)
        : null;
    const metadataSourceChannelTitle =
      sourceMetadata && typeof sourceMetadata.source_channel_title === 'string'
        ? String(sourceMetadata.source_channel_title || '').trim() || null
        : (
          sourceMetadata && typeof sourceMetadata.channel_title === 'string'
            ? String(sourceMetadata.channel_title || '').trim() || null
            : null
        );

    return {
      id: row.id,
      state: row.state,
      lastDecisionCode: row.last_decision_code,
      createdAt: row.created_at,
      source: source
        ? {
            id: source.id,
            sourceChannelId: source.source_channel_id || null,
            sourceUrl: source.source_url,
            title: source.title,
            sourceChannelTitle: source.source_channel_title || metadataSourceChannelTitle || null,
            thumbnailUrl: source.thumbnail_url || null,
            channelBannerUrl:
              source.metadata
              && typeof source.metadata === 'object'
              && source.metadata !== null
              && 'channel_banner_url' in source.metadata
                ? String((source.metadata as Record<string, unknown>).channel_banner_url || '') || null
                : null,
          }
        : null,
      blueprint: blueprint
        ? {
            id: blueprint.id,
            title: blueprint.title,
            bannerUrl: blueprint.banner_url,
            llmReview: blueprint.llm_review,
            isPublic: blueprint.is_public,
            steps: blueprint.steps,
            tags: tagsByBlueprint.get(blueprint.id) || [],
          }
        : null,
      candidate: candidateMap.get(row.id) || null,
    };
  });

  return res.json({
    ok: true,
    error_code: null,
    message: 'profile feed',
    data: {
      profile_user_id: profileUserId,
      is_owner_view: isOwnerView,
      items,
    },
  });
});

app.get('/api/credits', creditsReadLimiter, async (_req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const credits = await getCredits(userId);
  return res.json(credits);
});

app.post('/api/generate-inventory', async (req, res) => {
  const parsed = InventoryRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const payload: InventoryRequest = parsed.data;
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const creditCheck = await consumeCredit(userId, {
    reasonCode: 'INVENTORY_GENERATE',
  });
  if (!creditCheck.ok) {
    if (creditCheck.reason === 'global') {
      return res.status(429).json({
        error: 'We’re at capacity right now. Please try again in a few minutes.',
        retryAfterSeconds: creditCheck.retryAfterSeconds,
      });
    }
    return res.status(429).json({
      error: 'Insufficient credits right now. Please wait for refill and try again.',
      remaining: creditCheck.remaining,
      limit: creditCheck.limit,
      resetAt: creditCheck.resetAt,
    });
  }

  try {
    const client = createLLMClient();
    const schema = await client.generateInventory(payload);
    return res.json(schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/analyze-blueprint', async (req, res) => {
  const parsed = BlueprintReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const creditCheck = await consumeCredit(userId, {
    reasonCode: 'BLUEPRINT_REVIEW',
  });
  if (!creditCheck.ok) {
    if (creditCheck.reason === 'global') {
      return res.status(429).json({
        error: 'We’re at capacity right now. Please try again in a few minutes.',
        retryAfterSeconds: creditCheck.retryAfterSeconds,
      });
    }
    return res.status(429).json({
      error: 'Insufficient credits right now. Please wait for refill and try again.',
      remaining: creditCheck.remaining,
      limit: creditCheck.limit,
      resetAt: creditCheck.resetAt,
    });
  }

  const normalizedItems: Record<string, BlueprintSelectedItem[]> = {};
  Object.entries(parsed.data.selectedItems).forEach(([category, items]) => {
    const normalized = items.map((item) => {
      if (typeof item === 'string') {
        return { name: item };
      }
      return { name: item.name, context: item.context };
    });
    normalizedItems[category] = normalized;
  });

  const payload: BlueprintAnalysisRequest = {
    title: parsed.data.title,
    inventoryTitle: parsed.data.inventoryTitle,
    selectedItems: normalizedItems,
    mixNotes: parsed.data.mixNotes,
    reviewPrompt: parsed.data.reviewPrompt,
    reviewSections: parsed.data.reviewSections,
    includeScore: parsed.data.includeScore,
  };

  try {
    const client = createLLMClient();
    const review = await client.analyzeBlueprint(payload);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chunkSize = 200;
    for (let i = 0; i < review.length; i += chunkSize) {
      const chunk = review.slice(i, i + chunkSize);
      const frame = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
      res.write(`data: ${frame}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/generate-blueprint', async (req, res) => {
  const parsed = BlueprintGenerationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const creditCheck = await consumeCredit(userId, {
    reasonCode: 'BLUEPRINT_GENERATE',
  });
  if (!creditCheck.ok) {
    if (creditCheck.reason === 'global') {
      return res.status(429).json({
        error: 'We’re at capacity right now. Please try again in a few minutes.',
        retryAfterSeconds: creditCheck.retryAfterSeconds,
      });
    }
    return res.status(429).json({
      error: 'Insufficient credits right now. Please wait for refill and try again.',
      remaining: creditCheck.remaining,
      limit: creditCheck.limit,
      resetAt: creditCheck.resetAt,
    });
  }

  const payload: BlueprintGenerationRequest = {
    title: parsed.data.title?.trim() || undefined,
    description: parsed.data.description?.trim() || undefined,
    notes: parsed.data.notes?.trim() || undefined,
    inventoryTitle: parsed.data.inventoryTitle.trim(),
    categories: parsed.data.categories.map((category) => ({
      name: category.name.trim(),
      items: category.items.map((item) => item.trim()).filter(Boolean),
    })).filter((category) => category.items.length > 0),
  };

  try {
    const client = createLLMClient();
    const generated = await client.generateBlueprint(payload);
    const normalized = normalizeGeneratedBlueprint(payload, generated);
    if (!normalized.steps.length) {
      return res.status(500).json({ error: 'Generated blueprint had no usable steps.' });
    }
    return res.json(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/youtube-to-blueprint', yt2bpIpHourlyLimiter, yt2bpAnonLimiter, yt2bpAuthLimiter, async (req, res) => {
  if (!yt2bpEnabled) {
    res.locals.bucketErrorCode = 'SERVICE_DISABLED';
    return res.status(503).json({
      ok: false,
      error_code: 'SERVICE_DISABLED',
      message: 'YouTube to Blueprint is temporarily unavailable. Please try again later.',
      run_id: null,
    });
  }

  const parsed = YouTubeToBlueprintRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_URL',
      message: 'Invalid request payload.',
      run_id: null,
    });
  }

  const runId = `yt2bp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adapter = getAdapterForUrl(parsed.data.video_url);
  if (!adapter) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_URL',
      message: 'Only YouTube URLs are supported.',
      run_id: runId,
    });
  }
  const validatedUrl = adapter.validate(parsed.data.video_url);
  if (!validatedUrl.ok) {
    return res.status(400).json({
      ok: false,
      error_code: validatedUrl.errorCode,
      message: validatedUrl.message,
      run_id: runId,
    });
  }

  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (userId) {
    const creditCheck = await consumeCredit(userId, {
      reasonCode: 'YOUTUBE_TO_BLUEPRINT',
    });
    if (!creditCheck.ok) {
      return res.status(429).json({
        ok: false,
        error_code: 'GENERATION_FAIL',
        message: creditCheck.reason === 'global'
          ? 'We’re at capacity right now. Please try again in a few minutes.'
          : 'Insufficient credits right now. Please wait for refill and try again.',
        run_id: runId,
      });
    }
  }

  try {
    const result = await withTimeout(
      runYouTubePipeline({
        runId,
        videoId: validatedUrl.sourceNativeId,
        videoUrl: parsed.data.video_url,
        generateReview: false,
        generateBanner: parsed.data.generate_banner,
        authToken,
      }),
      yt2bpCoreTimeoutMs
    );
    return res.json(result);
  } catch (error) {
    const known = mapPipelineError(error);
    if (known) {
      res.locals.bucketErrorCode = known.error_code;
      const status =
        known.error_code === 'TIMEOUT' ? 504
          : known.error_code === 'INVALID_URL' ? 400
            : known.error_code === 'NO_CAPTIONS' || known.error_code === 'TRANSCRIPT_EMPTY' ? 422
              : known.error_code === 'PROVIDER_FAIL' ? 502
                : known.error_code === 'PII_BLOCKED' || known.error_code === 'SAFETY_BLOCKED' ? 422
                  : known.error_code === 'RATE_LIMITED' ? 429
                : 500;
      return res.status(status).json({
        ok: false,
        ...known,
        run_id: runId,
      });
    }
    const message = error instanceof Error ? error.message : 'Could not complete YouTube blueprint.';
    return res.status(500).json({
      ok: false,
      error_code: 'GENERATION_FAIL',
      message,
      run_id: runId,
    });
  }
});

app.get('/api/youtube-search', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const query = String(req.query.q || '').trim();
  if (query.length < 2) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_QUERY',
      message: 'Query must be at least 2 characters.',
      data: null,
    });
  }

  if (!youtubeDataApiKey) {
    return res.status(503).json({
      ok: false,
      error_code: 'SEARCH_DISABLED',
      message: 'YouTube search is not configured.',
      data: null,
    });
  }

  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const limit = clampYouTubeSearchLimit(rawLimit, 10);
  const pageToken = typeof req.query.page_token === 'string' ? req.query.page_token.trim() : '';

  try {
    const result = await searchYouTubeVideos({
      apiKey: youtubeDataApiKey,
      query,
      limit,
      pageToken: pageToken || undefined,
    });

    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube search complete',
      data: {
        results: result.results,
        next_page_token: result.nextPageToken,
      },
    });
  } catch (error) {
    if (error instanceof YouTubeSearchError) {
      const status = error.code === 'INVALID_QUERY'
        ? 400
        : error.code === 'SEARCH_DISABLED'
          ? 503
          : error.code === 'RATE_LIMITED'
            ? 429
            : 502;
      return res.status(status).json({
        ok: false,
        error_code: error.code,
        message: error.message,
        data: null,
      });
    }

    const message = error instanceof Error ? error.message : 'YouTube search failed.';
    return res.status(502).json({
      ok: false,
      error_code: 'PROVIDER_FAIL',
      message,
      data: null,
    });
  }
});

app.get('/api/youtube-channel-search', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const query = String(req.query.q || '').trim();
  if (query.length < 2) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_QUERY',
      message: 'Query must be at least 2 characters.',
      data: null,
    });
  }

  if (!youtubeDataApiKey) {
    return res.status(503).json({
      ok: false,
      error_code: 'SEARCH_DISABLED',
      message: 'YouTube channel search is not configured.',
      data: null,
    });
  }

  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const limit = clampYouTubeChannelSearchLimit(rawLimit, 10);
  const pageToken = typeof req.query.page_token === 'string' ? req.query.page_token.trim() : '';

  try {
    const result = await searchYouTubeChannels({
      apiKey: youtubeDataApiKey,
      query,
      limit,
      pageToken: pageToken || undefined,
    });

    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube channel search complete',
      data: {
        results: result.results,
        next_page_token: result.nextPageToken,
      },
    });
  } catch (error) {
    if (error instanceof YouTubeChannelSearchError) {
      const status = error.code === 'INVALID_QUERY'
        ? 400
        : error.code === 'SEARCH_DISABLED'
          ? 503
          : error.code === 'RATE_LIMITED'
            ? 429
            : 502;
      return res.status(status).json({
        ok: false,
        error_code: error.code,
        message: error.message,
        data: null,
      });
    }

    const message = error instanceof Error ? error.message : 'YouTube channel search failed.';
    return res.status(502).json({
      ok: false,
      error_code: 'PROVIDER_FAIL',
      message,
      data: null,
    });
  }
});

app.get('/api/youtube/connection/status', async (_req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data, error } = await db
    .from('user_youtube_connections')
    .select('id, user_id, youtube_channel_title, youtube_channel_url, youtube_channel_avatar_url, refresh_token_encrypted, token_expires_at, last_import_at, is_active')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error.message, data: null });

  if (!data || !data.is_active) {
    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube connection status',
      data: {
        connected: false,
        needs_reauth: false,
        channel_title: null,
        channel_url: null,
        channel_avatar_url: null,
        last_import_at: null,
      },
    });
  }

  const expiresAtMs = data.token_expires_at ? Date.parse(data.token_expires_at) : null;
  const hasRefreshToken = Boolean(String(data.refresh_token_encrypted || '').trim());
  const needsReauth = Boolean(expiresAtMs && expiresAtMs <= Date.now() + 60_000 && !hasRefreshToken);

  return res.json({
    ok: true,
    error_code: null,
    message: 'youtube connection status',
    data: {
      connected: true,
      needs_reauth: needsReauth,
      channel_title: data.youtube_channel_title || null,
      channel_url: data.youtube_channel_url || null,
      channel_avatar_url: data.youtube_channel_avatar_url || null,
      last_import_at: data.last_import_at || null,
    },
  });
});

app.post('/api/youtube/connection/start', youtubeConnectStartLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const parsed = YouTubeConnectionStartSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid connect request.', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const returnTo = normalizeReturnToUrl(String(parsed.data.return_to || '').trim(), req) || buildDefaultReturnTo(req);
  if (!returnTo) {
    return res.status(400).json({
      ok: false,
      error_code: 'YT_RETURN_TO_INVALID',
      message: 'Invalid return URL. Please retry from the app.',
      data: null,
    });
  }

  await db
    .from('youtube_oauth_states')
    .delete()
    .eq('user_id', userId)
    .not('consumed_at', 'is', null);
  await db
    .from('youtube_oauth_states')
    .delete()
    .eq('user_id', userId)
    .lt('expires_at', new Date().toISOString());

  const state = randomBytes(24).toString('base64url');
  const stateHash = hashOAuthState(state);
  const expiresAt = new Date(Date.now() + youtubeOAuthStateTtlSeconds * 1000).toISOString();

  const { error: insertError } = await db
    .from('youtube_oauth_states')
    .insert({
      user_id: userId,
      state_hash: stateHash,
      return_to: returnTo,
      expires_at: expiresAt,
    });
  if (insertError) {
    return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: insertError.message, data: null });
  }

  const authUrl = buildYouTubeOAuthUrl(youtubeOAuthConfig, state);
  return res.json({
    ok: true,
    error_code: null,
    message: 'youtube connection started',
    data: {
      auth_url: authUrl,
    },
  });
});

app.get('/api/youtube/connection/callback', async (req, res) => {
  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const state = String(req.query.state || '').trim();
  if (!state) {
    return res.status(400).json({ ok: false, error_code: 'YT_STATE_INVALID', message: 'Invalid OAuth state.', data: null });
  }

  const stateHash = hashOAuthState(state);
  const { data: oauthState, error: stateError } = await db
    .from('youtube_oauth_states')
    .select('id, user_id, return_to, expires_at, consumed_at')
    .eq('state_hash', stateHash)
    .maybeSingle();
  if (stateError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: stateError.message, data: null });
  }
  if (!oauthState?.id) {
    return res.status(400).json({ ok: false, error_code: 'YT_STATE_INVALID', message: 'Invalid OAuth state.', data: null });
  }

  const returnTo = String(oauthState.return_to || '').trim();
  const redirectWith = (params: Record<string, string>) => res.redirect(appendReturnToQuery(returnTo, params));
  const now = Date.now();
  const expiresAtMs = Number.isFinite(Date.parse(oauthState.expires_at)) ? Date.parse(oauthState.expires_at) : 0;
  if (expiresAtMs <= now) {
    return redirectWith({ yt_connect: 'error', yt_code: 'YT_STATE_EXPIRED' });
  }
  if (oauthState.consumed_at) {
    return redirectWith({ yt_connect: 'error', yt_code: 'YT_STATE_INVALID' });
  }

  const { data: consumeData, error: consumeError } = await db
    .from('youtube_oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', oauthState.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  if (consumeError || !consumeData?.id) {
    return redirectWith({ yt_connect: 'error', yt_code: 'YT_STATE_INVALID' });
  }

  const providerError = String(req.query.error || '').trim();
  if (providerError) {
    return redirectWith({ yt_connect: 'error', yt_code: 'YT_TOKEN_EXCHANGE_FAILED' });
  }

  const code = String(req.query.code || '').trim();
  if (!code) {
    return redirectWith({ yt_connect: 'error', yt_code: 'YT_TOKEN_EXCHANGE_FAILED' });
  }

  try {
    const tokenSet = await exchangeYouTubeOAuthCode(youtubeOAuthConfig, code);
    const profile = await fetchYouTubeOAuthAccountProfile(tokenSet.accessToken);
    const accessTokenEncrypted = encryptToken(tokenSet.accessToken, tokenEncryptionKey);
    const refreshTokenEncrypted = tokenSet.refreshToken
      ? encryptToken(tokenSet.refreshToken, tokenEncryptionKey)
      : null;
    const tokenExpiresAt = tokenSet.expiresIn ? new Date(Date.now() + tokenSet.expiresIn * 1000).toISOString() : null;

    const { error: upsertError } = await db
      .from('user_youtube_connections')
      .upsert({
        user_id: oauthState.user_id,
        google_sub: tokenSet.googleSub || profile.googleSub || null,
        youtube_channel_id: profile.youtubeChannelId,
        youtube_channel_title: profile.youtubeChannelTitle,
        youtube_channel_url: profile.youtubeChannelUrl,
        youtube_channel_avatar_url: profile.youtubeChannelAvatarUrl,
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: tokenExpiresAt,
        scope: tokenSet.scope,
        is_active: true,
        last_error: null,
      }, { onConflict: 'user_id' });
    if (upsertError) {
      return redirectWith({ yt_connect: 'error', yt_code: 'WRITE_FAILED' });
    }

    return redirectWith({ yt_connect: 'success' });
  } catch (error) {
    const mapped = mapYouTubeOAuthError(error);
    await db
      .from('user_youtube_connections')
      .upsert({
        user_id: oauthState.user_id,
        is_active: false,
        last_error: mapped.message.slice(0, 500),
      }, { onConflict: 'user_id' });

    return redirectWith({ yt_connect: 'error', yt_code: mapped.error_code });
  }
});

app.get('/api/youtube/subscriptions/preview', youtubePreviewLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data: connection, error: connectionError } = await db
    .from('user_youtube_connections')
    .select('id, user_id, google_sub, youtube_channel_id, youtube_channel_title, youtube_channel_url, youtube_channel_avatar_url, access_token_encrypted, refresh_token_encrypted, token_expires_at, scope, is_active, last_import_at, last_error')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (connectionError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: connectionError.message, data: null });
  }
  if (!connection) {
    return res.status(404).json({ ok: false, error_code: 'YT_CONNECTION_NOT_FOUND', message: 'Connect YouTube first.', data: null });
  }

  try {
    const { accessToken } = await getUsableYouTubeAccessToken({
      db,
      connection: connection as UserYouTubeConnectionRow,
    });

    const preview = await fetchYouTubeUserSubscriptions({
      accessToken,
      maxTotal: youtubeImportMaxChannels,
    });
    const channelIds = preview.items.map((item) => item.channelId);

    const { data: existing, error: existingError } = channelIds.length === 0
      ? { data: [] as Array<{ source_channel_id: string; is_active: boolean }>, error: null }
      : await db
        .from('user_source_subscriptions')
        .select('source_channel_id, is_active')
        .eq('user_id', userId)
        .eq('source_type', 'youtube')
        .in('source_channel_id', channelIds);
    if (existingError) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: existingError.message, data: null });
    }

    const existingByChannelId = new Map(
      (existing || []).map((row) => [String(row.source_channel_id || '').trim(), row.is_active]),
    );

    return res.json({
      ok: true,
      error_code: null,
      message: 'youtube subscriptions preview',
      data: {
        results: preview.items.map((item) => ({
          channel_id: item.channelId,
          channel_title: item.channelTitle,
          channel_url: item.channelUrl,
          thumbnail_url: item.thumbnailUrl,
          already_active: existingByChannelId.get(item.channelId) === true,
          already_exists_inactive: existingByChannelId.get(item.channelId) === false,
        })),
        truncated: preview.truncated,
      },
    });
  } catch (error) {
    const mapped = mapYouTubeOAuthError(error);
    return res.status(mapped.status).json({
      ok: false,
      error_code: mapped.error_code,
      message: mapped.message,
      data: null,
    });
  }
});

app.post('/api/youtube/subscriptions/import', youtubeImportLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const parsed = YouTubeSubscriptionsImportSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid import payload.', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const { data: connection, error: connectionError } = await db
    .from('user_youtube_connections')
    .select('id, user_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (connectionError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: connectionError.message, data: null });
  }
  if (!connection) {
    return res.status(404).json({ ok: false, error_code: 'YT_CONNECTION_NOT_FOUND', message: 'Connect YouTube first.', data: null });
  }

  const channelIdRe = /^UC[a-zA-Z0-9_-]{20,}$/;
  const requestedMap = new Map<string, { channelId: string; channelUrl: string | null; channelTitle: string | null }>();
  for (const item of parsed.data.channels) {
    const channelId = String(item.channel_id || '').trim();
    if (!channelIdRe.test(channelId)) continue;
    const channelUrl = String(item.channel_url || '').trim() || `https://www.youtube.com/channel/${channelId}`;
    const channelTitle = String(item.channel_title || '').trim() || null;
    requestedMap.set(channelId, { channelId, channelUrl, channelTitle });
    if (requestedMap.size >= youtubeImportMaxChannels) break;
  }

  const requested = Array.from(requestedMap.values());
  if (requested.length === 0) {
    return res.status(400).json({ ok: false, error_code: 'YT_IMPORT_EMPTY_SELECTION', message: 'Select at least one channel to import.', data: null });
  }

  const channelIds = requested.map((row) => row.channelId);
  const { data: existingRows, error: existingError } = await db
    .from('user_source_subscriptions')
    .select('id, source_channel_id, source_page_id, is_active, auto_unlock_enabled')
    .eq('user_id', userId)
    .eq('source_type', 'youtube')
    .in('source_channel_id', channelIds);
  if (existingError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: existingError.message, data: null });
  }
  const existingByChannelId = new Map(
    (existingRows || []).map((row) => [String(row.source_channel_id || '').trim(), row]),
  );

  let assetMap = new Map<string, { avatarUrl: string | null; bannerUrl: string | null }>();
  if (youtubeDataApiKey) {
    try {
      assetMap = await fetchYouTubeChannelAssetMap({
        apiKey: youtubeDataApiKey,
        channelIds,
      });
    } catch (error) {
      console.log('[youtube_import_assets_lookup_failed]', JSON.stringify({
        user_id: userId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  let importedCount = 0;
  let reactivatedCount = 0;
  let alreadyActiveCount = 0;
  const failures: Array<{ channel_id: string; error_code: string; error: string }> = [];

  for (const row of requested) {
    const existing = existingByChannelId.get(row.channelId) || null;
    let sourcePage;
    try {
      const assets = assetMap.get(row.channelId);
      sourcePage = await ensureSourcePageFromYouTubeChannel(sourcePageDb, {
        channelId: row.channelId,
        channelUrl: row.channelUrl,
        title: row.channelTitle,
        avatarUrl: assets?.avatarUrl || null,
        bannerUrl: assets?.bannerUrl || null,
      });
    } catch (sourcePageError) {
      failures.push({
        channel_id: row.channelId,
        error_code: 'SOURCE_PAGE_SUBSCRIBE_FAILED',
        error: sourcePageError instanceof Error ? sourcePageError.message : 'Could not create source page.',
      });
      continue;
    }

    if (existing?.is_active) {
      if (!existing.source_page_id) {
        await db
          .from('user_source_subscriptions')
          .update({ source_page_id: sourcePage.id })
          .eq('id', existing.id)
          .eq('user_id', userId);
      }
      alreadyActiveCount += 1;
      continue;
    }

    const { data: upserted, error: upsertError } = await db
      .from('user_source_subscriptions')
      .upsert(
        {
          user_id: userId,
          source_type: 'youtube',
          source_channel_id: row.channelId,
          source_channel_url: row.channelUrl,
          source_channel_title: row.channelTitle,
          source_page_id: sourcePage.id,
          mode: 'auto',
          auto_unlock_enabled: existing?.auto_unlock_enabled ?? true,
          is_active: true,
          last_sync_error: null,
        },
        { onConflict: 'user_id,source_type,source_channel_id' },
      )
      .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
      .single();
    if (upsertError || !upserted) {
      failures.push({
        channel_id: row.channelId,
        error_code: 'WRITE_FAILED',
        error: upsertError?.message || 'Could not upsert subscription.',
      });
      continue;
    }

    try {
      await syncSingleSubscription(db, upserted, { trigger: 'youtube_import' });
    } catch (error) {
      await markSubscriptionSyncError(db, upserted.id, error);
    }

    if (!existing) importedCount += 1;
    else reactivatedCount += 1;

    try {
      const assets = assetMap.get(row.channelId);
      const noticeSource = await upsertSubscriptionNoticeSourceItem(db, {
        channelId: row.channelId,
        channelTitle: row.channelTitle,
        channelUrl: row.channelUrl,
        channelAvatarUrl: assets?.avatarUrl || null,
        channelBannerUrl: assets?.bannerUrl || null,
      });
      await insertFeedItem(db, {
        userId,
        sourceItemId: noticeSource.id,
        blueprintId: null,
        state: 'subscription_notice',
      });
    } catch (noticeError) {
      console.log('[youtube_import_notice_insert_failed]', JSON.stringify({
        user_id: userId,
        source_channel_id: row.channelId,
        error: noticeError instanceof Error ? noticeError.message : String(noticeError),
      }));
    }
  }

  const nowIso = new Date().toISOString();
  await db
    .from('user_youtube_connections')
    .update({
      last_import_at: nowIso,
      last_error: failures.length
        ? `Failed ${failures.length}/${requested.length} channels during import.`
        : null,
    })
    .eq('user_id', userId);

  const successfulImports = importedCount + reactivatedCount;
  if (successfulImports > 0) {
    await db
      .from('user_youtube_onboarding')
      .update({
        status: 'completed',
        completed_at: nowIso,
      })
      .eq('user_id', userId);
  }

  const failedCount = failures.length;
  return res.json({
    ok: true,
    error_code: failedCount > 0 ? 'YT_IMPORT_PARTIAL_FAILURE' : null,
    message: failedCount > 0 ? 'Import completed with partial failures.' : 'Import completed.',
    data: {
      requested_count: requested.length,
      imported_count: importedCount,
      reactivated_count: reactivatedCount,
      already_active_count: alreadyActiveCount,
      failed_count: failedCount,
      failures: failures.slice(0, 50),
    },
  });
});

app.delete('/api/youtube/connection', youtubeDisconnectLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const configCheck = ensureYouTubeOAuthConfig();
  if (!configCheck.ok) {
    return res.status(configCheck.status).json({ ok: false, error_code: configCheck.error_code, message: configCheck.message, data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data: connection, error: connectionError } = await db
    .from('user_youtube_connections')
    .select('id, access_token_encrypted, refresh_token_encrypted')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (connectionError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: connectionError.message, data: null });
  }
  if (!connection?.id) {
    return res.status(404).json({ ok: false, error_code: 'YT_CONNECTION_NOT_FOUND', message: 'No active YouTube connection found.', data: null });
  }

  try {
    const refreshToken = connection.refresh_token_encrypted
      ? decryptToken(connection.refresh_token_encrypted, tokenEncryptionKey)
      : null;
    const accessToken = connection.access_token_encrypted
      ? decryptToken(connection.access_token_encrypted, tokenEncryptionKey)
      : null;
    await revokeYouTubeToken(refreshToken || accessToken || '');
  } catch {
    // best effort revoke, continue unlink flow
  }

  const { error: updateError } = await db
    .from('user_youtube_connections')
    .update({
      is_active: false,
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      scope: null,
      last_error: null,
    })
    .eq('id', connection.id);
  if (updateError) {
    return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: updateError.message, data: null });
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'YouTube disconnected.',
    data: { disconnected: true },
  });
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
      'User-Agent': 'bleuv1-youtube-channel-assets/1.0 (+https://bapi.vdsai.cloud)',
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

async function runSourcePageAssetSweep(
  db: ReturnType<typeof createClient>,
  input?: {
    mode?: 'opportunistic' | 'cron' | 'manual';
    force?: boolean;
    traceId?: string;
  },
) {
  if (!sourcePageAssetSweepEnabled || !youtubeDataApiKey) return null;

  const mode = input?.mode || 'opportunistic';
  const nowMs = Date.now();
  if (!input?.force && nowMs - sourcePageAssetSweepLastRunMs < sourcePageAssetSweepMinIntervalMs) {
    return null;
  }
  sourcePageAssetSweepLastRunMs = nowMs;

  const summary = {
    mode,
    trace_id: String(input?.traceId || '').trim() || null,
    scanned_count: 0,
    hydrated_count: 0,
    unchanged_count: 0,
    missing_assets_count: 0,
    error_count: 0,
    batch_size: sourcePageAssetSweepBatch,
  };

  const { data: sourcePagesData, error: sourcePagesError } = await db
    .from('source_pages')
    .select('id, platform, external_id, external_url, title, avatar_url, banner_url, metadata, is_active, created_at, updated_at')
    .eq('platform', 'youtube')
    .eq('is_active', true)
    .or('avatar_url.is.null,banner_url.is.null')
    .order('updated_at', { ascending: true })
    .limit(sourcePageAssetSweepBatch);
  if (sourcePagesError) {
    console.log('[source_page_asset_sweep_failed]', JSON.stringify({
      mode,
      trace_id: summary.trace_id,
      error: sourcePagesError.message,
    }));
    return null;
  }

  const sourcePages = (sourcePagesData || []) as SourcePageAssetRecord[];
  summary.scanned_count = sourcePages.length;
  if (!sourcePages.length) {
    return summary;
  }

  let assetMap = new Map<string, { avatarUrl: string | null; bannerUrl: string | null }>();
  try {
    assetMap = await fetchYouTubeChannelAssetMap({
      apiKey: youtubeDataApiKey,
      channelIds: sourcePages.map((row) => row.external_id),
    });
  } catch (assetError) {
    console.log('[source_page_asset_sweep_failed]', JSON.stringify({
      mode,
      trace_id: summary.trace_id,
      error: assetError instanceof Error ? assetError.message : String(assetError),
    }));
    return null;
  }

  for (const sourcePage of sourcePages) {
    try {
      const hydration = await hydrateSourcePageAssetsForRow(db, sourcePage, { assetMap });
      if (hydration.updated) {
        summary.hydrated_count += 1;
      } else if (hydration.hadAssets) {
        summary.unchanged_count += 1;
      } else {
        summary.missing_assets_count += 1;
      }
    } catch (error) {
      summary.error_count += 1;
      console.log('[source_page_asset_row_hydration_failed]', JSON.stringify({
        source_page_id: sourcePage.id,
        source_channel_id: sourcePage.external_id,
        trace_id: summary.trace_id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  console.log('[source_page_asset_sweep_summary]', JSON.stringify(summary));
  return summary;
}

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
  return steps.map((step, index) => ({
    id: `yt-sub-step-${index + 1}`,
    title: step.name,
    description: step.notes,
    items: [],
  }));
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

async function suppressUnlockableFeedRowsForSourceItem(
  db: ReturnType<typeof createClient>,
  input: {
    sourceItemId: string;
    decisionCode: string;
    traceId?: string;
    sourceChannelId?: string | null;
    videoId?: string | null;
  },
) {
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!sourceItemId) return 0;

  const { data, error } = await db
    .from('user_feed_items')
    .update({
      state: 'my_feed_skipped',
      last_decision_code: String(input.decisionCode || 'TRANSCRIPT_BLOCKED').slice(0, 120),
    })
    .eq('source_item_id', sourceItemId)
    .is('blueprint_id', null)
    .in('state', ['my_feed_unlockable', 'my_feed_unlocking'])
    .select('id');
  if (error) throw error;

  const hiddenCount = (data || []).length;
  if (hiddenCount > 0) {
    logUnlockEvent(
      'auto_transcript_hidden_feed_row',
      {
        trace_id: String(input.traceId || '').trim() || createUnlockTraceId(),
        source_item_id: sourceItemId,
      },
      {
        decision_code: String(input.decisionCode || '').trim() || 'TRANSCRIPT_BLOCKED',
        hidden_count: hiddenCount,
        source_channel_id: String(input.sourceChannelId || '').trim() || null,
        video_id: String(input.videoId || '').trim() || null,
      },
    );
  }

  return hiddenCount;
}

async function upsertFeedItemWithBlueprint(db: ReturnType<typeof createClient>, input: {
  userId: string;
  sourceItemId: string;
  blueprintId: string;
  state: string;
}) {
  const { data, error } = await db
    .from('user_feed_items')
    .upsert(
      {
        user_id: input.userId,
        source_item_id: input.sourceItemId,
        blueprint_id: input.blueprintId,
        state: input.state,
        last_decision_code: null,
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

async function processAutoBannerQueue(db: ReturnType<typeof createClient>, input?: { maxJobs?: number }) {
  const nowIso = new Date().toISOString();
  const maxJobs = Math.max(1, Math.min(200, input?.maxJobs || autoBannerBatchSize));
  const claimScanLimit = Math.max(maxJobs * 4, maxJobs);

  await recoverStaleAutoBannerJobs(db);

  const { data: queueCandidates, error: queueError } = await db
    .from('auto_banner_jobs')
    .select('id, blueprint_id, status, attempts, max_attempts, available_at, source_item_id, subscription_id, run_id, last_error')
    .in('status', ['queued', 'failed'])
    .lte('available_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(claimScanLimit);
  if (queueError) throw queueError;

  const claimed: AutoBannerJobRow[] = [];
  for (const candidate of queueCandidates || []) {
    if (claimed.length >= maxJobs) break;
    const attempts = Number(candidate.attempts || 0);
    const maxAttempts = Math.max(1, Number(candidate.max_attempts || autoBannerMaxAttempts));
    if (attempts >= maxAttempts) {
      await db.from('auto_banner_jobs')
        .update({
          status: 'dead',
          finished_at: new Date().toISOString(),
          last_error: candidate.last_error || 'Reached max attempts',
        })
        .eq('id', candidate.id)
        .eq('status', candidate.status);
      continue;
    }

    const { data: locked } = await db
      .from('auto_banner_jobs')
      .update({
        status: 'running',
        attempts: attempts + 1,
        started_at: new Date().toISOString(),
        finished_at: null,
      })
      .eq('id', candidate.id)
      .eq('status', candidate.status)
      .lte('available_at', nowIso)
      .select('id, blueprint_id, status, attempts, max_attempts, available_at, source_item_id, subscription_id, run_id')
      .maybeSingle();
    if (locked) claimed.push(locked as AutoBannerJobRow);
  }

  const results = {
    claimed: claimed.length,
    succeeded: 0,
    failed: 0,
    dead: 0,
    errors: [] as Array<{ job_id: string; error: string }>,
  };

  for (const job of claimed) {
    try {
      const processed = await processAutoBannerJob(db, job);
      results.succeeded += 1;
      console.log('[auto_banner_job_succeeded]', JSON.stringify({
        job_id: job.id,
        blueprint_id: processed.blueprintId,
        source_item_id: job.source_item_id,
        subscription_id: job.subscription_id,
        run_id: job.run_id,
        attempts: Number(job.attempts || 0),
        timeout_ms: autoBannerTimeoutMs,
        transition_reason: 'completed',
      }));
    } catch (error) {
      const transition = getFailureTransition({
        attempts: Number(job.attempts || 0),
        maxAttempts: Math.max(1, Number(job.max_attempts || autoBannerMaxAttempts)),
        now: new Date(),
      });
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from('auto_banner_jobs')
        .update({
          status: transition.status,
          available_at: transition.availableAt,
          finished_at: transition.status === 'dead' ? new Date().toISOString() : null,
          last_error: message.slice(0, 500),
        })
        .eq('id', job.id);
      if (transition.status === 'dead') results.dead += 1;
      else results.failed += 1;
      results.errors.push({ job_id: job.id, error: message.slice(0, 180) });
      console.log('[auto_banner_job_failed]', JSON.stringify({
        job_id: job.id,
        blueprint_id: job.blueprint_id,
        attempts: Number(job.attempts || 0),
        timeout_ms: autoBannerTimeoutMs,
        transition_reason: 'process_error',
        status: transition.status,
        next_available_at: transition.availableAt,
        error: message,
      }));
    }
  }

  const rebalance = await rebalanceGeneratedBannerCap(db);
  console.log('[auto_banner_rebalance]', JSON.stringify({
    cap: autoBannerCap,
    eligible: rebalance.eligible,
    kept: rebalance.kept,
    demoted: rebalance.demoted,
    restored_generated: rebalance.restoredToGenerated,
    demoted_default: rebalance.demotedToDefault,
    demoted_none: rebalance.demotedToNone,
  }));

  return {
    ...results,
    rebalance,
  };
}

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

async function createBlueprintFromVideo(db: ReturnType<typeof createClient>, input: {
  userId: string;
  videoUrl: string;
  videoId: string;
  sourceTag: 'subscription_auto' | 'subscription_accept' | 'source_page_video_library';
  sourceItemId?: string | null;
  subscriptionId?: string | null;
}) {
  let sourceThumbnailUrl: string | null = null;
  const normalizedSourceItemId = String(input.sourceItemId || '').trim();
  if (normalizedSourceItemId) {
    const { data: sourceRow } = await db
      .from('source_items')
      .select('thumbnail_url')
      .eq('id', normalizedSourceItemId)
      .maybeSingle();
    sourceThumbnailUrl = String(sourceRow?.thumbnail_url || '').trim() || null;
  }
  if (!sourceThumbnailUrl && YOUTUBE_VIDEO_ID_REGEX.test(String(input.videoId || '').trim())) {
    sourceThumbnailUrl = `https://i.ytimg.com/vi/${String(input.videoId || '').trim()}/hqdefault.jpg`;
  }

  const runId = `sub-${input.sourceTag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await runYouTubePipeline({
    runId,
    videoId: input.videoId,
    videoUrl: input.videoUrl,
    generateReview: false,
    generateBanner: false,
    authToken: '',
  });

  const { data: blueprint, error: blueprintError } = await db
    .from('blueprints')
    .insert({
      title: result.draft.title,
      creator_user_id: input.userId,
      is_public: false,
      steps: mapDraftStepsForBlueprint(result.draft.steps),
      selected_items: {
        source: input.sourceTag,
        run_id: result.run_id,
        video_url: input.videoUrl,
      },
      banner_url: sourceThumbnailUrl,
      mix_notes: result.draft.notes || null,
      llm_review: result.review.summary || null,
    })
    .select('id')
    .single();
  if (blueprintError) throw blueprintError;

  for (const rawTag of result.draft.tags || []) {
    const tagSlug = toTagSlug(rawTag);
    if (!tagSlug) continue;
    const tagId = await ensureTagId(db, input.userId, tagSlug);
    await db
      .from('blueprint_tags')
      .upsert({ blueprint_id: blueprint.id, tag_id: tagId }, { onConflict: 'blueprint_id,tag_id' });
  }

  return {
    blueprintId: blueprint.id,
    runId: result.run_id,
    title: result.draft.title,
  };
}

type SyncSubscriptionResult = {
  processed: number;
  inserted: number;
  skipped: number;
  newestVideoId: string | null;
  newestPublishedAt: string | null;
  channelTitle: string | null;
};

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
};

type SourcePageVideoGenerateItem = {
  video_id: string;
  video_url: string;
  title: string;
  published_at: string | null;
  thumbnail_url: string | null;
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
  reserved_cost: number;
  reserved_by_user_id: string;
  unlock_origin: 'manual_unlock' | 'subscription_auto_unlock' | 'source_auto_unlock_retry';
};

type SourceAutoUnlockRetryPayload = {
  source_item_id: string;
  source_page_id: string | null;
  source_channel_id: string;
  source_channel_title: string | null;
  video_id: string;
  video_url: string;
  title: string;
  trigger: 'user_sync' | 'service_cron' | 'subscription_create' | 'debug_simulation' | 'youtube_import';
  preferred_payer_user_id: string | null;
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

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{8,15}$/;

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
  };

  const videoId = String(row.video_id || '').trim();
  const videoUrl = String(row.video_url || '').trim();
  const title = String(row.title || '').trim();
  const publishedAt = row.published_at == null ? null : String(row.published_at || '').trim() || null;
  const thumbnailUrl = row.thumbnail_url == null ? null : String(row.thumbnail_url || '').trim() || null;

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
    await runTranscriptFeedSuppressionSweep(db, { traceId: input?.traceId });
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

  let hiddenRows = 0;
  for (const row of data || []) {
    const sourceItemId = String(row.source_item_id || '').trim();
    if (!sourceItemId) continue;
    const isPermanent =
      normalizeTranscriptTruthStatus((row as { transcript_status?: unknown }).transcript_status) === 'confirmed_no_speech'
      || isPermanentNoTranscriptCode(String((row as { last_error_code?: unknown }).last_error_code || ''));
    const hidden = await suppressUnlockableFeedRowsForSourceItem(db, {
      sourceItemId,
      decisionCode: isPermanent ? 'NO_TRANSCRIPT_PERMANENT_AUTO' : 'TRANSCRIPT_UNAVAILABLE_AUTO',
      traceId: input?.traceId,
    });
    hiddenRows += hidden;
  }

  if (hiddenRows > 0) {
    logUnlockEvent(
      'transcript_feed_sweep_summary',
      { trace_id: String(input?.traceId || '').trim() || createUnlockTraceId() },
      { hidden_rows: hiddenRows, scanned: (data || []).length },
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
  const cost = Math.max(0, Number(unlock.estimated_cost || input.fallbackCost));
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
  return normalized === 'NO_TRANSCRIPT_PERMANENT';
}

function isTransientTranscriptUnavailableCode(code: string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === 'TRANSCRIPT_EMPTY' || normalized === 'TRANSCRIPT_UNAVAILABLE' || normalized === 'NO_CAPTIONS';
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
  if (normalized === 'NO_CAPTIONS' || normalized === 'TRANSCRIPT_EMPTY') return 'TRANSCRIPT_UNAVAILABLE';
  return normalized || 'UNLOCK_GENERATION_FAILED';
}

function getTranscriptRetryDelaySecondsForAttempt(attemptCount: number) {
  const normalizedAttempt = Math.max(1, Math.floor(Number(attemptCount) || 1));
  if (normalizedAttempt <= 1) return sourceTranscriptRetryDelayAttempt1Seconds;
  if (normalizedAttempt === 2) return sourceTranscriptRetryDelayAttempt2Seconds;
  return sourceTranscriptRetryDelayAttempt3Seconds;
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
}) : Promise<TranscriptFailureDecision> {
  const normalizedRawErrorCode = String(input.rawErrorCode || '').trim().toUpperCase();
  const nextAttemptCount = getUnlockTranscriptAttemptCount(input.unlock) + 1;
  let nextNoCaptionHits = getUnlockTranscriptNoCaptionHits(input.unlock);
  let transcriptStatus: TranscriptTruthStatus = 'transient_error';
  let finalErrorCode = normalizeUnlockFailureCode(normalizedRawErrorCode);
  let retryAfterSeconds = getTranscriptRetryDelaySecondsForAttempt(nextAttemptCount);
  const probeMeta: Record<string, unknown> = {
    normalized_raw_error_code: normalizedRawErrorCode || null,
  };

  if (isTransientTranscriptUnavailableCode(normalizedRawErrorCode)) {
    transcriptStatus = 'retrying';
  }

  if (normalizedRawErrorCode === 'NO_CAPTIONS') {
    logUnlockEvent('transcript_probe_started', { trace_id: input.traceId, unlock_id: input.unlock.id }, {
      video_id: input.videoId,
      attempt: nextAttemptCount,
    });
    const probe = await probeTranscriptProviders(input.videoId);
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

  const confirmedPermanent = nextAttemptCount >= sourceTranscriptMaxAttempts
    && nextNoCaptionHits >= sourceTranscriptMaxAttempts;
  if (confirmedPermanent) {
    transcriptStatus = 'confirmed_no_speech';
    finalErrorCode = 'NO_TRANSCRIPT_PERMANENT';
    retryAfterSeconds = 0;
  } else if (isTransientTranscriptUnavailableCode(normalizedRawErrorCode)) {
    finalErrorCode = 'TRANSCRIPT_UNAVAILABLE';
    retryAfterSeconds = getTranscriptRetryDelaySecondsForAttempt(nextAttemptCount);
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

function sampleRandomWithoutReplacement(values: string[], maxCount: number) {
  const unique = Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
  for (let i = unique.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[swapIndex]] = [unique[swapIndex], unique[i]];
  }
  return unique.slice(0, Math.max(0, Math.min(maxCount, unique.length)));
}

function prioritizeAutoUnlockCandidates(input: {
  values: string[];
  preferredUserId?: string | null;
  maxCount: number;
}) {
  const preferredUserId = String(input.preferredUserId || '').trim();
  const sampled = sampleRandomWithoutReplacement(input.values, input.values.length);
  if (!preferredUserId) {
    return sampled.slice(0, Math.max(0, Math.min(input.maxCount, sampled.length)));
  }

  const preferredIncluded = sampled.includes(preferredUserId);
  const ordered = preferredIncluded
    ? [preferredUserId, ...sampled.filter((value) => value !== preferredUserId)]
    : sampled;
  return ordered.slice(0, Math.max(0, Math.min(input.maxCount, ordered.length)));
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
    payer_user_id: string;
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
  estimatedUnlockCost: number;
  preferredPayerUserId?: string | null;
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
  const sampledUsers = prioritizeAutoUnlockCandidates({
    values: eligibleUsers,
    preferredUserId: input.preferredPayerUserId,
    maxCount: sourceAutoUnlockSampleSize,
  });
  if (sampledUsers.length === 0) {
    return { queued: false as const, reason: 'NO_ELIGIBLE_USERS' as const };
  }

  let currentUnlock = input.unlock;
  let sawInsufficientCredits = false;
  for (const payerUserId of sampledUsers) {
    const reserveResult = await reserveUnlock(db, {
      unlock: currentUnlock,
      userId: payerUserId,
      estimatedCost: input.estimatedUnlockCost,
      reservationSeconds: sourceUnlockReservationSeconds,
    });

    if (reserveResult.state === 'ready') {
      return { queued: false as const, reason: 'ALREADY_READY' as const };
    }
    if (reserveResult.state === 'in_progress') {
      return { queued: false as const, reason: 'ALREADY_IN_PROGRESS' as const };
    }

    let reservedUnlock = reserveResult.unlock;
    const reservedCost = Math.max(0.001, Number(reservedUnlock.estimated_cost || input.estimatedUnlockCost));
    const hold = await reserveCredits(db, {
      userId: payerUserId,
      amount: reservedCost,
      idempotencyKey: buildUnlockLedgerIdempotencyKey({
        unlockId: reservedUnlock.id,
        userId: payerUserId,
        action: 'hold',
      }),
      reasonCode: 'UNLOCK_HOLD',
      context: {
        source_item_id: sourceItemId,
        source_page_id: input.sourcePageId,
        unlock_id: reservedUnlock.id,
        metadata: {
          source: 'subscription_auto_unlock',
          video_id: input.video.videoId,
        },
      },
    });

    if (!hold.ok) {
      sawInsufficientCredits = true;
      await failUnlock(db, {
        unlockId: reservedUnlock.id,
        errorCode: 'INSUFFICIENT_CREDITS',
        errorMessage: 'Auto-unlock payer has insufficient credits.',
      });
      const reloaded = await getSourceItemUnlockBySourceItemId(db, sourceItemId);
      if (!reloaded || reloaded.status !== 'available') {
        return { queued: false as const, reason: 'UNLOCK_NOT_AVAILABLE' as const };
      }
      currentUnlock = reloaded;
      continue;
    }

    reservedUnlock = await attachReservationLedger(db, {
      unlockId: reservedUnlock.id,
      userId: payerUserId,
      ledgerId: hold.ledger_id || null,
      amount: hold.reserved_amount,
    });

    const queueDepth = await countQueueDepth(db, {
      scope: 'source_item_unlock_generation',
      includeRunning: true,
    });
    const userQueueDepth = await countQueueDepth(db, {
      scope: 'source_item_unlock_generation',
      userId: payerUserId,
      includeRunning: true,
    });
    if (!unlockIntakeEnabled || queueDepth >= queueDepthHardLimit || userQueueDepth >= queueDepthPerUserLimit) {
      await refundReservation(db, {
        userId: payerUserId,
        amount: reservedCost,
        idempotencyKey: buildUnlockLedgerIdempotencyKey({
          unlockId: reservedUnlock.id,
          userId: payerUserId,
          action: 'refund',
        }),
        reasonCode: 'UNLOCK_REFUND',
        context: {
          source_item_id: sourceItemId,
          source_page_id: input.sourcePageId,
          unlock_id: reservedUnlock.id,
          metadata: {
            source: 'subscription_auto_unlock',
            error_code: !unlockIntakeEnabled ? 'QUEUE_INTAKE_DISABLED' : 'QUEUE_BACKPRESSURE',
          },
        },
      });
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
    const { data: job, error: jobError } = await db
      .from('ingestion_jobs')
      .insert({
        trigger: input.trigger === 'service_cron' ? 'service_cron' : 'user_sync',
        scope: 'source_item_unlock_generation',
        status: 'queued',
        requested_by_user_id: payerUserId,
        trace_id: traceId,
        payload: {
          user_id: payerUserId,
          trace_id: traceId,
          items: [{
            unlock_id: reservedUnlock.id,
            source_item_id: sourceItemId,
            source_page_id: input.sourcePageId,
            source_channel_id: sourceChannelId,
            source_channel_title: input.sourceChannelTitle,
            video_id: input.video.videoId,
            video_url: input.video.url,
            title: input.video.title,
            reserved_cost: reservedCost,
            reserved_by_user_id: payerUserId,
            unlock_origin: 'subscription_auto_unlock',
          } satisfies SourceUnlockQueueItem],
        },
        next_run_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job?.id) {
      await refundReservation(db, {
        userId: payerUserId,
        amount: reservedCost,
        idempotencyKey: buildUnlockLedgerIdempotencyKey({
          unlockId: reservedUnlock.id,
          userId: payerUserId,
          action: 'refund',
        }),
        reasonCode: 'UNLOCK_REFUND',
        context: {
          source_item_id: sourceItemId,
          source_page_id: input.sourcePageId,
          unlock_id: reservedUnlock.id,
          metadata: {
            source: 'subscription_auto_unlock',
            error_code: 'QUEUE_INSERT_FAILED',
          },
        },
      });
      await failUnlock(db, {
        unlockId: reservedUnlock.id,
        errorCode: 'SOURCE_VIDEO_GENERATE_FAILED',
        errorMessage: jobError?.message || 'Could not enqueue auto-unlock job.',
      });
      const reloaded = await getSourceItemUnlockBySourceItemId(db, sourceItemId);
      if (!reloaded || reloaded.status !== 'available') {
        return { queued: false as const, reason: 'UNLOCK_NOT_AVAILABLE' as const };
      }
      currentUnlock = reloaded;
      continue;
    }

    scheduleQueuedIngestionProcessing();
    return {
      queued: true as const,
      payer_user_id: payerUserId,
      job_id: job.id,
      trace_id: traceId,
    };
  }

  if (sawInsufficientCredits) {
    return { queued: false as const, reason: 'NO_ELIGIBLE_CREDITS' as const };
  }
  return { queued: false as const, reason: 'UNLOCK_NOT_AVAILABLE' as const };
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
  const { data: job, error: jobError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: input.trigger === 'service_cron' ? 'service_cron' : 'user_sync',
      scope: 'source_auto_unlock_retry',
      status: 'queued',
      requested_by_user_id: input.preferred_payer_user_id || null,
      max_attempts: sourceAutoUnlockRetryMaxAttempts,
      payload: input,
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
    }),
  ).min(1).max(200),
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
  };
}

async function processManualRefreshGenerateJob(input: {
  jobId: string;
  userId: string;
  items: RefreshScanCandidate[];
}) {
  const db = getServiceSupabaseClient();
  if (!db) {
    throw new Error('Service role client not configured');
  }

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
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

  for (const item of input.items) {
    processed += 1;
    const subscription = subscriptionById.get(item.subscription_id);
    if (!subscription) {
      skipped += 1;
      continue;
    }
    if (subscription.source_channel_id !== item.source_channel_id) {
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
        },
        channelId: subscription.source_channel_id,
        channelTitle: item.source_channel_title || subscription.source_channel_title || null,
        sourcePageId: subscription.source_page_id || null,
      });

      const existingFeedItem = await getExistingFeedItem(db, input.userId, source.id);
      if (existingFeedItem) {
        skipped += 1;
        recordCheckpointCandidate(item);
        continue;
      }

      const generated = await createBlueprintFromVideo(db, {
        userId: input.userId,
        videoUrl: source.source_url,
        videoId: source.source_native_id,
        sourceTag: 'subscription_auto',
        sourceItemId: source.id,
        subscriptionId: subscription.id,
      });

      const insertedItem = await insertFeedItem(db, {
        userId: input.userId,
        sourceItemId: source.id,
        blueprintId: generated.blueprintId,
        state: 'my_feed_published',
      });
      if (insertedItem) inserted += 1;
      else skipped += 1;

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
  const failures: Array<{ video_id: string; unlock_id: string; error_code: string; error: string }> = [];

  for (const item of input.items) {
    let processingUnlockRow: SourceItemUnlockRow | null = null;
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
        if (current?.status === 'ready' && current.blueprint_id) {
          skipped += 1;
          continue;
        }
        skipped += 1;
        continue;
      }

      if (processingUnlock.status === 'ready' && processingUnlock.blueprint_id) {
        skipped += 1;
        continue;
      }

      const { data: sourceRow, error: sourceError } = await db
        .from('source_items')
        .select('id, source_url, source_native_id, source_page_id, source_channel_id, source_channel_title, title')
        .eq('id', item.source_item_id)
        .maybeSingle();

      if (sourceError || !sourceRow) {
        throw new Error(sourceError?.message || 'SOURCE_ITEM_NOT_FOUND');
      }

      const generated = await createBlueprintFromVideo(db, {
        userId: input.userId,
        videoUrl: sourceRow.source_url,
        videoId: sourceRow.source_native_id,
        sourceTag: 'source_page_video_library',
        sourceItemId: sourceRow.id,
        subscriptionId: null,
      });

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

      await completeUnlock(db, {
        unlockId: item.unlock_id,
        blueprintId: generated.blueprintId,
        jobId: input.jobId,
      });
      await markUnlockTranscriptSuccess(db, item.unlock_id);

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

      inserted += 1;

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
      const message = error instanceof Error ? error.message : String(error);
      const rawErrorCode = String(error instanceof PipelineError
        ? error.errorCode
        : getSupabaseErrorCode(error) || 'UNLOCK_GENERATION_FAILED').trim().toUpperCase();
      let errorCode = normalizeUnlockFailureCode(rawErrorCode);
      let transcriptDecision: TranscriptFailureDecision | null = null;

      if (isTransientTranscriptUnavailableCode(rawErrorCode)) {
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
        errorCode = 'NO_TRANSCRIPT_PERMANENT';
        try {
          await db
            .from('source_item_unlocks')
            .update({
              transcript_status: 'confirmed_no_speech',
              transcript_attempt_count: Math.max(sourceTranscriptMaxAttempts, transcriptAttempts),
              transcript_no_caption_hits: Math.max(
                getUnlockTranscriptNoCaptionHits(processingUnlockRow),
                transcriptDecision?.transcriptNoCaptionHits || 0,
              ),
              transcript_retry_after: null,
              transcript_probe_meta: {
                ...(transcriptDecision?.probeMeta || {}),
                exhausted_at: new Date().toISOString(),
                exhausted_reason: 'MAX_TRANSCRIPT_ATTEMPTS',
              },
              last_error_code: 'NO_TRANSCRIPT_PERMANENT',
              last_error_message: 'Transcript unavailable after max retry attempts.',
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

      try {
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

      if (isAutoOrigin && (errorCode === 'TRANSCRIPT_UNAVAILABLE' || errorCode === 'NO_TRANSCRIPT_PERMANENT')) {
        try {
          await suppressUnlockableFeedRowsForSourceItem(db, {
            sourceItemId: item.source_item_id,
            decisionCode: errorCode === 'NO_TRANSCRIPT_PERMANENT'
              ? 'NO_TRANSCRIPT_PERMANENT_AUTO'
              : 'TRANSCRIPT_UNAVAILABLE_AUTO',
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
            trigger: 'service_cron',
            preferred_payer_user_id: item.reserved_by_user_id,
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
    const probe = await probeTranscriptProviders(input.payload.video_id);
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

  const activeSubscriberCount = await countActiveSubscribersForSourcePage(db, input.payload.source_page_id || null);
  const estimatedUnlockCost = computeUnlockCost(activeSubscriberCount);
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
    transcriptAttempts >= sourceTranscriptMaxAttempts
    && (
      transcriptStatus === 'retrying'
      || transcriptStatus === 'transient_error'
      || isTransientTranscriptUnavailableCode(unlock.last_error_code)
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
    },
    unlock,
    estimatedUnlockCost,
    preferredPayerUserId: input.payload.preferred_payer_user_id || null,
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
      payer_user_id: attempt.payer_user_id,
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
    rows.push({
      unlock_id: unlockId,
      source_item_id: sourceItemId,
      source_page_id: row.source_page_id == null ? null : String(row.source_page_id || '').trim() || null,
      source_channel_id: sourceChannelId,
      source_channel_title: row.source_channel_title == null ? null : String(row.source_channel_title || '').trim() || null,
      video_id: videoId,
      video_url: videoUrl,
      title,
      reserved_cost: Math.max(0, Number(row.reserved_cost || 0)),
      reserved_by_user_id: reservedByUserId,
      unlock_origin: unlockOrigin,
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
  const preferredPayerUserId = String(row.preferred_payer_user_id || '').trim() || null;
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
    trigger,
    preferred_payer_user_id: preferredPayerUserId,
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
    });
  }
  return rows;
}

function getRetryDelayForErrorCode(errorCode: string) {
  switch (errorCode) {
    case 'PROVIDER_DEGRADED':
      return 30;
    case 'PROVIDER_FAIL':
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
  if (error instanceof PipelineError) {
    return {
      errorCode: error.errorCode,
      message: error.message,
      retryDelaySeconds: getRetryDelayForErrorCode(error.errorCode),
    };
  }
  const providerCode = String((error as { code?: string } | null)?.code || '').trim();
  if (providerCode === 'PROVIDER_DEGRADED') {
    return {
      errorCode: 'PROVIDER_DEGRADED',
      message: error instanceof Error ? error.message : 'Provider temporarily degraded.',
      retryDelaySeconds: getRetryDelayForErrorCode('PROVIDER_DEGRADED'),
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
    .select('id, user_id, mode, source_channel_id, source_page_id, last_seen_published_at, last_seen_video_id, is_active')
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
      await markSubscriptionSyncError(db, subscription.id, error);
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
  }, workerHeartbeatMs);

  try {
    await runWithExecutionTimeout(
      (async () => {
        if (scope === 'source_item_unlock_generation') {
          const userId = String(payload.user_id || job.requested_by_user_id || '').trim();
          const items = normalizeSourceUnlockQueueItems(payload.items);
          if (!userId || items.length === 0) {
            throw new Error('INVALID_UNLOCK_JOB_PAYLOAD');
          }
          await processSourceItemUnlockGenerationJob({
            jobId: job.id,
            userId,
            items,
            traceId,
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

        if (scope === 'manual_refresh_selection') {
          const userId = String(payload.user_id || job.requested_by_user_id || '').trim();
          const items = normalizeRefreshScanCandidates(payload.items);
          if (!userId || items.length === 0) {
            throw new Error('INVALID_MANUAL_REFRESH_JOB_PAYLOAD');
          }
          await processManualRefreshGenerateJob({
            jobId: job.id,
            userId,
            items,
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
    const retriableDelaySeconds = getRetryDelayForErrorCode(classified.errorCode);
    const nextRetryDelay = retriableDelaySeconds > 0 ? retriableDelaySeconds : classified.retryDelaySeconds;
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

async function runQueuedIngestionProcessing() {
  if (queuedWorkerRunning) {
    queuedWorkerRequested = true;
    return;
  }
  const db = getServiceSupabaseClient();
  if (!db) return;

  queuedWorkerRunning = true;
  try {
    do {
      queuedWorkerRequested = false;
      await runUnlockSweeps(db, { mode: 'cron', force: true });
      for (const scope of QUEUED_INGESTION_SCOPES) {
        const recovered = await recoverStaleIngestionJobs(db, { scope });
        if (recovered.length > 0) {
          console.log('[ingestion_stale_recovered]', JSON.stringify({
            worker_id: queuedWorkerId,
            scope,
            recovered_count: recovered.length,
            recovered_job_ids: recovered.map((row) => row.id),
          }));
        }
      }

      while (true) {
        const claimed = await claimQueuedIngestionJobs(db, {
          scopes: [...QUEUED_INGESTION_SCOPES],
          maxJobs: workerBatchSize,
          workerId: queuedWorkerId,
          leaseSeconds: Math.max(5, Math.ceil(workerLeaseMs / 1000)),
        });
        if (claimed.length === 0) break;
        await processClaimedIngestionJobs(db, claimed);
      }
    } while (queuedWorkerRequested);
  } catch (error) {
    console.log('[ingestion_queue_worker_failed]', JSON.stringify({
      worker_id: queuedWorkerId,
      error: error instanceof Error ? error.message : String(error),
    }));
  } finally {
    queuedWorkerRunning = false;
  }
}

function scheduleQueuedIngestionProcessing(delayMs = 0) {
  if (queuedWorkerRunning) {
    queuedWorkerRequested = true;
    return;
  }

  if (queuedWorkerTimer) return;
  const waitMs = Math.max(0, Math.floor(delayMs));
  queuedWorkerTimer = setTimeout(() => {
    queuedWorkerTimer = null;
    void runQueuedIngestionProcessing();
  }, waitMs);
}

async function syncSingleSubscription(db: ReturnType<typeof createClient>, subscription: {
  id: string;
  user_id: string;
  mode: string;
  source_channel_id: string;
  source_page_id?: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
}, options: {
  trigger: 'user_sync' | 'service_cron' | 'subscription_create' | 'debug_simulation' | 'youtube_import';
}) {
  const feed = await fetchYouTubeFeed(subscription.source_channel_id, 20);
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
    } as SyncSubscriptionResult;
  }

  let candidates: YouTubeFeedVideo[] = [];
  candidates = feed.videos.filter((video) =>
    isNewerThanCheckpoint(video, subscription.last_seen_published_at, subscription.last_seen_video_id),
  );

  const toProcess = candidates
    .slice(0, ingestionMaxPerSubscription)
    .sort((a, b) => {
      const aTs = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bTs = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return aTs - bTs;
    });

  let videoStatesById = new Map<string, { isUpcoming: boolean; scheduledStartAt: string | null }>();
  if (toProcess.length > 0 && youtubeDataApiKey) {
    try {
      const fetchedStates = await fetchYouTubeVideoStates({
        apiKey: youtubeDataApiKey,
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
  const activeSubscriberCount = await countActiveSubscribersForSourcePage(db, subscription.source_page_id || null);
  const estimatedUnlockCost = computeUnlockCost(activeSubscriberCount);

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
    const source = await upsertSourceItemFromVideo(db, {
      video,
      channelId: subscription.source_channel_id,
      channelTitle: feed.channelTitle,
      sourcePageId: subscription.source_page_id || null,
    });

    const existingFeedItem = await getExistingFeedItem(db, subscription.user_id, source.id);
    if (existingFeedItem) {
      skipped += 1;
      continue;
    }

    const unlock = await ensureSourceItemUnlock(db, {
      sourceItemId: source.id,
      sourcePageId: subscription.source_page_id || source.source_page_id || null,
      estimatedCost: estimatedUnlockCost,
    });

    let autoAttempt: AutoUnlockAttemptResult | null = null;
    let autoAttemptError: unknown = null;
    if (unlock.status === 'available') {
      try {
        autoAttempt = await attemptAutoUnlockForSourceItem({
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
            const retryDb = getServiceSupabaseClient();
            if (!retryDb) throw new Error('Service role client not configured');
            const retry = await enqueueSourceAutoUnlockRetryJob(retryDb, {
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

    const latestUnlock = await getSourceItemUnlockBySourceItemId(db, source.id);
    const transcriptCooldown = getTranscriptCooldownState(latestUnlock);
    const isTranscriptBlocked = transcriptCooldown.active || isConfirmedNoTranscriptUnlock(latestUnlock);
    if (isTranscriptBlocked) {
      await suppressUnlockableFeedRowsForSourceItem(db, {
        sourceItemId: source.id,
        decisionCode: isConfirmedNoTranscriptUnlock(latestUnlock)
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
      const insertedItem = await insertFeedItem(db, {
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
  } as SyncSubscriptionResult;
}

const DebugSimulateSubscriptionRequestSchema = z.object({
  rewind_days: z.coerce.number().int().min(1).max(365).optional(),
});

async function markSubscriptionSyncError(db: ReturnType<typeof createClient>, subscriptionId: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  await db
    .from('user_source_subscriptions')
    .update({
      last_polled_at: new Date().toISOString(),
      last_sync_error: message.slice(0, 500),
    })
    .eq('id', subscriptionId);
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

app.post('/api/source-subscriptions', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const body = req.body as { channel_input?: string; mode?: string };
  const channelInput = String(body.channel_input || '').trim();
  if (!channelInput) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'channel_input required', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let resolved;
  try {
    resolved = await resolveYouTubeChannel(channelInput);
  } catch {
    return res.status(400).json({ ok: false, error_code: 'INVALID_CHANNEL', message: 'Could not resolve YouTube channel', data: null });
  }

  let channelAvatarUrl: string | null = null;
  let channelBannerUrl: string | null = null;
  if (youtubeDataApiKey) {
    try {
      const assetMap = await fetchYouTubeChannelAssetMap({
        apiKey: youtubeDataApiKey,
        channelIds: [resolved.channelId],
      });
      const assets = assetMap.get(resolved.channelId);
      channelAvatarUrl = assets?.avatarUrl || null;
      channelBannerUrl = assets?.bannerUrl || null;
    } catch (assetError) {
      console.log('[source_page_assets_lookup_failed]', JSON.stringify({
        source_channel_id: resolved.channelId,
        error: assetError instanceof Error ? assetError.message : String(assetError),
      }));
    }
  }

  let sourcePage;
  try {
    sourcePage = await ensureSourcePageFromYouTubeChannel(sourcePageDb, {
      channelId: resolved.channelId,
      channelUrl: resolved.channelUrl,
      title: resolved.channelTitle,
      avatarUrl: channelAvatarUrl,
      bannerUrl: channelBannerUrl,
    });
  } catch (sourcePageError) {
    return res.status(500).json({
      ok: false,
      error_code: 'SOURCE_PAGE_SUBSCRIBE_FAILED',
      message: sourcePageError instanceof Error ? sourcePageError.message : 'Could not prepare source page.',
      data: null,
    });
  }

  const { data: existingSub } = await db
    .from('user_source_subscriptions')
    .select('id, is_active, auto_unlock_enabled')
    .eq('user_id', userId)
    .eq('source_type', 'youtube')
    .eq('source_channel_id', resolved.channelId)
    .maybeSingle();
  const isCreateOrReactivate = !existingSub || !existingSub.is_active;

  const { data: upserted, error: upsertError } = await db
    .from('user_source_subscriptions')
    .upsert(
      {
        user_id: userId,
        source_type: 'youtube',
        source_channel_id: resolved.channelId,
        source_channel_url: resolved.channelUrl,
        source_channel_title: resolved.channelTitle,
        source_page_id: sourcePage.id,
        mode: 'auto',
        auto_unlock_enabled: existingSub?.auto_unlock_enabled ?? true,
        is_active: true,
        last_sync_error: null,
      },
      { onConflict: 'user_id,source_type,source_channel_id' },
    )
    .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
    .single();
  if (upsertError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: upsertError.message, data: null });

  let sync: SyncSubscriptionResult | null = null;
  try {
    sync = await syncSingleSubscription(db, upserted, { trigger: 'subscription_create' });
  } catch (error) {
    await markSubscriptionSyncError(db, upserted.id, error);
  }

  if (isCreateOrReactivate) {
    try {
      const noticeSource = await upsertSubscriptionNoticeSourceItem(db, {
        channelId: resolved.channelId,
        channelTitle: resolved.channelTitle,
        channelUrl: resolved.channelUrl,
        channelAvatarUrl,
        channelBannerUrl,
      });
      await insertFeedItem(db, {
        userId,
        sourceItemId: noticeSource.id,
        blueprintId: null,
        state: 'subscription_notice',
      });
    } catch (noticeError) {
      console.log('[subscription_notice_insert_failed]', JSON.stringify({
        user_id: userId,
        source_channel_id: resolved.channelId,
        error: noticeError instanceof Error ? noticeError.message : String(noticeError),
      }));
    }
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'subscription upserted',
    data: {
      subscription: {
        ...upserted,
        source_page_path: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
      },
      source_page: sourcePage,
      sync,
    },
  });
});

type SourcePageBlueprintCursor = {
  createdAt: string;
  feedItemId: string;
};

type SourcePageFeedScanRow = {
  id: string;
  source_item_id: string;
  blueprint_id: string;
  created_at: string;
};

type SourcePageFeedSourceRow = {
  id: string;
  source_page_id: string | null;
  source_channel_id: string | null;
  source_url: string;
  thumbnail_url: string | null;
};

function normalizeSourcePageBlueprintCursor(input: SourcePageBlueprintCursor) {
  const createdAtMs = Date.parse(input.createdAt);
  if (!Number.isFinite(createdAtMs)) return null;
  const feedItemId = String(input.feedItemId || '').trim();
  if (!feedItemId) return null;
  return {
    createdAt: new Date(createdAtMs).toISOString(),
    feedItemId,
  };
}

function encodeSourcePageBlueprintCursor(input: SourcePageBlueprintCursor) {
  const normalized = normalizeSourcePageBlueprintCursor(input);
  if (!normalized) return null;
  const payload = JSON.stringify({
    created_at: normalized.createdAt,
    feed_item_id: normalized.feedItemId,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeSourcePageBlueprintCursor(raw: string) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { created_at?: string; feed_item_id?: string };
    return normalizeSourcePageBlueprintCursor({
      createdAt: String(parsed.created_at || ''),
      feedItemId: String(parsed.feed_item_id || ''),
    });
  } catch {
    return null;
  }
}

function buildSourcePageCursorFilter(cursor: SourcePageBlueprintCursor) {
  const normalized = normalizeSourcePageBlueprintCursor(cursor);
  if (!normalized) return null;
  return `created_at.lt.${normalized.createdAt},and(created_at.eq.${normalized.createdAt},id.lt.${normalized.feedItemId})`;
}

function cleanSourcePageSummaryText(raw: string) {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .trim();
}

function buildSourcePageSummary(input: {
  llmReview: string | null;
  selectedItems: unknown;
  fallbackTitle: string;
  maxChars?: number;
}) {
  const maxChars = Math.max(80, Math.min(320, Number(input.maxChars || 220)));
  const selectedItems =
    input.selectedItems && typeof input.selectedItems === 'object' ? input.selectedItems as Record<string, unknown> : null;
  const selectedItemsOverview = selectedItems
    ? [selectedItems.overview, selectedItems.description, selectedItems.notes]
      .find((value) => typeof value === 'string' && String(value).trim().length > 0) || null
    : null;
  const candidate = cleanSourcePageSummaryText(
    String(input.llmReview || selectedItemsOverview || input.fallbackTitle || ''),
  );
  if (!candidate) return 'Open to view the full step-by-step blueprint.';
  if (candidate.length <= maxChars) return candidate;
  return `${candidate.slice(0, maxChars).trim()}...`;
}

type SourcePageSearchRow = {
  id: string;
  platform: string;
  external_id: string;
  external_url: string;
  title: string;
  avatar_url: string | null;
  is_active: boolean;
};

function normalizeSourcePageSearchToken(raw: string) {
  return String(raw || '').trim().toLowerCase();
}

function scoreSourcePageSearchRow(row: SourcePageSearchRow, normalizedQuery: string) {
  const normalizedTitle = normalizeSourcePageSearchToken(row.title);
  const normalizedExternalId = normalizeSourcePageSearchToken(row.external_id);
  if (!normalizedQuery) return 99;
  if (normalizedTitle === normalizedQuery || normalizedExternalId === normalizedQuery) return 0;
  if (normalizedTitle.startsWith(normalizedQuery)) return 1;
  if (normalizedExternalId.startsWith(normalizedQuery)) return 2;
  if (normalizedTitle.includes(normalizedQuery)) return 3;
  if (normalizedExternalId.includes(normalizedQuery)) return 4;
  return 9;
}

app.get('/api/source-pages/search', async (req, res) => {
  const rawQuery = String(req.query.q || '').trim();
  if (rawQuery.length < 2) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_QUERY',
      message: 'Query must be at least 2 characters.',
      data: null,
    });
  }

  const limit = clampInt(req.query.limit, 12, 1, 25);
  const scanLimit = clampInt(limit * 4, 48, 20, 100);
  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });
  void runSourcePageAssetSweep(db, { mode: 'opportunistic' });

  const likePattern = `%${rawQuery}%`;
  const [titleResult, externalResult] = await Promise.all([
    db
      .from('source_pages')
      .select('id, platform, external_id, external_url, title, avatar_url, is_active')
      .eq('is_active', true)
      .ilike('title', likePattern)
      .limit(scanLimit),
    db
      .from('source_pages')
      .select('id, platform, external_id, external_url, title, avatar_url, is_active')
      .eq('is_active', true)
      .ilike('external_id', likePattern)
      .limit(scanLimit),
  ]);

  if (titleResult.error || externalResult.error) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_SEARCH_FAILED',
      message: titleResult.error?.message || externalResult.error?.message || 'Could not search source pages.',
      data: null,
    });
  }

  const dedupedById = new Map<string, SourcePageSearchRow>();
  for (const row of ([...(titleResult.data || []), ...(externalResult.data || [])] as SourcePageSearchRow[])) {
    if (!row?.id) continue;
    dedupedById.set(row.id, row);
  }

  const normalizedQuery = normalizeSourcePageSearchToken(rawQuery);
  const items = Array.from(dedupedById.values())
    .sort((a, b) => {
      const scoreDelta = scoreSourcePageSearchRow(a, normalizedQuery) - scoreSourcePageSearchRow(b, normalizedQuery);
      if (scoreDelta !== 0) return scoreDelta;
      const titleDelta = String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
      if (titleDelta !== 0) return titleDelta;
      return String(a.external_id || '').localeCompare(String(b.external_id || ''), undefined, { sensitivity: 'base' });
    })
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      platform: row.platform,
      external_id: row.external_id,
      external_url: row.external_url,
      title: row.title,
      avatar_url: row.avatar_url,
      is_active: row.is_active,
      path: buildSourcePagePath(row.platform, row.external_id),
    }));

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page search',
    data: {
      items,
    },
  });
});

app.get('/api/source-pages/:platform/:externalId', async (req, res) => {
  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: null,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'externalId required',
      data: null,
    });
  }

  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let sourcePage;
  try {
    sourcePage = await getSourcePageByPlatformExternalId(db, { platform, externalId });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not fetch source page.',
      data: null,
    });
  }
  if (!sourcePage) {
    return res.status(404).json({
      ok: false,
      error_code: 'SOURCE_PAGE_NOT_FOUND',
      message: 'Source page not found.',
      data: null,
    });
  }

  // Opportunistic lazy hydration: older backfilled rows can miss avatar/banner
  // until a subscribe/import rewrite occurs. Fill once on read when possible.
  if (needsSourcePageAssetHydration(sourcePage) && youtubeDataApiKey) {
    try {
      const hydration = await hydrateSourcePageAssetsForRow(db, sourcePage as SourcePageAssetRecord);
      sourcePage = hydration.sourcePage as typeof sourcePage;
    } catch (assetError) {
      console.log('[source_page_assets_lookup_failed]', JSON.stringify({
        source_page_id: sourcePage.id,
        source_channel_id: sourcePage.external_id,
        error: assetError instanceof Error ? assetError.message : String(assetError),
      }));
    }
  }

  const { count: linkedFollowerCount, error: linkedFollowerCountError } = await db
    .from('user_source_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('source_page_id', sourcePage.id)
    .eq('is_active', true);
  if (linkedFollowerCountError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: linkedFollowerCountError.message, data: null });
  }

  let followerCount = Number(linkedFollowerCount || 0);
  if (followerCount === 0 && platform === 'youtube') {
    const { count: fallbackFollowerCount } = await db
      .from('user_source_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('source_type', 'youtube')
      .eq('source_channel_id', sourcePage.external_id)
      .eq('is_active', true);
    followerCount = Number(fallbackFollowerCount || 0);
  }

  const userId = (res.locals.user as { id?: string } | undefined)?.id || null;
  let subscribed = false;
  let subscriptionId: string | null = null;
  if (userId) {
    try {
      const subscriptionState = await getUserSubscriptionStateForSourcePage(db, {
        userId,
        sourcePageId: sourcePage.id,
      });
      subscribed = Boolean(subscriptionState.subscribed);
      subscriptionId = subscriptionState.subscription_id || null;

      if (!subscribed && platform === 'youtube') {
        const { data: fallbackSub } = await db
          .from('user_source_subscriptions')
          .select('id, is_active')
          .eq('user_id', userId)
          .eq('source_type', 'youtube')
          .eq('source_channel_id', sourcePage.external_id)
          .maybeSingle();
        if (fallbackSub?.is_active) {
          subscribed = true;
          subscriptionId = fallbackSub.id;
        }
      }
    } catch {
      // Optional viewer state should not fail public reads.
      subscribed = false;
      subscriptionId = null;
    }
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page fetched',
    data: {
      source_page: {
        ...sourcePage,
        path: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
        follower_count: followerCount,
      },
      viewer: {
        authenticated: Boolean(userId),
        subscribed,
        subscription_id: subscriptionId,
      },
    },
  });
});

app.get(
  '/api/source-pages/:platform/:externalId/videos',
  sourceVideoListBurstLimiter,
  sourceVideoListSustainedLimiter,
  async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: null,
    });
  }
  if (platform !== 'youtube') {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Only YouTube source pages are supported in this version.',
      data: null,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'externalId required',
      data: null,
    });
  }

  const limit = clampYouTubeSourceVideoLimit(Number(req.query.limit), 12);
  const pageToken = String(req.query.page_token || '').trim();
  const kind = normalizeYouTubeSourceVideoKind(String(req.query.kind || ''), 'full');
  const shortsMaxSeconds = 60;

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let sourcePage;
  try {
    sourcePage = await getSourcePageByPlatformExternalId(sourcePageDb, { platform, externalId });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not read source page.',
      data: null,
    });
  }
  if (!sourcePage) {
    return res.status(404).json({
      ok: false,
      error_code: 'SOURCE_PAGE_NOT_FOUND',
      message: 'Source page not found.',
      data: null,
    });
  }

  let page;
  try {
    await runUnlockSweeps(sourcePageDb, { mode: 'opportunistic' });
    page = await listYouTubeSourceVideos({
      apiKey: youtubeDataApiKey,
      channelId: sourcePage.external_id,
      limit,
      pageToken: pageToken || undefined,
      kind,
      shortsMaxSeconds,
    });
  } catch (error) {
    if (error instanceof YouTubeSourceVideosError) {
      if (error.code === 'RATE_LIMITED') {
        return res.status(429).json({
          ok: false,
          error_code: 'RATE_LIMITED',
          message: error.message,
          data: null,
        });
      }
      if (error.code === 'SEARCH_DISABLED') {
        return res.status(503).json({
          ok: false,
          error_code: 'SOURCE_VIDEO_LIST_FAILED',
          message: error.message,
          data: null,
        });
      }
      return res.status(502).json({
        ok: false,
        error_code: 'SOURCE_VIDEO_LIST_FAILED',
        message: error.message,
        data: null,
      });
    }
    return res.status(502).json({
      ok: false,
      error_code: 'SOURCE_VIDEO_LIST_FAILED',
      message: error instanceof Error ? error.message : 'Could not load source videos.',
      data: null,
    });
  }

  let existingByVideoId = new Map<string, SourcePageVideoExistingState>();
  try {
    existingByVideoId = await loadExistingSourceVideoStateForUser(
      db,
      userId,
      page.results.map((item) => item.video_id),
    );
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not resolve duplicate state.',
      data: null,
    });
  }

  let activeSubscriberCount = 0;
  try {
    activeSubscriberCount = await countActiveSubscribersForSourcePage(sourcePageDb, sourcePage.id);
  } catch (error) {
    console.log('[source_video_active_subscriber_count_failed]', JSON.stringify({
      source_page_id: sourcePage.id,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  const fallbackUnlockCost = computeUnlockCost(activeSubscriberCount);

  const sourceItemIds = Array.from(new Set(
    page.results
      .map((item) => existingByVideoId.get(item.video_id)?.source_item_id || null)
      .filter((value): value is string => Boolean(value)),
  ));
  let unlockBySourceItemId = new Map<string, SourceItemUnlockRow>();
  if (sourceItemIds.length > 0) {
    try {
      const unlockRows = await getSourceItemUnlocksBySourceItemIds(sourcePageDb, sourceItemIds);
      unlockBySourceItemId = new Map(unlockRows.map((row) => [row.source_item_id, row]));
    } catch (error) {
      console.log('[source_video_unlock_lookup_failed]', JSON.stringify({
        source_page_id: sourcePage.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const items = page.results
    .map((item) => {
      const existing = existingByVideoId.get(item.video_id);
      const unlock = existing?.source_item_id ? unlockBySourceItemId.get(existing.source_item_id) || null : null;
      return {
        unlock,
        payload: {
          video_id: item.video_id,
          video_url: item.video_url,
          title: item.title,
          description: item.description,
          thumbnail_url: item.thumbnail_url,
          published_at: item.published_at,
          duration_seconds: item.duration_seconds,
          channel_id: item.channel_id,
          channel_title: item.channel_title,
          already_exists_for_user: Boolean(existing?.already_exists_for_user),
          existing_blueprint_id: existing?.existing_blueprint_id || null,
          existing_feed_item_id: existing?.existing_feed_item_id || null,
          ...toUnlockSnapshot({
            unlock,
            fallbackCost: fallbackUnlockCost,
          }),
        },
      };
    })
    .filter((row) => !isConfirmedNoTranscriptUnlock(row.unlock))
    .map((row) => row.payload);

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page videos',
    data: {
      items,
      next_page_token: page.nextPageToken,
      kind,
      shorts_max_seconds: shortsMaxSeconds,
    },
  });
  },
);

async function handleSourcePageVideosUnlock(req: express.Request, res: express.Response) {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }
  const traceId = createUnlockTraceId();
  const traceData = { trace_id: traceId };

  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: traceData,
    });
  }
  if (platform !== 'youtube') {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Only YouTube source pages are supported in this version.',
      data: traceData,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'externalId required',
      data: traceData,
    });
  }

  const parsed = SourcePageVideosGenerateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_VIDEO_GENERATE_INVALID_INPUT',
      message: 'Invalid unlock payload.',
      data: traceData,
    });
  }
  if (parsed.data.items.length > sourceUnlockGenerateMaxItems) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_VIDEO_GENERATE_INVALID_INPUT',
      message: `Select up to ${sourceUnlockGenerateMaxItems} videos per request.`,
      data: traceData,
    });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: traceData });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: traceData });

  logUnlockEvent('unlock_request_received', { trace_id: traceId, user_id: userId, platform, external_id: externalId }, {
    requested_items: parsed.data.items.length,
    route: req.path,
  });

  let sourcePage;
  try {
    sourcePage = await getSourcePageByPlatformExternalId(sourcePageDb, { platform, externalId });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not read source page.',
      data: traceData,
    });
  }
  if (!sourcePage) {
    return res.status(404).json({
      ok: false,
      error_code: 'SOURCE_PAGE_NOT_FOUND',
      message: 'Source page not found.',
      data: traceData,
    });
  }

  await runUnlockSweeps(sourcePageDb, { mode: 'opportunistic', traceId });

  const dedupedMap = new Map<string, SourcePageVideoGenerateItem>();
  for (const item of parsed.data.items) {
    const normalized = normalizeSourcePageVideoGenerateItem(item);
    if (!normalized) continue;
    dedupedMap.set(normalized.video_id, normalized);
  }
  const normalizedItems = Array.from(dedupedMap.values());
  if (normalizedItems.length === 0) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_VIDEO_GENERATE_INVALID_INPUT',
      message: 'No valid videos selected for generation.',
      data: traceData,
    });
  }

  let existingByVideoId = new Map<string, SourcePageVideoExistingState>();
  try {
    existingByVideoId = await loadExistingSourceVideoStateForUser(
      db,
      userId,
      normalizedItems.map((item) => item.video_id),
    );
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not resolve duplicate state.',
      data: traceData,
    });
  }

  const duplicateRows = normalizedItems
    .map((item) => ({
      item,
      existing: existingByVideoId.get(item.video_id),
    }))
    .filter((row) => Boolean(row.existing?.already_exists_for_user));

  let activeSubscriberCount = 0;
  try {
    activeSubscriberCount = await countActiveSubscribersForSourcePage(sourcePageDb, sourcePage.id);
  } catch (error) {
    logUnlockEvent(
      'source_unlock_active_subscriber_count_failed',
      { trace_id: traceId, user_id: userId, source_page_id: sourcePage.id },
      {
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
  const estimatedUnlockCost = computeUnlockCost(activeSubscriberCount);

  const queueItems: SourceUnlockQueueItem[] = [];
  const inProgressRows: Array<{ video_id: string; title: string }> = [];
  const readyRows: Array<{ video_id: string; title: string; blueprint_id: string | null }> = [];
  const insufficientRows: Array<{ video_id: string; title: string; required: number; balance: number }> = [];
  const transcriptUnavailableRows: Array<{ video_id: string; title: string; retry_after_seconds: number }> = [];
  const permanentNoTranscriptRows: Array<{ video_id: string; title: string }> = [];

  const candidateRows = normalizedItems.filter((item) => !existingByVideoId.get(item.video_id)?.already_exists_for_user);

  for (const item of candidateRows) {
    try {
      const source = await upsertSourceItemFromVideo(sourcePageDb, {
        video: {
          videoId: item.video_id,
          title: item.title,
          url: item.video_url,
          publishedAt: item.published_at || null,
          thumbnailUrl: item.thumbnail_url || null,
        },
        channelId: sourcePage.external_id,
        channelTitle: sourcePage.title || sourcePage.external_id,
        sourcePageId: sourcePage.id,
      });

      const unlockSeed = await ensureSourceItemUnlock(sourcePageDb, {
        sourceItemId: source.id,
        sourcePageId: sourcePage.id,
        estimatedCost: estimatedUnlockCost,
      });
      if (isConfirmedNoTranscriptUnlock(unlockSeed)) {
        permanentNoTranscriptRows.push({
          video_id: item.video_id,
          title: item.title,
        });
        continue;
      }
      const transcriptCooldown = getTranscriptCooldownState(unlockSeed);
      if (transcriptCooldown.active) {
        transcriptUnavailableRows.push({
          video_id: item.video_id,
          title: item.title,
          retry_after_seconds: transcriptCooldown.retryAfterSeconds,
        });
        continue;
      }

      const reserveResult = await reserveUnlock(sourcePageDb, {
        unlock: unlockSeed,
        userId,
        estimatedCost: estimatedUnlockCost,
        reservationSeconds: sourceUnlockReservationSeconds,
      });

      if (reserveResult.state === 'ready') {
        readyRows.push({
          video_id: item.video_id,
          title: item.title,
          blueprint_id: reserveResult.unlock.blueprint_id || null,
        });
        continue;
      }

      if (reserveResult.state === 'in_progress') {
        inProgressRows.push({
          video_id: item.video_id,
          title: item.title,
        });
        continue;
      }

      let reservedUnlock = reserveResult.unlock;
      if (!reservedUnlock.reserved_ledger_id) {
        const hold = await reserveCredits(sourcePageDb, {
          userId,
          amount: Math.max(0.001, Number(reservedUnlock.estimated_cost || estimatedUnlockCost)),
          idempotencyKey: buildUnlockLedgerIdempotencyKey({
            unlockId: reservedUnlock.id,
            userId,
            action: 'hold',
          }),
          reasonCode: 'UNLOCK_HOLD',
          context: {
            source_item_id: source.id,
            source_page_id: sourcePage.id,
            unlock_id: reservedUnlock.id,
            metadata: {
              source: 'source_page_video_library',
              video_id: item.video_id,
              trace_id: traceId,
            },
          },
        });

        if (!hold.ok) {
          await failUnlock(sourcePageDb, {
            unlockId: reservedUnlock.id,
            errorCode: 'INSUFFICIENT_CREDITS',
            errorMessage: 'Insufficient credits to reserve unlock.',
          });
          insufficientRows.push({
            video_id: item.video_id,
            title: item.title,
            required: Math.max(0.001, Number(reservedUnlock.estimated_cost || estimatedUnlockCost)),
            balance: hold.wallet.balance,
          });
          continue;
        }

        reservedUnlock = await attachReservationLedger(sourcePageDb, {
          unlockId: reservedUnlock.id,
          userId,
          ledgerId: hold.ledger_id || null,
          amount: hold.reserved_amount,
        });
      }

      queueItems.push({
        unlock_id: reservedUnlock.id,
        source_item_id: source.id,
        source_page_id: sourcePage.id,
        source_channel_id: sourcePage.external_id,
        source_channel_title: sourcePage.title || sourcePage.external_id,
        video_id: item.video_id,
        video_url: item.video_url,
        title: item.title,
        reserved_cost: Math.max(0.001, Number(reservedUnlock.estimated_cost || estimatedUnlockCost)),
        reserved_by_user_id: userId,
        unlock_origin: 'manual_unlock',
      });
      logUnlockEvent(
        'unlock_item_queued',
        {
          trace_id: traceId,
          user_id: userId,
          source_page_id: sourcePage.id,
          unlock_id: reservedUnlock.id,
          source_item_id: source.id,
          video_id: item.video_id,
        },
        {
          cost: Math.max(0.001, Number(reservedUnlock.estimated_cost || estimatedUnlockCost)),
        },
      );
    } catch (error) {
      logUnlockEvent(
        'source_unlock_prepare_failed',
        { trace_id: traceId, user_id: userId, source_page_id: sourcePage.id, video_id: item.video_id },
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      inProgressRows.push({
        video_id: item.video_id,
        title: item.title,
      });
    }
  }

  if (
    queueItems.length === 0
    && insufficientRows.length > 0
    && transcriptUnavailableRows.length === 0
    && permanentNoTranscriptRows.length === 0
    && readyRows.length === 0
    && inProgressRows.length === 0
    && duplicateRows.length === 0
  ) {
    return res.status(402).json({
      ok: false,
      error_code: 'INSUFFICIENT_CREDITS',
      message: 'Insufficient credits for unlock.',
      data: {
        ...traceData,
        required: insufficientRows[0]?.required || 0,
        balance: insufficientRows[0]?.balance || 0,
        insufficient: insufficientRows,
      },
    });
  }

  if (
    queueItems.length === 0
    && transcriptUnavailableRows.length > 0
    && insufficientRows.length === 0
    && permanentNoTranscriptRows.length === 0
    && readyRows.length === 0
    && inProgressRows.length === 0
    && duplicateRows.length === 0
  ) {
    const retryAfterSeconds = Math.max(...transcriptUnavailableRows.map((row) => row.retry_after_seconds));
    logUnlockEvent(
      'auto_transcript_manual_add_error_returned',
      { trace_id: traceId, user_id: userId, source_page_id: sourcePage.id },
      {
        transcript_unavailable_count: transcriptUnavailableRows.length,
        retry_after_seconds: retryAfterSeconds,
        video_ids: transcriptUnavailableRows.map((row) => row.video_id),
      },
    );
    return res.status(422).json({
      ok: false,
      error_code: 'TRANSCRIPT_UNAVAILABLE',
      message: 'Only videos with speech can be generated. If this video has speech, please try again in a few minutes.',
      retry_after_seconds: retryAfterSeconds,
      data: {
        ...traceData,
        transcript_unavailable_count: transcriptUnavailableRows.length,
        transcript_unavailable: transcriptUnavailableRows,
      },
    });
  }

  if (
    queueItems.length === 0
    && permanentNoTranscriptRows.length > 0
    && transcriptUnavailableRows.length === 0
    && insufficientRows.length === 0
    && readyRows.length === 0
    && inProgressRows.length === 0
    && duplicateRows.length === 0
  ) {
    return res.status(422).json({
      ok: false,
      error_code: 'NO_TRANSCRIPT_PERMANENT',
      message: 'No transcript is available for this video.',
      data: {
        ...traceData,
        transcript_status: 'confirmed_no_speech',
        transcript_attempt_count: sourceTranscriptMaxAttempts,
        transcript_retry_after_seconds: 0,
        no_transcript_count: permanentNoTranscriptRows.length,
        no_transcript: permanentNoTranscriptRows,
      },
    });
  }

  if (queueItems.length === 0) {
    return res.json({
      ok: true,
      error_code: null,
      message: 'source unlock status resolved',
      data: {
        ...traceData,
        job_id: null,
        queued_count: 0,
        skipped_existing_count: duplicateRows.length,
        skipped_existing: duplicateRows.map((row) => ({
          video_id: row.item.video_id,
          title: row.item.title,
          existing_blueprint_id: row.existing?.existing_blueprint_id || null,
          existing_feed_item_id: row.existing?.existing_feed_item_id || null,
        })),
        ready_count: readyRows.length,
        ready: readyRows,
        in_progress_count: inProgressRows.length,
        in_progress: inProgressRows,
        insufficient_count: insufficientRows.length,
        insufficient: insufficientRows,
        transcript_unavailable_count: transcriptUnavailableRows.length,
        transcript_unavailable: transcriptUnavailableRows,
        transcript_status: transcriptUnavailableRows.length > 0 ? 'retrying' : null,
        transcript_attempt_count: null,
        transcript_retry_after_seconds: transcriptUnavailableRows.length > 0
          ? Math.max(...transcriptUnavailableRows.map((row) => row.retry_after_seconds))
          : 0,
        no_transcript_count: permanentNoTranscriptRows.length,
        no_transcript: permanentNoTranscriptRows,
      },
    });
  }

  const queueDepth = await countQueueDepth(sourcePageDb, {
    scope: 'source_item_unlock_generation',
    includeRunning: true,
  });
  const userQueueDepth = await countQueueDepth(sourcePageDb, {
    scope: 'source_item_unlock_generation',
    userId,
    includeRunning: true,
  });
  if (!unlockIntakeEnabled) {
    return res.status(503).json({
      ok: false,
      error_code: 'QUEUE_INTAKE_DISABLED',
      message: 'Unlock intake is temporarily paused.',
      data: {
        ...traceData,
        queue_depth: queueDepth,
      },
    });
  }
  if (queueDepth >= queueDepthHardLimit || userQueueDepth >= queueDepthPerUserLimit) {
    return res.status(429).json({
      ok: false,
      error_code: 'QUEUE_BACKPRESSURE',
      message: 'Unlock queue is busy. Please retry shortly.',
      retry_after_seconds: 30,
      data: {
        ...traceData,
        queue_depth: queueDepth,
        user_queue_depth: userQueueDepth,
      },
    });
  }

  const { data: job, error: jobCreateError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: 'user_sync',
      scope: 'source_item_unlock_generation',
      status: 'queued',
      requested_by_user_id: userId,
      trace_id: traceId,
      payload: {
        user_id: userId,
        trace_id: traceId,
        items: queueItems,
      },
      next_run_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobCreateError) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_VIDEO_GENERATE_FAILED',
      message: jobCreateError.message,
      data: traceData,
    });
  }

  scheduleQueuedIngestionProcessing();

  return res.status(202).json({
    ok: true,
    error_code: null,
    message: 'background unlock generation started',
    data: {
      ...traceData,
      job_id: job.id,
      queue_depth: queueDepth + 1,
      estimated_start_seconds: Math.max(1, Math.ceil((queueDepth + 1) / Math.max(1, workerConcurrency)) * 4),
      queued_count: queueItems.length,
      skipped_existing_count: duplicateRows.length,
      skipped_existing: duplicateRows.map((row) => ({
        video_id: row.item.video_id,
        title: row.item.title,
        existing_blueprint_id: row.existing?.existing_blueprint_id || null,
        existing_feed_item_id: row.existing?.existing_feed_item_id || null,
      })),
      ready_count: readyRows.length,
      ready: readyRows,
      in_progress_count: inProgressRows.length,
      in_progress: inProgressRows,
      insufficient_count: insufficientRows.length,
      insufficient: insufficientRows,
      transcript_unavailable_count: transcriptUnavailableRows.length,
      transcript_unavailable: transcriptUnavailableRows,
      transcript_status: transcriptUnavailableRows.length > 0 ? 'retrying' : null,
      transcript_attempt_count: null,
      transcript_retry_after_seconds: transcriptUnavailableRows.length > 0
        ? Math.max(...transcriptUnavailableRows.map((row) => row.retry_after_seconds))
        : 0,
      no_transcript_count: permanentNoTranscriptRows.length,
      no_transcript: permanentNoTranscriptRows,
    },
  });
}

app.post(
  '/api/source-pages/:platform/:externalId/videos/unlock',
  sourceVideoUnlockBurstLimiter,
  sourceVideoUnlockSustainedLimiter,
  handleSourcePageVideosUnlock,
);
app.post(
  '/api/source-pages/:platform/:externalId/videos/generate',
  sourceVideoUnlockBurstLimiter,
  sourceVideoUnlockSustainedLimiter,
  handleSourcePageVideosUnlock,
);

app.get('/api/source-pages/:platform/:externalId/blueprints', async (req, res) => {
  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: null,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'externalId required',
      data: null,
    });
  }

  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let sourcePage;
  try {
    sourcePage = await getSourcePageByPlatformExternalId(db, { platform, externalId });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not fetch source page.',
      data: null,
    });
  }
  if (!sourcePage) {
    return res.status(404).json({
      ok: false,
      error_code: 'SOURCE_PAGE_NOT_FOUND',
      message: 'Source page not found.',
      data: null,
    });
  }

  const limit = clampInt(req.query.limit, 12, 1, 24);
  const rawCursor = String(req.query.cursor || '').trim();
  const decodedCursor = rawCursor ? decodeSourcePageBlueprintCursor(rawCursor) : null;
  if (rawCursor && !decodedCursor) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_CURSOR',
      message: 'Invalid cursor.',
      data: null,
    });
  }

  const scanBatch = Math.max(limit * 6, 48);
  const maxScanRows = 2000;
  const seenSourceItemIds = new Set<string>();
  const selectedRows: Array<{
    sourceItemId: string;
    blueprintId: string;
    createdAt: string;
    sourceUrl: string;
    sourceThumbnailUrl: string | null;
  }> = [];

  let scanRows = 0;
  let cursor = decodedCursor;
  let exhausted = false;
  let reachedLimit = false;
  let lastAcceptedCursor: SourcePageBlueprintCursor | null = null;
  let lastScannedCursor: SourcePageBlueprintCursor | null = null;

  while (!reachedLimit && !exhausted && scanRows < maxScanRows) {
    let feedQuery = db
      .from('user_feed_items')
      .select('id, source_item_id, blueprint_id, created_at')
      .eq('state', 'channel_published')
      .not('blueprint_id', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(scanBatch);

    const cursorFilter = cursor ? buildSourcePageCursorFilter(cursor) : null;
    if (cursorFilter) feedQuery = feedQuery.or(cursorFilter);

    const { data: feedRowsData, error: feedRowsError } = await feedQuery;
    if (feedRowsError) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: feedRowsError.message,
        data: null,
      });
    }

    const feedRows = (feedRowsData || []) as SourcePageFeedScanRow[];
    if (!feedRows.length) {
      exhausted = true;
      break;
    }

    scanRows += feedRows.length;
    const lastFeedRow = feedRows[feedRows.length - 1];
    const normalizedLastFeedCursor = normalizeSourcePageBlueprintCursor({
      createdAt: lastFeedRow.created_at,
      feedItemId: lastFeedRow.id,
    });
    if (normalizedLastFeedCursor) {
      lastScannedCursor = normalizedLastFeedCursor;
      cursor = normalizedLastFeedCursor;
    }

    const sourceItemIds = Array.from(new Set(feedRows.map((row) => String(row.source_item_id || '').trim()).filter(Boolean)));
    const chunkBlueprintIds = Array.from(new Set(feedRows.map((row) => String(row.blueprint_id || '').trim()).filter(Boolean)));
    if (!sourceItemIds.length || !chunkBlueprintIds.length) {
      if (feedRows.length < scanBatch) exhausted = true;
      continue;
    }

    const [{ data: sourceRowsData, error: sourceRowsError }, { data: blueprintVisibilityData, error: blueprintVisibilityError }] = await Promise.all([
      db
        .from('source_items')
        .select('id, source_page_id, source_channel_id, source_url, thumbnail_url')
        .in('id', sourceItemIds),
      db
        .from('blueprints')
        .select('id, is_public')
        .in('id', chunkBlueprintIds),
    ]);

    if (sourceRowsError || blueprintVisibilityError) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: sourceRowsError?.message || blueprintVisibilityError?.message || 'Could not load source-page feed rows.',
        data: null,
      });
    }

    const sourceMap = new Map((sourceRowsData || []).map((row) => [row.id, row as SourcePageFeedSourceRow]));
    const publicBlueprintIds = new Set(
      (blueprintVisibilityData || [])
        .filter((row) => Boolean(row.is_public))
        .map((row) => String(row.id || '').trim())
        .filter(Boolean),
    );

    for (const row of feedRows) {
      const sourceItemId = String(row.source_item_id || '').trim();
      const blueprintId = String(row.blueprint_id || '').trim();
      if (!sourceItemId || !blueprintId) continue;
      if (!publicBlueprintIds.has(blueprintId)) continue;

      const source = sourceMap.get(sourceItemId);
      if (!source) continue;

      const sourcePageId = String(source.source_page_id || '').trim() || null;
      const sourceChannelId = String(source.source_channel_id || '').trim() || null;
      const matchesLinkedSource = sourcePageId === sourcePage.id;
      const matchesLegacyYoutubeFallback =
        platform === 'youtube'
        && !sourcePageId
        && sourceChannelId === sourcePage.external_id;
      if (!matchesLinkedSource && !matchesLegacyYoutubeFallback) continue;

      if (seenSourceItemIds.has(sourceItemId)) continue;
      seenSourceItemIds.add(sourceItemId);

      const normalizedAcceptedCursor = normalizeSourcePageBlueprintCursor({
        createdAt: row.created_at,
        feedItemId: row.id,
      });
      if (normalizedAcceptedCursor) lastAcceptedCursor = normalizedAcceptedCursor;

      selectedRows.push({
        sourceItemId,
        blueprintId,
        createdAt: normalizedAcceptedCursor?.createdAt || row.created_at,
        sourceUrl: String(source.source_url || '').trim(),
        sourceThumbnailUrl: String(source.thumbnail_url || '').trim() || null,
      });

      if (selectedRows.length >= limit) {
        reachedLimit = true;
        break;
      }
    }

    if (feedRows.length < scanBatch) exhausted = true;
  }

  if (!selectedRows.length) {
    return res.json({
      ok: true,
      error_code: null,
      message: 'source page blueprints',
      data: {
        items: [],
        next_cursor: null,
      },
    });
  }

  const blueprintIds = Array.from(new Set(selectedRows.map((row) => row.blueprintId)));
  const [{ data: blueprintRowsData, error: blueprintRowsError }, { data: tagRowsData, error: tagRowsError }] = await Promise.all([
    db
      .from('blueprints')
      .select('id, title, llm_review, banner_url, selected_items, is_public')
      .in('id', blueprintIds),
    db
      .from('blueprint_tags')
      .select('blueprint_id, tag_id')
      .in('blueprint_id', blueprintIds),
  ]);

  if (blueprintRowsError || tagRowsError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: blueprintRowsError?.message || tagRowsError?.message || 'Could not load source-page blueprints.',
      data: null,
    });
  }

  const tagIds = Array.from(new Set((tagRowsData || []).map((row) => String(row.tag_id || '').trim()).filter(Boolean)));
  const { data: tagDefsData, error: tagDefsError } = tagIds.length
    ? await db
      .from('tags')
      .select('id, slug')
      .in('id', tagIds)
    : { data: [], error: null };
  if (tagDefsError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: tagDefsError.message,
      data: null,
    });
  }

  const { data: allPublishedFeedRows, error: allPublishedFeedRowsError } = await db
    .from('user_feed_items')
    .select('id, blueprint_id')
    .eq('state', 'channel_published')
    .in('blueprint_id', blueprintIds);
  if (allPublishedFeedRowsError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: allPublishedFeedRowsError.message,
      data: null,
    });
  }

  const publishedFeedItemIds = Array.from(new Set((allPublishedFeedRows || []).map((row) => String(row.id || '').trim()).filter(Boolean)));
  const blueprintIdByFeedItemId = new Map(
    (allPublishedFeedRows || []).map((row) => [String(row.id || '').trim(), String(row.blueprint_id || '').trim()]),
  );

  const { data: candidateRowsData, error: candidateRowsError } = publishedFeedItemIds.length
    ? await db
      .from('channel_candidates')
      .select('user_feed_item_id, channel_slug, created_at')
      .eq('status', 'published')
      .in('user_feed_item_id', publishedFeedItemIds)
      .order('created_at', { ascending: false })
    : { data: [], error: null };
  if (candidateRowsError) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: candidateRowsError.message,
      data: null,
    });
  }

  const publicBlueprintMap = new Map(
    (blueprintRowsData || [])
      .filter((row) => Boolean(row.is_public))
      .map((row) => [String(row.id || '').trim(), row]),
  );
  const tagDefMap = new Map((tagDefsData || []).map((row) => [String(row.id || '').trim(), String(row.slug || '').trim()]));
  const tagsByBlueprint = new Map<string, Array<{ id: string; slug: string }>>();
  for (const row of tagRowsData || []) {
    const blueprintId = String(row.blueprint_id || '').trim();
    const tagId = String(row.tag_id || '').trim();
    const tagSlug = tagDefMap.get(tagId);
    if (!blueprintId || !tagId || !tagSlug) continue;
    const list = tagsByBlueprint.get(blueprintId) || [];
    list.push({ id: tagId, slug: tagSlug });
    tagsByBlueprint.set(blueprintId, list);
  }

  const publishedChannelByBlueprint = new Map<string, { slug: string; createdAtMs: number }>();
  for (const row of candidateRowsData || []) {
    const feedItemId = String(row.user_feed_item_id || '').trim();
    const blueprintId = blueprintIdByFeedItemId.get(feedItemId);
    const channelSlug = String(row.channel_slug || '').trim().toLowerCase();
    if (!blueprintId || !channelSlug) continue;
    const createdAtMs = Date.parse(String(row.created_at || ''));
    const safeCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : 0;
    const existing = publishedChannelByBlueprint.get(blueprintId);
    if (!existing || safeCreatedAtMs > existing.createdAtMs || (safeCreatedAtMs === existing.createdAtMs && channelSlug < existing.slug)) {
      publishedChannelByBlueprint.set(blueprintId, {
        slug: channelSlug,
        createdAtMs: safeCreatedAtMs,
      });
    }
  }

  const items = selectedRows
    .map((row) => {
      const blueprint = publicBlueprintMap.get(row.blueprintId);
      if (!blueprint) return null;
      return {
        source_item_id: row.sourceItemId,
        blueprint_id: row.blueprintId,
        title: String(blueprint.title || '').trim() || 'Untitled blueprint',
        summary: buildSourcePageSummary({
          llmReview: blueprint.llm_review || null,
          selectedItems: blueprint.selected_items ?? null,
          fallbackTitle: String(blueprint.title || ''),
        }),
        banner_url: blueprint.banner_url || null,
        created_at: row.createdAt,
        published_channel_slug: publishedChannelByBlueprint.get(row.blueprintId)?.slug || null,
        tags: tagsByBlueprint.get(row.blueprintId) || [],
        source_url: row.sourceUrl || '',
        source_thumbnail_url: row.sourceThumbnailUrl,
      };
    })
    .filter(Boolean);

  let nextCursor: string | null = null;
  if (reachedLimit && lastAcceptedCursor) {
    nextCursor = encodeSourcePageBlueprintCursor(lastAcceptedCursor);
  } else if (!exhausted && lastScannedCursor) {
    nextCursor = encodeSourcePageBlueprintCursor(lastScannedCursor);
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page blueprints',
    data: {
      items,
      next_cursor: nextCursor,
    },
  });
});

app.post('/api/source-pages/:platform/:externalId/subscribe', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: null,
    });
  }
  if (platform !== 'youtube') {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Only YouTube source pages are supported in this version.',
      data: null,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'externalId required', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let resolved;
  try {
    resolved = await resolveYouTubeChannel(externalId);
  } catch {
    return res.status(400).json({ ok: false, error_code: 'INVALID_CHANNEL', message: 'Could not resolve YouTube channel', data: null });
  }

  let channelAvatarUrl: string | null = null;
  let channelBannerUrl: string | null = null;
  if (youtubeDataApiKey) {
    try {
      const assetMap = await fetchYouTubeChannelAssetMap({
        apiKey: youtubeDataApiKey,
        channelIds: [resolved.channelId],
      });
      const assets = assetMap.get(resolved.channelId);
      channelAvatarUrl = assets?.avatarUrl || null;
      channelBannerUrl = assets?.bannerUrl || null;
    } catch (assetError) {
      console.log('[source_page_assets_lookup_failed]', JSON.stringify({
        source_channel_id: resolved.channelId,
        error: assetError instanceof Error ? assetError.message : String(assetError),
      }));
    }
  }

  let sourcePage;
  try {
    sourcePage = await ensureSourcePageFromYouTubeChannel(sourcePageDb, {
      channelId: resolved.channelId,
      channelUrl: resolved.channelUrl,
      title: resolved.channelTitle,
      avatarUrl: channelAvatarUrl,
      bannerUrl: channelBannerUrl,
    });
  } catch (sourcePageError) {
    return res.status(500).json({
      ok: false,
      error_code: 'SOURCE_PAGE_SUBSCRIBE_FAILED',
      message: sourcePageError instanceof Error ? sourcePageError.message : 'Could not prepare source page.',
      data: null,
    });
  }

  const { data: existingSub } = await db
    .from('user_source_subscriptions')
    .select('id, is_active, auto_unlock_enabled')
    .eq('user_id', userId)
    .eq('source_type', 'youtube')
    .eq('source_channel_id', resolved.channelId)
    .maybeSingle();
  const isCreateOrReactivate = !existingSub || !existingSub.is_active;

  const { data: upserted, error: upsertError } = await db
    .from('user_source_subscriptions')
    .upsert(
      {
        user_id: userId,
        source_type: 'youtube',
        source_channel_id: resolved.channelId,
        source_channel_url: resolved.channelUrl,
        source_channel_title: resolved.channelTitle,
        source_page_id: sourcePage.id,
        mode: 'auto',
        auto_unlock_enabled: existingSub?.auto_unlock_enabled ?? true,
        is_active: true,
        last_sync_error: null,
      },
      { onConflict: 'user_id,source_type,source_channel_id' },
    )
    .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
    .single();
  if (upsertError) {
    return res.status(400).json({ ok: false, error_code: 'SOURCE_PAGE_SUBSCRIBE_FAILED', message: upsertError.message, data: null });
  }

  let sync: SyncSubscriptionResult | null = null;
  try {
    sync = await syncSingleSubscription(db, upserted, { trigger: 'subscription_create' });
  } catch (error) {
    await markSubscriptionSyncError(db, upserted.id, error);
  }

  if (isCreateOrReactivate) {
    try {
      const noticeSource = await upsertSubscriptionNoticeSourceItem(db, {
        channelId: resolved.channelId,
        channelTitle: resolved.channelTitle,
        channelUrl: resolved.channelUrl,
        channelAvatarUrl,
        channelBannerUrl,
      });
      await insertFeedItem(db, {
        userId,
        sourceItemId: noticeSource.id,
        blueprintId: null,
        state: 'subscription_notice',
      });
    } catch (noticeError) {
      console.log('[subscription_notice_insert_failed]', JSON.stringify({
        user_id: userId,
        source_channel_id: resolved.channelId,
        error: noticeError instanceof Error ? noticeError.message : String(noticeError),
      }));
    }
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page subscribed',
    data: {
      source_page: {
        ...sourcePage,
        path: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
      },
      subscription: {
        ...upserted,
        source_page_path: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
      },
      sync,
    },
  });
});

app.delete('/api/source-pages/:platform/:externalId/subscribe', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const platform = normalizeSourcePagePlatform(req.params.platform || '');
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Unsupported source page platform.',
      data: null,
    });
  }
  if (platform !== 'youtube') {
    return res.status(400).json({
      ok: false,
      error_code: 'SOURCE_PAGE_PLATFORM_UNSUPPORTED',
      message: 'Only YouTube source pages are supported in this version.',
      data: null,
    });
  }

  const externalId = String(req.params.externalId || '').trim();
  if (!externalId) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'externalId required', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const sourcePageDb = getServiceSupabaseClient();
  if (!sourcePageDb) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  let sourcePage;
  try {
    sourcePage = await getSourcePageByPlatformExternalId(sourcePageDb, { platform, externalId });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error_code: 'READ_FAILED',
      message: error instanceof Error ? error.message : 'Could not read source page.',
      data: null,
    });
  }
  if (!sourcePage) {
    return res.status(404).json({
      ok: false,
      error_code: 'SOURCE_PAGE_NOT_FOUND',
      message: 'Source page not found.',
      data: null,
    });
  }

  const { data, error } = await db
    .from('user_source_subscriptions')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('source_type', 'youtube')
    .eq('source_channel_id', sourcePage.external_id)
    .select('id, source_channel_id')
    .maybeSingle();
  if (error) return res.status(400).json({ ok: false, error_code: 'SOURCE_PAGE_UNSUBSCRIBE_FAILED', message: error.message, data: null });
  if (!data) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });

  await cleanupSubscriptionNoticeForChannel(db, {
    userId,
    subscriptionId: data.id,
    channelId: data.source_channel_id,
  });

  return res.json({
    ok: true,
    error_code: null,
    message: 'source page unsubscribed',
    data: {
      source_page: {
        ...sourcePage,
        path: buildSourcePagePath(sourcePage.platform, sourcePage.external_id),
      },
      subscription: data,
    },
  });
});

app.get('/api/source-subscriptions', async (_req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data, error } = await db
    .from('user_source_subscriptions')
    .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error.message, data: null });

  const rows = Array.isArray(data) ? data : [];
  let assetMap = new Map<string, { avatarUrl: string | null; bannerUrl: string | null }>();
  try {
    assetMap = await fetchYouTubeChannelAssetMap({
      apiKey: youtubeDataApiKey,
      channelIds: rows.map((row) => String(row.source_channel_id || '')),
    });
  } catch (avatarError) {
    console.log('[subscription_avatars_lookup_failed]', JSON.stringify({
      user_id: userId,
      error: avatarError instanceof Error ? avatarError.message : String(avatarError),
    }));
  }
  const withAvatars = rows.map((row) => {
    const sourceChannelId = String(row.source_channel_id || '').trim();
    return {
      ...row,
      source_channel_avatar_url: assetMap.get(sourceChannelId)?.avatarUrl || null,
      source_page_path: sourceChannelId ? buildSourcePagePath('youtube', sourceChannelId) : null,
    };
  });

  return res.json({
    ok: true,
    error_code: null,
    message: 'subscriptions fetched',
    data: withAvatars,
  });
});

app.post('/api/source-subscriptions/refresh-scan', refreshScanLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const parsed = RefreshSubscriptionsScanSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid scan request', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  try {
    const scanned = await collectRefreshCandidatesForUser(db, userId, {
      maxPerSubscription: parsed.data.max_per_subscription,
      maxTotal: parsed.data.max_total,
    });
    console.log('[subscription_refresh_scan_done]', JSON.stringify({
      user_id: userId,
      subscriptions_total: scanned.subscriptionsTotal,
      candidates_total: scanned.candidates.length,
      scan_errors: scanned.scanErrors.length,
      cooldown_filtered: scanned.cooldownFiltered,
    }));
    return res.json({
      ok: true,
      error_code: null,
      message: 'refresh scan complete',
      data: {
        subscriptions_total: scanned.subscriptionsTotal,
        candidates_total: scanned.candidates.length,
        candidates: scanned.candidates,
        scan_errors: scanned.scanErrors,
        cooldown_filtered: scanned.cooldownFiltered,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ ok: false, error_code: 'SCAN_FAILED', message, data: null });
  }
});

app.post('/api/source-subscriptions/refresh-generate', refreshGenerateLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const parsed = RefreshSubscriptionsGenerateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid generate request', data: null });
  }
  if (parsed.data.items.length > refreshGenerateMaxItems) {
    return res.status(400).json({
      ok: false,
      error_code: 'MAX_ITEMS_EXCEEDED',
      message: `Select up to ${refreshGenerateMaxItems} videos per generation run.`,
      data: null,
    });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });
  const serviceDb = getServiceSupabaseClient();
  if (!serviceDb) {
    return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });
  }

  const recoveredJobs = await recoverStaleIngestionJobs(db, {
    scope: 'manual_refresh_selection',
    requestedByUserId: userId,
  });
  if (recoveredJobs.length > 0) {
    console.log('[ingestion_stale_recovered]', JSON.stringify({
      scope: 'manual_refresh_selection',
      user_id: userId,
      recovered_count: recoveredJobs.length,
      recovered_job_ids: recoveredJobs.map((row) => row.id),
    }));
  }

  const activeManualJob = await getActiveManualRefreshJob(db, userId);
  if (activeManualJob?.id) {
    return res.status(409).json({
      ok: false,
      error_code: 'JOB_ALREADY_RUNNING',
      message: 'Background generation is already running for this account.',
      data: {
        job_id: activeManualJob.id,
      },
    });
  }

  const subscriptionIds = Array.from(new Set(parsed.data.items.map((item) => item.subscription_id)));
  const { data: subscriptions, error: subscriptionsError } = await db
    .from('user_source_subscriptions')
    .select('id, source_channel_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('id', subscriptionIds);
  if (subscriptionsError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: subscriptionsError.message, data: null });
  }

  const activeById = new Map((subscriptions || []).map((row) => [row.id, row]));
  const allowedItems = parsed.data.items.filter((item) => {
    const sub = activeById.get(item.subscription_id);
    if (!sub) return false;
    return String(sub.source_channel_id || '').trim() === String(item.source_channel_id || '').trim();
  });

  const dedupedMap = new Map<string, RefreshScanCandidate>();
  for (const item of allowedItems) {
    dedupedMap.set(`${item.subscription_id}:${item.video_id}`, {
      subscription_id: item.subscription_id,
      source_channel_id: item.source_channel_id,
      source_channel_title: item.source_channel_title || null,
      source_channel_url: item.source_channel_url || null,
      video_id: item.video_id,
      video_url: item.video_url,
      title: item.title,
      published_at: item.published_at || null,
      thumbnail_url: item.thumbnail_url || null,
    });
  }
  const dedupedItems = Array.from(dedupedMap.values());

  if (dedupedItems.length === 0) {
    return res.status(400).json({
      ok: false,
      error_code: 'NO_ELIGIBLE_ITEMS',
      message: 'No eligible videos found for active subscriptions',
      data: null,
    });
  }

  const queueDepth = await countQueueDepth(serviceDb, { includeRunning: true });
  const userQueueDepth = await countQueueDepth(serviceDb, { userId, includeRunning: true });
  if (queueDepth >= queueDepthHardLimit || userQueueDepth >= queueDepthPerUserLimit) {
    return res.status(429).json({
      ok: false,
      error_code: 'QUEUE_BACKPRESSURE',
      message: 'Generation queue is busy. Please retry shortly.',
      retry_after_seconds: 30,
      data: {
        queue_depth: queueDepth,
        user_queue_depth: userQueueDepth,
      },
    });
  }

  const { data: job, error: jobCreateError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: 'user_sync',
      scope: 'manual_refresh_selection',
      status: 'queued',
      requested_by_user_id: userId,
      payload: {
        user_id: userId,
        items: dedupedItems,
      },
      next_run_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobCreateError) {
    return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: jobCreateError.message, data: null });
  }
  scheduleQueuedIngestionProcessing();

  return res.status(202).json({
    ok: true,
    error_code: null,
    message: 'background generation started',
    data: {
      job_id: job.id,
      queue_depth: queueDepth + 1,
      queued_count: dedupedItems.length,
    },
  });
});

app.patch('/api/source-subscriptions/:id', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const modeRaw = req.body?.mode;
  const isActiveRaw = req.body?.is_active;
  const autoUnlockEnabledRaw = req.body?.auto_unlock_enabled;
  const updates: Record<string, unknown> = {};
  if (typeof modeRaw === 'string') {
    const mode = modeRaw.trim().toLowerCase();
    if (mode !== 'manual' && mode !== 'auto') {
      return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'Invalid mode', data: null });
    }
    // MVP simplification: mode is accepted for compatibility but coerced to auto.
    updates.mode = 'auto';
  }
  if (typeof isActiveRaw === 'boolean') {
    updates.is_active = isActiveRaw;
  }
  if (typeof autoUnlockEnabledRaw === 'boolean') {
    updates.auto_unlock_enabled = autoUnlockEnabledRaw;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'No valid fields to update', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data, error } = await db
    .from('user_source_subscriptions')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select('id, user_id, source_type, source_channel_id, source_channel_url, source_channel_title, source_page_id, mode, auto_unlock_enabled, is_active, last_polled_at, last_seen_published_at, last_seen_video_id, last_sync_error, created_at, updated_at')
    .maybeSingle();
  if (error) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error.message, data: null });
  if (!data) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });

  return res.json({
    ok: true,
    error_code: null,
    message: 'subscription updated',
    data,
  });
});

app.delete('/api/source-subscriptions/:id', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data, error } = await db
    .from('user_source_subscriptions')
    .update({ is_active: false })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select('id, source_channel_id, source_page_id')
    .maybeSingle();
  if (error) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error.message, data: null });
  if (!data) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });

  await cleanupSubscriptionNoticeForChannel(db, {
    userId,
    subscriptionId: data.id,
    channelId: data.source_channel_id,
  });

  return res.json({
    ok: true,
    error_code: null,
    message: 'subscription deactivated',
    data,
  });
});

app.post('/api/source-subscriptions/:id/sync', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data: subscription, error: subscriptionError } = await db
    .from('user_source_subscriptions')
    .select('id, user_id, mode, source_channel_id, source_page_id, last_seen_published_at, last_seen_video_id, is_active')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (subscriptionError) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: subscriptionError.message, data: null });
  if (!subscription) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });
  if (!subscription.is_active) return res.status(400).json({ ok: false, error_code: 'INACTIVE_SUBSCRIPTION', message: 'Subscription is inactive', data: null });

  const { data: job, error: jobCreateError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: 'user_sync',
      scope: 'subscription',
      status: 'running',
      requested_by_user_id: userId,
      subscription_id: subscription.id,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobCreateError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: jobCreateError.message, data: null });

  try {
    const sync = await syncSingleSubscription(db, subscription, { trigger: 'user_sync' });
    await db.from('ingestion_jobs').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      processed_count: sync.processed,
      inserted_count: sync.inserted,
      skipped_count: sync.skipped,
      error_code: null,
      error_message: null,
    }).eq('id', job.id);

    return res.json({
      ok: true,
      error_code: null,
      message: 'subscription sync complete',
      data: {
        job_id: job.id,
        ...sync,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markSubscriptionSyncError(db, subscription.id, error);
    await db.from('ingestion_jobs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_code: 'SYNC_FAILED',
      error_message: message.slice(0, 500),
    }).eq('id', job.id);
    return res.status(500).json({ ok: false, error_code: 'SYNC_FAILED', message, data: { job_id: job.id } });
  }
});

app.get('/api/ingestion/jobs/:id([0-9a-fA-F-]{36})', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data, error } = await db
    .from('ingestion_jobs')
    .select('id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id, created_at, updated_at')
    .eq('id', req.params.id)
    .eq('requested_by_user_id', userId)
    .maybeSingle();

  if (error) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error.message, data: null });
  }
  if (!data) {
    return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Ingestion job not found', data: null });
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'ingestion job fetched',
    data: {
      job_id: data.id,
      trigger: data.trigger,
      scope: data.scope,
      status: data.status,
      started_at: data.started_at,
      finished_at: data.finished_at,
      processed_count: data.processed_count,
      inserted_count: data.inserted_count,
      skipped_count: data.skipped_count,
      error_code: data.error_code,
      error_message: data.error_message,
      attempts: data.attempts,
      max_attempts: data.max_attempts,
      next_run_at: data.next_run_at,
      lease_expires_at: data.lease_expires_at,
      trace_id: data.trace_id || null,
      created_at: data.created_at,
      updated_at: data.updated_at,
    },
  });
});

app.get('/api/ingestion/jobs/latest-mine', ingestionLatestMineLimiter, async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const scopeRaw = String(req.query.scope || '').trim();
  const scope = scopeRaw || 'manual_refresh_selection';
  const selectColumns = 'id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id, created_at, updated_at';

  const { data: activeData, error: activeError } = await db
    .from('ingestion_jobs')
    .select(selectColumns)
    .eq('requested_by_user_id', userId)
    .eq('scope', scope)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: activeError.message, data: null });
  }

  let data = activeData;
  if (!data) {
    const { data: latestData, error: latestError } = await db
      .from('ingestion_jobs')
      .select(selectColumns)
      .eq('requested_by_user_id', userId)
      .eq('scope', scope)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: latestError.message, data: null });
    }
    data = latestData;
  }

  return res.json({
    ok: true,
    error_code: null,
    message: data ? 'latest user ingestion job fetched' : 'no ingestion jobs found',
    data: data
      ? {
          job_id: data.id,
          trigger: data.trigger,
          scope: data.scope,
          status: data.status,
          started_at: data.started_at,
          finished_at: data.finished_at,
          processed_count: data.processed_count,
          inserted_count: data.inserted_count,
          skipped_count: data.skipped_count,
          error_code: data.error_code,
          error_message: data.error_message,
          attempts: data.attempts,
          max_attempts: data.max_attempts,
          next_run_at: data.next_run_at,
          lease_expires_at: data.lease_expires_at,
          trace_id: data.trace_id || null,
          created_at: data.created_at,
          updated_at: data.updated_at,
        }
      : null,
  });
});

app.post('/api/ingestion/jobs/trigger', async (req, res) => {
  if (!isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const recoveredJobs = await recoverStaleIngestionJobs(db, {
    scope: 'all_active_subscriptions',
  });
  if (recoveredJobs.length > 0) {
    console.log('[ingestion_stale_recovered]', JSON.stringify({
      scope: 'all_active_subscriptions',
      recovered_count: recoveredJobs.length,
      recovered_job_ids: recoveredJobs.map((row) => row.id),
    }));
  }
  await runUnlockSweeps(db, { mode: 'cron', force: true });
  await runSourcePageAssetSweep(db, { mode: 'cron' });
  try {
    const seeded = await seedSourceTranscriptRevalidateJobs(db, 50);
    if (seeded.enqueued > 0) {
      console.log('[transcript_revalidate_seeded]', JSON.stringify({
        scanned: seeded.scanned,
        enqueued: seeded.enqueued,
      }));
    }
  } catch (seedError) {
    console.log('[transcript_revalidate_seed_failed]', JSON.stringify({
      error: seedError instanceof Error ? seedError.message : String(seedError),
    }));
  }

  const { data: existingJob, error: runningJobError } = await db
    .from('ingestion_jobs')
    .select('id, status, started_at')
    .eq('scope', 'all_active_subscriptions')
    .in('status', ['queued', 'running'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runningJobError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: runningJobError.message, data: null });
  }
  if (existingJob?.id) {
    return res.status(409).json({
      ok: false,
      error_code: 'JOB_ALREADY_RUNNING',
      message: 'A subscription ingestion job is already queued or running.',
      data: { job_id: existingJob.id, status: existingJob.status },
    });
  }

  const queueDepth = await countQueueDepth(db, { includeRunning: true });
  if (queueDepth >= queueDepthHardLimit) {
    return res.status(429).json({
      ok: false,
      error_code: 'QUEUE_BACKPRESSURE',
      message: 'Queue is busy. Retry shortly.',
      retry_after_seconds: 30,
      data: {
        queue_depth: queueDepth,
      },
    });
  }

  const traceId = createUnlockTraceId();
  const { data: job, error: jobCreateError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: 'service_cron',
      scope: 'all_active_subscriptions',
      status: 'queued',
      trace_id: traceId,
      payload: {
        trace_id: traceId,
      },
      next_run_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobCreateError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: jobCreateError.message, data: null });

  scheduleQueuedIngestionProcessing();
  return res.status(202).json({
    ok: true,
    error_code: null,
    message: 'ingestion job queued',
    data: {
      job_id: job.id,
      queue_depth: queueDepth + 1,
      trace_id: traceId,
    },
  });
});

app.get('/api/ingestion/jobs/latest', async (req, res) => {
  if (!isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const { data, error } = await db
    .from('ingestion_jobs')
    .select('id, trigger, scope, status, started_at, finished_at, processed_count, inserted_count, skipped_count, error_code, error_message, attempts, max_attempts, next_run_at, lease_expires_at, trace_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error.message, data: null });
  }

  return res.json({
    ok: true,
    error_code: null,
    message: data ? 'latest ingestion job fetched' : 'no ingestion jobs found',
    data: data
      ? {
          job_id: data.id,
          trigger: data.trigger,
          scope: data.scope,
          status: data.status,
          started_at: data.started_at,
          finished_at: data.finished_at,
          processed_count: data.processed_count,
          inserted_count: data.inserted_count,
          skipped_count: data.skipped_count,
          error_code: data.error_code,
          error_message: data.error_message,
          attempts: data.attempts,
          max_attempts: data.max_attempts,
          next_run_at: data.next_run_at,
          lease_expires_at: data.lease_expires_at,
          trace_id: data.trace_id || null,
        }
      : null,
  });
});

app.get('/api/ops/queue/health', async (req, res) => {
  if (!isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const nowIso = new Date().toISOString();
  const [queuedDepth, runningDepth] = await Promise.all([
    countQueueDepth(db, { includeRunning: false }),
    countQueueDepth(db, { includeRunning: true }),
  ]);

  const { count: staleLeaseCount, error: staleLeaseError } = await db
    .from('ingestion_jobs')
    .select('id', { head: true, count: 'exact' })
    .eq('status', 'running')
    .not('lease_expires_at', 'is', null)
    .lt('lease_expires_at', nowIso);
  if (staleLeaseError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: staleLeaseError.message, data: null });
  }

  const { data: byScopeRows, error: byScopeError } = await db
    .from('ingestion_jobs')
    .select('scope, status')
    .in('status', ['queued', 'running'])
    .in('scope', [...QUEUED_INGESTION_SCOPES]);
  if (byScopeError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: byScopeError.message, data: null });
  }
  const byScope: Record<string, { queued: number; running: number }> = {};
  for (const scope of QUEUED_INGESTION_SCOPES) {
    byScope[scope] = { queued: 0, running: 0 };
  }
  for (const row of byScopeRows || []) {
    const scope = String((row as { scope?: string }).scope || '').trim();
    const status = String((row as { status?: string }).status || '').trim();
    if (!isQueuedIngestionScope(scope)) continue;
    if (status === 'queued') byScope[scope].queued += 1;
    if (status === 'running') byScope[scope].running += 1;
  }

  const providerKeys = [
    'transcript',
    'llm_generate_blueprint',
    'llm_quality_judge',
    'llm_safety_judge',
    'llm_review',
    'llm_banner',
  ];
  const providerCircuitState: Record<string, unknown> = {};
  for (const providerKey of providerKeys) {
    providerCircuitState[providerKey] = await getProviderCircuitSnapshot(db, providerKey);
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'queue health',
    data: {
      worker_id: queuedWorkerId,
      worker_running: queuedWorkerRunning,
      queue_depth: queuedDepth,
      running_depth: Math.max(0, runningDepth - queuedDepth),
      stale_leases: Number(staleLeaseCount || 0),
      limits: {
        queue_depth_hard_limit: queueDepthHardLimit,
        queue_depth_per_user_limit: queueDepthPerUserLimit,
        worker_concurrency: workerConcurrency,
        worker_batch_size: workerBatchSize,
        worker_lease_ms: workerLeaseMs,
        worker_heartbeat_ms: workerHeartbeatMs,
        job_execution_timeout_ms: jobExecutionTimeoutMs,
      },
      by_scope: byScope,
      provider_circuit_state: providerCircuitState,
    },
  });
});

app.post('/api/source-pages/assets/sweep', async (req, res) => {
  if (!isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const forceRaw = String((req.body as { force?: unknown } | undefined)?.force ?? '').trim().toLowerCase();
  const force = forceRaw === 'true' || forceRaw === '1' || forceRaw === 'on';
  const traceId = createUnlockTraceId();
  const summary = await runSourcePageAssetSweep(db, { mode: 'manual', force, traceId });

  return res.json({
    ok: true,
    error_code: null,
    message: summary ? 'source page asset sweep complete' : 'source page asset sweep skipped',
    data: {
      trace_id: traceId,
      summary,
    },
  });
});

app.post('/api/auto-banner/jobs/trigger', async (req, res) => {
  if (!isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  if (autoBannerMode === 'off') {
    return res.status(409).json({ ok: false, error_code: 'AUTO_BANNER_DISABLED', message: 'Auto banner mode is disabled', data: null });
  }

  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  try {
    const workerRuns = Math.max(1, autoBannerConcurrency);
    const batchPerRun = Math.max(1, Math.ceil(autoBannerBatchSize / workerRuns));
    const runResults: Array<{
      claimed: number;
      succeeded: number;
      failed: number;
      dead: number;
      errors: Array<{ job_id: string; error: string }>;
      rebalance: {
        eligible: number;
        kept: number;
        demoted: number;
        restoredToGenerated: number;
        demotedToDefault: number;
        demotedToNone: number;
      };
    }> = [];

    for (let index = 0; index < workerRuns; index += 1) {
      const run = await processAutoBannerQueue(db, { maxJobs: batchPerRun });
      runResults.push(run);
    }

    const totals = runResults.reduce((acc, run) => ({
      claimed: acc.claimed + run.claimed,
      succeeded: acc.succeeded + run.succeeded,
      failed: acc.failed + run.failed,
      dead: acc.dead + run.dead,
      errors: acc.errors.concat(run.errors),
    }), {
      claimed: 0,
      succeeded: 0,
      failed: 0,
      dead: 0,
      errors: [] as Array<{ job_id: string; error: string }>,
    });
    const rebalance = runResults[runResults.length - 1]?.rebalance || {
      eligible: 0,
      kept: 0,
      demoted: 0,
      restoredToGenerated: 0,
      demotedToDefault: 0,
      demotedToNone: 0,
    };

    return res.status(totals.failed || totals.dead ? 207 : 200).json({
      ok: true,
      error_code: totals.failed || totals.dead ? 'PARTIAL_FAILURE' : null,
      message: 'auto banner trigger complete',
      data: {
        mode: autoBannerMode,
        cap: autoBannerCap,
        batch_size: autoBannerBatchSize,
        concurrency: autoBannerConcurrency,
        ...totals,
        rebalance,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      ok: false,
      error_code: 'AUTO_BANNER_TRIGGER_FAILED',
      message,
      data: null,
    });
  }
});

app.get('/api/auto-banner/jobs/latest', async (req, res) => {
  if (!isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }
  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const { data: latest, error: latestError } = await db
    .from('auto_banner_jobs')
    .select('id, blueprint_id, status, attempts, max_attempts, available_at, last_error, started_at, finished_at, created_at, updated_at, source_item_id, subscription_id, run_id')
    .order('created_at', { ascending: false })
    .limit(20);
  if (latestError) {
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: latestError.message, data: null });
  }

  const summary = {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    dead: 0,
  };
  for (const row of latest || []) {
    if (row.status === 'queued') summary.queued += 1;
    else if (row.status === 'running') summary.running += 1;
    else if (row.status === 'succeeded') summary.succeeded += 1;
    else if (row.status === 'failed') summary.failed += 1;
    else if (row.status === 'dead') summary.dead += 1;
  }

  return res.json({
    ok: true,
    error_code: null,
    message: latest?.length ? 'latest auto banner jobs fetched' : 'no auto banner jobs found',
    data: {
      mode: autoBannerMode as AutoBannerMode,
      cap: autoBannerCap,
      max_attempts: autoBannerMaxAttempts,
      timeout_ms: autoBannerTimeoutMs,
      batch_size: autoBannerBatchSize,
      concurrency: autoBannerConcurrency,
      summary,
      jobs: latest || [],
    },
  });
});

app.post('/api/debug/subscriptions/:id/simulate-new-uploads', async (req, res) => {
  if (!debugEndpointsEnabled) {
    return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Not found', data: null });
  }
  if (!isServiceRequestAuthorized(req)) {
    return res.status(401).json({ ok: false, error_code: 'SERVICE_AUTH_REQUIRED', message: 'Missing or invalid service token', data: null });
  }

  const parsed = DebugSimulateSubscriptionRequestSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error_code: 'INVALID_INPUT',
      message: 'Invalid request payload',
      data: null,
    });
  }
  const rewindDays = parsed.data.rewind_days || 30;

  const db = getServiceSupabaseClient();
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Service role client not configured', data: null });

  const { data: subscription, error: subscriptionError } = await db
    .from('user_source_subscriptions')
    .select('id, user_id, mode, source_channel_id, source_page_id, last_seen_published_at, last_seen_video_id, is_active')
    .eq('id', req.params.id)
    .maybeSingle();

  if (subscriptionError) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: subscriptionError.message, data: null });
  if (!subscription) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Subscription not found', data: null });
  if (!subscription.is_active) return res.status(400).json({ ok: false, error_code: 'INACTIVE_SUBSCRIPTION', message: 'Subscription is inactive', data: null });

  const rewoundToIso = new Date(Date.now() - rewindDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: rewindError } = await db
    .from('user_source_subscriptions')
    .update({
      last_seen_published_at: rewoundToIso,
      last_seen_video_id: null,
      last_sync_error: null,
    })
    .eq('id', subscription.id);

  if (rewindError) {
    return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: rewindError.message, data: null });
  }

  const { data: job, error: jobCreateError } = await db
    .from('ingestion_jobs')
    .insert({
      trigger: 'debug_simulation',
      scope: 'subscription_debug',
      status: 'running',
      subscription_id: subscription.id,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (jobCreateError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: jobCreateError.message, data: null });

  try {
    const sync = await syncSingleSubscription(
      db,
      {
        ...subscription,
        last_seen_published_at: rewoundToIso,
        last_seen_video_id: null,
      },
      { trigger: 'debug_simulation' },
    );

    await db.from('ingestion_jobs').update({
      status: 'succeeded',
      finished_at: new Date().toISOString(),
      processed_count: sync.processed,
      inserted_count: sync.inserted,
      skipped_count: sync.skipped,
      error_code: null,
      error_message: null,
    }).eq('id', job.id);

    return res.json({
      ok: true,
      error_code: null,
      message: 'subscription debug simulation complete',
      data: {
        job_id: job.id,
        subscription_id: subscription.id,
        rewind_days: rewindDays,
        checkpoint_rewound_to: rewoundToIso,
        ...sync,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markSubscriptionSyncError(db, subscription.id, error);
    await db.from('ingestion_jobs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error_code: 'SYNC_FAILED',
      error_message: message.slice(0, 500),
    }).eq('id', job.id);
    return res.status(500).json({ ok: false, error_code: 'SYNC_FAILED', message, data: { job_id: job.id } });
  }
});

app.post('/api/my-feed/items/:id/accept', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const feedItemId = req.params.id;
  const { data: feedItem, error: readError } = await db
    .from('user_feed_items')
    .select('id, user_id, source_item_id, blueprint_id, state')
    .eq('id', feedItemId)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: readError.message, data: null });
  if (!feedItem) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Feed item not found', data: null });

  if (feedItem.blueprint_id && feedItem.state === 'my_feed_published') {
    return res.json({
      ok: true,
      error_code: null,
      message: 'item already accepted',
      data: {
        user_feed_item_id: feedItem.id,
        blueprint_id: feedItem.blueprint_id,
        state: feedItem.state,
      },
    });
  }

  if (!['my_feed_pending_accept', 'my_feed_skipped'].includes(feedItem.state)) {
    return res.status(409).json({
      ok: false,
      error_code: 'INVALID_STATE',
      message: `Cannot accept item in state ${feedItem.state}`,
      data: null,
    });
  }

  const { data: lockRow, error: lockError } = await db
    .from('user_feed_items')
    .update({ state: 'my_feed_generating', last_decision_code: null })
    .eq('id', feedItem.id)
    .eq('user_id', userId)
    .eq('state', feedItem.state)
    .select('id')
    .maybeSingle();
  if (lockError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: lockError.message, data: null });
  if (!lockRow) {
    return res.status(409).json({ ok: false, error_code: 'LOCK_FAILED', message: 'Item is being processed by another request', data: null });
  }

  const { data: sourceRow, error: sourceError } = await db
    .from('source_items')
    .select('id, source_url, source_native_id')
    .eq('id', feedItem.source_item_id)
    .maybeSingle();
  if (sourceError || !sourceRow) {
    await db.from('user_feed_items').update({ state: 'my_feed_pending_accept', last_decision_code: 'SOURCE_MISSING' }).eq('id', feedItem.id);
    return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: sourceError?.message || 'Source item missing', data: null });
  }

  try {
      const generated = await createBlueprintFromVideo(db, {
        userId,
        videoUrl: sourceRow.source_url,
        videoId: sourceRow.source_native_id,
        sourceTag: 'subscription_accept',
        sourceItemId: sourceRow.id,
      });

    await db.from('user_feed_items').update({
      blueprint_id: generated.blueprintId,
      state: 'my_feed_published',
      last_decision_code: null,
    }).eq('id', feedItem.id).eq('user_id', userId);

    let responseState: string = 'my_feed_published';
    let responseReasonCode: string | null = null;
    try {
      const autoResult = await runAutoChannelForFeedItem({
        db,
        userId,
        userFeedItemId: feedItem.id,
        blueprintId: generated.blueprintId,
        sourceItemId: sourceRow.id,
        sourceTag: 'subscription_accept',
      });
      if (autoResult) {
        responseState = autoResult.decision === 'published' ? 'channel_published' : 'channel_rejected';
        responseReasonCode = autoResult.reasonCode;
      }
    } catch (autoChannelError) {
      console.log('[auto_channel_pipeline_failed]', JSON.stringify({
        user_id: userId,
        user_feed_item_id: feedItem.id,
        blueprint_id: generated.blueprintId,
        source_item_id: sourceRow.id,
        source_tag: 'subscription_accept',
        error: autoChannelError instanceof Error ? autoChannelError.message : String(autoChannelError),
      }));
    }

    console.log('[my_feed_pending_accepted]', JSON.stringify({
      user_feed_item_id: feedItem.id,
      source_item_id: sourceRow.id,
      blueprint_id: generated.blueprintId,
      run_id: generated.runId,
    }));

    return res.json({
      ok: true,
      error_code: null,
      message: 'item accepted and generated',
      data: {
        user_feed_item_id: feedItem.id,
        blueprint_id: generated.blueprintId,
        state: responseState,
        reason_code: responseReasonCode,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from('user_feed_items').update({
      state: 'my_feed_pending_accept',
      last_decision_code: 'GENERATION_FAILED',
    }).eq('id', feedItem.id).eq('user_id', userId);

    return res.status(500).json({
      ok: false,
      error_code: 'GENERATION_FAILED',
      message,
      data: {
        user_feed_item_id: feedItem.id,
      },
    });
  }
});

app.post('/api/my-feed/items/:id/skip', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data, error } = await db
    .from('user_feed_items')
    .update({ state: 'my_feed_skipped', last_decision_code: 'SKIPPED_BY_USER' })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .eq('state', 'my_feed_pending_accept')
    .select('id, state')
    .maybeSingle();
  if (error) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error.message, data: null });
  if (!data) return res.status(409).json({ ok: false, error_code: 'INVALID_STATE', message: 'Only pending items can be skipped', data: null });

  return res.json({
    ok: true,
    error_code: null,
    message: 'item skipped',
    data: {
      user_feed_item_id: data.id,
      state: data.state,
    },
  });
});

app.post('/api/my-feed/items/:id/auto-publish', async (req, res) => {
  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

  if (!autoChannelPipelineEnabled) {
    return res.status(409).json({
      ok: false,
      error_code: 'AUTO_CHANNEL_DISABLED',
      message: 'Auto-channel pipeline is disabled.',
      data: null,
    });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data: feedItem, error: readError } = await db
    .from('user_feed_items')
    .select('id, user_id, source_item_id, blueprint_id')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: readError.message, data: null });
  if (!feedItem) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Feed item not found', data: null });
  if (!feedItem.blueprint_id) {
    return res.status(409).json({
      ok: false,
      error_code: 'BLUEPRINT_REQUIRED',
      message: 'Feed item has no blueprint to auto-publish.',
      data: null,
    });
  }

  const sourceTag = String(req.body?.source_tag || 'manual_save').trim() || 'manual_save';

  try {
    const result = await runAutoChannelForFeedItem({
      db,
      userId,
      userFeedItemId: feedItem.id,
      blueprintId: feedItem.blueprint_id,
      sourceItemId: feedItem.source_item_id || null,
      sourceTag,
    });

    if (!result) {
      return res.status(500).json({
        ok: false,
        error_code: 'AUTO_CHANNEL_DISABLED',
        message: 'Auto-channel pipeline is disabled.',
        data: null,
      });
    }

    return res.json({
      ok: true,
      error_code: null,
      message: 'auto publish complete',
      data: {
        user_feed_item_id: result.userFeedItemId,
        candidate_id: result.candidateId,
        channel_slug: result.channelSlug,
        decision: result.decision,
        reason_code: result.reasonCode,
        classifier_mode: result.classifierMode,
        classifier_reason: result.classifierReason,
        classifier_confidence: result.classifierConfidence ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      ok: false,
      error_code: 'AUTO_CHANNEL_FAILED',
      message,
      data: {
        user_feed_item_id: feedItem.id,
      },
    });
  }
});

app.post('/api/channel-candidates', async (req, res) => {
  // Legacy manual candidate flow retained for rollback.
  if (rejectLegacyManualFlowIfDisabled(res)) return;

  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

  const body = req.body as { user_feed_item_id?: string; channel_slug?: string };
  const userFeedItemId = String(body.user_feed_item_id || '').trim();
  const channelSlug = String(body.channel_slug || '').trim();
  if (!userFeedItemId || !channelSlug) {
    return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'user_feed_item_id and channel_slug required', data: null });
  }

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const { data, error } = await db
    .from('channel_candidates')
    .upsert(
      {
        user_feed_item_id: userFeedItemId,
        channel_slug: channelSlug,
        submitted_by_user_id: userId,
        status: 'pending',
      },
      { onConflict: 'user_feed_item_id,channel_slug' },
    )
    .select('id, user_feed_item_id, channel_slug, status')
    .single();

  if (error) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error.message, data: null });

  await db.from('user_feed_items').update({ state: 'candidate_submitted', last_decision_code: null }).eq('id', userFeedItemId);

  return res.json({
    ok: true,
    error_code: null,
    message: 'candidate upserted',
    data,
  });
});

app.get('/api/channel-candidates/:id', async (req, res) => {
  // Legacy manual candidate flow retained for rollback.
  if (rejectLegacyManualFlowIfDisabled(res)) return;

  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const candidateId = req.params.id;
  const { data: candidate, error: candidateError } = await db
    .from('channel_candidates')
    .select('id, user_feed_item_id, channel_slug, status, created_at, updated_at')
    .eq('id', candidateId)
    .maybeSingle();

  if (candidateError) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: candidateError.message, data: null });
  if (!candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });

  const { data: decisions } = await db
    .from('channel_gate_decisions')
    .select('gate_id, outcome, reason_code, score, policy_version, method_version, created_at')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });

  return res.json({
    ok: true,
    error_code: null,
    message: 'candidate status',
    data: {
      ...candidate,
      decisions: decisions || [],
    },
  });
});

app.post('/api/channel-candidates/:id/evaluate', async (req, res) => {
  // Legacy manual candidate flow retained for rollback.
  if (rejectLegacyManualFlowIfDisabled(res)) return;

  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const candidateId = req.params.id;
  const { data: candidate, error: candidateError } = await db
    .from('channel_candidates')
    .select('id, user_feed_item_id, channel_slug, status')
    .eq('id', candidateId)
    .maybeSingle();
  if (candidateError) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: candidateError.message, data: null });
  if (!candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });

  const { data: feedItem, error: feedError } = await db
    .from('user_feed_items')
    .select('id, blueprint_id')
    .eq('id', candidate.user_feed_item_id)
    .maybeSingle();
  if (feedError || !feedItem) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: feedError?.message || 'Feed item missing', data: null });

  const { data: blueprint, error: blueprintError } = await db
    .from('blueprints')
    .select('id, title, llm_review, steps')
    .eq('id', feedItem.blueprint_id)
    .maybeSingle();
  if (blueprintError || !blueprint) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: blueprintError?.message || 'Blueprint missing', data: null });

  const { data: tagRows } = await db
    .from('blueprint_tags')
    .select('tags(slug)')
    .eq('blueprint_id', blueprint.id);
  const tagSlugs = (tagRows || [])
    .map((row) => (row.tags as { slug?: string } | null)?.slug || '')
    .filter(Boolean);

  const stepCount = Array.isArray(blueprint.steps) ? blueprint.steps.length : 0;
  const evaluation = evaluateCandidateForChannel({
    title: blueprint.title,
    llmReview: blueprint.llm_review,
    channelSlug: candidate.channel_slug,
    tagSlugs,
    stepCount,
  });

  const decisionsPayload = evaluation.decisions.map((decision) => ({
    candidate_id: candidate.id,
    gate_id: decision.gate_id,
    outcome: decision.outcome,
    reason_code: decision.reason_code,
    score: decision.score ?? null,
    policy_version: 'bleuv1-gate-policy-v1.0',
    method_version: decision.method_version || 'gate-v1',
  }));

  const { error: insertError } = await db.from('channel_gate_decisions').insert(decisionsPayload);
  if (insertError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: insertError.message, data: null });

  await db.from('channel_candidates').update({ status: evaluation.candidateStatus }).eq('id', candidate.id);
  await db
    .from('user_feed_items')
    .update({ state: evaluation.feedState, last_decision_code: evaluation.reasonCode })
    .eq('id', candidate.user_feed_item_id);

  console.log('[candidate_gate_result]', JSON.stringify({
    candidate_id: candidate.id,
    channel_slug: candidate.channel_slug,
    aggregate: evaluation.aggregate,
    reason_code: evaluation.reasonCode,
    execution_mode: 'all_gates_run',
    gate_mode: evaluation.mode,
    diagnostic_aggregate: evaluation.diagnosticAggregate || null,
    diagnostic_reason_code: evaluation.diagnosticReasonCode || null,
  }));
  if (evaluation.candidateStatus === 'pending_manual_review') {
    console.log('[candidate_manual_review_pending]', JSON.stringify({
      candidate_id: candidate.id,
      channel_slug: candidate.channel_slug,
      reason_code: evaluation.reasonCode,
      gate_mode: evaluation.mode,
    }));
  }

  return res.json({
    ok: true,
    error_code: null,
    message: 'candidate evaluated',
    data: {
      candidate_id: candidate.id,
      decision: evaluation.aggregate,
      next_state: evaluation.feedState,
      reason_code: evaluation.reasonCode,
    },
    meta: {
      execution_mode: 'all_gates_run',
      gate_mode: evaluation.mode,
      diagnostic_aggregate: evaluation.diagnosticAggregate || null,
      diagnostic_reason_code: evaluation.diagnosticReasonCode || null,
    },
  });
});

app.post('/api/channel-candidates/:id/publish', async (req, res) => {
  // Legacy manual candidate flow retained for rollback.
  if (rejectLegacyManualFlowIfDisabled(res)) return;

  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const candidateId = req.params.id;
  const body = req.body as { tag_slug?: string };

  const { data: candidate, error: candidateError } = await db
    .from('channel_candidates')
    .select('id, user_feed_item_id, channel_slug, status')
    .eq('id', candidateId)
    .maybeSingle();
  if (candidateError || !candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: candidateError?.message || 'Candidate not found', data: null });

  const { data: feedItem, error: feedError } = await db
    .from('user_feed_items')
    .select('id, blueprint_id')
    .eq('id', candidate.user_feed_item_id)
    .maybeSingle();
  if (feedError || !feedItem) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: feedError?.message || 'Feed item missing', data: null });

  const { error: publishError } = await db
    .from('blueprints')
    .update({ is_public: true })
    .eq('id', feedItem.blueprint_id);
  if (publishError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: publishError.message, data: null });

  const tagSlug = String(body.tag_slug || candidate.channel_slug || 'general').trim().toLowerCase();
  let tagId: string | null = null;
  const { data: existingTag } = await db.from('tags').select('id').eq('slug', tagSlug).maybeSingle();
  if (existingTag?.id) {
    tagId = existingTag.id;
  } else {
    const { data: createdTag, error: tagCreateError } = await db
      .from('tags')
      .insert({ slug: tagSlug, created_by: userId })
      .select('id')
      .single();
    if (tagCreateError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: tagCreateError.message, data: null });
    tagId = createdTag.id;
  }

  const { error: tagLinkError } = await db
    .from('blueprint_tags')
    .upsert({ blueprint_id: feedItem.blueprint_id, tag_id: tagId }, { onConflict: 'blueprint_id,tag_id' });
  if (tagLinkError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: tagLinkError.message, data: null });

  await db.from('channel_candidates').update({ status: 'published' }).eq('id', candidate.id);
  await db.from('user_feed_items').update({ state: 'channel_published', last_decision_code: 'ALL_GATES_PASS' }).eq('id', candidate.user_feed_item_id);

  console.log('[candidate_published]', JSON.stringify({
    candidate_id: candidate.id,
    user_feed_item_id: candidate.user_feed_item_id,
    blueprint_id: feedItem.blueprint_id,
    channel_slug: candidate.channel_slug,
    reason_code: 'ALL_GATES_PASS',
  }));

  return res.json({
    ok: true,
    error_code: null,
    message: 'candidate published',
    data: {
      candidate_id: candidate.id,
      published: true,
      channel_slug: candidate.channel_slug,
    },
  });
});

app.post('/api/channel-candidates/:id/reject', async (req, res) => {
  // Legacy manual candidate flow retained for rollback.
  if (rejectLegacyManualFlowIfDisabled(res)) return;

  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

  const db = getAuthedSupabaseClient(authToken);
  if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

  const candidateId = req.params.id;
  const body = req.body as { reason_code?: string };
  const reasonCode = String(body.reason_code || 'MANUAL_REJECT').trim();

  const { data: candidate, error: candidateError } = await db
    .from('channel_candidates')
    .select('id, user_feed_item_id, channel_slug')
    .eq('id', candidateId)
    .maybeSingle();
  if (candidateError || !candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: candidateError?.message || 'Candidate not found', data: null });

  const { data: feedItem } = await db
    .from('user_feed_items')
    .select('blueprint_id')
    .eq('id', candidate.user_feed_item_id)
    .maybeSingle();

  await db.from('channel_candidates').update({ status: 'rejected' }).eq('id', candidate.id);
  await db.from('user_feed_items').update({ state: 'channel_rejected', last_decision_code: reasonCode }).eq('id', candidate.user_feed_item_id);

  console.log('[candidate_rejected]', JSON.stringify({
    candidate_id: candidate.id,
    user_feed_item_id: candidate.user_feed_item_id,
    blueprint_id: feedItem?.blueprint_id || null,
    channel_slug: candidate.channel_slug,
    reason_code: reasonCode,
  }));

  return res.json({
    ok: true,
    error_code: null,
    message: 'candidate rejected',
    data: {
      candidate_id: candidate.id,
      reason_code: reasonCode,
    },
  });
});

function normalizeGeneratedBlueprint(
  request: BlueprintGenerationRequest,
  generated: BlueprintGenerationResult
) {
  const categoryMap = new Map<string, Set<string>>();
  request.categories.forEach((category) => {
    categoryMap.set(
      category.name,
      new Set(category.items.map((item) => item.trim()).filter(Boolean))
    );
  });

  const steps = (generated.steps || [])
    .map((step) => {
      const items = (step.items || [])
        .map((item) => ({
          category: item.category?.trim() || '',
          name: item.name?.trim() || '',
          context: item.context?.trim() || undefined,
        }))
        .filter((item) => {
          if (!item.category || !item.name) return false;
          const allowed = categoryMap.get(item.category);
          return !!allowed && allowed.has(item.name);
        });
      return {
        title: step.title?.trim() || 'Step',
        description: step.description?.trim() || '',
        items,
      };
    })
    .filter((step) => step.items.length > 0);

  return {
    title: generated.title?.trim() || request.title || request.inventoryTitle,
    steps,
  };
}

type PipelineErrorCode =
  | 'SERVICE_DISABLED'
  | 'INVALID_URL'
  | 'NO_CAPTIONS'
  | 'PROVIDER_FAIL'
  | 'PROVIDER_DEGRADED'
  | 'TRANSCRIPT_EMPTY'
  | 'GENERATION_FAIL'
  | 'SAFETY_BLOCKED'
  | 'PII_BLOCKED'
  | 'RATE_LIMITED'
  | 'TIMEOUT';

type PipelineErrorShape = {
  error_code: PipelineErrorCode;
  message: string;
};

class PipelineError extends Error {
  errorCode: PipelineErrorCode;
  constructor(errorCode: PipelineErrorCode, message: string) {
    super(message);
    this.errorCode = errorCode;
  }
}

function makePipelineError(errorCode: PipelineErrorCode, message: string): never {
  throw new PipelineError(errorCode, message);
}

function mapPipelineError(error: unknown): PipelineErrorShape | null {
  if (error instanceof PipelineError) {
    return { error_code: error.errorCode, message: error.message };
  }
  const providerCode = String((error as { code?: string } | null)?.code || '').trim();
  if (providerCode === 'PROVIDER_DEGRADED') {
    return {
      error_code: 'PROVIDER_DEGRADED',
      message: error instanceof Error ? error.message : 'Provider temporarily degraded.',
    };
  }
  if (error instanceof TranscriptProviderError) {
    if (error.code === 'TRANSCRIPT_FETCH_FAIL') {
      return { error_code: 'PROVIDER_FAIL', message: 'Transcript provider is currently unavailable. Please try another video.' };
    }
    return { error_code: error.code, message: error.message };
  }
  return null;
}

function flattenDraftText(draft: {
  title: string;
  description: string;
  notes?: string | null;
  tags?: string[];
  steps: Array<{ name: string; notes: string; timestamp?: string | null }>;
}) {
  const blocks = [
    draft.title,
    draft.description,
    draft.notes || '',
    ...(draft.tags || []),
    ...draft.steps.flatMap((step) => [step.name, step.notes, step.timestamp || '']),
  ];
  return blocks.filter(Boolean).join('\n').toLowerCase();
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

async function runYouTubePipeline(input: {
  runId: string;
  videoId: string;
  videoUrl: string;
  generateReview: boolean;
  generateBanner: boolean;
  authToken: string;
}) {
  const startedAt = Date.now();
  const serviceDb = getServiceSupabaseClient();
  const transcript = await runWithProviderRetry(
    {
      providerKey: 'transcript',
      db: serviceDb,
      maxAttempts: providerRetryDefaults.transcriptAttempts,
      timeoutMs: providerRetryDefaults.transcriptTimeoutMs,
      baseDelayMs: 250,
      jitterMs: 150,
    },
    async () => getTranscriptForVideo(input.videoId),
  );
  const client = createLLMClient();
  const qualityConfig = readYt2bpQualityConfig();
  const contentSafetyConfig = readYt2bpContentSafetyConfig();
  const qualityAttempts = qualityConfig.enabled ? 1 + qualityConfig.retry_policy.max_retries : 1;
  const safetyRetryBudget = contentSafetyConfig.enabled ? contentSafetyConfig.retry_policy.max_retries : 0;
  let bestFailingQuality: {
    draft: YouTubeDraft;
    overall: number;
    failures: string[];
  } | null = null;
  const passingCandidates: Array<{ draft: YouTubeDraft; overall: number }> = [];

  const toDraft = (rawDraft: Awaited<ReturnType<typeof client.generateYouTubeBlueprint>>): YouTubeDraft => ({
    title: rawDraft.title?.trim() || 'YouTube Blueprint',
    description: rawDraft.description?.trim() || 'AI-generated blueprint from video transcript.',
    steps: (rawDraft.steps || [])
      .map((step) => ({
        name: step.name?.trim() || '',
        notes: step.notes?.trim() || '',
        timestamp: step.timestamp?.trim() || null,
      }))
      .filter((step) => step.name && step.notes),
    notes: rawDraft.notes?.trim() || null,
    tags: (rawDraft.tags || []).map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
  });

  let safetyRetriesUsed = 0;
  for (let attempt = 1; attempt <= qualityAttempts; attempt += 1) {
    let safetyRetryHint = '';
    let attemptRunCount = 0;
    const maxRunsForAttempt = 1 + safetyRetryBudget;
    while (attemptRunCount < maxRunsForAttempt) {
      attemptRunCount += 1;
      const globalRunIndex = (attempt - 1) * maxRunsForAttempt + attemptRunCount;
      const rawDraft = await runWithProviderRetry(
        {
          providerKey: 'llm_generate_blueprint',
          db: serviceDb,
          maxAttempts: providerRetryDefaults.llmAttempts,
          timeoutMs: providerRetryDefaults.llmTimeoutMs,
          baseDelayMs: 300,
          jitterMs: 200,
        },
        async () => client.generateYouTubeBlueprint({
          videoUrl: input.videoUrl,
          transcript: transcript.text,
          additionalInstructions: safetyRetryHint || undefined,
        }),
      );
      const draft = toDraft(rawDraft);

      if (!draft.steps.length) {
        console.log(
          `[yt2bp-quality] run_id=${input.runId} attempt=${attempt}/${qualityAttempts} run=${attemptRunCount}/${maxRunsForAttempt} global_run=${globalRunIndex} pass=false reason=no_steps`
        );
        break;
      }

      const flattened = flattenDraftText(draft);
      const deterministicSafety = runSafetyChecks(flattened);
      if (!deterministicSafety.ok) {
        makePipelineError('SAFETY_BLOCKED', `Forbidden topics detected: ${deterministicSafety.blockedTopics.join(', ')}`);
      }
      const pii = runPiiChecks(flattened);
      if (!pii.ok) {
        makePipelineError('PII_BLOCKED', `PII detected: ${pii.matches.join(', ')}`);
      }

      if (!qualityConfig.enabled) {
        passingCandidates.push({ draft, overall: 0 });
        break;
      }
      try {
        const graded = await runWithProviderRetry(
          {
            providerKey: 'llm_quality_judge',
            db: serviceDb,
            maxAttempts: providerRetryDefaults.llmAttempts,
            timeoutMs: providerRetryDefaults.llmTimeoutMs,
            baseDelayMs: 250,
            jitterMs: 200,
          },
          async () => scoreYt2bpQualityWithOpenAI(draft, qualityConfig),
        );
        const failIds = graded.failures.join(',') || 'none';
        console.log(
          `[yt2bp-quality] run_id=${input.runId} attempt=${attempt}/${qualityAttempts} run=${attemptRunCount}/${maxRunsForAttempt} global_run=${globalRunIndex} pass=${graded.ok} overall=${graded.overall.toFixed(2)} failures=${failIds}`
        );
        if (!graded.ok) {
          if (!bestFailingQuality || graded.overall > bestFailingQuality.overall) {
            bestFailingQuality = { draft, overall: graded.overall, failures: graded.failures };
          }
          break;
        }

        let safetyPassed = !contentSafetyConfig.enabled;
        if (contentSafetyConfig.enabled) {
          const safetyScore = await runWithProviderRetry(
            {
              providerKey: 'llm_safety_judge',
              db: serviceDb,
              maxAttempts: providerRetryDefaults.llmAttempts,
              timeoutMs: providerRetryDefaults.llmTimeoutMs,
              baseDelayMs: 250,
              jitterMs: 200,
            },
            async () => scoreYt2bpContentSafetyWithOpenAI(draft, contentSafetyConfig),
          );
          const flagged = safetyScore.failedCriteria.join(',') || 'none';
          console.log(
            `[yt2bp-content-safety] run_id=${input.runId} attempt=${attempt}/${qualityAttempts} run=${attemptRunCount}/${maxRunsForAttempt} global_run=${globalRunIndex} pass=${safetyScore.ok} flagged=${flagged}`
          );
          if (safetyScore.ok) {
            safetyPassed = true;
          } else if (safetyRetriesUsed < safetyRetryBudget && attemptRunCount < maxRunsForAttempt) {
            safetyRetriesUsed += 1;
            safetyRetryHint =
              'Avoid these forbidden topics: self_harm, sexual_minors, hate_harassment. Keep output safe and compliant.';
            continue;
          } else {
            makePipelineError('SAFETY_BLOCKED', 'This video content could not be converted safely. Please try another video.');
          }
        }

        if (safetyPassed) {
          passingCandidates.push({ draft, overall: graded.overall });
          break;
        }
      } catch (error) {
        if (error instanceof PipelineError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        const phase = message.toLowerCase().includes('safety') ? 'yt2bp-content-safety' : 'yt2bp-quality';
        console.log(
          `[${phase}] run_id=${input.runId} attempt=${attempt}/${qualityAttempts} run=${attemptRunCount}/${maxRunsForAttempt} pass=false judge_error=${message.slice(0, 180)}`
        );
        makePipelineError('GENERATION_FAIL', GENERIC_YT2BP_FAILURE_MESSAGE);
      }
    }
  }

  const selected = passingCandidates
    .slice()
    .sort((a, b) => b.overall - a.overall)[0];
  if (!selected) {
    if (bestFailingQuality) {
      console.log(
        `[yt2bp-quality] run_id=${input.runId} selected=none best_fail_overall=${bestFailingQuality.overall.toFixed(2)} fail_ids=${bestFailingQuality.failures.join(',')}`
      );
    }
    makePipelineError('GENERATION_FAIL', GENERIC_YT2BP_FAILURE_MESSAGE);
  }

  const draft = selected.draft;
  console.log(
    `[yt2bp] run_id=${input.runId} transcript_source=${transcript.source} transcript_chars=${transcript.text.length}`
  );

  let reviewSummary: string | null = null;
  if (input.generateReview) {
    const selectedItems = {
      transcript: draft.steps.map((step) => ({ name: step.name, context: step.timestamp || undefined })),
    };
    reviewSummary = await runWithProviderRetry(
      {
        providerKey: 'llm_review',
        db: serviceDb,
        maxAttempts: providerRetryDefaults.llmAttempts,
        timeoutMs: providerRetryDefaults.llmTimeoutMs,
        baseDelayMs: 300,
        jitterMs: 200,
      },
      async () => client.analyzeBlueprint({
        title: draft.title,
        inventoryTitle: 'YouTube transcript',
        selectedItems,
        mixNotes: draft.notes || undefined,
        reviewPrompt: 'Summarize quality and clarity in a concise way.',
        reviewSections: ['Overview', 'Strengths', 'Suggestions'],
        includeScore: true,
      }),
    );
  }

  let bannerUrl: string | null = null;
  if (input.generateBanner && input.authToken && supabaseUrl) {
    const banner = await runWithProviderRetry(
      {
        providerKey: 'llm_banner',
        db: serviceDb,
        maxAttempts: providerRetryDefaults.llmAttempts,
        timeoutMs: providerRetryDefaults.llmTimeoutMs,
        baseDelayMs: 300,
        jitterMs: 200,
      },
      async () => client.generateBanner({
        title: draft.title,
        inventoryTitle: 'YouTube transcript',
        tags: draft.tags,
      }),
    );
    bannerUrl = await uploadBannerToSupabase(banner.buffer.toString('base64'), banner.mimeType, input.authToken);
  }

  return {
    ok: true,
    run_id: input.runId,
    draft,
    review: { available: input.generateReview, summary: reviewSummary },
    banner: { available: input.generateBanner, url: bannerUrl },
    meta: {
      transcript_source: transcript.source,
      confidence: transcript.confidence,
      duration_ms: Date.now() - startedAt,
    },
  };
}

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

app.post('/api/generate-banner', async (req, res) => {
  const parsed = BannerRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  if (!supabaseUrl) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const userId = (res.locals.user as { id?: string } | undefined)?.id;
  const authToken = (res.locals.authToken as string | undefined) ?? '';
  if (!userId || !authToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const creditCheck = await consumeCredit(userId, {
    reasonCode: 'BANNER_GENERATE',
  });
  if (!creditCheck.ok) {
    if (creditCheck.reason === 'global') {
      return res.status(429).json({
        error: 'We’re at capacity right now. Please try again in a few minutes.',
        retryAfterSeconds: creditCheck.retryAfterSeconds,
      });
    }
    return res.status(429).json({
      error: 'Insufficient credits right now. Please wait for refill and try again.',
      remaining: creditCheck.remaining,
      limit: creditCheck.limit,
      resetAt: creditCheck.resetAt,
    });
  }

  try {
    const client = createLLMClient();
    const result = await client.generateBanner(parsed.data);

    if (parsed.data.dryRun) {
      return res.json({
        contentType: result.mimeType,
        imageBase64: result.buffer.toString('base64'),
      });
    }

    const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/upload-banner`;
    const imageBase64 = result.buffer.toString('base64');
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        contentType: result.mimeType,
        imageBase64,
      }),
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      return res.status(uploadResponse.status).json({
        error: errorData.error || 'Banner upload failed',
      });
    }

    const uploadData = await uploadResponse.json();
    if (!uploadData?.bannerUrl) {
      return res.status(500).json({ error: 'Banner URL missing from upload' });
    }

    return res.json({
      bannerUrl: uploadData.bannerUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
});


app.listen(port, () => {
  console.log(`[agentic-backend] listening on :${port}`);
  scheduleQueuedIngestionProcessing(1500);
});

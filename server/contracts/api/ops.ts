import type express from 'express';
import type { ParseResult } from './shared';
import type { BackendRuntimeMode } from '../../services/runtimeConfig';
import type { OracleScopeDecisionCode } from '../../services/oracleSubscriptionSchedulerState';

type DbClient = any;

export type IngestionJobRow = { id: string };

export type AutoBannerRunResult = {
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
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  mode: string;
  source_channel_id: string;
  source_channel_title?: string | null;
  source_page_id: string | null;
  last_polled_at?: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
  last_sync_error?: string | null;
  is_active: boolean;
};

export type DebugSimulatePayload = {
  rewind_days?: number;
};

export type DebugSimulateSchema = {
  safeParse: (input: unknown) => ParseResult<DebugSimulatePayload>;
};

export type TranscriptProxyDebugMode = 'disabled' | 'explicit';

export type OpsRouteDeps = {
  isServiceRequestAuthorized: (req: express.Request) => boolean;
  getServiceSupabaseClient: () => DbClient | null;
  recoverStaleIngestionJobs: (db: DbClient, input: { scope: string }) => Promise<IngestionJobRow[]>;
  runUnlockSweeps: (db: DbClient, input: { mode: 'cron' | 'opportunistic' | 'manual'; force?: boolean; traceId?: string }) => Promise<void>;
  runSourcePageAssetSweep: (db: DbClient, input: { mode: 'cron' | 'opportunistic' | 'manual'; force?: boolean; traceId?: string }) => Promise<unknown>;
  seedSourceTranscriptRevalidateJobs: (db: DbClient, limit: number) => Promise<{ scanned: number; enqueued: number }>;
  countQueueDepth: (db: DbClient, input: { includeRunning?: boolean; userId?: string; statuses?: string[]; scope?: string; scopes?: string[] }) => Promise<number>;
  countQueueWorkItems: (db: DbClient, input: { includeRunning?: boolean; userId?: string; statuses?: string[]; scope?: string; scopes?: string[] }) => Promise<number>;
  createUnlockTraceId: () => string;
  scheduleQueuedIngestionProcessing: () => void;
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
  queueWorkItemsHardLimit: number;
  queueWorkItemsPerUserLimit: number;
  queuePriorityEnabled: boolean;
  queueLowPrioritySuppressionDepth: number;
  allActiveSubscriptionsMinTriggerIntervalMs: number;
  workerConcurrency: number;
  workerBatchSize: number;
  workerLeaseMs: number;
  workerHeartbeatMs: number;
  jobExecutionTimeoutMs: number;
  queuedWorkerId: string;
  getQueuedWorkerRunning: () => boolean;
  runtimeMode: BackendRuntimeMode;
  queuedIngestionScopes: readonly string[];
  isQueuedIngestionScope: (scope: string) => boolean;
  getProviderCircuitSnapshot: (db: DbClient, providerKey: string) => Promise<unknown>;
  autoBannerMode: string;
  autoBannerCap: number;
  autoBannerMaxAttempts: number;
  autoBannerTimeoutMs: number;
  autoBannerBatchSize: number;
  autoBannerConcurrency: number;
  processAutoBannerQueue: (db: DbClient, input: { maxJobs: number }) => Promise<AutoBannerRunResult>;
  debugEndpointsEnabled: boolean;
  debugSimulateSubscriptionRequestSchema: DebugSimulateSchema;
  resetTranscriptProxyDispatcher: () => Promise<void>;
  getTranscriptProxyDebugMode: () => TranscriptProxyDebugMode;
  syncSingleSubscription: (db: DbClient, subscription: SubscriptionRow, input: { trigger: string }) => Promise<{ processed: number; inserted: number; skipped: number }>;
  markSubscriptionSyncError: (
    db: DbClient,
    subscription: string | { id: string; last_polled_at?: string | null; last_sync_error?: string | null },
    error: unknown,
  ) => Promise<void>;
  observeOracleAllActiveSubscriptionsTrigger?: (input: {
    actualDecisionCode: OracleScopeDecisionCode;
    queueDepth?: number | null;
    latestJobId?: string | null;
    latestJobStatus?: string | null;
    latestActivityAt?: string | null;
    existingJobId?: string | null;
    existingJobStatus?: string | null;
    enqueuedJobId?: string | null;
  }) => Promise<void>;
};

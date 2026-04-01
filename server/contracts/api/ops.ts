import type express from 'express';
import type { ParseResult } from './shared';
import type { BackendRuntimeMode } from '../../services/runtimeConfig';
import type { OracleScopeDecisionCode } from '../../services/oracleSubscriptionSchedulerState';
import type { OraclePrimarySchedulerDecision } from '../../services/oracleSubscriptionScheduler';

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
  getActiveIngestionJobForScope?: (input: { scope: string }) => Promise<{
    id: string;
    status: string;
    started_at: string | null;
  } | null>;
  getLatestIngestionJob?: () => Promise<any | null>;
  getQueueHealthSnapshot?: (input: {
    snapshotAtIso: string;
    runningHeartbeatFreshMs: number;
  }) => Promise<{
    worker_running: boolean;
    queue_depth: number;
    running_depth: number;
    queue_work_items: number;
    running_work_items: number;
    oldest_queued_created_at: string | null;
    oldest_queued_age_ms: number | null;
    oldest_running_started_at: string | null;
    oldest_running_age_ms: number | null;
    stale_leases: number;
    by_scope: Record<string, {
      queued: number;
      running: number;
      queued_work_items: number;
      running_work_items: number;
      oldest_queued_age_ms: number | null;
      oldest_running_age_ms: number | null;
      priority: string;
    }>;
  } | null>;
  recoverStaleIngestionJobs: (db: DbClient, input: { scope: string }) => Promise<IngestionJobRow[]>;
  runUnlockSweeps: (db: DbClient, input: { mode: 'cron' | 'opportunistic' | 'manual'; force?: boolean; traceId?: string }) => Promise<void>;
  runSourcePageAssetSweep: (db: DbClient, input: { mode: 'cron' | 'opportunistic' | 'manual'; force?: boolean; traceId?: string }) => Promise<unknown>;
  seedSourceTranscriptRevalidateJobs: (db: DbClient, limit: number) => Promise<{ scanned: number; enqueued: number }>;
  countQueueDepth: (db: DbClient, input: { includeRunning?: boolean; userId?: string; statuses?: string[]; scope?: string; scopes?: string[] }) => Promise<number>;
  countQueueWorkItems: (db: DbClient, input: { includeRunning?: boolean; userId?: string; statuses?: string[]; scope?: string; scopes?: string[] }) => Promise<number>;
  createUnlockTraceId: () => string;
  scheduleQueuedIngestionProcessing: () => void;
  enqueueIngestionJob: any;
  finalizeIngestionJob: any;
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
  queueWorkItemsHardLimit: number;
  queueWorkItemsPerUserLimit: number;
  queuePriorityEnabled: boolean;
  queueLowPrioritySuppressionDepth: number;
  allActiveSubscriptionsMinTriggerIntervalMs: number;
  oraclePrimaryMinTriggerIntervalMs: number;
  oraclePrimaryOwnsAllActiveSubscriptionsTrigger: boolean;
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
    oracleDecisionCode?: OracleScopeDecisionCode;
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
  }) => Promise<void>;
  resolveOracleAllActiveSubscriptionsPrimaryDecision?: (input: {
    queueDepth?: number | null;
  }) => Promise<OraclePrimarySchedulerDecision | null>;
};

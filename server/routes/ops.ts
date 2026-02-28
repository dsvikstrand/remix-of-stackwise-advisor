import type express from 'express';
import {
  handleAutoBannerJobsLatest,
  handleAutoBannerJobsTrigger,
  handleDebugSimulateNewUploads,
  handleIngestionJobsLatest,
  handleIngestionJobsTrigger,
  handleQueueHealth,
  handleSourcePagesAssetSweep,
} from '../handlers/opsHandlers';

type DbClient = any;

type IngestionJobRow = { id: string };

type AutoBannerRunResult = {
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

type SubscriptionRow = {
  id: string;
  user_id: string;
  mode: string;
  source_channel_id: string;
  source_page_id: string | null;
  last_seen_published_at: string | null;
  last_seen_video_id: string | null;
  is_active: boolean;
};

type DebugSimulateSchema = {
  safeParse: (input: unknown) => { success: true; data: { rewind_days?: number } } | { success: false };
};

export type OpsRouteDeps = {
  isServiceRequestAuthorized: (req: express.Request) => boolean;
  getServiceSupabaseClient: () => DbClient | null;
  recoverStaleIngestionJobs: (db: DbClient, input: { scope: string }) => Promise<IngestionJobRow[]>;
  runUnlockSweeps: (db: DbClient, input: { mode: 'cron' | 'opportunistic' | 'manual'; force?: boolean; traceId?: string }) => Promise<void>;
  runSourcePageAssetSweep: (db: DbClient, input: { mode: 'cron' | 'opportunistic' | 'manual'; force?: boolean; traceId?: string }) => Promise<unknown>;
  seedSourceTranscriptRevalidateJobs: (db: DbClient, limit: number) => Promise<{ scanned: number; enqueued: number }>;
  countQueueDepth: (db: DbClient, input: { includeRunning: boolean; userId?: string }) => Promise<number>;
  createUnlockTraceId: () => string;
  scheduleQueuedIngestionProcessing: () => void;
  queueDepthHardLimit: number;
  queueDepthPerUserLimit: number;
  workerConcurrency: number;
  workerBatchSize: number;
  workerLeaseMs: number;
  workerHeartbeatMs: number;
  jobExecutionTimeoutMs: number;
  queuedWorkerId: string;
  queuedWorkerRunning: boolean;
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
  syncSingleSubscription: (db: DbClient, subscription: SubscriptionRow, input: { trigger: string }) => Promise<{ processed: number; inserted: number; skipped: number }>;
  markSubscriptionSyncError: (db: DbClient, subscriptionId: string, error: unknown) => Promise<void>;
};

export function registerOpsRoutes(app: express.Express, deps: OpsRouteDeps) {
  app.post('/api/ingestion/jobs/trigger', (req, res) => handleIngestionJobsTrigger(req, res, deps));

  app.get('/api/ingestion/jobs/latest', (req, res) => handleIngestionJobsLatest(req, res, deps));

  app.get('/api/ops/queue/health', (req, res) => handleQueueHealth(req, res, deps));

  app.post('/api/source-pages/assets/sweep', (req, res) => handleSourcePagesAssetSweep(req, res, deps));

  app.post('/api/auto-banner/jobs/trigger', (req, res) => handleAutoBannerJobsTrigger(req, res, deps));

  app.get('/api/auto-banner/jobs/latest', (req, res) => handleAutoBannerJobsLatest(req, res, deps));

  app.post('/api/debug/subscriptions/:id/simulate-new-uploads', (req, res) => handleDebugSimulateNewUploads(req, res, deps));
}

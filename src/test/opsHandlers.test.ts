import { describe, expect, it, vi } from 'vitest';
import { handleDebugResetYtProxy, handleQueueHealth } from '../../server/handlers/opsHandlers';
import type { OpsRouteDeps } from '../../server/contracts/api/ops';

function createMockResponse() {
  const response = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return response;
}

function createBaseDeps(overrides: Partial<OpsRouteDeps> = {}): OpsRouteDeps {
  return {
    isServiceRequestAuthorized: () => true,
    getServiceSupabaseClient: () => null,
    recoverStaleIngestionJobs: async () => [],
    runUnlockSweeps: async () => undefined,
    runSourcePageAssetSweep: async () => null,
    seedSourceTranscriptRevalidateJobs: async () => ({ scanned: 0, enqueued: 0 }),
    countQueueDepth: async () => 0,
    createUnlockTraceId: () => 'trace_123',
    scheduleQueuedIngestionProcessing: () => undefined,
    queueDepthHardLimit: 1000,
    queueDepthPerUserLimit: 50,
    workerConcurrency: 1,
    workerBatchSize: 10,
    workerLeaseMs: 90_000,
    workerHeartbeatMs: 10_000,
    jobExecutionTimeoutMs: 180_000,
    queuedWorkerId: 'worker_1',
    queuedWorkerRunning: true,
    queuedIngestionScopes: ['all_active_subscriptions'],
    isQueuedIngestionScope: () => true,
    getProviderCircuitSnapshot: async () => ({}),
    autoBannerMode: 'off',
    autoBannerCap: 1000,
    autoBannerMaxAttempts: 3,
    autoBannerTimeoutMs: 12_000,
    autoBannerBatchSize: 20,
    autoBannerConcurrency: 1,
    processAutoBannerQueue: async () => ({
      claimed: 0,
      succeeded: 0,
      failed: 0,
      dead: 0,
      errors: [],
      rebalance: {
        eligible: 0,
        kept: 0,
        demoted: 0,
        restoredToGenerated: 0,
        demotedToDefault: 0,
        demotedToNone: 0,
      },
    }),
    debugEndpointsEnabled: true,
    debugSimulateSubscriptionRequestSchema: {
      safeParse: () => ({ success: true, data: {} }),
    },
    resetYtToTextProxyDispatcher: async () => undefined,
    getYtToTextProxyDebugMode: () => 'rand',
    syncSingleSubscription: async () => ({ processed: 0, inserted: 0, skipped: 0 }),
    markSubscriptionSyncError: async () => undefined,
    ...overrides,
  };
}

function createQueueHealthDb(options?: {
  staleLeaseCount?: number;
  rows?: Array<{
    scope: string;
    status: 'queued' | 'running';
    created_at?: string | null;
    started_at?: string | null;
  }>;
  staleLeaseError?: { message: string } | null;
  rowsError?: { message: string } | null;
}) {
  const staleLeaseCount = options?.staleLeaseCount ?? 0;
  const rows = options?.rows ?? [];
  return {
    from(table: string) {
      if (table !== 'ingestion_jobs') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select(columns: string, opts?: { head?: boolean; count?: string }) {
          if (opts?.head) {
            return {
              eq() {
                return this;
              },
              not() {
                return this;
              },
              lt: async () => ({
                count: staleLeaseCount,
                error: options?.staleLeaseError ?? null,
              }),
            };
          }
          expect(columns).toContain('scope');
          expect(columns).toContain('status');
          return {
            in() {
              return this;
            },
            async then(resolve: (value: unknown) => unknown) {
              return resolve({
                data: rows,
                error: options?.rowsError ?? null,
              });
            },
          };
        },
      };
    },
  };
}

describe('debug yt_to_text proxy reset handler', () => {
  it('returns 404 when debug endpoints are disabled', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleDebugResetYtProxy(req, res as never, createBaseDeps({
      debugEndpointsEnabled: false,
    }));

    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'NOT_FOUND',
    });
  });

  it('returns 401 when the service token is missing or invalid', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleDebugResetYtProxy(req, res as never, createBaseDeps({
      isServiceRequestAuthorized: () => false,
    }));

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'SERVICE_AUTH_REQUIRED',
    });
  });

  it('resets the proxy cache and returns the current selector mode when authorized', async () => {
    const req = {} as never;
    const res = createMockResponse();
    const resetSpy = vi.fn(async () => undefined);

    await handleDebugResetYtProxy(req, res as never, createBaseDeps({
      resetYtToTextProxyDispatcher: resetSpy,
      getYtToTextProxyDebugMode: () => 'rand',
    }));

    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        reset: true,
        proxy_selector_mode: 'rand',
      },
    });
  });

  it('can report sample as the current selector mode', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleDebugResetYtProxy(req, res as never, createBaseDeps({
      getYtToTextProxyDebugMode: () => 'sample',
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        reset: true,
        proxy_selector_mode: 'sample',
      },
    });
  });
});

describe('queue health handler', () => {
  it('returns 401 when service auth is missing', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleQueueHealth(req, res as never, createBaseDeps({
      isServiceRequestAuthorized: () => false,
    }));

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'SERVICE_AUTH_REQUIRED',
    });
  });

  it('returns 500 when the service client is unavailable', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleQueueHealth(req, res as never, createBaseDeps());

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'CONFIG_ERROR',
    });
  });

  it('returns additive queue-age metrics and per-scope ages', async () => {
    const req = {} as never;
    const res = createMockResponse();
    const now = Date.now();
    const queuedIso = new Date(now - 5 * 60_000).toISOString();
    const runningIso = new Date(now - 2 * 60_000).toISOString();

    await handleQueueHealth(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => createQueueHealthDb({
        staleLeaseCount: 1,
        rows: [
          { scope: 'all_active_subscriptions', status: 'queued', created_at: queuedIso },
          { scope: 'all_active_subscriptions', status: 'running', started_at: runningIso },
        ],
      }),
      countQueueDepth: async (_db, input) => (input.includeRunning ? 3 : 1),
      queuedIngestionScopes: ['all_active_subscriptions', 'search_video_generate'],
      isQueuedIngestionScope: (scope) => scope === 'all_active_subscriptions' || scope === 'search_video_generate',
      getProviderCircuitSnapshot: async () => ({ state: 'closed' }),
    }));

    expect(res.statusCode).toBe(200);
    const payload = res.body as {
      ok: boolean;
      data: {
        snapshot_at: string;
        oldest_queued_created_at: string | null;
        oldest_queued_age_ms: number | null;
        oldest_running_started_at: string | null;
        oldest_running_age_ms: number | null;
        by_scope: Record<string, {
          queued: number;
          running: number;
          oldest_queued_age_ms: number | null;
          oldest_running_age_ms: number | null;
        }>;
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.data.snapshot_at).toMatch(/T/);
    expect(payload.data.oldest_queued_created_at).toBe(queuedIso);
    expect(payload.data.oldest_running_started_at).toBe(runningIso);
    expect(payload.data.oldest_queued_age_ms).not.toBeNull();
    expect(payload.data.oldest_running_age_ms).not.toBeNull();
    expect(payload.data.by_scope.all_active_subscriptions).toMatchObject({
      queued: 1,
      running: 1,
    });
    expect(payload.data.by_scope.all_active_subscriptions.oldest_queued_age_ms).not.toBeNull();
    expect(payload.data.by_scope.all_active_subscriptions.oldest_running_age_ms).not.toBeNull();
    expect(payload.data.by_scope.search_video_generate).toMatchObject({
      queued: 0,
      running: 0,
      oldest_queued_age_ms: null,
      oldest_running_age_ms: null,
    });
  });

  it('returns null age fields when no queued or running jobs exist', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleQueueHealth(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => createQueueHealthDb(),
      countQueueDepth: async (_db, input) => (input.includeRunning ? 0 : 0),
      queuedIngestionScopes: ['all_active_subscriptions'],
      isQueuedIngestionScope: () => true,
      getProviderCircuitSnapshot: async () => null,
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        oldest_queued_created_at: null,
        oldest_queued_age_ms: null,
        oldest_running_started_at: null,
        oldest_running_age_ms: null,
        by_scope: {
          all_active_subscriptions: {
            queued: 0,
            running: 0,
            oldest_queued_age_ms: null,
            oldest_running_age_ms: null,
          },
        },
      },
    });
  });
});

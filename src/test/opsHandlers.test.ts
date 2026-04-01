import { describe, expect, it, vi } from 'vitest';
import {
  handleDebugResetTranscriptProxy,
  handleIngestionJobsLatest,
  handleIngestionJobsTrigger,
  handleQueueHealth,
} from '../../server/handlers/opsHandlers';
import type { OpsRouteDeps } from '../../server/contracts/api/ops';
import { listTranscriptProviderRetryKeys } from '../../server/transcript/getTranscript';

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
    countQueueWorkItems: async () => 0,
    createUnlockTraceId: () => 'trace_123',
    scheduleQueuedIngestionProcessing: () => undefined,
    queueDepthHardLimit: 1000,
    queueDepthPerUserLimit: 50,
    queueWorkItemsHardLimit: 250,
    queueWorkItemsPerUserLimit: 40,
    queuePriorityEnabled: true,
    queueLowPrioritySuppressionDepth: 100,
    allActiveSubscriptionsMinTriggerIntervalMs: 10 * 60_000,
    oraclePrimaryMinTriggerIntervalMs: 10 * 60_000,
    oraclePrimaryOwnsAllActiveSubscriptionsTrigger: false,
    workerConcurrency: 1,
    workerBatchSize: 10,
    workerLeaseMs: 90_000,
    workerHeartbeatMs: 10_000,
    jobExecutionTimeoutMs: 180_000,
    queuedWorkerId: 'worker_1',
    getQueuedWorkerRunning: () => true,
    runtimeMode: 'combined',
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
    resetTranscriptProxyDispatcher: async () => undefined,
    getTranscriptProxyDebugMode: () => 'explicit',
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
    payload?: Record<string, unknown> | null;
    created_at?: string | null;
    started_at?: string | null;
    lease_expires_at?: string | null;
    last_heartbeat_at?: string | null;
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
          expect(columns).toContain('payload');
          expect(columns).toContain('lease_expires_at');
          expect(columns).toContain('last_heartbeat_at');
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

function createIngestionTriggerDbWithoutRunningJob() {
  return {
    from(table: string) {
      if (table !== 'ingestion_jobs') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select(_columns: string) {
          return {
            eq() {
              return this;
            },
            in() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            maybeSingle: async () => ({ data: null, error: null }),
          };
        },
      };
    },
  };
}

function createIngestionTriggerDb(options?: {
  runningJob?: { id: string; status: 'queued' | 'running'; started_at?: string | null } | null;
  latestJob?: { id: string; status: string; created_at?: string | null; started_at?: string | null } | null;
  insertedJobId?: string;
}) {
  const insertedJobId = options?.insertedJobId ?? 'job_new';
  const inserts: Array<Record<string, unknown>> = [];
  return {
    inserts,
    from(table: string) {
      if (table !== 'ingestion_jobs') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select(_columns: string) {
          const filters: Array<{ type: string; value?: unknown }> = [];
          return {
            eq(_field: string, value: unknown) {
              filters.push({ type: 'eq', value });
              return this;
            },
            in(_field: string, value: unknown) {
              filters.push({ type: 'in', value });
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            maybeSingle: async () => {
              const hasQueuedRunningFilter = filters.some((entry) => entry.type === 'in');
              return {
                data: hasQueuedRunningFilter ? (options?.runningJob ?? null) : (options?.latestJob ?? null),
                error: null,
              };
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          inserts.push(payload);
          return {
            select() {
              return {
                single: async () => ({ data: { id: insertedJobId }, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

describe('debug transcript proxy reset handler', () => {
  it('returns 404 when debug endpoints are disabled', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleDebugResetTranscriptProxy(req, res as never, createBaseDeps({
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

    await handleDebugResetTranscriptProxy(req, res as never, createBaseDeps({
      isServiceRequestAuthorized: () => false,
    }));

    expect(res.statusCode).toBe(401);
    expect(res.body).toMatchObject({
      ok: false,
      error_code: 'SERVICE_AUTH_REQUIRED',
    });
  });

  it('resets the proxy cache and returns the current proxy mode when authorized', async () => {
    const req = {} as never;
    const res = createMockResponse();
    const resetSpy = vi.fn(async () => undefined);

    await handleDebugResetTranscriptProxy(req, res as never, createBaseDeps({
      resetTranscriptProxyDispatcher: resetSpy,
      getTranscriptProxyDebugMode: () => 'explicit',
    }));

    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        reset: true,
        proxy_mode: 'explicit',
      },
    });
  });

  it('can report disabled as the current proxy mode', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleDebugResetTranscriptProxy(req, res as never, createBaseDeps({
      getTranscriptProxyDebugMode: () => 'disabled',
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        reset: true,
        proxy_mode: 'disabled',
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
    const getProviderCircuitSnapshot = vi.fn(async () => ({ state: 'closed' }));

    await handleQueueHealth(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => createQueueHealthDb({
        staleLeaseCount: 1,
        rows: [
          { scope: 'all_active_subscriptions', status: 'queued', payload: null, created_at: queuedIso },
          {
            scope: 'all_active_subscriptions',
            status: 'running',
            payload: null,
            started_at: runningIso,
            lease_expires_at: new Date(now + 60_000).toISOString(),
            last_heartbeat_at: new Date(now - 5_000).toISOString(),
          },
          { scope: 'search_video_generate', status: 'queued', payload: { items: [{}, {}, {}] }, created_at: queuedIso },
        ],
      }),
      countQueueDepth: async (_db, input) => (
        Array.isArray(input.statuses) && input.statuses.includes('running')
          ? 3
          : 2
      ),
      countQueueWorkItems: async (_db, input) => (
        Array.isArray(input.statuses) && input.statuses.length === 1 && input.statuses[0] === 'running'
          ? 1
          : 4
      ),
      queuedIngestionScopes: ['all_active_subscriptions', 'search_video_generate'],
      isQueuedIngestionScope: (scope) => scope === 'all_active_subscriptions' || scope === 'search_video_generate',
      getProviderCircuitSnapshot,
    }));

    expect(res.statusCode).toBe(200);
    const payload = res.body as {
      ok: boolean;
      data: {
        snapshot_at: string;
        worker_running: boolean;
        local_worker_running: boolean;
        runtime_mode: string;
        oldest_queued_created_at: string | null;
        oldest_queued_age_ms: number | null;
        oldest_running_started_at: string | null;
        oldest_running_age_ms: number | null;
        queue_work_items: number;
        running_work_items: number;
        by_scope: Record<string, {
          queued: number;
          running: number;
          queued_work_items: number;
          running_work_items: number;
          oldest_queued_age_ms: number | null;
          oldest_running_age_ms: number | null;
          priority: string;
        }>;
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.data.snapshot_at).toMatch(/T/);
    expect(payload.data.worker_running).toBe(true);
    expect(payload.data.local_worker_running).toBe(true);
    expect(payload.data.runtime_mode).toBe('combined');
    expect(payload.data.queue_work_items).toBe(4);
    expect(payload.data.running_work_items).toBe(1);
    expect(payload.data.oldest_queued_created_at).toBe(queuedIso);
    expect(payload.data.oldest_running_started_at).toBe(runningIso);
    expect(payload.data.oldest_queued_age_ms).not.toBeNull();
    expect(payload.data.oldest_running_age_ms).not.toBeNull();
    expect(payload.data.by_scope.all_active_subscriptions).toMatchObject({
      queued: 1,
      running: 1,
      queued_work_items: 1,
      running_work_items: 1,
      priority: 'low',
    });
    expect(payload.data.by_scope.all_active_subscriptions.oldest_queued_age_ms).not.toBeNull();
    expect(payload.data.by_scope.all_active_subscriptions.oldest_running_age_ms).not.toBeNull();
    expect(payload.data.by_scope.search_video_generate).toMatchObject({
      queued: 1,
      running: 0,
      queued_work_items: 3,
      running_work_items: 0,
      priority: 'high',
    });
    expect(payload.data.by_scope.search_video_generate.oldest_queued_age_ms).not.toBeNull();
    expect(payload.data.by_scope.search_video_generate.oldest_running_age_ms).toBeNull();
    const providerKeys = getProviderCircuitSnapshot.mock.calls.map((call) => call[1]);
    expect(providerKeys).toEqual([
      ...listTranscriptProviderRetryKeys(),
      'llm_generate_blueprint',
      'llm_quality_judge',
      'llm_safety_judge',
      'llm_review',
      'llm_banner',
    ]);
    expect(providerKeys).not.toContain('transcript');
  });

  it('returns null age fields when no queued or running jobs exist', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleQueueHealth(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => createQueueHealthDb(),
      countQueueDepth: async () => 0,
      countQueueWorkItems: async () => 0,
      queuedIngestionScopes: ['all_active_subscriptions'],
      isQueuedIngestionScope: () => true,
      getProviderCircuitSnapshot: async () => null,
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        worker_running: false,
        oldest_queued_created_at: null,
        oldest_queued_age_ms: null,
        oldest_running_started_at: null,
        oldest_running_age_ms: null,
        queue_work_items: 0,
        running_work_items: 0,
        by_scope: {
          all_active_subscriptions: {
            queued: 0,
            running: 0,
            queued_work_items: 0,
            running_work_items: 0,
            oldest_queued_age_ms: null,
            oldest_running_age_ms: null,
            priority: 'low',
          },
        },
      },
    });
  });

  it('prefers the Oracle queue health snapshot when provided', async () => {
    const req = {} as never;
    const res = createMockResponse();
    const getQueueHealthSnapshot = vi.fn(async () => ({
      worker_running: true,
      queue_depth: 4,
      running_depth: 2,
      queue_work_items: 9,
      running_work_items: 5,
      oldest_queued_created_at: '2026-04-01T09:00:00.000Z',
      oldest_queued_age_ms: 1000,
      oldest_running_started_at: '2026-04-01T09:05:00.000Z',
      oldest_running_age_ms: 500,
      stale_leases: 1,
      by_scope: {
        all_active_subscriptions: {
          queued: 1,
          running: 1,
          queued_work_items: 1,
          running_work_items: 1,
          oldest_queued_age_ms: 1000,
          oldest_running_age_ms: 500,
          priority: 'low',
        },
      },
    }));

    await handleQueueHealth(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => ({}) as any,
      getQueueHealthSnapshot,
      getProviderCircuitSnapshot: async () => ({ state: 'closed' }),
      countQueueDepth: vi.fn(async () => 999),
      countQueueWorkItems: vi.fn(async () => 999),
      queuedIngestionScopes: ['all_active_subscriptions'],
      isQueuedIngestionScope: () => true,
    }));

    expect(getQueueHealthSnapshot).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        worker_running: true,
        queue_depth: 4,
        running_depth: 2,
        queue_work_items: 9,
        running_work_items: 5,
        stale_leases: 1,
      },
    });
  });

  it('reports worker_running from fresh running jobs even when the local web process is not a worker', async () => {
    const req = {} as never;
    const res = createMockResponse();
    const now = Date.now();

    await handleQueueHealth(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => createQueueHealthDb({
        rows: [
          {
            scope: 'search_video_generate',
            status: 'running',
            payload: { items: [{}, {}, {}] },
            started_at: new Date(now - 10_000).toISOString(),
            lease_expires_at: new Date(now + 30_000).toISOString(),
            last_heartbeat_at: new Date(now - 2_000).toISOString(),
          },
        ],
      }),
      countQueueDepth: async (_db, input) => (
        Array.isArray(input.statuses) && input.statuses.includes('running')
          ? 1
          : 0
      ),
      countQueueWorkItems: async (_db, input) => (
        Array.isArray(input.statuses) && input.statuses[0] === 'running' ? 3 : 0
      ),
      queuedIngestionScopes: ['search_video_generate'],
      isQueuedIngestionScope: (scope) => scope === 'search_video_generate',
      getQueuedWorkerRunning: () => false,
      runtimeMode: 'web_only',
      getProviderCircuitSnapshot: async () => ({ state: 'closed' }),
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        worker_running: true,
        local_worker_running: false,
        runtime_mode: 'web_only',
        running_depth: 1,
        running_work_items: 3,
      },
    });
  });

  it('does not report worker_running from a stale local snapshot in web-only mode without fresh running jobs', async () => {
    const req = {} as never;
    const res = createMockResponse();

    await handleQueueHealth(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => createQueueHealthDb(),
      countQueueDepth: async () => 0,
      countQueueWorkItems: async () => 0,
      getQueuedWorkerRunning: () => true,
      runtimeMode: 'web_only',
      getProviderCircuitSnapshot: async () => ({ state: 'closed' }),
    }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        worker_running: false,
        local_worker_running: true,
        runtime_mode: 'web_only',
      },
    });
  });
});

describe('latest ingestion job handler', () => {
  it('prefers the Oracle latest-job reader when provided', async () => {
    const req = {} as never;
    const res = createMockResponse();
    const getLatestIngestionJob = vi.fn(async () => ({
      id: 'job_latest_1',
      trigger: 'user_sync',
      scope: 'manual_refresh_selection',
      status: 'queued',
      started_at: null,
      finished_at: null,
      processed_count: 0,
      inserted_count: 0,
      skipped_count: 0,
      error_code: null,
      error_message: null,
      attempts: 0,
      max_attempts: 3,
      next_run_at: '2026-04-01T10:00:00.000Z',
      lease_expires_at: null,
      trace_id: 'trace_latest',
      created_at: '2026-04-01T09:59:00.000Z',
      updated_at: '2026-04-01T09:59:00.000Z',
    }));

    await handleIngestionJobsLatest(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => ({}) as any,
      getLatestIngestionJob,
    }));

    expect(getLatestIngestionJob).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        job_id: 'job_latest_1',
        scope: 'manual_refresh_selection',
        trace_id: 'trace_latest',
      },
    });
  });
});

describe('ingestion trigger handler', () => {
  it('skips external all_active_subscriptions trigger requests when Oracle primary owns the scope', async () => {
    const req = {
      header: vi.fn(() => undefined),
    } as never;
    const res = createMockResponse();
    const resolveOracleAllActiveSubscriptionsPrimaryDecision = vi.fn(async () => null);

    await handleIngestionJobsTrigger(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => createIngestionTriggerDbWithoutRunningJob(),
      oraclePrimaryOwnsAllActiveSubscriptionsTrigger: true,
      resolveOracleAllActiveSubscriptionsPrimaryDecision,
    }));

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        suppressed: true,
        reason: 'oracle_primary_scheduler_owned',
        scope: 'all_active_subscriptions',
      },
    });
    expect(resolveOracleAllActiveSubscriptionsPrimaryDecision).not.toHaveBeenCalled();
  });

  it('allows Oracle-owned internal scheduler requests through the trigger path', async () => {
    const req = {
      header: vi.fn((name: string) => (name === 'x-oracle-primary-scheduler' ? '1' : undefined)),
    } as never;
    const res = createMockResponse();
    const observeOracleAllActiveSubscriptionsTrigger = vi.fn(async () => undefined);
    const resolveOracleAllActiveSubscriptionsPrimaryDecision = vi.fn(async () => ({
      nowIso: '2026-03-31T12:00:00.000Z',
      actualDecisionCode: 'actual_no_due_subscriptions' as const,
      oracleDecisionCode: 'shadow_no_due_subscriptions' as const,
      shouldEnqueue: false,
      dueSubscriptionCount: 0,
      dueSubscriptionIds: [],
      nextDueAt: '2026-03-31T12:30:00.000Z',
      minIntervalUntil: null,
      suppressionUntil: null,
      queueDepth: null,
      retryAfterSeconds: 1800,
    }));
    const db = {
      from(table: string) {
        if (table !== 'ingestion_jobs') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return {
          select() {
            const filters: Array<{ type: string }> = [];
            return {
              eq() {
                return this;
              },
              in() {
                filters.push({ type: 'in' });
                return this;
              },
              order() {
                return this;
              },
              limit() {
                return this;
              },
              maybeSingle: async () => {
                const isExistingJobRead = filters.some((entry) => entry.type === 'in');
                if (isExistingJobRead) {
                  return { data: null, error: null };
                }
                throw new Error('Latest-job fallback should not run in primary no-due mode');
              },
            };
          },
        };
      },
    };

    await handleIngestionJobsTrigger(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => db,
      oraclePrimaryOwnsAllActiveSubscriptionsTrigger: true,
      observeOracleAllActiveSubscriptionsTrigger,
      resolveOracleAllActiveSubscriptionsPrimaryDecision,
    }));

    expect(res.statusCode).toBe(202);
    expect(resolveOracleAllActiveSubscriptionsPrimaryDecision).toHaveBeenCalledTimes(1);
    expect(observeOracleAllActiveSubscriptionsTrigger).toHaveBeenCalledTimes(1);
  });

  it('suppresses enqueue when the latest all_active_subscriptions job is inside the minimum interval gate', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T12:00:00.000Z'));
    try {
      const req = {
        header: () => undefined,
      } as never;
      const res = createMockResponse();
      const scheduleQueuedIngestionProcessing = vi.fn();
      const recoverStaleIngestionJobs = vi.fn(async () => []);
      const runUnlockSweeps = vi.fn(async () => undefined);
      const runSourcePageAssetSweep = vi.fn(async () => null);
      const seedSourceTranscriptRevalidateJobs = vi.fn(async () => ({ scanned: 0, enqueued: 0 }));

      await handleIngestionJobsTrigger(req, res as never, createBaseDeps({
        getServiceSupabaseClient: () => createIngestionTriggerDb({
          latestJob: {
            id: 'job_recent',
            status: 'succeeded',
            created_at: '2026-03-23T11:54:00.000Z',
            started_at: '2026-03-23T11:55:00.000Z',
          },
        }),
        scheduleQueuedIngestionProcessing,
        recoverStaleIngestionJobs,
        runUnlockSweeps,
        runSourcePageAssetSweep,
        seedSourceTranscriptRevalidateJobs,
      }));

      expect(res.statusCode).toBe(202);
      expect(res.body).toMatchObject({
        ok: true,
        data: {
          suppressed: true,
          reason: 'min_interval',
          scope: 'all_active_subscriptions',
          latest_job_id: 'job_recent',
          latest_job_status: 'succeeded',
          min_interval_ms: 10 * 60_000,
        },
      });
      expect(scheduleQueuedIngestionProcessing).not.toHaveBeenCalled();
      expect(recoverStaleIngestionJobs).not.toHaveBeenCalled();
      expect(runUnlockSweeps).not.toHaveBeenCalled();
      expect(runSourcePageAssetSweep).not.toHaveBeenCalled();
      expect(seedSourceTranscriptRevalidateJobs).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('suppresses enqueue from the Oracle primary scheduler when no subscriptions are due', async () => {
    const req = {
      header: () => '1',
    } as never;
    const res = createMockResponse();
    const observeOracleAllActiveSubscriptionsTrigger = vi.fn(async () => undefined);
    const resolveOracleAllActiveSubscriptionsPrimaryDecision = vi.fn(async () => ({
      nowIso: '2026-03-31T12:00:00.000Z',
      actualDecisionCode: 'actual_no_due_subscriptions' as const,
      oracleDecisionCode: 'shadow_no_due_subscriptions' as const,
      shouldEnqueue: false,
      dueSubscriptionCount: 0,
      dueSubscriptionIds: [],
      nextDueAt: '2026-03-31T12:30:00.000Z',
      minIntervalUntil: null,
      suppressionUntil: null,
      queueDepth: null,
      retryAfterSeconds: 1800,
    }));
    const db = {
      from(table: string) {
        if (table !== 'ingestion_jobs') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return {
          select() {
            const filters: Array<{ type: string }> = [];
            return {
              eq() {
                return this;
              },
              in() {
                filters.push({ type: 'in' });
                return this;
              },
              order() {
                return this;
              },
              limit() {
                return this;
              },
              maybeSingle: async () => {
                const isExistingJobRead = filters.some((entry) => entry.type === 'in');
                if (isExistingJobRead) {
                  return { data: null, error: null };
                }
                throw new Error('Latest-job fallback should not run in primary no-due mode');
              },
            };
          },
        };
      },
    };

    await handleIngestionJobsTrigger(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => db,
      observeOracleAllActiveSubscriptionsTrigger,
      resolveOracleAllActiveSubscriptionsPrimaryDecision,
    }));

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        suppressed: true,
        reason: 'no_due_subscriptions',
        scope: 'all_active_subscriptions',
        due_subscription_count: 0,
        next_due_at: '2026-03-31T12:30:00.000Z',
      },
      retry_after_seconds: 1800,
    });
    expect(resolveOracleAllActiveSubscriptionsPrimaryDecision).toHaveBeenCalledTimes(1);
    expect(observeOracleAllActiveSubscriptionsTrigger).toHaveBeenCalledWith({
      actualDecisionCode: 'actual_no_due_subscriptions',
      oracleDecisionCode: 'shadow_no_due_subscriptions',
      queueDepth: null,
      dueSubscriptionCount: 0,
      dueSubscriptionIds: [],
      nextDueAt: '2026-03-31T12:30:00.000Z',
      minIntervalUntil: null,
      suppressionUntil: null,
    });
  });

  it('suppresses enqueue from the Oracle primary scheduler using the Oracle cadence window', async () => {
    const req = {
      header: () => '1',
    } as never;
    const res = createMockResponse();
    const observeOracleAllActiveSubscriptionsTrigger = vi.fn(async () => undefined);
    const resolveOracleAllActiveSubscriptionsPrimaryDecision = vi.fn(async () => ({
      nowIso: '2026-03-31T12:00:00.000Z',
      actualDecisionCode: 'actual_min_interval' as const,
      oracleDecisionCode: 'shadow_min_interval' as const,
      shouldEnqueue: false,
      dueSubscriptionCount: 3,
      dueSubscriptionIds: ['sub_1', 'sub_2'],
      nextDueAt: '2026-03-31T12:05:00.000Z',
      minIntervalUntil: '2026-03-31T12:20:00.000Z',
      suppressionUntil: null,
      queueDepth: null,
      retryAfterSeconds: 1200,
    }));
    const db = {
      from(table: string) {
        if (table !== 'ingestion_jobs') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return {
          select() {
            const filters: Array<{ type: string }> = [];
            return {
              eq() {
                return this;
              },
              in() {
                filters.push({ type: 'in' });
                return this;
              },
              order() {
                return this;
              },
              limit() {
                return this;
              },
              maybeSingle: async () => {
                const isExistingJobRead = filters.some((entry) => entry.type === 'in');
                if (isExistingJobRead) {
                  return { data: null, error: null };
                }
                throw new Error('Latest-job fallback should not run in primary min-interval mode');
              },
            };
          },
        };
      },
    };

    await handleIngestionJobsTrigger(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => db,
      observeOracleAllActiveSubscriptionsTrigger,
      resolveOracleAllActiveSubscriptionsPrimaryDecision,
      oraclePrimaryMinTriggerIntervalMs: 20 * 60_000,
    }));

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        suppressed: true,
        reason: 'min_interval',
        scope: 'all_active_subscriptions',
        min_interval_ms: 20 * 60_000,
        min_interval_until: '2026-03-31T12:20:00.000Z',
        next_due_at: '2026-03-31T12:05:00.000Z',
      },
      retry_after_seconds: 1200,
    });
    expect(resolveOracleAllActiveSubscriptionsPrimaryDecision).toHaveBeenCalledTimes(1);
    expect(observeOracleAllActiveSubscriptionsTrigger).toHaveBeenCalledWith({
      actualDecisionCode: 'actual_min_interval',
      oracleDecisionCode: 'shadow_min_interval',
      queueDepth: null,
      dueSubscriptionCount: 3,
      dueSubscriptionIds: ['sub_1', 'sub_2'],
      nextDueAt: '2026-03-31T12:05:00.000Z',
      minIntervalUntil: '2026-03-31T12:20:00.000Z',
      suppressionUntil: null,
    });
  });

  it('falls back to the Supabase minimum-interval gate when Oracle primary resolution is unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T12:00:00.000Z'));
    try {
      const req = {
        header: () => '1',
      } as never;
      const res = createMockResponse();
      const resolveOracleAllActiveSubscriptionsPrimaryDecision = vi.fn(async () => null);

      await handleIngestionJobsTrigger(req, res as never, createBaseDeps({
        getServiceSupabaseClient: () => createIngestionTriggerDb({
          latestJob: {
            id: 'job_recent',
            status: 'succeeded',
            created_at: '2026-03-23T11:54:00.000Z',
            started_at: '2026-03-23T11:55:00.000Z',
          },
        }),
        resolveOracleAllActiveSubscriptionsPrimaryDecision,
      }));

      expect(res.statusCode).toBe(202);
      expect(res.body).toMatchObject({
        ok: true,
        data: {
          suppressed: true,
          reason: 'min_interval',
          latest_job_id: 'job_recent',
        },
      });
      expect(resolveOracleAllActiveSubscriptionsPrimaryDecision).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('queues a new job from the Oracle primary scheduler without using the latest-job fallback', async () => {
    const req = {
      header: () => '1',
    } as never;
    const res = createMockResponse();
    const scheduleQueuedIngestionProcessing = vi.fn();
    const observeOracleAllActiveSubscriptionsTrigger = vi.fn(async () => undefined);
    const resolveOracleAllActiveSubscriptionsPrimaryDecision = vi.fn(async () => ({
      nowIso: '2026-03-31T12:00:00.000Z',
      actualDecisionCode: 'actual_enqueued' as const,
      oracleDecisionCode: 'shadow_enqueue' as const,
      shouldEnqueue: true,
      dueSubscriptionCount: 4,
      dueSubscriptionIds: ['sub_1', 'sub_2'],
      nextDueAt: '2026-03-31T11:45:00.000Z',
      minIntervalUntil: null,
      suppressionUntil: null,
      queueDepth: null,
      retryAfterSeconds: null,
    }));
    const inserts: Array<Record<string, unknown>> = [];
    const db = {
      inserts,
      from(table: string) {
        if (table !== 'ingestion_jobs') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return {
          select() {
            const filters: Array<{ type: string }> = [];
            return {
              eq() {
                return this;
              },
              in() {
                filters.push({ type: 'in' });
                return this;
              },
              order() {
                return this;
              },
              limit() {
                return this;
              },
              maybeSingle: async () => {
                const isExistingJobRead = filters.some((entry) => entry.type === 'in');
                if (isExistingJobRead) {
                  return { data: null, error: null };
                }
                throw new Error('Latest-job fallback should not run for Oracle primary enqueue');
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            inserts.push(payload);
            return {
              select() {
                return {
                  single: async () => ({ data: { id: 'job_primary' }, error: null }),
                };
              },
            };
          },
        };
      },
    };

    await handleIngestionJobsTrigger(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => db,
      scheduleQueuedIngestionProcessing,
      observeOracleAllActiveSubscriptionsTrigger,
      resolveOracleAllActiveSubscriptionsPrimaryDecision,
    }));

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        job_id: 'job_primary',
      },
    });
    expect(inserts).toHaveLength(1);
    expect(scheduleQueuedIngestionProcessing).toHaveBeenCalledTimes(1);
    expect(observeOracleAllActiveSubscriptionsTrigger).toHaveBeenCalledWith({
      actualDecisionCode: 'actual_enqueued',
      oracleDecisionCode: 'shadow_enqueue',
      queueDepth: 1,
      dueSubscriptionCount: 4,
      dueSubscriptionIds: ['sub_1', 'sub_2'],
      nextDueAt: '2026-03-31T11:45:00.000Z',
      enqueuedJobId: 'job_primary',
    });
  });

  it('suppresses low-priority all_active_subscriptions enqueue when queue pressure threshold is hit', async () => {
    const req = {
      header: () => undefined,
    } as never;
    const res = createMockResponse();
    const recoverStaleIngestionJobs = vi.fn(async () => []);

    await handleIngestionJobsTrigger(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => createIngestionTriggerDbWithoutRunningJob(),
      countQueueDepth: async () => 125,
      queuePriorityEnabled: true,
      queueLowPrioritySuppressionDepth: 100,
      recoverStaleIngestionJobs,
    }));

    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        suppressed: true,
        scope: 'all_active_subscriptions',
      },
    });
    expect(recoverStaleIngestionJobs).not.toHaveBeenCalled();
  });

  it('queues a new all_active_subscriptions job once the minimum interval gate has elapsed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T12:00:00.000Z'));
    try {
      const req = {
        header: () => undefined,
      } as never;
      const res = createMockResponse();
      const db = createIngestionTriggerDb({
        latestJob: {
          id: 'job_old',
          status: 'succeeded',
          created_at: '2026-03-23T11:40:00.000Z',
          started_at: '2026-03-23T11:41:00.000Z',
        },
        insertedJobId: 'job_new',
      });
      const scheduleQueuedIngestionProcessing = vi.fn();
      const observeOracleAllActiveSubscriptionsTrigger = vi.fn(async () => undefined);

      await handleIngestionJobsTrigger(req, res as never, createBaseDeps({
        getServiceSupabaseClient: () => db,
        scheduleQueuedIngestionProcessing,
        observeOracleAllActiveSubscriptionsTrigger,
      }));

      expect(res.statusCode).toBe(202);
      expect(res.body).toMatchObject({
        ok: true,
        data: {
          job_id: 'job_new',
        },
      });
      expect(db.inserts).toHaveLength(1);
      expect(scheduleQueuedIngestionProcessing).toHaveBeenCalledTimes(1);
      expect(observeOracleAllActiveSubscriptionsTrigger).toHaveBeenCalledWith({
        actualDecisionCode: 'actual_enqueued',
        queueDepth: 1,
        enqueuedJobId: 'job_new',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('attempts stale recovery only for running all_active_subscriptions jobs before returning a conflict', async () => {
    const req = {
      header: () => undefined,
    } as never;
    const res = createMockResponse();
    const recoverStaleIngestionJobs = vi.fn(async () => []);
    let existingJobReads = 0;
    const db = {
      from(table: string) {
        if (table !== 'ingestion_jobs') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return {
          select(_columns: string) {
            const filters: Array<{ type: string }> = [];
            return {
              eq() {
                filters.push({ type: 'eq' });
                return this;
              },
              in() {
                filters.push({ type: 'in' });
                return this;
              },
              order() {
                return this;
              },
              limit() {
                return this;
              },
              maybeSingle: async () => {
                const isExistingJobRead = filters.some((entry) => entry.type === 'in');
                if (isExistingJobRead) {
                  existingJobReads += 1;
                  return {
                    data: { id: `job_running_${existingJobReads}`, status: 'running', started_at: '2026-03-23T11:40:00.000Z' },
                    error: null,
                  };
                }
                return {
                  data: null,
                  error: null,
                };
              },
            };
          },
        };
      },
    };

    await handleIngestionJobsTrigger(req, res as never, createBaseDeps({
      getServiceSupabaseClient: () => db,
      recoverStaleIngestionJobs,
    }));

    expect(res.statusCode).toBe(409);
    expect(recoverStaleIngestionJobs).toHaveBeenCalledTimes(1);
    expect(existingJobReads).toBe(2);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { handleDebugResetYtProxy } from '../../server/handlers/opsHandlers';
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQueuedIngestionWorkerController,
  resolveWorkerLeaseHeartbeatStartupDelayMs,
  resolveWorkerLeaseHeartbeatMs,
} from '../../server/services/queuedIngestionWorkerController';

describe('queued ingestion worker controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('coarsens worker lease heartbeats to a lease-aware cadence by default', () => {
    expect(resolveWorkerLeaseHeartbeatMs({
      workerLeaseMs: 90_000,
      configuredHeartbeatMs: 10_000,
    })).toBe(30_000);

    expect(resolveWorkerLeaseHeartbeatMs({
      workerLeaseMs: 15_000,
      configuredHeartbeatMs: 1_000,
    })).toBe(5_000);
  });

  it('keeps a slower configured heartbeat when it is already more conservative', () => {
    expect(resolveWorkerLeaseHeartbeatMs({
      workerLeaseMs: 90_000,
      configuredHeartbeatMs: 45_000,
    })).toBe(45_000);
  });

  it('keeps the default first-heartbeat delay for heavy scopes', () => {
    expect(resolveWorkerLeaseHeartbeatStartupDelayMs({
      scope: 'search_video_generate',
      workerLeaseMs: 90_000,
      heartbeatMs: 30_000,
    })).toBe(30_000);

    expect(resolveWorkerLeaseHeartbeatStartupDelayMs({
      scope: 'all_active_subscriptions',
      workerLeaseMs: 90_000,
      heartbeatMs: 30_000,
    })).toBe(30_000);
  });

  it('defers the first heartbeat for fast maintenance scopes', () => {
    expect(resolveWorkerLeaseHeartbeatStartupDelayMs({
      scope: 'blueprint_youtube_refresh',
      workerLeaseMs: 90_000,
      heartbeatMs: 30_000,
    })).toBe(45_000);

    expect(resolveWorkerLeaseHeartbeatStartupDelayMs({
      scope: 'source_transcript_revalidate',
      workerLeaseMs: 15_000,
      heartbeatMs: 5_000,
    })).toBe(7_500);
  });

  it('processes claimed jobs and exposes running state', async () => {
    const db = { tag: 'db' };
    const processClaimedIngestionJobs = vi.fn(async () => undefined);
    const runUnlockSweeps = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => db,
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['search_video_generate'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: false,
      getQueueSweepPlan: () => [{ scopes: ['search_video_generate'], maxJobs: 2 }],
      claimQueuedIngestionJobs: vi.fn()
        .mockResolvedValueOnce([{ id: 'job_1' }])
        .mockResolvedValueOnce([]),
      processClaimedIngestionJobs,
    });

    controller.schedule();
    expect(controller.getRunning()).toBe(false);

    await vi.advanceTimersByTimeAsync(0);

    expect(processClaimedIngestionJobs).toHaveBeenCalledWith(db, [{ id: 'job_1' }]);
    expect(runUnlockSweeps).toHaveBeenCalledWith(db, { mode: 'cron' });
    expect(controller.getRunning()).toBe(false);
  });

  it('reruns when a schedule request arrives while the worker is already running', async () => {
    const db = { tag: 'db' };
    let controller: ReturnType<typeof createQueuedIngestionWorkerController>;
    const runUnlockSweeps = vi.fn(async () => undefined);
    const claimQueuedIngestionJobs = vi.fn()
      .mockResolvedValueOnce([{ id: 'job_1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const processClaimedIngestionJobs = vi.fn(async () => {
      if (processClaimedIngestionJobs.mock.calls.length === 1) {
        controller.schedule();
      }
    });

    controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => db,
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['search_video_generate'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: false,
      getQueueSweepPlan: () => [{ scopes: ['search_video_generate'], maxJobs: 2 }],
      claimQueuedIngestionJobs,
      processClaimedIngestionJobs,
    });

    controller.schedule();
    await vi.advanceTimersByTimeAsync(0);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);
    expect(processClaimedIngestionJobs).toHaveBeenCalledTimes(1);
    expect(claimQueuedIngestionJobs).toHaveBeenCalledTimes(3);
  });

  it('keeps polling after a run when combined-mode background work is enabled', async () => {
    const runUnlockSweeps = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['all_active_subscriptions'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: true,
      keepAliveDelayMs: 1_500,
      keepAliveIdleBaseDelayMs: 10_000,
      keepAliveIdleMaxDelayMs: 60_000,
      keepAliveIdleJitterRatio: 0,
      getQueueSweepPlan: () => [{ scopes: ['all_active_subscriptions'], maxJobs: 1 }],
      claimQueuedIngestionJobs: vi.fn(async () => []),
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    expect(controller.getRunning()).toBe(false);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(3);
  });

  it('keeps the default idle cadence for non-low-priority sweeps', async () => {
    const runUnlockSweeps = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['search_video_generate'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: true,
      keepAliveDelayMs: 1_500,
      keepAliveIdleBaseDelayMs: 10_000,
      keepAliveIdleMaxDelayMs: 60_000,
      keepAliveIdleJitterRatio: 0,
      getQueueSweepPlan: () => [{ scopes: ['search_video_generate'], maxJobs: 1 }],
      claimQueuedIngestionJobs: vi.fn(async () => []),
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);
  });

  it('throttles maintenance work when a maintenance interval is configured', async () => {
    const db = { tag: 'db' };
    const runUnlockSweeps = vi.fn(async () => undefined);
    const recoverStaleIngestionJobs = vi.fn(async () => []);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => db,
      runUnlockSweeps,
      recoverStaleIngestionJobs,
      queuedIngestionScopes: ['all_active_subscriptions'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: true,
      keepAliveDelayMs: 1_500,
      keepAliveIdleBaseDelayMs: 10_000,
      keepAliveIdleMaxDelayMs: 60_000,
      keepAliveIdleJitterRatio: 0,
      maintenanceMinIntervalMs: 30_000,
      getQueueSweepPlan: () => [{ scopes: ['all_active_subscriptions'], maxJobs: 1 }],
      claimQueuedIngestionJobs: vi.fn(async () => []),
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);
    expect(recoverStaleIngestionJobs).toHaveBeenCalledTimes(1);

    controller.schedule(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);
    expect(recoverStaleIngestionJobs).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(59_999);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);
    expect(recoverStaleIngestionJobs).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);
    expect(recoverStaleIngestionJobs).toHaveBeenCalledTimes(2);
  });

  it('preempts a long idle timer when new work is scheduled', async () => {
    const runUnlockSweeps = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['all_active_subscriptions'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: true,
      keepAliveDelayMs: 1_500,
      keepAliveIdleBaseDelayMs: 10_000,
      keepAliveIdleMaxDelayMs: 60_000,
      keepAliveIdleJitterRatio: 0,
      getQueueSweepPlan: () => [{ scopes: ['all_active_subscriptions'], maxJobs: 1 }],
      claimQueuedIngestionJobs: vi.fn(async () => []),
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);

    controller.schedule(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);
  });

  it('resets idle backoff after claimed work is found', async () => {
    const runUnlockSweeps = vi.fn(async () => undefined);
    const claimQueuedIngestionJobs = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'job_1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['all_active_subscriptions'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: true,
      keepAliveDelayMs: 1_500,
      keepAliveIdleBaseDelayMs: 10_000,
      keepAliveIdleMaxDelayMs: 60_000,
      keepAliveIdleJitterRatio: 0,
      getQueueSweepPlan: () => [{ scopes: ['all_active_subscriptions'], maxJobs: 1 }],
      claimQueuedIngestionJobs,
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);

    controller.schedule(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_499);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(3);
  });

  it('does not keep polling when background work is disabled in web-only mode', async () => {
    const runUnlockSweeps = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['all_active_subscriptions'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: false,
      getQueueSweepPlan: () => [{ scopes: ['all_active_subscriptions'], maxJobs: 1 }],
      claimQueuedIngestionJobs: vi.fn(async () => []),
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('skips claim RPCs when the Oracle queue governor says the sweep is still cooling down', async () => {
    const runUnlockSweeps = vi.fn(async () => undefined);
    const claimQueuedIngestionJobs = vi.fn(async () => []);
    const shouldAttemptQueueClaim = vi.fn(async () => ({ allowed: false }));
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['all_active_subscriptions'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: false,
      getQueueSweepPlan: () => [{ tier: 'low', scopes: ['all_active_subscriptions'], maxJobs: 1 }],
      claimQueuedIngestionJobs,
      shouldAttemptQueueClaim,
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(shouldAttemptQueueClaim).toHaveBeenCalledTimes(1);
    expect(claimQueuedIngestionJobs).not.toHaveBeenCalled();
  });

  it('records Oracle queue claim results after each sweep attempt', async () => {
    const runUnlockSweeps = vi.fn(async () => undefined);
    const recordQueueClaimResult = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['source_auto_unlock_retry'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: false,
      getQueueSweepPlan: () => [{ tier: 'medium', scopes: ['source_auto_unlock_retry'], maxJobs: 2 }],
      claimQueuedIngestionJobs: vi.fn(async () => []),
      recordQueueClaimResult,
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(recordQueueClaimResult).toHaveBeenCalledWith(expect.objectContaining({
      tier: 'medium',
      scopes: ['source_auto_unlock_retry'],
      maxJobs: 1,
      claimedCount: 0,
    }));
  });

  it('claims an interactive refill promptly while another interactive job is still running', async () => {
    const db = { tag: 'db' };
    let activeClaimedJobs = 0;
    let releaseFirstJob: (() => void) | null = null;
    const firstJobDone = new Promise<void>((resolve) => {
      releaseFirstJob = resolve;
    });
    const runUnlockSweeps = vi.fn(async () => undefined);
    const claimQueuedIngestionJobs = vi.fn()
      .mockResolvedValueOnce([{ id: 'job_1' }])
      .mockResolvedValueOnce([{ id: 'job_2' }])
      .mockResolvedValueOnce([]);

    const processClaimedIngestionJobs = vi.fn(async (_db, jobs: Array<{ id: string }>) => {
      const jobId = jobs[0]?.id;
      if (jobId === 'job_1') {
        activeClaimedJobs = 1;
        await firstJobDone;
        activeClaimedJobs = 0;
        return;
      }
      if (jobId === 'job_2') {
        return;
      }
    });

    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => db,
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['source_item_unlock_generation'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      workerConcurrency: 2,
      getActiveClaimedJobCount: () => activeClaimedJobs,
      keepAliveEnabled: false,
      getQueueSweepPlan: () => [{ tier: 'high', scopes: ['source_item_unlock_generation'], maxJobs: 8 }],
      claimQueuedIngestionJobs,
      processClaimedIngestionJobs,
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);
    controller.requestRefill({
      scopes: ['source_item_unlock_generation'],
      reason: 'test_interactive_refill',
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(claimQueuedIngestionJobs).toHaveBeenCalledTimes(2);
    expect(claimQueuedIngestionJobs).toHaveBeenNthCalledWith(2, db, expect.objectContaining({
      scopes: ['source_item_unlock_generation'],
      maxJobs: 1,
    }));
    expect(processClaimedIngestionJobs).toHaveBeenCalledWith(db, [{ id: 'job_2' }]);

    releaseFirstJob?.();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('caps transcript-bound refills to transcript slot capacity even when worker concurrency is higher', async () => {
    const db = { tag: 'db' };
    const claimQueuedIngestionJobs = vi.fn()
      .mockResolvedValueOnce([{ id: 'job_2' }])
      .mockResolvedValueOnce([]);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => db,
      runUnlockSweeps: vi.fn(async () => undefined),
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['source_item_unlock_generation'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      workerConcurrency: 5,
      transcriptBoundSlotCapacity: 4,
      getActiveClaimedJobCount: () => 3,
      getActiveTranscriptBoundJobCount: () => 3,
      isTranscriptBoundScope: (scope) => scope === 'source_item_unlock_generation',
      keepAliveEnabled: false,
      getQueueSweepPlan: () => [{ tier: 'high', scopes: ['source_item_unlock_generation'], maxJobs: 8 }],
      claimQueuedIngestionJobs,
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);
    controller.requestRefill({
      scopes: ['source_item_unlock_generation'],
      reason: 'transcript_slot_alignment',
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(claimQueuedIngestionJobs).toHaveBeenNthCalledWith(2, db, expect.objectContaining({
      scopes: ['source_item_unlock_generation'],
      maxJobs: 1,
    }));
  });

  it('does not block non-transcript refill work when transcript slots are full', async () => {
    const db = { tag: 'db' };
    const claimQueuedIngestionJobs = vi.fn()
      .mockResolvedValueOnce([{ id: 'job_2' }])
      .mockResolvedValueOnce([]);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => db,
      runUnlockSweeps: vi.fn(async () => undefined),
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['blueprint_youtube_refresh'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      workerConcurrency: 5,
      transcriptBoundSlotCapacity: 4,
      getActiveClaimedJobCount: () => 3,
      getActiveTranscriptBoundJobCount: () => 4,
      isTranscriptBoundScope: (scope) => scope === 'source_item_unlock_generation',
      keepAliveEnabled: false,
      getQueueSweepPlan: () => [{ tier: 'low', scopes: ['blueprint_youtube_refresh'], maxJobs: 8 }],
      claimQueuedIngestionJobs,
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);
    controller.requestRefill({
      scopes: ['blueprint_youtube_refresh'],
      reason: 'non_transcript_refill',
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(claimQueuedIngestionJobs).toHaveBeenNthCalledWith(2, db, expect.objectContaining({
      scopes: ['blueprint_youtube_refresh'],
      maxJobs: 2,
    }));
  });

  it('uses the Oracle-selected sweep plan when provided', async () => {
    const runUnlockSweeps = vi.fn(async () => undefined);
    const claimQueuedIngestionJobs = vi.fn(async () => []);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['manual_refresh_selection', 'all_active_subscriptions'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: false,
      getQueueSweepPlan: () => [
        { tier: 'high', scopes: ['manual_refresh_selection'], maxJobs: 8 },
        { tier: 'low', scopes: ['all_active_subscriptions'], maxJobs: 1 },
      ],
      selectQueueSweepPlan: vi.fn(async ({ basePlan }) => basePlan.filter((entry) => entry.tier === 'high')),
      claimQueuedIngestionJobs,
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(claimQueuedIngestionJobs).toHaveBeenCalledTimes(1);
    expect(claimQueuedIngestionJobs).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      scopes: ['manual_refresh_selection'],
      maxJobs: 1,
    }));
  });

  it('uses the Oracle keepalive override when the worker goes idle', async () => {
    const runUnlockSweeps = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['all_active_subscriptions'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: true,
      keepAliveDelayMs: 1_500,
      keepAliveIdleBaseDelayMs: 10_000,
      keepAliveIdleMaxDelayMs: 60_000,
      keepAliveIdleJitterRatio: 0,
      getQueueSweepPlan: () => [{ tier: 'low', scopes: ['all_active_subscriptions'], maxJobs: 1 }],
      getKeepAliveDelayOverrideMs: vi.fn(async () => 2_000),
      claimQueuedIngestionJobs: vi.fn(async () => []),
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);
  });

  it('ignores zero-delay Oracle keepalive overrides while idle', async () => {
    const runUnlockSweeps = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['all_active_subscriptions'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: true,
      keepAliveDelayMs: 1_500,
      keepAliveIdleBaseDelayMs: 10_000,
      keepAliveIdleMaxDelayMs: 60_000,
      keepAliveIdleJitterRatio: 0,
      queueSweepControlEnabled: true,
      getQueueSweepPlan: () => [{ tier: 'low', scopes: ['all_active_subscriptions'], maxJobs: 1 }],
      getKeepAliveDelayOverrideMs: vi.fn(async () => 0),
      claimQueuedIngestionJobs: vi.fn(async () => []),
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);
  });

  it('clamps invalid idle keepalive delays and emits a guard warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const runUnlockSweeps = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => ({ tag: 'db' }),
      runUnlockSweeps,
      recoverStaleIngestionJobs: vi.fn(async () => []),
      queuedIngestionScopes: ['search_video_generate'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: true,
      keepAliveDelayMs: 0,
      keepAliveIdleBaseDelayMs: 0,
      keepAliveIdleMaxDelayMs: 0,
      keepAliveIdleJitterRatio: 0,
      getQueueSweepPlan: () => [{ tier: 'high', scopes: ['search_video_generate'], maxJobs: 1 }],
      claimQueuedIngestionJobs: vi.fn(async () => []),
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[queued_worker_idle_delay_guard]',
      expect.stringContaining('"fallback_delay_ms":1000'),
    );

    await vi.advanceTimersByTimeAsync(999);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);
  });

  it('can disable idle maintenance while preserving queue claims', async () => {
    const db = { tag: 'db' };
    const runUnlockSweeps = vi.fn(async () => undefined);
    const recoverStaleIngestionJobs = vi.fn(async () => []);
    const selectQueueSweepPlan = vi.fn(async ({ basePlan }) => basePlan.slice(0, 1));
    const recordQueueSweepResult = vi.fn(async () => undefined);
    const getKeepAliveDelayOverrideMs = vi.fn(async () => 2_000);
    const claimQueuedIngestionJobs = vi.fn()
      .mockResolvedValueOnce([{ id: 'job_1' }])
      .mockResolvedValueOnce([]);
    const processClaimedIngestionJobs = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => db,
      runUnlockSweeps,
      recoverStaleIngestionJobs,
      queuedIngestionScopes: ['search_video_generate'],
      queuedWorkerId: 'worker_1',
      workerLeaseMs: 90_000,
      keepAliveEnabled: true,
      keepAliveDelayMs: 1_500,
      keepAliveIdleBaseDelayMs: 10_000,
      keepAliveIdleMaxDelayMs: 60_000,
      keepAliveIdleJitterRatio: 0,
      unlockSweepsEnabled: false,
      staleJobRecoveryEnabled: false,
      queueSweepControlEnabled: false,
      getQueueSweepPlan: () => [
        { tier: 'high', scopes: ['search_video_generate'], maxJobs: 2 },
        { tier: 'low', scopes: ['all_active_subscriptions'], maxJobs: 1 },
      ],
      selectQueueSweepPlan,
      recordQueueSweepResult,
      getKeepAliveDelayOverrideMs,
      claimQueuedIngestionJobs,
      processClaimedIngestionJobs,
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(runUnlockSweeps).not.toHaveBeenCalled();
    expect(recoverStaleIngestionJobs).not.toHaveBeenCalled();
    expect(selectQueueSweepPlan).not.toHaveBeenCalled();
    expect(recordQueueSweepResult).not.toHaveBeenCalled();
    expect(getKeepAliveDelayOverrideMs).not.toHaveBeenCalled();
    expect(processClaimedIngestionJobs).toHaveBeenCalledWith(db, [{ id: 'job_1' }]);
    expect(claimQueuedIngestionJobs).toHaveBeenCalledWith(db, expect.objectContaining({
      scopes: ['search_video_generate'],
      maxJobs: 1,
    }));
  });
});

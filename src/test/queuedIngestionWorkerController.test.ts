import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueuedIngestionWorkerController } from '../../server/services/queuedIngestionWorkerController';

describe('queued ingestion worker controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('processes claimed jobs and exposes running state', async () => {
    const db = { tag: 'db' };
    const processClaimedIngestionJobs = vi.fn(async () => undefined);
    const controller = createQueuedIngestionWorkerController({
      getServiceSupabaseClient: () => db,
      runUnlockSweeps: vi.fn(async () => undefined),
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
      getQueueSweepPlan: () => [{ scopes: ['all_active_subscriptions'], maxJobs: 1 }],
      claimQueuedIngestionJobs: vi.fn(async () => []),
      processClaimedIngestionJobs: vi.fn(async () => undefined),
    });

    controller.start(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    expect(controller.getRunning()).toBe(false);

    await vi.advanceTimersByTimeAsync(1500);

    expect(runUnlockSweeps).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
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
});

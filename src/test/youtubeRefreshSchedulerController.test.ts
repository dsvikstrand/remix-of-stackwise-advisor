import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createYouTubeRefreshSchedulerController } from '../../server/services/youtubeRefreshSchedulerController';

describe('youtube refresh scheduler controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not schedule cycles when disabled', async () => {
    const runCycle = vi.fn(async () => undefined);
    const controller = createYouTubeRefreshSchedulerController({
      enabled: false,
      runIngestionWorker: true,
      intervalMinutes: 10,
      runCycle,
    });

    controller.start(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(runCycle).not.toHaveBeenCalled();
    expect(controller.getScheduled()).toBe(false);
  });

  it('does not schedule cycles when the worker runtime is disabled', async () => {
    const runCycle = vi.fn(async () => undefined);
    const controller = createYouTubeRefreshSchedulerController({
      enabled: true,
      runIngestionWorker: false,
      intervalMinutes: 10,
      runCycle,
    });

    controller.start(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(runCycle).not.toHaveBeenCalled();
    expect(controller.getScheduled()).toBe(false);
  });

  it('runs a cycle and reschedules itself using the configured interval', async () => {
    const runCycle = vi.fn(async () => undefined);
    const controller = createYouTubeRefreshSchedulerController({
      enabled: true,
      runIngestionWorker: true,
      intervalMinutes: 10,
      runCycle,
    });

    controller.start(100);
    await vi.advanceTimersByTimeAsync(100);

    expect(runCycle).toHaveBeenCalledTimes(1);
    expect(controller.getScheduled()).toBe(true);

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(runCycle).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOracleSubscriptionSchedulerController } from '../../server/services/oracleSubscriptionSchedulerController';

describe('oracle subscription scheduler controller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the cycle on the configured interval and reschedules after completion', async () => {
    vi.useFakeTimers();
    const runCycle = vi.fn(async () => undefined);
    const controller = createOracleSubscriptionSchedulerController({
      enabled: true,
      intervalMs: 5_000,
      runCycle,
    });

    controller.start(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runCycle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(runCycle).toHaveBeenCalledTimes(2);
  });

  it('does not schedule when disabled', async () => {
    vi.useFakeTimers();
    const runCycle = vi.fn(async () => undefined);
    const controller = createOracleSubscriptionSchedulerController({
      enabled: false,
      intervalMs: 5_000,
      runCycle,
    });

    controller.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(runCycle).not.toHaveBeenCalled();
  });
});

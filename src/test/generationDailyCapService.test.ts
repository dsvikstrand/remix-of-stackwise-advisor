import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGenerationDailyCapService,
  DailyGenerationCapReachedError,
} from '../../server/services/generationDailyCap';

function createDbMock(resultByFn: Record<string, { data: unknown; error: unknown }>) {
  return {
    rpc: vi.fn(async (fn: string) => {
      const result = resultByFn[fn];
      if (!result) {
        return { data: null, error: null };
      }
      return result;
    }),
  };
}

describe('generationDailyCap service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('increments usage under limit', async () => {
    const db = createDbMock({
      get_generation_plan_for_user: {
        data: [{ plan: 'free', daily_limit_override: null }],
        error: null,
      },
      consume_generation_daily_quota: {
        data: [{
          allowed: true,
          used_count: 1,
          remaining_count: 4,
          limit_count: 5,
          usage_day: '2026-03-05',
          reset_at: '2026-03-06T00:00:00.000Z',
        }],
        error: null,
      },
    });
    const service = createGenerationDailyCapService({
      enabled: true,
      freeLimit: 5,
      plusLimit: 25,
      resetHourUtc: 0,
      bypassUserIds: new Set(),
      failOpen: false,
    });

    const status = await service.consume({
      db,
      userId: '00000000-0000-0000-0000-000000000001',
      units: 1,
    });

    expect(status.used).toBe(1);
    expect(status.remaining).toBe(4);
    expect(status.limit).toBe(5);
  });

  it('blocks when cap is reached', async () => {
    const db = createDbMock({
      get_generation_plan_for_user: {
        data: [{ plan: 'free', daily_limit_override: null }],
        error: null,
      },
      consume_generation_daily_quota: {
        data: [{
          allowed: false,
          used_count: 5,
          remaining_count: 0,
          limit_count: 5,
          usage_day: '2026-03-05',
          reset_at: '2026-03-06T00:00:00.000Z',
        }],
        error: null,
      },
    });
    const service = createGenerationDailyCapService({
      enabled: true,
      freeLimit: 5,
      plusLimit: 25,
      resetHourUtc: 0,
      bypassUserIds: new Set(),
      failOpen: false,
    });

    await expect(
      service.consume({
        db,
        userId: '00000000-0000-0000-0000-000000000001',
        units: 1,
      }),
    ).rejects.toBeInstanceOf(DailyGenerationCapReachedError);
  });

  it('computes UTC midnight rollover by default', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-03-05T23:50:00.000Z'));
    const db = createDbMock({
      get_generation_plan_for_user: {
        data: [{ plan: 'free', daily_limit_override: null }],
        error: null,
      },
      get_generation_daily_quota_status: {
        data: [{
          used_count: 2,
          remaining_count: 3,
          limit_count: 5,
          usage_day: '2026-03-05',
          reset_at: '2026-03-06T00:00:00.000Z',
        }],
        error: null,
      },
    });
    const service = createGenerationDailyCapService({
      enabled: true,
      freeLimit: 5,
      plusLimit: 25,
      resetHourUtc: 0,
      bypassUserIds: new Set(),
      failOpen: false,
    });

    const status = await service.getStatus({
      db,
      userId: '00000000-0000-0000-0000-000000000001',
    });

    expect(status.usageDay).toBe('2026-03-05');
    expect(status.resetAt).toBe('2026-03-06T00:00:00.000Z');
  });

  it('supports custom reset-hour rollover', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-03-05T05:30:00.000Z'));
    const db = createDbMock({
      get_generation_plan_for_user: {
        data: [{ plan: 'free', daily_limit_override: null }],
        error: null,
      },
      get_generation_daily_quota_status: {
        data: [{
          used_count: 0,
          remaining_count: 5,
          limit_count: 5,
          usage_day: '2026-03-04',
          reset_at: '2026-03-05T06:00:00.000Z',
        }],
        error: null,
      },
    });
    const service = createGenerationDailyCapService({
      enabled: true,
      freeLimit: 5,
      plusLimit: 25,
      resetHourUtc: 6,
      bypassUserIds: new Set(),
      failOpen: false,
    });

    const status = await service.getStatus({
      db,
      userId: '00000000-0000-0000-0000-000000000001',
    });

    expect(status.usageDay).toBe('2026-03-04');
    expect(status.resetAt).toBe('2026-03-05T06:00:00.000Z');
  });

  it('bypasses enforcement for allowlisted users', async () => {
    const db = createDbMock({});
    const service = createGenerationDailyCapService({
      enabled: true,
      freeLimit: 5,
      plusLimit: 25,
      resetHourUtc: 0,
      bypassUserIds: new Set(['00000000-0000-0000-0000-0000000000aa']),
      failOpen: false,
    });

    const status = await service.consume({
      db,
      userId: '00000000-0000-0000-0000-0000000000aa',
      units: 1,
    });

    expect(status.bypass).toBe(true);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('uses plus limit for plus users', async () => {
    const db = createDbMock({
      get_generation_plan_for_user: {
        data: [{ plan: 'plus', daily_limit_override: null }],
        error: null,
      },
      consume_generation_daily_quota: {
        data: [{
          allowed: true,
          used_count: 4,
          remaining_count: 21,
          limit_count: 25,
          usage_day: '2026-03-05',
          reset_at: '2026-03-06T00:00:00.000Z',
        }],
        error: null,
      },
    });
    const service = createGenerationDailyCapService({
      enabled: true,
      freeLimit: 5,
      plusLimit: 25,
      resetHourUtc: 0,
      bypassUserIds: new Set(),
      failOpen: false,
    });

    const status = await service.consume({
      db,
      userId: '00000000-0000-0000-0000-0000000000bb',
      units: 1,
    });

    expect(status.plan).toBe('plus');
    expect(status.limit).toBe(25);
    expect(status.effectiveLimit).toBe(25);
  });

  it('bypasses cap for admin entitlement users', async () => {
    const db = createDbMock({
      get_generation_plan_for_user: {
        data: [{ plan: 'admin', daily_limit_override: null }],
        error: null,
      },
    });
    const service = createGenerationDailyCapService({
      enabled: true,
      freeLimit: 5,
      plusLimit: 25,
      resetHourUtc: 0,
      bypassUserIds: new Set(),
      failOpen: false,
    });

    const status = await service.consume({
      db,
      userId: '00000000-0000-0000-0000-0000000000cc',
      units: 1,
    });

    expect(status.plan).toBe('admin');
    expect(status.bypass).toBe(true);
    expect(status.effectiveLimit).toBeNull();
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith('get_generation_plan_for_user', {
      p_user_id: '00000000-0000-0000-0000-0000000000cc',
    });
  });
});

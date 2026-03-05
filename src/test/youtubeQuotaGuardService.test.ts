import { describe, expect, it } from 'vitest';
import { applyQuotaDecision } from '../../server/services/youtubeQuotaGuard';

describe('youtubeQuotaGuard service helpers', () => {
  it('allows and increments counters when under budget', () => {
    const nowMs = Date.parse('2026-03-05T10:00:00.000Z');
    const result = applyQuotaDecision({
      nowMs,
      state: {
        windowStartedAt: '2026-03-05T09:59:30.000Z',
        liveCallsWindow: 3,
        liveCallsDay: 100,
        dayStartedAt: '2026-03-05',
        cooldownUntil: null,
      },
      maxPerMinute: 60,
      maxPerDay: 20_000,
    });

    expect(result.decision.allowed).toBe(true);
    expect(result.nextState.liveCallsWindow).toBe(4);
    expect(result.nextState.liveCallsDay).toBe(101);
  });

  it('blocks when cooldown is active', () => {
    const nowMs = Date.parse('2026-03-05T10:00:00.000Z');
    const result = applyQuotaDecision({
      nowMs,
      state: {
        windowStartedAt: '2026-03-05T09:59:30.000Z',
        liveCallsWindow: 3,
        liveCallsDay: 100,
        dayStartedAt: '2026-03-05',
        cooldownUntil: '2026-03-05T10:05:00.000Z',
      },
      maxPerMinute: 60,
      maxPerDay: 20_000,
    });

    expect(result.decision.allowed).toBe(false);
    expect(result.decision.reason).toBe('cooldown');
    expect(result.decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('blocks when minute budget is exhausted', () => {
    const nowMs = Date.parse('2026-03-05T10:00:40.000Z');
    const result = applyQuotaDecision({
      nowMs,
      state: {
        windowStartedAt: '2026-03-05T10:00:00.000Z',
        liveCallsWindow: 60,
        liveCallsDay: 100,
        dayStartedAt: '2026-03-05',
        cooldownUntil: null,
      },
      maxPerMinute: 60,
      maxPerDay: 20_000,
    });

    expect(result.decision.allowed).toBe(false);
    expect(result.decision.reason).toBe('minute_budget');
    expect(result.decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets day counters on UTC day change', () => {
    const nowMs = Date.parse('2026-03-06T00:01:00.000Z');
    const result = applyQuotaDecision({
      nowMs,
      state: {
        windowStartedAt: '2026-03-05T23:59:30.000Z',
        liveCallsWindow: 20,
        liveCallsDay: 20_000,
        dayStartedAt: '2026-03-05',
        cooldownUntil: null,
      },
      maxPerMinute: 60,
      maxPerDay: 20_000,
    });

    expect(result.decision.allowed).toBe(true);
    expect(result.nextState.liveCallsDay).toBe(1);
    expect(result.nextState.dayStartedAt).toBe('2026-03-06');
  });
});

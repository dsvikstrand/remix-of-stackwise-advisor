type DbClient = any;

export type YouTubeQuotaBlockReason = 'cooldown' | 'minute_budget' | 'day_budget';

export type YouTubeQuotaDecision = {
  allowed: boolean;
  reason: YouTubeQuotaBlockReason | null;
  retryAfterSeconds: number | null;
};

type QuotaStateRow = {
  provider: string;
  window_started_at: string | null;
  live_calls_window: number;
  live_calls_day: number;
  day_started_at: string | null;
  cooldown_until: string | null;
};

function isMissingRelationError(error: unknown, relation: string) {
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const hay = `${String(e?.message || '')} ${String(e?.details || '')} ${String(e?.hint || '')}`.toLowerCase();
  const code = String(e?.code || '').trim().toUpperCase();
  if (code === '42P01' || code === 'PGRST205') {
    return hay.includes(relation.toLowerCase()) || hay.includes(relation.replace(/^public\./i, '').toLowerCase());
  }
  return (
    (hay.includes('does not exist') || hay.includes('could not find the table'))
    && (hay.includes(relation.toLowerCase()) || hay.includes(relation.replace(/^public\./i, '').toLowerCase()))
  );
}

function secondsUntil(targetMs: number, nowMs: number) {
  if (!Number.isFinite(targetMs) || targetMs <= nowMs) return 0;
  return Math.max(1, Math.ceil((targetMs - nowMs) / 1000));
}

export function applyQuotaDecision(input: {
  nowMs: number;
  state: {
    windowStartedAt: string | null;
    liveCallsWindow: number;
    liveCallsDay: number;
    dayStartedAt: string | null;
    cooldownUntil: string | null;
  };
  maxPerMinute: number;
  maxPerDay: number;
}) {
  const now = new Date(input.nowMs);
  const todayUtc = now.toISOString().slice(0, 10);
  const minuteMs = 60_000;
  const maxPerMinute = Math.max(1, Math.floor(Number(input.maxPerMinute) || 1));
  const maxPerDay = Math.max(1, Math.floor(Number(input.maxPerDay) || 1));

  let dayStartedAt = String(input.state.dayStartedAt || '').trim();
  let liveCallsDay = Math.max(0, Math.floor(Number(input.state.liveCallsDay) || 0));
  if (!dayStartedAt || dayStartedAt !== todayUtc) {
    dayStartedAt = todayUtc;
    liveCallsDay = 0;
  }

  let windowStartedAt = String(input.state.windowStartedAt || '').trim();
  let liveCallsWindow = Math.max(0, Math.floor(Number(input.state.liveCallsWindow) || 0));
  const windowStartedAtMs = Date.parse(windowStartedAt);
  if (!windowStartedAt || !Number.isFinite(windowStartedAtMs) || input.nowMs - windowStartedAtMs >= minuteMs) {
    windowStartedAt = now.toISOString();
    liveCallsWindow = 0;
  }

  const cooldownUntilRaw = String(input.state.cooldownUntil || '').trim();
  const cooldownUntilMs = Date.parse(cooldownUntilRaw);
  if (cooldownUntilRaw && Number.isFinite(cooldownUntilMs) && cooldownUntilMs > input.nowMs) {
    return {
      decision: {
        allowed: false,
        reason: 'cooldown' as const,
        retryAfterSeconds: secondsUntil(cooldownUntilMs, input.nowMs),
      },
      nextState: {
        windowStartedAt,
        liveCallsWindow,
        liveCallsDay,
        dayStartedAt,
      },
    };
  }

  if (liveCallsDay >= maxPerDay) {
    const nextDayMs = Date.parse(`${todayUtc}T23:59:59.999Z`) + 1;
    return {
      decision: {
        allowed: false,
        reason: 'day_budget' as const,
        retryAfterSeconds: secondsUntil(nextDayMs, input.nowMs),
      },
      nextState: {
        windowStartedAt,
        liveCallsWindow,
        liveCallsDay,
        dayStartedAt,
      },
    };
  }

  if (liveCallsWindow >= maxPerMinute) {
    const resetAtMs = Date.parse(windowStartedAt) + minuteMs;
    return {
      decision: {
        allowed: false,
        reason: 'minute_budget' as const,
        retryAfterSeconds: secondsUntil(resetAtMs, input.nowMs),
      },
      nextState: {
        windowStartedAt,
        liveCallsWindow,
        liveCallsDay,
        dayStartedAt,
      },
    };
  }

  return {
    decision: {
      allowed: true,
      reason: null,
      retryAfterSeconds: null,
    },
    nextState: {
      windowStartedAt,
      liveCallsWindow: liveCallsWindow + 1,
      liveCallsDay: liveCallsDay + 1,
      dayStartedAt,
    },
  };
}

export function createYouTubeQuotaGuardService(input?: {
  providerKey?: string;
}) {
  const providerKey = String(input?.providerKey || 'youtube_data_api').trim();
  const TABLE_NAME = 'youtube_quota_state';

  async function checkAndConsume(args: {
    db: DbClient | null;
    maxPerMinute: number;
    maxPerDay: number;
  }): Promise<YouTubeQuotaDecision> {
    if (!args.db) return { allowed: true, reason: null, retryAfterSeconds: null };

    const nowIso = new Date().toISOString();
    const upsertResult = await args.db
      .from(TABLE_NAME)
      .upsert({
        provider: providerKey,
        window_started_at: nowIso,
        live_calls_window: 0,
        live_calls_day: 0,
        day_started_at: nowIso.slice(0, 10),
        updated_at: nowIso,
      }, {
        onConflict: 'provider',
      });
    if (upsertResult.error && !isMissingRelationError(upsertResult.error, TABLE_NAME)) {
      throw upsertResult.error;
    }
    if (upsertResult.error && isMissingRelationError(upsertResult.error, TABLE_NAME)) {
      return { allowed: true, reason: null, retryAfterSeconds: null };
    }

    const { data, error } = await args.db
      .from(TABLE_NAME)
      .select('provider, window_started_at, live_calls_window, live_calls_day, day_started_at, cooldown_until')
      .eq('provider', providerKey)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error, TABLE_NAME)) {
        return { allowed: true, reason: null, retryAfterSeconds: null };
      }
      throw error;
    }
    if (!data) {
      return { allowed: true, reason: null, retryAfterSeconds: null };
    }

    const row = data as QuotaStateRow;
    const evaluated = applyQuotaDecision({
      nowMs: Date.now(),
      state: {
        windowStartedAt: row.window_started_at || null,
        liveCallsWindow: Number(row.live_calls_window || 0),
        liveCallsDay: Number(row.live_calls_day || 0),
        dayStartedAt: row.day_started_at || null,
        cooldownUntil: row.cooldown_until || null,
      },
      maxPerMinute: args.maxPerMinute,
      maxPerDay: args.maxPerDay,
    });

    const { error: updateError } = await args.db
      .from(TABLE_NAME)
      .update({
        window_started_at: evaluated.nextState.windowStartedAt,
        live_calls_window: evaluated.nextState.liveCallsWindow,
        live_calls_day: evaluated.nextState.liveCallsDay,
        day_started_at: evaluated.nextState.dayStartedAt,
        updated_at: new Date().toISOString(),
      })
      .eq('provider', providerKey);
    if (updateError && !isMissingRelationError(updateError, TABLE_NAME)) {
      throw updateError;
    }

    return evaluated.decision;
  }

  async function markQuotaLimited(args: {
    db: DbClient | null;
    statusCode: 403 | 429;
    cooldownSeconds: number;
  }) {
    if (!args.db) return;
    const cooldownSeconds = Math.max(1, Math.floor(Number(args.cooldownSeconds) || 1));
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + cooldownSeconds * 1000).toISOString();

    const updatePayload: Record<string, unknown> = {
      cooldown_until: cooldownUntil,
      updated_at: now.toISOString(),
    };
    if (args.statusCode === 403) {
      updatePayload.last_403_at = now.toISOString();
    } else {
      updatePayload.last_429_at = now.toISOString();
    }

    const { error } = await args.db
      .from(TABLE_NAME)
      .upsert({
        provider: providerKey,
        ...updatePayload,
      }, {
        onConflict: 'provider',
      });
    if (error && !isMissingRelationError(error, TABLE_NAME)) {
      throw error;
    }
  }

  return {
    checkAndConsume,
    markQuotaLimited,
  };
}

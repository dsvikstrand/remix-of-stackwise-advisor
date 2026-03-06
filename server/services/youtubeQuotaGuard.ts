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

type QuotaRpcRow = {
  allowed?: boolean | null;
  reason?: string | null;
  retry_after_seconds?: number | null;
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

function isMissingRpcError(error: unknown, rpcName: string) {
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const hay = `${String(e?.message || '')} ${String(e?.details || '')} ${String(e?.hint || '')}`.toLowerCase();
  const code = String(e?.code || '').trim().toUpperCase();
  if (code === '42883' || code === 'PGRST202') {
    return hay.includes(rpcName.toLowerCase()) || hay.includes('function');
  }
  return hay.includes(rpcName.toLowerCase()) && hay.includes('does not exist');
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
  const RPC_NAME = 'consume_youtube_quota_budget';

  async function checkAndConsume(args: {
    db: DbClient | null;
    maxPerMinute: number;
    maxPerDay: number;
  }): Promise<YouTubeQuotaDecision> {
    if (!args.db) return { allowed: true, reason: null, retryAfterSeconds: null };

    if (typeof args.db.rpc === 'function') {
      const { data, error } = await args.db.rpc(RPC_NAME, {
        p_provider: providerKey,
        p_max_per_minute: Math.max(1, Math.floor(Number(args.maxPerMinute) || 1)),
        p_max_per_day: Math.max(1, Math.floor(Number(args.maxPerDay) || 1)),
      });
      if (error) {
        if (isMissingRelationError(error, TABLE_NAME) || isMissingRpcError(error, RPC_NAME)) {
          return { allowed: true, reason: null, retryAfterSeconds: null };
        }
        throw error;
      }
      const row = (Array.isArray(data) ? data[0] : data) as QuotaRpcRow | null;
      if (!row || typeof row.allowed !== 'boolean') {
        return { allowed: true, reason: null, retryAfterSeconds: null };
      }
      const reason = String(row.reason || '').trim();
      return {
        allowed: row.allowed,
        reason: row.allowed ? null : (reason === 'cooldown' || reason === 'minute_budget' || reason === 'day_budget' ? reason : null),
        retryAfterSeconds: row.retry_after_seconds == null ? null : Math.max(1, Math.floor(Number(row.retry_after_seconds) || 0)),
      };
    }

    return { allowed: true, reason: null, retryAfterSeconds: null };
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

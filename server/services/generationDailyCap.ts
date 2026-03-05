type DbClient = any;

export const DAILY_GENERATION_CAP_ERROR_CODE = 'DAILY_GENERATION_CAP_REACHED' as const;

export class DailyGenerationCapReachedError extends Error {
  readonly code = DAILY_GENERATION_CAP_ERROR_CODE;
  readonly status = 429;
  readonly details: GenerationDailyCapStatus;

  constructor(details: GenerationDailyCapStatus, message = 'Daily generation cap reached.') {
    super(message);
    this.name = 'DailyGenerationCapReachedError';
    this.details = details;
  }
}

export type GenerationPlan = 'free' | 'plus' | 'admin';

export type GenerationDailyCapConfig = {
  enabled: boolean;
  freeLimit: number;
  plusLimit: number;
  resetHourUtc: number;
  bypassUserIds: Set<string>;
  failOpen: boolean;
};

export type GenerationDailyCapStatus = {
  enabled: boolean;
  plan: GenerationPlan;
  bypass: boolean;
  limit: number;
  effectiveLimit: number | null;
  used: number;
  remaining: number;
  usageDay: string;
  resetAt: string;
};

function parseBoolean(raw: unknown, fallback: boolean) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function clampInt(raw: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeUserId(raw: unknown) {
  return String(raw || '').trim().toLowerCase();
}

function parseUserIdCsv(raw: unknown) {
  return new Set(
    String(raw || '')
      .split(',')
      .map((value) => normalizeUserId(value))
      .filter(Boolean),
  );
}

function normalizePlan(raw: unknown): GenerationPlan {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'plus') return 'plus';
  return 'free';
}

function isMissingRelationOrFunctionError(error: unknown, relationOrFn: string) {
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const code = String(e?.code || '').trim().toUpperCase();
  const hay = `${String(e?.message || '')} ${String(e?.details || '')} ${String(e?.hint || '')}`.toLowerCase();
  const target = relationOrFn.toLowerCase();
  if (code === '42P01' || code === '42883' || code === 'PGRST205') {
    return hay.includes(target);
  }
  return (
    (hay.includes('does not exist') || hay.includes('could not find the table'))
    && hay.includes(target)
  );
}

function toIsoDate(value: unknown) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) return new Date().toISOString().slice(0, 10);
  return new Date(parsed).toISOString().slice(0, 10);
}

function computeWindow(nowMs: number, resetHourUtc: number) {
  const now = new Date(nowMs);
  const currentHour = now.getUTCHours();
  const usageBase = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
  if (currentHour < resetHourUtc) {
    usageBase.setUTCDate(usageBase.getUTCDate() - 1);
  }
  const usageDay = usageBase.toISOString().slice(0, 10);
  const reset = new Date(Date.UTC(
    usageBase.getUTCFullYear(),
    usageBase.getUTCMonth(),
    usageBase.getUTCDate(),
    resetHourUtc,
    0,
    0,
    0,
  ));
  reset.setUTCDate(reset.getUTCDate() + 1);
  return {
    usageDay,
    resetAt: reset.toISOString(),
  };
}

function toStatus(input: {
  enabled: boolean;
  plan: GenerationPlan;
  bypass: boolean;
  limit: number;
  effectiveLimit?: number | null;
  used: number;
  usageDay: string;
  resetAt: string;
}): GenerationDailyCapStatus {
  const limit = Math.max(0, Math.floor(Number(input.limit || 0)));
  const used = Math.max(0, Math.floor(Number(input.used || 0)));
  const effectiveLimitRaw = input.effectiveLimit;
  const effectiveLimit = effectiveLimitRaw == null
    ? null
    : Math.max(0, Math.floor(Number(effectiveLimitRaw || 0)));
  return {
    enabled: input.enabled,
    plan: input.plan,
    bypass: input.bypass,
    limit,
    effectiveLimit,
    used,
    remaining: effectiveLimit == null ? 0 : Math.max(0, effectiveLimit - used),
    usageDay: toIsoDate(input.usageDay),
    resetAt: String(input.resetAt || new Date().toISOString()),
  };
}

function pickRpcRow(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === 'object') return first as Record<string, unknown>;
    return null;
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return null;
}

function extractStatusFromRpcRow(
  row: Record<string, unknown> | null,
  fallback: {
    enabled: boolean;
    plan: GenerationPlan;
    bypass: boolean;
    limit: number;
    effectiveLimit?: number | null;
    usageDay: string;
    resetAt: string;
  },
) {
  const used = Number(row?.used_count ?? 0);
  return toStatus({
    enabled: fallback.enabled,
    plan: fallback.plan,
    bypass: fallback.bypass,
    limit: Number(row?.limit_count ?? fallback.limit),
    effectiveLimit: fallback.effectiveLimit ?? Number(row?.limit_count ?? fallback.limit),
    used: Number.isFinite(used) ? used : 0,
    usageDay: String(row?.usage_day || fallback.usageDay),
    resetAt: String(row?.reset_at || fallback.resetAt),
  });
}

export function readGenerationDailyCapConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GenerationDailyCapConfig {
  return {
    enabled: parseBoolean(env.GENERATION_DAILY_CAP_ENABLED, true),
    freeLimit: clampInt(env.GENERATION_DAILY_CAP_FREE_LIMIT, 5, 1, 10_000),
    plusLimit: clampInt(env.GENERATION_DAILY_CAP_PLUS_LIMIT, 25, 1, 50_000),
    resetHourUtc: clampInt(env.GENERATION_DAILY_CAP_RESET_HOUR_UTC, 0, 0, 23),
    bypassUserIds: parseUserIdCsv(env.GENERATION_DAILY_CAP_BYPASS_USER_IDS),
    failOpen: parseBoolean(env.GENERATION_DAILY_CAP_FAIL_OPEN, false),
  };
}

export function createGenerationDailyCapService(config: GenerationDailyCapConfig) {
  function resolveLimitForPlan(plan: GenerationPlan, override: number | null) {
    if (Number.isFinite(override)) {
      return Math.max(0, Math.floor(Number(override)));
    }
    if (plan === 'plus') return config.plusLimit;
    return config.freeLimit;
  }

  function isBypassUser(userId: string) {
    const normalized = normalizeUserId(userId);
    return normalized && config.bypassUserIds.has(normalized);
  }

  async function resolveEntitlement(input: {
    db: DbClient | null;
    userId: string;
  }) {
    const now = computeWindow(Date.now(), config.resetHourUtc);
    if (isBypassUser(input.userId)) {
      return {
        enabled: config.enabled,
        plan: 'free' as GenerationPlan,
        bypass: true,
        limit: config.freeLimit,
        effectiveLimit: null as number | null,
        usageDay: now.usageDay,
        resetAt: now.resetAt,
      };
    }

    if (!input.db) {
      if (config.failOpen) {
        return {
          enabled: config.enabled,
          plan: 'free' as GenerationPlan,
          bypass: true,
          limit: config.freeLimit,
          effectiveLimit: null as number | null,
          usageDay: now.usageDay,
          resetAt: now.resetAt,
        };
      }
      throw new Error('DAILY_CAP_DB_UNAVAILABLE');
    }

    const { data, error } = await input.db.rpc('get_generation_plan_for_user', {
      p_user_id: input.userId,
    });
    if (error) {
      if (
        config.failOpen
        && (
          isMissingRelationOrFunctionError(error, 'user_generation_entitlements')
          || isMissingRelationOrFunctionError(error, 'get_generation_plan_for_user')
        )
      ) {
        return {
          enabled: config.enabled,
          plan: 'free' as GenerationPlan,
          bypass: true,
          limit: config.freeLimit,
          effectiveLimit: null as number | null,
          usageDay: now.usageDay,
          resetAt: now.resetAt,
        };
      }
      throw error;
    }

    const row = pickRpcRow(data);
    const plan = normalizePlan(row?.plan);
    const overrideValue = row?.daily_limit_override;
    const overrideRaw = (
      overrideValue === null
      || overrideValue === undefined
      || String(overrideValue).trim() === ''
    )
      ? NaN
      : Number(overrideValue);
    const override = Number.isFinite(overrideRaw) ? Math.max(0, Math.floor(overrideRaw)) : null;
    const bypass = Boolean(isBypassUser(input.userId) || plan === 'admin');
    const limit = resolveLimitForPlan(plan, override);
    const effectiveLimit = bypass ? null : limit;
    return {
      enabled: config.enabled,
      plan,
      bypass,
      limit,
      effectiveLimit,
      usageDay: now.usageDay,
      resetAt: now.resetAt,
    };
  }

  async function getStatus(input: {
    db: DbClient | null;
    userId: string;
  }): Promise<GenerationDailyCapStatus> {
    const now = computeWindow(Date.now(), config.resetHourUtc);
    if (!config.enabled) {
      return toStatus({
        enabled: config.enabled,
        bypass: true,
        plan: 'free',
        limit: config.freeLimit,
        effectiveLimit: null,
        used: 0,
        usageDay: now.usageDay,
        resetAt: now.resetAt,
      });
    }

    const entitlement = await resolveEntitlement(input);
    if (entitlement.bypass) {
      return toStatus({
        enabled: entitlement.enabled,
        bypass: entitlement.bypass,
        plan: entitlement.plan,
        limit: entitlement.limit,
        effectiveLimit: entitlement.effectiveLimit,
        used: 0,
        usageDay: entitlement.usageDay,
        resetAt: entitlement.resetAt,
      });
    }

    const { data, error } = await input.db.rpc('get_generation_daily_quota_status', {
      p_user_id: input.userId,
      p_limit: entitlement.limit,
      p_reset_hour_utc: config.resetHourUtc,
    });
    if (error) {
      if (
        config.failOpen
        && (
          isMissingRelationOrFunctionError(error, 'user_generation_daily_usage')
          || isMissingRelationOrFunctionError(error, 'get_generation_daily_quota_status')
        )
      ) {
        return toStatus({
          enabled: config.enabled,
          bypass: true,
          plan: entitlement.plan,
          limit: config.freeLimit,
          effectiveLimit: null,
          used: 0,
          usageDay: entitlement.usageDay,
          resetAt: entitlement.resetAt,
        });
      }
      throw error;
    }

    return extractStatusFromRpcRow(pickRpcRow(data), {
      enabled: config.enabled,
      plan: entitlement.plan,
      bypass: false,
      limit: entitlement.limit,
      effectiveLimit: entitlement.effectiveLimit,
      usageDay: entitlement.usageDay,
      resetAt: entitlement.resetAt,
    });
  }

  async function consume(input: {
    db: DbClient | null;
    userId: string;
    units?: number;
  }): Promise<GenerationDailyCapStatus> {
    const now = computeWindow(Date.now(), config.resetHourUtc);
    const units = clampInt(input.units, 1, 1, 1000);

    if (!config.enabled) {
      return toStatus({
        enabled: config.enabled,
        bypass: true,
        plan: 'free',
        limit: config.freeLimit,
        effectiveLimit: null,
        used: 0,
        usageDay: now.usageDay,
        resetAt: now.resetAt,
      });
    }

    const entitlement = await resolveEntitlement(input);
    if (entitlement.bypass) {
      return toStatus({
        enabled: entitlement.enabled,
        bypass: entitlement.bypass,
        plan: entitlement.plan,
        limit: entitlement.limit,
        effectiveLimit: entitlement.effectiveLimit,
        used: 0,
        usageDay: entitlement.usageDay,
        resetAt: entitlement.resetAt,
      });
    }

    const { data, error } = await input.db.rpc('consume_generation_daily_quota', {
      p_user_id: input.userId,
      p_units: units,
      p_limit: entitlement.limit,
      p_reset_hour_utc: config.resetHourUtc,
    });
    if (error) {
      if (
        config.failOpen
        && (
          isMissingRelationOrFunctionError(error, 'user_generation_daily_usage')
          || isMissingRelationOrFunctionError(error, 'consume_generation_daily_quota')
        )
      ) {
        return toStatus({
          enabled: config.enabled,
          bypass: true,
          plan: entitlement.plan,
          limit: config.freeLimit,
          effectiveLimit: null,
          used: 0,
          usageDay: entitlement.usageDay,
          resetAt: entitlement.resetAt,
        });
      }
      throw error;
    }

    const row = pickRpcRow(data);
    const status = extractStatusFromRpcRow(row, {
      enabled: config.enabled,
      plan: entitlement.plan,
      bypass: false,
      limit: entitlement.limit,
      effectiveLimit: entitlement.effectiveLimit,
      usageDay: entitlement.usageDay,
      resetAt: entitlement.resetAt,
    });
    const allowed = Boolean(row?.allowed);
    if (!allowed) {
      throw new DailyGenerationCapReachedError(
        status,
        `Daily generation cap reached (${status.used}/${status.limit}).`,
      );
    }
    return status;
  }

  return {
    config,
    isBypassUser,
    getStatus,
    consume,
  };
}

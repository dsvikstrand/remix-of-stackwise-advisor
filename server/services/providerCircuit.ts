import type { SupabaseClient } from '@supabase/supabase-js';

type DbClient = SupabaseClient<any, 'public', any>;

type ProviderCircuitState = 'closed' | 'open' | 'half_open';

type ProviderCircuitRow = {
  provider_key: string;
  state: ProviderCircuitState;
  opened_at: string | null;
  cooldown_until: string | null;
  failure_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type ProviderCircuitOracleWriteAdapter = {
  upsertRow: (input: {
    providerKey: string;
    patch: Partial<ProviderCircuitRow>;
    nowIso?: string;
  }) => Promise<ProviderCircuitRow | null>;
};

const PROVIDER_CIRCUIT_FAILURE_THRESHOLD = clampInt(
  process.env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD,
  5,
  1,
  100,
);
const PROVIDER_CIRCUIT_COOLDOWN_SECONDS = clampInt(
  process.env.PROVIDER_CIRCUIT_COOLDOWN_SECONDS,
  60,
  5,
  3600,
);
const PROVIDER_FAIL_FAST_MODE = /^(1|true|on)$/i.test(String(process.env.PROVIDER_FAIL_FAST_MODE || 'false'));
let providerCircuitOracleWriteAdapter: ProviderCircuitOracleWriteAdapter | null = null;

function clampInt(raw: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parseIsoMs(value: string | null | undefined) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

async function getCircuitRow(db: DbClient | null | undefined, providerKey: string) {
  if (!db) return null;
  const { data, error } = await db
    .from('provider_circuit_state')
    .select('provider_key, state, opened_at, cooldown_until, failure_count, last_error, created_at, updated_at')
    .eq('provider_key', providerKey)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as ProviderCircuitRow | null;
}

async function upsertCircuitRow(
  db: DbClient | null | undefined,
  providerKey: string,
  patch: Partial<ProviderCircuitRow>,
) {
  const nowIso = new Date().toISOString();
  if (providerCircuitOracleWriteAdapter) {
    return providerCircuitOracleWriteAdapter.upsertRow({
      providerKey,
      patch,
      nowIso,
    });
  }
  if (!db) return null;
  const { data, error } = await db
    .from('provider_circuit_state')
    .upsert(
      {
        provider_key: providerKey,
        state: patch.state || 'closed',
        opened_at: patch.opened_at ?? null,
        cooldown_until: patch.cooldown_until ?? null,
        failure_count: Number.isFinite(Number(patch.failure_count)) ? Number(patch.failure_count) : 0,
        last_error: patch.last_error ?? null,
        updated_at: nowIso,
      },
      { onConflict: 'provider_key' },
    )
    .select('provider_key, state, opened_at, cooldown_until, failure_count, last_error, created_at, updated_at')
    .single();
  if (error) throw error;
  return data as ProviderCircuitRow;
}

export class ProviderCircuitOpenError extends Error {
  code: 'PROVIDER_DEGRADED';

  constructor(message: string) {
    super(message);
    this.code = 'PROVIDER_DEGRADED';
  }
}

export function configureProviderCircuitOracleWriteAdapter(adapter: ProviderCircuitOracleWriteAdapter | null) {
  providerCircuitOracleWriteAdapter = adapter;
}

export function providerFailFastModeEnabled() {
  return PROVIDER_FAIL_FAST_MODE;
}

export async function assertProviderAvailable(
  db: DbClient | null | undefined,
  providerKey: string,
) {
  if (!PROVIDER_FAIL_FAST_MODE || !db) return;
  const row = await getCircuitRow(db, providerKey);
  if (!row) return;

  if (row.state !== 'open') return;

  const nowMs = Date.now();
  const cooldownUntilMs = parseIsoMs(row.cooldown_until);
  if (cooldownUntilMs != null && cooldownUntilMs > nowMs) {
    const seconds = Math.max(1, Math.ceil((cooldownUntilMs - nowMs) / 1000));
    throw new ProviderCircuitOpenError(
      `Provider temporarily degraded. Retry in ~${seconds}s.`,
    );
  }

  await upsertCircuitRow(db, providerKey, {
    state: 'half_open',
    cooldown_until: null,
  });
}

export async function recordProviderSuccess(
  db: DbClient | null | undefined,
  providerKey: string,
) {
  if (!db) return;
  await upsertCircuitRow(db, providerKey, {
    state: 'closed',
    opened_at: null,
    cooldown_until: null,
    failure_count: 0,
    last_error: null,
  });
}

export async function recordProviderFailure(
  db: DbClient | null | undefined,
  providerKey: string,
  errorMessage: string,
) {
  if (!db) return;
  const now = new Date();
  const nowIso = now.toISOString();
  const existing = await getCircuitRow(db, providerKey);
  const nextFailureCount = (existing?.failure_count || 0) + 1;
  const shouldOpen = nextFailureCount >= PROVIDER_CIRCUIT_FAILURE_THRESHOLD;
  const cooldownUntilIso = shouldOpen
    ? new Date(now.getTime() + PROVIDER_CIRCUIT_COOLDOWN_SECONDS * 1000).toISOString()
    : null;

  await upsertCircuitRow(db, providerKey, {
    state: shouldOpen ? 'open' : (existing?.state || 'closed'),
    opened_at: shouldOpen ? nowIso : existing?.opened_at || null,
    cooldown_until: cooldownUntilIso,
    failure_count: nextFailureCount,
    last_error: String(errorMessage || '').slice(0, 500),
  });
}

export async function getProviderCircuitSnapshot(
  db: DbClient | null | undefined,
  providerKey: string,
) {
  return getCircuitRow(db, providerKey);
}

import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { normalizeRequiredIso, normalizeStringOrNull } from './oracleValueNormalization';

export type OracleProviderCircuitState = 'closed' | 'open' | 'half_open';

export type OracleProviderCircuitRow = {
  provider_key: string;
  state: OracleProviderCircuitState;
  opened_at: string | null;
  cooldown_until: string | null;
  failure_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function normalizeProviderCircuitState(value: unknown): OracleProviderCircuitState {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'open') return 'open';
  if (normalized === 'half_open') return 'half_open';
  return 'closed';
}

function normalizeFailureCount(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

function mapProviderCircuitRow(
  row: Record<string, unknown>,
  fallbackIso?: string,
): OracleProviderCircuitRow {
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    provider_key: normalizeRequiredString(row.provider_key),
    state: normalizeProviderCircuitState(row.state),
    opened_at: normalizeStringOrNull(row.opened_at),
    cooldown_until: normalizeStringOrNull(row.cooldown_until),
    failure_count: normalizeFailureCount(row.failure_count),
    last_error: normalizeStringOrNull(row.last_error),
    created_at: createdAt,
    updated_at: normalizeRequiredIso(row.updated_at, createdAt),
  };
}

export async function getOracleProviderCircuitRow(input: {
  controlDb: OracleControlPlaneDb;
  providerKey: string;
}) {
  const providerKey = normalizeRequiredString(input.providerKey);
  if (!providerKey) return null;

  const row = await input.controlDb.db
    .selectFrom('provider_circuit_state')
    .selectAll()
    .where('provider_key', '=', providerKey)
    .executeTakeFirst();

  return row
    ? mapProviderCircuitRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function upsertOracleProviderCircuitRow(input: {
  controlDb: OracleControlPlaneDb;
  providerKey: string;
  patch: Partial<OracleProviderCircuitRow>;
  nowIso?: string;
}) {
  const providerKey = normalizeRequiredString(input.providerKey);
  if (!providerKey) return null;

  const nowIso = normalizeRequiredIso(input.nowIso);
  const current = await getOracleProviderCircuitRow({
    controlDb: input.controlDb,
    providerKey,
  });

  const nextRow = mapProviderCircuitRow({
    provider_key: providerKey,
    state: input.patch.state ?? current?.state ?? 'closed',
    opened_at: input.patch.opened_at !== undefined ? input.patch.opened_at : (current?.opened_at ?? null),
    cooldown_until: input.patch.cooldown_until !== undefined ? input.patch.cooldown_until : (current?.cooldown_until ?? null),
    failure_count: input.patch.failure_count !== undefined ? input.patch.failure_count : (current?.failure_count ?? 0),
    last_error: input.patch.last_error !== undefined ? input.patch.last_error : (current?.last_error ?? null),
    created_at: current?.created_at ?? nowIso,
    updated_at: nowIso,
  }, nowIso);

  await input.controlDb.db
    .insertInto('provider_circuit_state')
    .values(nextRow)
    .onConflict((oc) => oc.column('provider_key').doUpdateSet({
      state: nextRow.state,
      opened_at: nextRow.opened_at,
      cooldown_until: nextRow.cooldown_until,
      failure_count: nextRow.failure_count,
      last_error: nextRow.last_error,
      updated_at: nextRow.updated_at,
    }))
    .execute();

  return nextRow;
}

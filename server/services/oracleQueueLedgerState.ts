import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import type { IngestionJobRow } from './ingestionQueue';

type DbClient = SupabaseClient<any, 'public', any>;

type OracleQueueLedgerStateRow = {
  id: string;
  trigger: string;
  scope: string;
  status: string;
  requested_by_user_id: string | null;
  subscription_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  worker_id: string | null;
  trace_id: string | null;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
};

const QUEUE_LEDGER_SELECT = [
  'id',
  'trigger',
  'scope',
  'status',
  'requested_by_user_id',
  'subscription_id',
  'started_at',
  'finished_at',
  'processed_count',
  'inserted_count',
  'skipped_count',
  'error_code',
  'error_message',
  'attempts',
  'max_attempts',
  'next_run_at',
  'lease_expires_at',
  'last_heartbeat_at',
  'worker_id',
  'trace_id',
  'payload',
  'created_at',
  'updated_at',
].join(', ');

function normalizeIsoOrNull(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeRequiredIso(value: string | null | undefined, fallbackIso: string) {
  return normalizeIsoOrNull(value) || fallbackIso;
}

function normalizeMaybeString(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeStatus(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || 'queued';
}

function normalizeInt(value: unknown, fallback = 0, min = 0, max = 10_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parsePayloadJson(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function mapJobToStateRow(job: IngestionJobRow, nowIso?: string): OracleQueueLedgerStateRow {
  const createdAt = normalizeRequiredIso(job.created_at, nowIso || new Date().toISOString());
  const updatedAt = normalizeRequiredIso(job.updated_at, nowIso || createdAt);
  const nextRunAt = normalizeRequiredIso(job.next_run_at, updatedAt);
  return {
    id: String(job.id || '').trim(),
    trigger: String(job.trigger || '').trim() || 'service_cron',
    scope: String(job.scope || '').trim(),
    status: normalizeStatus(job.status),
    requested_by_user_id: normalizeMaybeString(job.requested_by_user_id),
    subscription_id: normalizeMaybeString(job.subscription_id),
    started_at: normalizeIsoOrNull(job.started_at),
    finished_at: normalizeIsoOrNull(job.finished_at),
    processed_count: normalizeInt(job.processed_count),
    inserted_count: normalizeInt(job.inserted_count),
    skipped_count: normalizeInt(job.skipped_count),
    error_code: normalizeMaybeString(job.error_code),
    error_message: normalizeMaybeString(job.error_message),
    attempts: normalizeInt(job.attempts),
    max_attempts: normalizeInt(job.max_attempts, 3, 1, 100),
    next_run_at: nextRunAt,
    lease_expires_at: normalizeIsoOrNull(job.lease_expires_at),
    last_heartbeat_at: normalizeIsoOrNull(job.last_heartbeat_at),
    worker_id: normalizeMaybeString(job.worker_id),
    trace_id: normalizeMaybeString(job.trace_id),
    payload_json: job.payload == null ? null : JSON.stringify(job.payload),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function mapStateRowToJob(row: OracleQueueLedgerStateRow): IngestionJobRow {
  return {
    id: row.id,
    trigger: row.trigger,
    scope: row.scope,
    status: row.status,
    requested_by_user_id: row.requested_by_user_id,
    subscription_id: row.subscription_id,
    started_at: row.started_at,
    finished_at: row.finished_at,
    processed_count: normalizeInt(row.processed_count),
    inserted_count: normalizeInt(row.inserted_count),
    skipped_count: normalizeInt(row.skipped_count),
    error_code: row.error_code,
    error_message: row.error_message,
    attempts: normalizeInt(row.attempts),
    max_attempts: normalizeInt(row.max_attempts, 3, 1, 100),
    next_run_at: row.next_run_at,
    lease_expires_at: row.lease_expires_at,
    last_heartbeat_at: row.last_heartbeat_at,
    worker_id: row.worker_id,
    trace_id: row.trace_id,
    payload: parsePayloadJson(row.payload_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapSupabaseRowToIngestionJob(row: Record<string, unknown>): IngestionJobRow {
  return {
    id: String(row.id || '').trim(),
    trigger: String(row.trigger || '').trim(),
    scope: String(row.scope || '').trim(),
    status: String(row.status || '').trim(),
    requested_by_user_id: normalizeMaybeString(row.requested_by_user_id),
    subscription_id: normalizeMaybeString(row.subscription_id),
    started_at: normalizeIsoOrNull(row.started_at as string | null | undefined),
    finished_at: normalizeIsoOrNull(row.finished_at as string | null | undefined),
    processed_count: normalizeInt(row.processed_count),
    inserted_count: normalizeInt(row.inserted_count),
    skipped_count: normalizeInt(row.skipped_count),
    error_code: normalizeMaybeString(row.error_code),
    error_message: normalizeMaybeString(row.error_message),
    attempts: normalizeInt(row.attempts),
    max_attempts: normalizeInt(row.max_attempts, 3, 1, 100),
    next_run_at: normalizeRequiredIso(row.next_run_at as string | null | undefined, new Date().toISOString()),
    lease_expires_at: normalizeIsoOrNull(row.lease_expires_at as string | null | undefined),
    last_heartbeat_at: normalizeIsoOrNull(row.last_heartbeat_at as string | null | undefined),
    worker_id: normalizeMaybeString(row.worker_id),
    trace_id: normalizeMaybeString(row.trace_id),
    payload: row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? row.payload as Record<string, unknown>
      : null,
    created_at: normalizeRequiredIso(row.created_at as string | null | undefined, new Date().toISOString()),
    updated_at: normalizeRequiredIso(row.updated_at as string | null | undefined, new Date().toISOString()),
  };
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export function buildOracleQueueLedgerJobFromInsertValues(input: {
  values: Record<string, unknown>;
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const createdAt = normalizeRequiredIso(input.values.created_at as string | null | undefined, nowIso);
  const updatedAt = normalizeRequiredIso(input.values.updated_at as string | null | undefined, createdAt);
  return {
    id: String(input.values.id || '').trim() || randomUUID(),
    trigger: String(input.values.trigger || '').trim() || 'service_cron',
    scope: String(input.values.scope || '').trim(),
    status: normalizeStatus(input.values.status),
    requested_by_user_id: normalizeMaybeString(input.values.requested_by_user_id),
    subscription_id: normalizeMaybeString(input.values.subscription_id),
    started_at: normalizeIsoOrNull(input.values.started_at as string | null | undefined),
    finished_at: normalizeIsoOrNull(input.values.finished_at as string | null | undefined),
    processed_count: normalizeInt(input.values.processed_count),
    inserted_count: normalizeInt(input.values.inserted_count),
    skipped_count: normalizeInt(input.values.skipped_count),
    error_code: normalizeMaybeString(input.values.error_code),
    error_message: normalizeMaybeString(input.values.error_message),
    attempts: normalizeInt(input.values.attempts),
    max_attempts: normalizeInt(input.values.max_attempts, 3, 1, 100),
    next_run_at: normalizeRequiredIso(input.values.next_run_at as string | null | undefined, nowIso),
    lease_expires_at: normalizeIsoOrNull(input.values.lease_expires_at as string | null | undefined),
    last_heartbeat_at: normalizeIsoOrNull(input.values.last_heartbeat_at as string | null | undefined),
    worker_id: normalizeMaybeString(input.values.worker_id),
    trace_id: normalizeMaybeString(input.values.trace_id),
    payload: input.values.payload && typeof input.values.payload === 'object' && !Array.isArray(input.values.payload)
      ? input.values.payload as Record<string, unknown>
      : null,
    created_at: createdAt,
    updated_at: updatedAt,
  } satisfies IngestionJobRow;
}

export async function upsertOracleQueueLedgerRow(input: {
  controlDb: OracleControlPlaneDb;
  job: IngestionJobRow;
  nowIso?: string;
}) {
  const row = mapJobToStateRow(input.job, input.nowIso);
  if (!row.id || !row.scope) return null;

  await input.controlDb.db
    .insertInto('queue_ledger_state')
    .values(row)
    .onConflict((oc) => oc.column('id').doUpdateSet(row))
    .execute();

  return mapStateRowToJob(row);
}

export async function upsertOracleQueueLedgerRows(input: {
  controlDb: OracleControlPlaneDb;
  jobs: IngestionJobRow[];
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const rows = input.jobs
    .map((job) => mapJobToStateRow(job, nowIso))
    .filter((row) => Boolean(row.id && row.scope));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('queue_ledger_state')
        .values(row)
        .onConflict((oc) => oc.column('id').doUpdateSet(row))
        .execute();
    }
  }

  return rows.map(mapStateRowToJob);
}

export async function deleteOracleQueueLedgerJob(input: {
  controlDb: OracleControlPlaneDb;
  jobId: string;
}) {
  const jobId = String(input.jobId || '').trim();
  if (!jobId) return;
  await input.controlDb.db
    .deleteFrom('queue_ledger_state')
    .where('id', '=', jobId)
    .execute();
}

export async function syncOracleQueueLedgerFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  recentLimit: number;
  nowIso?: string;
}) {
  const recentLimit = Math.max(50, Math.floor(Number(input.recentLimit) || 0));
  const [activeRowsResult, recentRowsResult] = await Promise.all([
    input.db
      .from('ingestion_jobs')
      .select(QUEUE_LEDGER_SELECT)
      .in('status', ['queued', 'running']),
    input.db
      .from('ingestion_jobs')
      .select(QUEUE_LEDGER_SELECT)
      .order('created_at', { ascending: false })
      .limit(recentLimit),
  ]);

  if (activeRowsResult.error) throw activeRowsResult.error;
  if (recentRowsResult.error) throw recentRowsResult.error;

  const merged = new Map<string, IngestionJobRow>();
  for (const row of recentRowsResult.data || []) {
    const normalized = mapSupabaseRowToIngestionJob(row as Record<string, unknown>);
    if (normalized.id) merged.set(normalized.id, normalized);
  }
  for (const row of activeRowsResult.data || []) {
    const normalized = mapSupabaseRowToIngestionJob(row as Record<string, unknown>);
    if (normalized.id) merged.set(normalized.id, normalized);
  }

  const rows = [...merged.values()];
  await input.controlDb.db.deleteFrom('queue_ledger_state').execute();
  await upsertOracleQueueLedgerRows({
    controlDb: input.controlDb,
    jobs: rows,
    nowIso: input.nowIso,
  });

  return {
    rowCount: rows.length,
    activeCount: rows.filter((row) => row.status === 'queued' || row.status === 'running').length,
  };
}

export async function readOracleQueueLedgerBootstrapSummary(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const [rowCount, activeCount] = await Promise.all([
    countOracleQueueLedgerJobs({
      controlDb: input.controlDb,
    }),
    countOracleQueueLedgerJobs({
      controlDb: input.controlDb,
      statuses: ['queued', 'running'],
    }),
  ]);

  return {
    rowCount,
    activeCount,
  };
}

export async function getOracleLatestQueueJobForScope(input: {
  controlDb: OracleControlPlaneDb;
  scope: string;
}) {
  const scope = String(input.scope || '').trim();
  if (!scope) return null;

  const row = await input.controlDb.db
    .selectFrom('queue_ledger_state')
    .selectAll()
    .where('scope', '=', scope)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();

  return row ? mapStateRowToJob(row as OracleQueueLedgerStateRow) : null;
}

export async function getOracleLatestQueueJob(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const row = await input.controlDb.db
    .selectFrom('queue_ledger_state')
    .selectAll()
    .orderBy('created_at', 'desc')
    .executeTakeFirst();

  return row ? mapStateRowToJob(row as OracleQueueLedgerStateRow) : null;
}

export async function countOracleQueueLedgerJobs(input: {
  controlDb: OracleControlPlaneDb;
  scope?: string;
  scopes?: readonly string[];
  userId?: string;
  statuses?: readonly string[];
}) {
  const scope = String(input.scope || '').trim();
  const scopes = [...new Set(
    (Array.isArray(input.scopes) ? input.scopes : [])
      .map((candidate) => String(candidate || '').trim())
      .filter(Boolean),
  )];
  const userId = String(input.userId || '').trim();
  const statuses = [...new Set(
    (Array.isArray(input.statuses) ? input.statuses : [])
      .map((status) => String(status || '').trim())
      .filter(Boolean),
  )];

  let query = input.controlDb.db
    .selectFrom('queue_ledger_state')
    .select(({ fn }) => fn.count<number>('id').as('count'));

  if (scope) {
    query = query.where('scope', '=', scope);
  } else if (scopes.length > 0) {
    query = query.where('scope', 'in', scopes);
  }

  if (userId) {
    query = query.where('requested_by_user_id', '=', userId);
  }

  if (statuses.length > 0) {
    query = query.where('status', 'in', statuses);
  }

  const row = await query.executeTakeFirst();
  return Math.max(0, Number(row?.count || 0));
}

export async function listOracleQueueLedgerJobs(input: {
  controlDb: OracleControlPlaneDb;
  scope?: string;
  scopes?: readonly string[];
  userId?: string;
  jobIds?: readonly string[];
  statuses?: readonly string[];
  startedBeforeIso?: string | null;
  limit?: number;
  orderBy?: 'created_desc' | 'next_run_asc' | 'started_asc';
}) {
  const scope = String(input.scope || '').trim();
  const scopes = [...new Set(
    (Array.isArray(input.scopes) ? input.scopes : [])
      .map((candidate) => String(candidate || '').trim())
      .filter(Boolean),
  )];
  const userId = String(input.userId || '').trim();
  const jobIds = [...new Set(
    (Array.isArray(input.jobIds) ? input.jobIds : [])
      .map((jobId) => String(jobId || '').trim())
      .filter(Boolean),
  )];
  const statuses = [...new Set(
    (Array.isArray(input.statuses) ? input.statuses : [])
      .map((status) => String(status || '').trim())
      .filter(Boolean),
  )];
  const startedBeforeIso = normalizeIsoOrNull(input.startedBeforeIso);
  const limit = Math.max(1, Math.floor(Number(input.limit) || 1000));
  const orderBy = input.orderBy || 'created_desc';

  let query = input.controlDb.db
    .selectFrom('queue_ledger_state')
    .selectAll();

  if (scope) {
    query = query.where('scope', '=', scope);
  } else if (scopes.length > 0) {
    query = query.where('scope', 'in', scopes);
  }

  if (userId) {
    query = query.where('requested_by_user_id', '=', userId);
  }

  if (jobIds.length > 0) {
    query = query.where('id', 'in', jobIds);
  }

  if (statuses.length > 0) {
    query = query.where('status', 'in', statuses);
  }

  if (startedBeforeIso) {
    query = query
      .where('started_at', 'is not', null)
      .where('started_at', '<', startedBeforeIso);
  }

  if (orderBy === 'next_run_asc') {
    query = query
      .orderBy('next_run_at', 'asc')
      .orderBy('created_at', 'asc');
  } else if (orderBy === 'started_asc') {
    query = query
      .orderBy('started_at', 'asc')
      .orderBy('created_at', 'asc');
  } else {
    query = query.orderBy('created_at', 'desc');
  }

  const rows = await query.limit(limit).execute();
  return rows.map((row) => mapStateRowToJob(row as OracleQueueLedgerStateRow));
}

export async function claimOracleQueuedIngestionJobs(input: {
  controlDb: OracleControlPlaneDb;
  scopes?: string[];
  maxJobs?: number;
  workerId: string;
  leaseSeconds: number;
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const scopes = [...new Set(
    (Array.isArray(input.scopes) ? input.scopes : [])
      .map((scope) => String(scope || '').trim())
      .filter(Boolean),
  )];
  const maxJobs = Math.max(1, Math.min(200, Math.floor(Number(input.maxJobs) || 1)));
  const leaseSeconds = Math.max(5, Math.min(3600, Math.floor(Number(input.leaseSeconds) || 90)));
  const leaseExpiresAt = new Date(Date.parse(nowIso) + (leaseSeconds * 1000)).toISOString();

  return input.controlDb.db.transaction().execute(async (trx) => {
    let query = trx
      .selectFrom('queue_ledger_state')
      .selectAll()
      .where('status', '=', 'queued')
      .where('next_run_at', '<=', nowIso)
      .where((eb) => eb.or([
        eb('lease_expires_at', 'is', null),
        eb('lease_expires_at', '<', nowIso),
      ]))
      .orderBy('next_run_at', 'asc')
      .orderBy('created_at', 'asc')
      .limit(maxJobs);

    if (scopes.length > 0) {
      query = query.where('scope', 'in', scopes);
    }

    const rows = await query.execute();
    const claimed: IngestionJobRow[] = [];
    for (const rawRow of rows as OracleQueueLedgerStateRow[]) {
      const nextRow: OracleQueueLedgerStateRow = {
        ...rawRow,
        status: 'running',
        attempts: normalizeInt(rawRow.attempts) + 1,
        started_at: rawRow.started_at || nowIso,
        lease_expires_at: leaseExpiresAt,
        last_heartbeat_at: nowIso,
        worker_id: String(input.workerId || '').trim() || rawRow.worker_id,
        updated_at: nowIso,
      };

      await trx
        .insertInto('queue_ledger_state')
        .values(nextRow)
        .onConflict((oc) => oc.column('id').doUpdateSet(nextRow))
        .execute();

      claimed.push(mapStateRowToJob(nextRow));
    }

    return claimed;
  });
}

export async function touchOracleQueueJobLease(input: {
  controlDb: OracleControlPlaneDb;
  jobId: string;
  workerId: string;
  leaseSeconds: number;
  nowIso?: string;
}) {
  const jobId = String(input.jobId || '').trim();
  if (!jobId) return null;

  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const leaseSeconds = Math.max(5, Math.min(3600, Math.floor(Number(input.leaseSeconds) || 90)));
  const leaseExpiresAt = new Date(Date.parse(nowIso) + (leaseSeconds * 1000)).toISOString();

  return input.controlDb.db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom('queue_ledger_state')
      .selectAll()
      .where('id', '=', jobId)
      .executeTakeFirst();
    if (!current) return null;
    if (current.status !== 'running') return null;
    const expectedWorkerId = String(input.workerId || '').trim();
    if (expectedWorkerId && current.worker_id && current.worker_id !== expectedWorkerId) {
      return null;
    }

    const nextRow: OracleQueueLedgerStateRow = {
      ...(current as OracleQueueLedgerStateRow),
      worker_id: expectedWorkerId || current.worker_id,
      lease_expires_at: leaseExpiresAt,
      last_heartbeat_at: nowIso,
      updated_at: nowIso,
    };

    await trx
      .insertInto('queue_ledger_state')
      .values(nextRow)
      .onConflict((oc) => oc.column('id').doUpdateSet(nextRow))
      .execute();
    return mapStateRowToJob(nextRow);
  });
}

export async function finalizeOracleQueueJob(input: {
  controlDb: OracleControlPlaneDb;
  jobId: string;
  status: 'succeeded' | 'failed';
  processedCount: number;
  insertedCount: number;
  skippedCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  finishedAt?: string;
  heartbeatAt?: string;
}) {
  const jobId = String(input.jobId || '').trim();
  if (!jobId) return null;

  const finishedAt = normalizeIsoOrNull(input.finishedAt) || new Date().toISOString();
  const heartbeatAt = normalizeIsoOrNull(input.heartbeatAt) || finishedAt;

  return input.controlDb.db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom('queue_ledger_state')
      .selectAll()
      .where('id', '=', jobId)
      .executeTakeFirst();
    if (!current) return null;

    const nextRow: OracleQueueLedgerStateRow = {
      ...(current as OracleQueueLedgerStateRow),
      status: input.status,
      finished_at: finishedAt,
      processed_count: normalizeInt(input.processedCount),
      inserted_count: normalizeInt(input.insertedCount),
      skipped_count: normalizeInt(input.skippedCount),
      lease_expires_at: null,
      worker_id: null,
      last_heartbeat_at: heartbeatAt,
      error_code: normalizeMaybeString(input.errorCode),
      error_message: normalizeMaybeString(input.errorMessage),
      updated_at: finishedAt,
    };

    await trx
      .insertInto('queue_ledger_state')
      .values(nextRow)
      .onConflict((oc) => oc.column('id').doUpdateSet(nextRow))
      .execute();

    return mapStateRowToJob(nextRow);
  });
}

export async function failOracleQueueJob(input: {
  controlDb: OracleControlPlaneDb;
  jobId: string;
  errorCode: string;
  errorMessage: string;
  scheduleRetryInSeconds?: number;
  maxAttempts?: number;
  currentAttempts?: number | null;
  nowIso?: string;
}) {
  const jobId = String(input.jobId || '').trim();
  if (!jobId) return null;

  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const retryDelay = Math.max(0, Math.min(24 * 3600, Math.floor(Number(input.scheduleRetryInSeconds) || 0)));
  const maxAttempts = Math.max(1, Math.min(100, Math.floor(Number(input.maxAttempts) || 3)));
  const nextRunAt = new Date(Date.parse(nowIso) + (retryDelay * 1000)).toISOString();

  return input.controlDb.db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom('queue_ledger_state')
      .selectAll()
      .where('id', '=', jobId)
      .executeTakeFirst();
    if (!current) return null;

    let attempts = normalizeInt(input.currentAttempts);
    if (input.currentAttempts == null) {
      attempts = normalizeInt((current as OracleQueueLedgerStateRow).attempts);
    }
    const shouldRetry = retryDelay > 0 && attempts < maxAttempts;

    const nextRow: OracleQueueLedgerStateRow = {
      ...(current as OracleQueueLedgerStateRow),
      status: shouldRetry ? 'queued' : 'failed',
      finished_at: shouldRetry ? null : nowIso,
      next_run_at: shouldRetry ? nextRunAt : nowIso,
      lease_expires_at: null,
      worker_id: null,
      last_heartbeat_at: nowIso,
      error_code: String(input.errorCode || '').slice(0, 120) || 'FAILED',
      error_message: String(input.errorMessage || '').slice(0, 500),
      max_attempts: maxAttempts,
      updated_at: nowIso,
    };

    await trx
      .insertInto('queue_ledger_state')
      .values(nextRow)
      .onConflict((oc) => oc.column('id').doUpdateSet(nextRow))
      .execute();

    return mapStateRowToJob(nextRow);
  });
}

export async function markOracleRunningJobsFailed(input: {
  controlDb: OracleControlPlaneDb;
  jobIds: string[];
  errorCode: string;
  errorMessage: string;
  finishedAt?: string;
}) {
  const uniqueJobIds = [...new Set(
    (Array.isArray(input.jobIds) ? input.jobIds : [])
      .map((jobId) => String(jobId || '').trim())
      .filter(Boolean),
  )];
  if (uniqueJobIds.length === 0) return [];

  const finishedAt = normalizeIsoOrNull(input.finishedAt) || new Date().toISOString();

  return input.controlDb.db.transaction().execute(async (trx) => {
    const rows = await trx
      .selectFrom('queue_ledger_state')
      .selectAll()
      .where('id', 'in', uniqueJobIds)
      .where('status', '=', 'running')
      .execute();

    const updatedRows: IngestionJobRow[] = [];
    for (const current of rows as OracleQueueLedgerStateRow[]) {
      const nextRow: OracleQueueLedgerStateRow = {
        ...current,
        status: 'failed',
        finished_at: finishedAt,
        lease_expires_at: null,
        worker_id: null,
        last_heartbeat_at: finishedAt,
        error_code: String(input.errorCode || '').slice(0, 120) || 'FAILED',
        error_message: String(input.errorMessage || '').slice(0, 500),
        updated_at: finishedAt,
      };

      await trx
        .insertInto('queue_ledger_state')
        .values(nextRow)
        .onConflict((oc) => oc.column('id').doUpdateSet(nextRow))
        .execute();

      updatedRows.push(mapStateRowToJob(nextRow));
    }

    return updatedRows;
  });
}

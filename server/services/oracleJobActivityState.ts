import type { SupabaseClient } from '@supabase/supabase-js';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { reconcileOracleQueueAdmissionJobState } from './oracleQueueAdmissionState';
import { countOracleQueueLedgerJobs, listOracleQueueLedgerJobs } from './oracleQueueLedgerState';

type DbClient = SupabaseClient<any, 'public', any>;

export type OracleMirroredIngestionJob = {
  id: string;
  trigger: string;
  scope: string;
  status: string;
  requested_by_user_id?: string | null;
  subscription_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  processed_count?: number | null;
  inserted_count?: number | null;
  skipped_count?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  attempts?: number | null;
  max_attempts?: number | null;
  next_run_at?: string | null;
  lease_expires_at?: string | null;
  worker_id?: string | null;
  trace_id?: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type OracleJobActivityStateRow = {
  job_id: string;
  scope_key: string;
  user_key: string;
  status: string;
  trigger_key: string | null;
  subscription_id: string | null;
  trace_id: string | null;
  payload_json: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  next_run_at: string | null;
  lease_expires_at: string | null;
  processed_count: number;
  inserted_count: number;
  skipped_count: number;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
};

type OracleJobActivitySummary = {
  id: string;
  trigger: string | null;
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
  next_run_at: string | null;
  lease_expires_at: string | null;
  trace_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const INGESTION_JOB_ACTIVITY_SELECT = [
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

function normalizeScopeKey(value?: string | null) {
  return String(value || '').trim() || '*';
}

function normalizeUserKey(value?: string | null) {
  return String(value || '').trim() || '*';
}

function normalizeMaybeString(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function parsePayload(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function mapJobToStateRow(job: OracleMirroredIngestionJob, nowIso?: string): OracleJobActivityStateRow {
  const createdAt = normalizeIsoOrNull(job.created_at) || nowIso || new Date().toISOString();
  const updatedAt = normalizeIsoOrNull(job.updated_at) || nowIso || createdAt;
  return {
    job_id: String(job.id || '').trim(),
    scope_key: normalizeScopeKey(job.scope),
    user_key: normalizeUserKey(job.requested_by_user_id),
    status: String(job.status || '').trim() || 'queued',
    trigger_key: normalizeMaybeString(job.trigger),
    subscription_id: normalizeMaybeString(job.subscription_id),
    trace_id: normalizeMaybeString(job.trace_id),
    payload_json: job.payload == null ? null : JSON.stringify(job.payload),
    created_at: createdAt,
    started_at: normalizeIsoOrNull(job.started_at),
    finished_at: normalizeIsoOrNull(job.finished_at),
    next_run_at: normalizeIsoOrNull(job.next_run_at),
    lease_expires_at: normalizeIsoOrNull(job.lease_expires_at),
    processed_count: normalizeInt(job.processed_count),
    inserted_count: normalizeInt(job.inserted_count),
    skipped_count: normalizeInt(job.skipped_count),
    attempts: normalizeInt(job.attempts),
    max_attempts: normalizeInt(job.max_attempts),
    error_code: normalizeMaybeString(job.error_code),
    error_message: normalizeMaybeString(job.error_message),
    updated_at: updatedAt,
  };
}

function mapStateRowToSummary(row: OracleJobActivityStateRow): OracleJobActivitySummary {
  return {
    id: row.job_id,
    trigger: row.trigger_key,
    scope: row.scope_key === '*' ? '' : row.scope_key,
    status: row.status,
    requested_by_user_id: row.user_key === '*' ? null : row.user_key,
    subscription_id: row.subscription_id,
    started_at: row.started_at,
    finished_at: row.finished_at,
    processed_count: normalizeInt(row.processed_count),
    inserted_count: normalizeInt(row.inserted_count),
    skipped_count: normalizeInt(row.skipped_count),
    error_code: row.error_code,
    error_message: row.error_message,
    attempts: normalizeInt(row.attempts),
    max_attempts: normalizeInt(row.max_attempts),
    next_run_at: row.next_run_at,
    lease_expires_at: row.lease_expires_at,
    trace_id: row.trace_id,
    payload: parsePayload(row.payload_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapJobToSummary(job: OracleMirroredIngestionJob): OracleJobActivitySummary {
  const createdAt = normalizeIsoOrNull(job.created_at) || new Date().toISOString();
  const updatedAt = normalizeIsoOrNull(job.updated_at) || createdAt;
  return {
    id: String(job.id || '').trim(),
    trigger: normalizeMaybeString(job.trigger),
    scope: String(job.scope || '').trim(),
    status: String(job.status || '').trim() || 'queued',
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
    max_attempts: normalizeInt(job.max_attempts),
    next_run_at: normalizeIsoOrNull(job.next_run_at),
    lease_expires_at: normalizeIsoOrNull(job.lease_expires_at),
    trace_id: normalizeMaybeString(job.trace_id),
    payload: job.payload && typeof job.payload === 'object' ? job.payload : null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function hasOracleQueueLedgerRows(controlDb: OracleControlPlaneDb) {
  return (await countOracleQueueLedgerJobs({ controlDb })) > 0;
}

async function setJobActivityMeta(input: {
  controlDb: OracleControlPlaneDb;
  db?: OracleControlPlaneDb['db'];
  key: string;
  at: string;
}) {
  const db = input.db || input.controlDb.db;
  await db
    .insertInto('control_meta')
    .values({
      key: input.key,
      value_json: JSON.stringify({ at: input.at }),
      updated_at: input.at,
    })
    .onConflict((oc) => oc.column('key').doUpdateSet({
      value_json: JSON.stringify({ at: input.at }),
      updated_at: input.at,
    }))
    .execute();
}

export async function replaceOracleJobActivityMirror(input: {
  controlDb: OracleControlPlaneDb;
  jobs: OracleMirroredIngestionJob[];
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const rows = input.jobs
    .map((job) => mapJobToStateRow(job, nowIso))
    .filter((row) => Boolean(row.job_id));

  await input.controlDb.db.transaction().execute(async (trx) => {
    await trx.deleteFrom('job_activity_state').execute();
    for (const chunk of chunkArray(rows, 100)) {
      if (chunk.length === 0) continue;
      await trx.insertInto('job_activity_state').values(chunk).execute();
    }
    await setJobActivityMeta({
      controlDb: input.controlDb,
      db: trx,
      key: 'job_activity_last_snapshot_at',
      at: nowIso,
    });
  });

  return {
    rowCount: rows.length,
    activeCount: rows.filter((row) => row.status === 'queued' || row.status === 'running').length,
    snapshotAt: nowIso,
  };
}

export async function syncOracleJobActivityMirrorFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  recentLimit: number;
  nowIso?: string;
}) {
  const recentLimit = Math.max(50, Math.floor(Number(input.recentLimit) || 0));
  const [activeLedgerRows, recentLedgerRows] = await Promise.all([
    listOracleQueueLedgerJobs({
      controlDb: input.controlDb,
      statuses: ['queued', 'running'],
      limit: 5000,
      orderBy: 'created_desc',
    }),
    listOracleQueueLedgerJobs({
      controlDb: input.controlDb,
      limit: recentLimit,
      orderBy: 'created_desc',
    }),
  ]);

  if (activeLedgerRows.length > 0 || recentLedgerRows.length > 0) {
    const merged = new Map<string, OracleMirroredIngestionJob>();
    for (const row of recentLedgerRows) {
      if (row?.id) merged.set(row.id, row);
    }
    for (const row of activeLedgerRows) {
      if (row?.id) merged.set(row.id, row);
    }

    const result = await replaceOracleJobActivityMirror({
      controlDb: input.controlDb,
      jobs: [...merged.values()],
      nowIso: input.nowIso,
    });

    return {
      ...result,
      recentCount: recentLedgerRows.length,
    };
  }

  const [activeRowsResult, recentRowsResult] = await Promise.all([
    input.db
      .from('ingestion_jobs')
      .select(INGESTION_JOB_ACTIVITY_SELECT)
      .in('status', ['queued', 'running']),
    input.db
      .from('ingestion_jobs')
      .select(INGESTION_JOB_ACTIVITY_SELECT)
      .order('created_at', { ascending: false })
      .limit(recentLimit),
  ]);

  if (activeRowsResult.error) throw activeRowsResult.error;
  if (recentRowsResult.error) throw recentRowsResult.error;

  const merged = new Map<string, OracleMirroredIngestionJob>();
  for (const row of recentRowsResult.data || []) {
    const normalized = row as OracleMirroredIngestionJob;
    if (normalized?.id) merged.set(normalized.id, normalized);
  }
  for (const row of activeRowsResult.data || []) {
    const normalized = row as OracleMirroredIngestionJob;
    if (normalized?.id) merged.set(normalized.id, normalized);
  }

  const result = await replaceOracleJobActivityMirror({
    controlDb: input.controlDb,
    jobs: [...merged.values()],
    nowIso: input.nowIso,
  });

  return {
    ...result,
    recentCount: (recentRowsResult.data || []).length,
  };
}

export async function syncOracleJobActivityRowFromSupabaseById(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  jobId: string;
  nowIso?: string;
}) {
  const jobId = String(input.jobId || '').trim();
  if (!jobId) return null;

  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    jobIds: [jobId],
    limit: 1,
  });
  const queueLedgerRow = queueLedgerRows[0];
  if (queueLedgerRow) {
    return upsertOracleJobActivityRow({
      controlDb: input.controlDb,
      job: queueLedgerRow,
      nowIso: input.nowIso,
    });
  }

  const { data, error } = await input.db
    .from('ingestion_jobs')
    .select(INGESTION_JOB_ACTIVITY_SELECT)
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return upsertOracleJobActivityRow({
    controlDb: input.controlDb,
    job: data as OracleMirroredIngestionJob,
    nowIso: input.nowIso,
  });
}

export async function syncOracleJobActivityRowsFromSupabaseByIds(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  jobIds: string[];
  nowIso?: string;
}) {
  const jobIds = [...new Set(
    (Array.isArray(input.jobIds) ? input.jobIds : [])
      .map((jobId) => String(jobId || '').trim())
      .filter(Boolean),
  )];
  if (jobIds.length === 0) return [];

  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    jobIds,
    limit: jobIds.length,
  });
  if (queueLedgerRows.length > 0) {
    await upsertOracleJobActivityRows({
      controlDb: input.controlDb,
      jobs: queueLedgerRows,
      nowIso: input.nowIso,
    });
    return queueLedgerRows;
  }

  const { data, error } = await input.db
    .from('ingestion_jobs')
    .select(INGESTION_JOB_ACTIVITY_SELECT)
    .in('id', jobIds);

  if (error) throw error;

  const rows = (data || []) as OracleMirroredIngestionJob[];
  await upsertOracleJobActivityRows({
    controlDb: input.controlDb,
    jobs: rows,
    nowIso: input.nowIso,
  });
  return rows;
}

export async function upsertOracleJobActivityRow(input: {
  controlDb: OracleControlPlaneDb;
  job: OracleMirroredIngestionJob;
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const nextRow = mapJobToStateRow(input.job, nowIso);
  if (!nextRow.job_id) return null;

  await input.controlDb.db.transaction().execute(async (trx) => {
    const previous = await trx
      .selectFrom('job_activity_state')
      .select(['scope_key', 'user_key', 'status'])
      .where('job_id', '=', nextRow.job_id)
      .executeTakeFirst();

    await trx
      .insertInto('job_activity_state')
      .values(nextRow)
      .onConflict((oc) => oc.column('job_id').doUpdateSet(nextRow))
      .execute();

    await reconcileOracleQueueAdmissionJobState({
      controlDb: input.controlDb,
      db: trx,
      nowIso,
      previous: previous
        ? {
            scope: previous.scope_key,
            requestedByUserId: previous.user_key,
            status: previous.status,
          }
        : null,
      next: {
        scope: nextRow.scope_key,
        requestedByUserId: nextRow.user_key,
        status: nextRow.status,
      },
    });

    await setJobActivityMeta({
      controlDb: input.controlDb,
      db: trx,
      key: 'job_activity_last_update_at',
      at: nowIso,
    });
  });

  return nextRow;
}

export async function upsertOracleJobActivityRows(input: {
  controlDb: OracleControlPlaneDb;
  jobs: OracleMirroredIngestionJob[];
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  for (const job of input.jobs) {
    await upsertOracleJobActivityRow({
      controlDb: input.controlDb,
      job,
      nowIso,
    });
  }
}

export async function recordOracleJobLeaseHeartbeat(input: {
  controlDb: OracleControlPlaneDb;
  job: OracleMirroredIngestionJob;
  leaseSeconds: number;
  heartbeatAtIso?: string;
}) {
  const jobId = String(input.job.id || '').trim();
  if (!jobId) return null;

  const heartbeatAtIso = normalizeIsoOrNull(input.heartbeatAtIso) || new Date().toISOString();
  const leaseSeconds = Math.max(5, Math.floor(Number(input.leaseSeconds) || 0));
  const existing = await input.controlDb.db
    .selectFrom('job_activity_state')
    .select(['status', 'started_at'])
    .where('job_id', '=', jobId)
    .executeTakeFirst();

  if (existing && existing.status !== 'queued' && existing.status !== 'running') {
    return null;
  }

  const leaseExpiresAtIso = new Date(Date.parse(heartbeatAtIso) + leaseSeconds * 1000).toISOString();
  return upsertOracleJobActivityRow({
    controlDb: input.controlDb,
    nowIso: heartbeatAtIso,
    job: {
      ...input.job,
      status: existing?.status || String(input.job.status || '').trim() || 'running',
      started_at: existing?.started_at || input.job.started_at || heartbeatAtIso,
      lease_expires_at: leaseExpiresAtIso,
      updated_at: heartbeatAtIso,
    },
  });
}

export async function findOracleStaleRunningJobs(input: {
  controlDb: OracleControlPlaneDb;
  olderThanMs: number;
  nowIso?: string;
  scope?: string | null;
  userId?: string | null;
  limit?: number;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const olderThanMs = Math.max(60_000, Math.floor(Number(input.olderThanMs) || 0));
  const staleBeforeIso = new Date(Date.parse(nowIso) - olderThanMs).toISOString();
  const limit = Math.max(1, Math.floor(Number(input.limit) || 500));

  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    scope: String(input.scope || '').trim() || undefined,
    userId: String(input.userId || '').trim() || undefined,
    statuses: ['running'],
    startedBeforeIso: staleBeforeIso,
    limit,
    orderBy: 'started_asc',
  });
  if (queueLedgerRows.length > 0) {
    return queueLedgerRows.map((row) => ({
      id: row.id,
      scope: row.scope || null,
      requested_by_user_id: row.requested_by_user_id ?? null,
      started_at: row.started_at,
    }));
  }
  if (await hasOracleQueueLedgerRows(input.controlDb)) {
    return [];
  }

  let query = input.controlDb.db
    .selectFrom('job_activity_state')
    .select(['job_id', 'scope_key', 'user_key', 'started_at'])
    .where('status', '=', 'running')
    .where('started_at', 'is not', null)
    .where('started_at', '<', staleBeforeIso)
    .orderBy('started_at', 'asc')
    .limit(limit);

  const scopeKey = normalizeScopeKey(input.scope);
  if (scopeKey !== '*') {
    query = query.where('scope_key', '=', scopeKey);
  }

  const userKey = normalizeUserKey(input.userId);
  if (userKey !== '*') {
    query = query.where('user_key', '=', userKey);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    id: row.job_id,
    scope: row.scope_key === '*' ? null : row.scope_key,
    requested_by_user_id: row.user_key === '*' ? null : row.user_key,
    started_at: row.started_at,
  }));
}

export async function getOracleActiveJobForUserScope(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  scope: string;
}) {
  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    userId: String(input.userId || '').trim() || undefined,
    scope: String(input.scope || '').trim() || undefined,
    statuses: ['queued', 'running'],
    limit: 1,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows[0]) {
    return mapJobToSummary(queueLedgerRows[0]);
  }
  if (await hasOracleQueueLedgerRows(input.controlDb)) {
    return null;
  }

  const userKey = normalizeUserKey(input.userId);
  const scopeKey = normalizeScopeKey(input.scope);
  const row = await input.controlDb.db
    .selectFrom('job_activity_state')
    .selectAll()
    .where('user_key', '=', userKey)
    .where('scope_key', '=', scopeKey)
    .where('status', 'in', ['queued', 'running'])
    .orderBy('started_at', 'desc')
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  return row ? mapStateRowToSummary(row) : null;
}

export async function listOracleActiveJobsForScope(input: {
  controlDb: OracleControlPlaneDb;
  scope: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.floor(Number(input.limit) || 200));
  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    scope: String(input.scope || '').trim() || undefined,
    statuses: ['queued', 'running'],
    limit,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows.length > 0) {
    return queueLedgerRows.map(mapJobToSummary);
  }
  if (await hasOracleQueueLedgerRows(input.controlDb)) {
    return [];
  }

  const scopeKey = normalizeScopeKey(input.scope);
  const rows = await input.controlDb.db
    .selectFrom('job_activity_state')
    .selectAll()
    .where('scope_key', '=', scopeKey)
    .where('status', 'in', ['queued', 'running'])
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
  return rows.map(mapStateRowToSummary);
}

export async function listOracleLatestJobsForUserScope(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  scope: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.floor(Number(input.limit) || 2));
  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    userId: String(input.userId || '').trim() || undefined,
    scope: String(input.scope || '').trim() || undefined,
    limit,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows.length > 0) {
    return queueLedgerRows.map(mapJobToSummary);
  }
  if (await hasOracleQueueLedgerRows(input.controlDb)) {
    return [];
  }

  const userKey = normalizeUserKey(input.userId);
  const scopeKey = normalizeScopeKey(input.scope);
  const rows = await input.controlDb.db
    .selectFrom('job_activity_state')
    .selectAll()
    .where('user_key', '=', userKey)
    .where('scope_key', '=', scopeKey)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
  return rows.map(mapStateRowToSummary);
}

export async function listOracleActiveJobsForUser(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  scopes?: readonly string[];
  limit?: number;
}) {
  const limit = Math.max(1, Math.floor(Number(input.limit) || 20));
  const scopes = [...new Set((input.scopes || []).map((scope) => normalizeScopeKey(scope)).filter((scope) => scope !== '*'))];
  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    scopes,
    userId: String(input.userId || '').trim() || undefined,
    statuses: ['queued', 'running'],
    limit,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows.length > 0) {
    return queueLedgerRows.map(mapJobToSummary);
  }
  if (await hasOracleQueueLedgerRows(input.controlDb)) {
    return [];
  }

  const userKey = normalizeUserKey(input.userId);

  let query = input.controlDb.db
    .selectFrom('job_activity_state')
    .selectAll()
    .where('user_key', '=', userKey)
    .where('status', 'in', ['queued', 'running'])
    .orderBy('created_at', 'desc')
    .limit(limit);

  if (scopes.length > 0) {
    query = query.where('scope_key', 'in', scopes);
  }

  const rows = await query.execute();
  return rows.map(mapStateRowToSummary);
}

export async function listOracleActiveJobsForScopes(input: {
  controlDb: OracleControlPlaneDb;
  scopes?: readonly string[];
  limit?: number;
}) {
  const scopes = [...new Set(
    (input.scopes || [])
      .map((scope) => normalizeScopeKey(scope))
      .filter((scope) => scope !== '*'),
  )];
  const limit = Math.max(1, Math.floor(Number(input.limit) || 1000));

  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    scopes,
    statuses: ['queued', 'running'],
    limit,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows.length > 0) {
    return queueLedgerRows.map(mapJobToSummary);
  }
  if (await hasOracleQueueLedgerRows(input.controlDb)) {
    return [];
  }

  let query = input.controlDb.db
    .selectFrom('job_activity_state')
    .selectAll()
    .where('status', 'in', ['queued', 'running'])
    .orderBy('created_at', 'desc')
    .limit(limit);

  if (scopes.length > 0) {
    query = query.where('scope_key', 'in', scopes);
  }

  const rows = await query.execute();
  return rows.map(mapStateRowToSummary);
}

export async function listOracleJobsByIds(input: {
  controlDb: OracleControlPlaneDb;
  jobIds: readonly string[];
}) {
  const jobIds = [...new Set(
    (Array.isArray(input.jobIds) ? input.jobIds : [])
      .map((jobId) => String(jobId || '').trim())
      .filter(Boolean),
  )];
  if (jobIds.length === 0) return [];

  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    jobIds,
    limit: jobIds.length,
  });
  if (queueLedgerRows.length > 0) {
    return queueLedgerRows.map(mapJobToSummary);
  }
  if (await hasOracleQueueLedgerRows(input.controlDb)) {
    return [];
  }

  const rows = await input.controlDb.db
    .selectFrom('job_activity_state')
    .selectAll()
    .where('job_id', 'in', jobIds)
    .execute();
  return rows.map(mapStateRowToSummary);
}

export async function listOracleRunningJobsByScope(input: {
  controlDb: OracleControlPlaneDb;
  scope: string;
  staleBeforeIso?: string | null;
  limit?: number;
}) {
  const scopeKey = normalizeScopeKey(input.scope);
  const limit = Math.max(1, Math.floor(Number(input.limit) || 500));
  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    scope: scopeKey === '*' ? undefined : scopeKey,
    statuses: ['running'],
    startedBeforeIso: input.staleBeforeIso,
    limit,
    orderBy: 'started_asc',
  });
  if (queueLedgerRows.length > 0) {
    return queueLedgerRows.map(mapJobToSummary);
  }
  if (await hasOracleQueueLedgerRows(input.controlDb)) {
    return [];
  }

  let query = input.controlDb.db
    .selectFrom('job_activity_state')
    .selectAll()
    .where('scope_key', '=', scopeKey)
    .where('status', '=', 'running')
    .orderBy('started_at', 'asc')
    .limit(limit);

  const staleBeforeIso = normalizeIsoOrNull(input.staleBeforeIso);
  if (staleBeforeIso) {
    query = query
      .where('started_at', 'is not', null)
      .where('started_at', '<', staleBeforeIso);
  }

  const rows = await query.execute();
  return rows.map(mapStateRowToSummary);
}

export async function getOracleLatestIngestionJob(input: {
  controlDb: OracleControlPlaneDb;
}) {
  const queueLedgerRows = await listOracleQueueLedgerJobs({
    controlDb: input.controlDb,
    limit: 1,
    orderBy: 'created_desc',
  });
  if (queueLedgerRows[0]) {
    return mapJobToSummary(queueLedgerRows[0]);
  }

  const row = await input.controlDb.db
    .selectFrom('job_activity_state')
    .selectAll()
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  return row ? mapStateRowToSummary(row) : null;
}

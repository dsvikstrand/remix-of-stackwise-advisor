import type { SupabaseClient } from '@supabase/supabase-js';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';

type DbClient = SupabaseClient<any, 'public', any>;
type TransactionDb = OracleControlPlaneDb['db'];

type QueueAdmissionActiveRow = {
  scope: string;
  requested_by_user_id: string | null;
};

function normalizeIsoOrNull(value: string | null | undefined) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseDateMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeScopeKey(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized || '*';
}

function normalizeUserKey(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized || '*';
}

function buildQueueAdmissionCountKey(input: {
  scopeKey: string;
  userKey: string;
}) {
  return `scope=${input.scopeKey}|user=${input.userKey}`;
}

function isActiveQueueAdmissionStatus(status?: string | null) {
  const normalized = String(status || '').trim();
  return normalized === 'queued' || normalized === 'running';
}

function normalizeScopes(scopes?: readonly string[] | null) {
  return [...new Set(
    (Array.isArray(scopes) ? scopes : [])
      .map((scope) => normalizeScopeKey(scope))
      .filter((scope) => scope !== '*'),
  )].sort();
}

function buildCountStateRows(activeRows: QueueAdmissionActiveRow[], nowIso: string) {
  const counts = new Map<string, {
    count_key: string;
    scope_key: string;
    user_key: string;
    active_count: number;
    updated_at: string;
  }>();

  const increment = (scopeKey: string, userKey: string) => {
    const countKey = buildQueueAdmissionCountKey({ scopeKey, userKey });
    const existing = counts.get(countKey);
    if (existing) {
      existing.active_count += 1;
      return;
    }
    counts.set(countKey, {
      count_key: countKey,
      scope_key: scopeKey,
      user_key: userKey,
      active_count: 1,
      updated_at: nowIso,
    });
  };

  for (const row of activeRows) {
    const scopeKey = normalizeScopeKey(row.scope);
    const userKey = normalizeUserKey(row.requested_by_user_id);
    increment('*', '*');
    increment(scopeKey, '*');
    if (userKey !== '*') {
      increment('*', userKey);
      increment(scopeKey, userKey);
    }
  }

  return [...counts.values()];
}

let refreshPromise: Promise<void> | null = null;

async function setLastSnapshotAt(input: {
  controlDb: OracleControlPlaneDb;
  nowIso: string;
  db?: TransactionDb;
}) {
  const db = input.db || input.controlDb.db;
  await db
    .insertInto('control_meta')
    .values({
      key: 'queue_admission_last_snapshot_at',
      value_json: JSON.stringify({ at: input.nowIso }),
      updated_at: input.nowIso,
    })
    .onConflict((oc) => oc.column('key').doUpdateSet({
      value_json: JSON.stringify({ at: input.nowIso }),
      updated_at: input.nowIso,
    }))
    .execute();
}

async function getLastSnapshotAt(controlDb: OracleControlPlaneDb) {
  const row = await controlDb.db
    .selectFrom('control_meta')
    .select(['value_json'])
    .where('key', '=', 'queue_admission_last_snapshot_at')
    .executeTakeFirst();
  const parsed = row?.value_json ? JSON.parse(row.value_json) as { at?: string } : null;
  return normalizeIsoOrNull(parsed?.at || null);
}

export async function replaceOracleQueueAdmissionMirror(input: {
  controlDb: OracleControlPlaneDb;
  activeRows: QueueAdmissionActiveRow[];
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const countRows = buildCountStateRows(input.activeRows, nowIso);

  await input.controlDb.db.transaction().execute(async (trx) => {
    await trx.deleteFrom('queue_admission_count_state').execute();
    if (countRows.length > 0) {
      await trx.insertInto('queue_admission_count_state').values(countRows).execute();
    }
    await trx
      .insertInto('control_meta')
      .values({
        key: 'queue_admission_last_snapshot_at',
        value_json: JSON.stringify({ at: nowIso }),
        updated_at: nowIso,
      })
      .onConflict((oc) => oc.column('key').doUpdateSet({
        value_json: JSON.stringify({ at: nowIso }),
        updated_at: nowIso,
      }))
      .execute();
  });

  return {
    rowCount: countRows.length,
    activeCount: input.activeRows.length,
    snapshotAt: nowIso,
  };
}

async function applyOracleQueueAdmissionCountDelta(input: {
  controlDb: OracleControlPlaneDb;
  db?: TransactionDb;
  scopeKey: string;
  userKey: string;
  delta: number;
  nowIso: string;
}) {
  const delta = Math.trunc(input.delta);
  if (!delta) return;
  const db = input.db || input.controlDb.db;
  const countKey = buildQueueAdmissionCountKey({
    scopeKey: input.scopeKey,
    userKey: input.userKey,
  });
  const existing = await db
    .selectFrom('queue_admission_count_state')
    .select(['active_count'])
    .where('count_key', '=', countKey)
    .executeTakeFirst();
  const nextCount = Math.max(0, Math.floor(Number(existing?.active_count) || 0) + delta);

  if (nextCount <= 0) {
    await db
      .deleteFrom('queue_admission_count_state')
      .where('count_key', '=', countKey)
      .execute();
    return;
  }

  await db
    .insertInto('queue_admission_count_state')
    .values({
      count_key: countKey,
      scope_key: input.scopeKey,
      user_key: input.userKey,
      active_count: nextCount,
      updated_at: input.nowIso,
    })
    .onConflict((oc) => oc.column('count_key').doUpdateSet({
      active_count: nextCount,
      updated_at: input.nowIso,
    }))
    .execute();
}

export async function reconcileOracleQueueAdmissionJobState(input: {
  controlDb: OracleControlPlaneDb;
  db?: TransactionDb;
  nowIso?: string;
  previous: {
    scope?: string | null;
    requestedByUserId?: string | null;
    status?: string | null;
  } | null;
  next: {
    scope?: string | null;
    requestedByUserId?: string | null;
    status?: string | null;
  } | null;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const db = input.db || input.controlDb.db;
  const previousActive = isActiveQueueAdmissionStatus(input.previous?.status);
  const nextActive = isActiveQueueAdmissionStatus(input.next?.status);
  const previousScopeKey = normalizeScopeKey(input.previous?.scope);
  const nextScopeKey = normalizeScopeKey(input.next?.scope);
  const previousUserKey = normalizeUserKey(input.previous?.requestedByUserId);
  const nextUserKey = normalizeUserKey(input.next?.requestedByUserId);

  if (
    previousActive === nextActive
    && previousScopeKey === nextScopeKey
    && previousUserKey === nextUserKey
  ) {
    await setLastSnapshotAt({
      controlDb: input.controlDb,
      nowIso,
      db,
    });
    return;
  }

  if (previousActive) {
    await applyOracleQueueAdmissionCountDelta({
      controlDb: input.controlDb,
      db,
      scopeKey: '*',
      userKey: '*',
      delta: -1,
      nowIso,
    });
    await applyOracleQueueAdmissionCountDelta({
      controlDb: input.controlDb,
      db,
      scopeKey: previousScopeKey,
      userKey: '*',
      delta: -1,
      nowIso,
    });
    if (previousUserKey !== '*') {
      await applyOracleQueueAdmissionCountDelta({
        controlDb: input.controlDb,
        db,
        scopeKey: '*',
        userKey: previousUserKey,
        delta: -1,
        nowIso,
      });
      await applyOracleQueueAdmissionCountDelta({
        controlDb: input.controlDb,
        db,
        scopeKey: previousScopeKey,
        userKey: previousUserKey,
        delta: -1,
        nowIso,
      });
    }
  }

  if (nextActive) {
    await applyOracleQueueAdmissionCountDelta({
      controlDb: input.controlDb,
      db,
      scopeKey: '*',
      userKey: '*',
      delta: 1,
      nowIso,
    });
    await applyOracleQueueAdmissionCountDelta({
      controlDb: input.controlDb,
      db,
      scopeKey: nextScopeKey,
      userKey: '*',
      delta: 1,
      nowIso,
    });
    if (nextUserKey !== '*') {
      await applyOracleQueueAdmissionCountDelta({
        controlDb: input.controlDb,
        db,
        scopeKey: '*',
        userKey: nextUserKey,
        delta: 1,
        nowIso,
      });
      await applyOracleQueueAdmissionCountDelta({
        controlDb: input.controlDb,
        db,
        scopeKey: nextScopeKey,
        userKey: nextUserKey,
        delta: 1,
        nowIso,
      });
    }
  }

  await setLastSnapshotAt({
    controlDb: input.controlDb,
    nowIso,
    db,
  });
}

export async function syncOracleQueueAdmissionMirrorFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const { data, error } = await input.db
    .from('ingestion_jobs')
    .select('scope, requested_by_user_id')
    .in('status', ['queued', 'running']);
  if (error) throw error;

  return replaceOracleQueueAdmissionMirror({
    controlDb: input.controlDb,
    activeRows: (data || []) as QueueAdmissionActiveRow[],
    nowIso,
  });
}

export async function ensureOracleQueueAdmissionMirrorFresh(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  refreshStaleMs: number;
  nowIso?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const nowMs = parseDateMs(nowIso) ?? Date.now();
  const lastSnapshotAt = await getLastSnapshotAt(input.controlDb);
  const lastSnapshotMs = parseDateMs(lastSnapshotAt);
  if (lastSnapshotMs != null && nowMs - lastSnapshotMs < Math.max(1_000, Math.floor(input.refreshStaleMs))) {
    return {
      refreshed: false,
      snapshotAt: lastSnapshotAt,
    };
  }

  if (!refreshPromise) {
    refreshPromise = syncOracleQueueAdmissionMirrorFromSupabase({
      controlDb: input.controlDb,
      db: input.db,
      nowIso,
    }).then(async () => {
      await setLastSnapshotAt({
        controlDb: input.controlDb,
        nowIso,
      });
    }).finally(() => {
      refreshPromise = null;
    });
  }

  await refreshPromise;

  return {
    refreshed: true,
    snapshotAt: nowIso,
  };
}

async function sumOracleQueueAdmissionCounts(input: {
  controlDb: OracleControlPlaneDb;
  scope?: string | null;
  scopes?: readonly string[] | null;
  userId?: string | null;
}) {
  const requestedScopes = input.scope
    ? [normalizeScopeKey(input.scope)]
    : normalizeScopes(input.scopes);
  const userKey = normalizeUserKey(input.userId);

  if (requestedScopes.length <= 1) {
    const scopeKey = requestedScopes[0] || '*';
    const row = await input.controlDb.db
      .selectFrom('queue_admission_count_state')
      .select(['active_count'])
      .where('scope_key', '=', scopeKey)
      .where('user_key', '=', userKey)
      .executeTakeFirst();
    return Math.max(0, Math.floor(Number(row?.active_count) || 0));
  }

  const rows = await input.controlDb.db
    .selectFrom('queue_admission_count_state')
    .select(['active_count'])
    .where('scope_key', 'in', requestedScopes)
    .where('user_key', '=', userKey)
    .execute();

  return rows.reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.active_count) || 0)), 0);
}

export async function readOracleQueueAdmissionCounts(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  refreshStaleMs: number;
  userId: string;
  scope?: string | null;
  scopes?: readonly string[] | null;
  nowIso?: string;
}) {
  await ensureOracleQueueAdmissionMirrorFresh({
    controlDb: input.controlDb,
    db: input.db,
    refreshStaleMs: input.refreshStaleMs,
    nowIso: input.nowIso,
  });

  const [queueDepth, userQueueDepth] = await Promise.all([
    sumOracleQueueAdmissionCounts({
      controlDb: input.controlDb,
      scope: input.scope,
      scopes: input.scopes,
    }),
    sumOracleQueueAdmissionCounts({
      controlDb: input.controlDb,
      scope: input.scope,
      scopes: input.scopes,
      userId: input.userId,
    }),
  ]);

  return {
    queue_depth: queueDepth,
    user_queue_depth: userQueueDepth,
    queue_work_items: queueDepth,
    user_queue_work_items: userQueueDepth,
    source: 'oracle_mirror' as const,
  };
}

export function supportsOracleQueueAdmissionMirror(input?: {
  includeRunning?: boolean;
  statuses?: string[];
}) {
  const statuses = Array.isArray(input?.statuses) ? input.statuses.map((status) => String(status || '').trim()).filter(Boolean).sort() : null;
  if (statuses && statuses.length > 0) {
    return statuses.length === 2 && statuses[0] === 'queued' && statuses[1] === 'running';
  }
  return Boolean(input?.includeRunning);
}

import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import {
  normalizeObject,
  normalizeRequiredIso,
  normalizeStringOrNull,
} from './oracleValueNormalization';

export type OracleGenerationTraceLevel = 'debug' | 'info' | 'warn' | 'error';

export type OracleGenerationRunEventRow = {
  id: number;
  run_id: string;
  seq: number;
  level: OracleGenerationTraceLevel;
  event: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const nextOracleGenerationEventSeqByRunId = new Map<string, Promise<number>>();

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function encodeEventCursor(input: { id: number }) {
  return Buffer.from(JSON.stringify({ id: input.id }), 'utf8').toString('base64url');
}

function decodeEventCursor(raw: string | null | undefined) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { id?: unknown };
    const id = Number(parsed.id || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { id: Math.floor(id) };
  } catch {
    return null;
  }
}

function parsePayloadJson(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return {};
  try {
    return normalizeObject(JSON.parse(raw)) || {};
  } catch {
    return {};
  }
}

function mapEventRow(row: Record<string, unknown>, fallbackIso?: string): OracleGenerationRunEventRow {
  return {
    id: clampInt(row.id, 0, 0, Number.MAX_SAFE_INTEGER),
    run_id: String(row.run_id || '').trim(),
    seq: clampInt(row.seq, 0, 0, Number.MAX_SAFE_INTEGER),
    level: (normalizeStringOrNull(row.level) || 'info') as OracleGenerationTraceLevel,
    event: String(row.event || '').trim(),
    payload: row.payload_json !== undefined ? parsePayloadJson(row.payload_json) : (normalizeObject(row.payload) || {}),
    created_at: normalizeRequiredIso(row.created_at, fallbackIso),
  };
}

async function loadNextOracleGenerationEventSeq(input: {
  controlDb: OracleControlPlaneDb;
  runId: string;
}) {
  const row = await input.controlDb.db
    .selectFrom('generation_run_event_state')
    .select('seq')
    .where('run_id', '=', input.runId)
    .orderBy('seq', 'desc')
    .executeTakeFirst();
  return clampInt(row?.seq, 0, 0, Number.MAX_SAFE_INTEGER) + 1;
}

async function reserveOracleGenerationEventSeq(input: {
  controlDb: OracleControlPlaneDb;
  runId: string;
}) {
  const cursorPromise = nextOracleGenerationEventSeqByRunId.get(input.runId)
    || loadNextOracleGenerationEventSeq(input);
  const reservedSeqPromise = cursorPromise.then((seq) => clampInt(seq, 1, 1, Number.MAX_SAFE_INTEGER));
  const nextCursorPromise = reservedSeqPromise.then((seq) => seq + 1);
  nextOracleGenerationEventSeqByRunId.set(input.runId, nextCursorPromise);
  try {
    return await reservedSeqPromise;
  } catch (error) {
    if (nextOracleGenerationEventSeqByRunId.get(input.runId) === nextCursorPromise) {
      nextOracleGenerationEventSeqByRunId.delete(input.runId);
    }
    throw error;
  }
}

export function clearOracleGenerationTraceSeqCursor(runId: string) {
  const normalizedRunId = String(runId || '').trim();
  if (!normalizedRunId) return;
  nextOracleGenerationEventSeqByRunId.delete(normalizedRunId);
}

export async function appendOracleGenerationTraceEvent(input: {
  controlDb: OracleControlPlaneDb;
  runId: string;
  event: string;
  level?: OracleGenerationTraceLevel;
  payload?: Record<string, unknown>;
  nowIso?: string;
}) {
  const runId = String(input.runId || '').trim();
  const eventName = String(input.event || '').trim();
  if (!runId || !eventName) return null;

  const seq = await reserveOracleGenerationEventSeq({
    controlDb: input.controlDb,
    runId,
  });
  const nowIso = normalizeRequiredIso(input.nowIso);

  await input.controlDb.db
    .insertInto('generation_run_event_state')
    .values({
      run_id: runId,
      seq,
      level: String(input.level || 'info').trim() || 'info',
      event: eventName,
      payload_json: JSON.stringify(normalizeObject(input.payload) || {}),
      created_at: nowIso,
    })
    .execute();

  return null;
}

export async function listOracleGenerationRunEvents(input: {
  controlDb: OracleControlPlaneDb;
  runId: string;
  limit?: number;
  cursor?: string | null;
}) {
  const runId = String(input.runId || '').trim();
  if (!runId) {
    return {
      items: [] as OracleGenerationRunEventRow[],
      next_cursor: null as string | null,
    };
  }

  const limit = clampInt(input.limit, 50, 1, 200);
  const cursor = decodeEventCursor(input.cursor);

  let query = input.controlDb.db
    .selectFrom('generation_run_event_state')
    .selectAll()
    .where('run_id', '=', runId)
    .orderBy('id', 'desc')
    .limit(limit);

  if (cursor) {
    query = query.where('id', '<', cursor.id);
  }

  const rows = await query.execute();
  const items = rows.map((row) => mapEventRow(row as unknown as Record<string, unknown>));
  const last = items.length === limit ? items[items.length - 1] : null;
  return {
    items,
    next_cursor: last ? encodeEventCursor({ id: Number(last.id || 0) }) : null,
  };
}

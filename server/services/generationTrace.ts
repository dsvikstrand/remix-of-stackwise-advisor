import type { SupabaseClient } from '@supabase/supabase-js';

type DbClient = SupabaseClient<any, 'public', any>;

export type GenerationRunStatus = 'running' | 'succeeded' | 'failed';
export type GenerationTraceLevel = 'debug' | 'info' | 'warn' | 'error';

export type GenerationRunRow = {
  id: string;
  run_id: string;
  user_id: string;
  blueprint_id: string | null;
  source_scope: string | null;
  source_tag: string | null;
  video_id: string | null;
  video_url: string | null;
  status: GenerationRunStatus;
  model_primary: string | null;
  model_used: string | null;
  fallback_used: boolean | null;
  fallback_model: string | null;
  reasoning_effort: string | null;
  quality_ok: boolean | null;
  quality_issues: string[] | null;
  quality_retries_used: number | null;
  quality_final_mode: string | null;
  trace_version: string | null;
  summary: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GenerationRunEventRow = {
  id: number;
  run_id: string;
  seq: number;
  level: GenerationTraceLevel;
  event: string;
  payload: Record<string, unknown>;
  created_at: string;
};

function normalizeObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

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

export async function startGenerationRun(
  db: DbClient,
  input: {
    runId: string;
    userId: string;
    sourceScope?: string | null;
    sourceTag?: string | null;
    videoId?: string | null;
    videoUrl?: string | null;
    modelPrimary?: string | null;
    reasoningEffort?: string | null;
    traceVersion?: string | null;
  },
) {
  const runId = String(input.runId || '').trim();
  const userId = String(input.userId || '').trim();
  if (!runId || !userId) return null;
  const nowIso = new Date().toISOString();

  const basePayload = {
    run_id: runId,
    user_id: userId,
    source_scope: String(input.sourceScope || '').trim() || null,
    source_tag: String(input.sourceTag || '').trim() || null,
    video_id: String(input.videoId || '').trim() || null,
    video_url: String(input.videoUrl || '').trim() || null,
    status: 'running' as GenerationRunStatus,
    model_primary: String(input.modelPrimary || '').trim() || null,
    reasoning_effort: String(input.reasoningEffort || '').trim() || null,
    trace_version: String(input.traceVersion || '').trim() || null,
    started_at: nowIso,
    finished_at: null,
    error_code: null,
    error_message: null,
  };

  const { data: existing, error: existingError } = await db
    .from('generation_runs')
    .select('id')
    .eq('run_id', runId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const { error: updateError } = await db
      .from('generation_runs')
      .update({
        ...basePayload,
        updated_at: nowIso,
      })
      .eq('run_id', runId)
      .select('run_id')
      .maybeSingle();
    if (updateError) throw updateError;
    return runId;
  }

  const { error: insertError } = await db
    .from('generation_runs')
    .insert(basePayload)
    .select('run_id')
    .maybeSingle();
  if (insertError) throw insertError;
  return runId;
}

export async function appendGenerationEvent(
  db: DbClient,
  input: {
    runId: string;
    event: string;
    level?: GenerationTraceLevel;
    payload?: Record<string, unknown>;
  },
) {
  const runId = String(input.runId || '').trim();
  const eventName = String(input.event || '').trim();
  if (!runId || !eventName) return null;

  const { data: latest, error: latestError } = await db
    .from('generation_run_events')
    .select('seq')
    .eq('run_id', runId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  const nextSeq = clampInt(latest?.seq, 0, 0, Number.MAX_SAFE_INTEGER) + 1;

  const payload = normalizeObject(input.payload);
  const { data, error } = await db
    .from('generation_run_events')
    .insert({
      run_id: runId,
      seq: nextSeq,
      level: (input.level || 'info') as GenerationTraceLevel,
      event: eventName,
      payload,
    })
    .select('id, run_id, seq, level, event, payload, created_at')
    .maybeSingle();
  if (error) throw error;
  return (data || null) as GenerationRunEventRow | null;
}

export async function updateGenerationModelInfo(
  db: DbClient,
  input: {
    runId: string;
    modelUsed?: string | null;
    fallbackUsed?: boolean | null;
    fallbackModel?: string | null;
    reasoningEffort?: string | null;
    modelPrimary?: string | null;
  },
) {
  const runId = String(input.runId || '').trim();
  if (!runId) return null;

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.modelPrimary !== undefined) payload.model_primary = String(input.modelPrimary || '').trim() || null;
  if (input.modelUsed !== undefined) payload.model_used = String(input.modelUsed || '').trim() || null;
  if (input.fallbackUsed !== undefined) payload.fallback_used = Boolean(input.fallbackUsed);
  if (input.fallbackModel !== undefined) payload.fallback_model = String(input.fallbackModel || '').trim() || null;
  if (input.reasoningEffort !== undefined) payload.reasoning_effort = String(input.reasoningEffort || '').trim() || null;

  const { error } = await db
    .from('generation_runs')
    .update(payload)
    .eq('run_id', runId)
    .select('run_id')
    .maybeSingle();
  if (error) throw error;
  return runId;
}

export async function attachBlueprintToRun(
  db: DbClient,
  input: { runId: string; blueprintId: string | null | undefined },
) {
  const runId = String(input.runId || '').trim();
  const blueprintId = String(input.blueprintId || '').trim();
  if (!runId || !blueprintId) return null;

  const { error } = await db
    .from('generation_runs')
    .update({
      blueprint_id: blueprintId,
      updated_at: new Date().toISOString(),
    })
    .eq('run_id', runId)
    .select('run_id')
    .maybeSingle();
  if (error) throw error;
  return runId;
}

export async function finalizeGenerationRunSuccess(
  db: DbClient,
  input: {
    runId: string;
    qualityOk: boolean;
    qualityIssues: string[];
    qualityRetriesUsed: number;
    qualityFinalMode: string;
    traceVersion?: string | null;
    summary?: Record<string, unknown> | null;
  },
) {
  const runId = String(input.runId || '').trim();
  if (!runId) return null;
  const nowIso = new Date().toISOString();
  const { error } = await db
    .from('generation_runs')
    .update({
      status: 'succeeded',
      quality_ok: Boolean(input.qualityOk),
      quality_issues: Array.from(new Set((input.qualityIssues || []).map((value) => String(value || '').trim()).filter(Boolean))),
      quality_retries_used: clampInt(input.qualityRetriesUsed, 0, 0, 20),
      quality_final_mode: String(input.qualityFinalMode || '').trim() || null,
      trace_version: String(input.traceVersion || '').trim() || null,
      summary: normalizeObject(input.summary),
      error_code: null,
      error_message: null,
      finished_at: nowIso,
      updated_at: nowIso,
    })
    .eq('run_id', runId)
    .select('run_id')
    .maybeSingle();
  if (error) throw error;
  return runId;
}

export async function finalizeGenerationRunFailure(
  db: DbClient,
  input: {
    runId: string;
    errorCode: string;
    errorMessage: string;
    traceVersion?: string | null;
    summary?: Record<string, unknown> | null;
  },
) {
  const runId = String(input.runId || '').trim();
  if (!runId) return null;
  const nowIso = new Date().toISOString();
  const { error } = await db
    .from('generation_runs')
    .update({
      status: 'failed',
      error_code: String(input.errorCode || '').trim() || 'GENERATION_FAIL',
      error_message: String(input.errorMessage || '').trim().slice(0, 1000) || 'Generation failed.',
      trace_version: String(input.traceVersion || '').trim() || null,
      summary: normalizeObject(input.summary),
      finished_at: nowIso,
      updated_at: nowIso,
    })
    .eq('run_id', runId)
    .select('run_id')
    .maybeSingle();
  if (error) throw error;
  return runId;
}

export async function getGenerationRunByRunId(
  db: DbClient,
  runId: string,
) {
  const normalized = String(runId || '').trim();
  if (!normalized) return null;
  const { data, error } = await db
    .from('generation_runs')
    .select('*')
    .eq('run_id', normalized)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as GenerationRunRow | null;
}

export async function getLatestGenerationRunByBlueprintId(
  db: DbClient,
  blueprintId: string,
) {
  const normalized = String(blueprintId || '').trim();
  if (!normalized) return null;
  const { data, error } = await db
    .from('generation_runs')
    .select('*')
    .eq('blueprint_id', normalized)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as GenerationRunRow | null;
}

export async function listGenerationRunEvents(
  db: DbClient,
  input: {
    runId: string;
    limit?: number;
    cursor?: string | null;
  },
) {
  const runId = String(input.runId || '').trim();
  if (!runId) {
    return {
      items: [] as GenerationRunEventRow[],
      next_cursor: null as string | null,
    };
  }

  const limit = clampInt(input.limit, 50, 1, 200);
  const cursor = decodeEventCursor(input.cursor);

  let query = db
    .from('generation_run_events')
    .select('id, run_id, seq, level, event, payload, created_at')
    .eq('run_id', runId)
    .order('id', { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt('id', cursor.id);
  }

  const { data, error } = await query;
  if (error) throw error;

  const items = (data || []) as GenerationRunEventRow[];
  const last = items.length === limit ? items[items.length - 1] : null;
  return {
    items,
    next_cursor: last ? encodeEventCursor({ id: Number(last.id || 0) }) : null,
  };
}

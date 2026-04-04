import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import {
  normalizeIsoOrNull,
  normalizeObject,
  normalizeRequiredIso,
  normalizeStringOrNull,
} from './oracleValueNormalization';

type DbClient = SupabaseClient<any, 'public', any>;

export type OracleGenerationVariantRow = {
  id: string;
  source_item_id: string;
  generation_tier: string;
  status: 'available' | 'queued' | 'running' | 'ready' | 'failed';
  blueprint_id: string | null;
  active_job_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OracleGenerationRunRow = {
  id: string;
  run_id: string;
  user_id: string;
  blueprint_id: string | null;
  source_scope: string | null;
  source_tag: string | null;
  video_id: string | null;
  video_url: string | null;
  status: 'running' | 'succeeded' | 'failed';
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

const VARIANT_SELECT = [
  'id',
  'source_item_id',
  'generation_tier',
  'status',
  'blueprint_id',
  'active_job_id',
  'last_error_code',
  'last_error_message',
  'created_by_user_id',
  'created_at',
  'updated_at',
].join(', ');

const RUN_SELECT = [
  'id',
  'run_id',
  'user_id',
  'blueprint_id',
  'source_scope',
  'source_tag',
  'video_id',
  'video_url',
  'status',
  'model_primary',
  'model_used',
  'fallback_used',
  'fallback_model',
  'reasoning_effort',
  'quality_ok',
  'quality_issues',
  'quality_retries_used',
  'quality_final_mode',
  'trace_version',
  'summary',
  'error_code',
  'error_message',
  'started_at',
  'finished_at',
  'created_at',
  'updated_at',
].join(', ');

function normalizeStatus(raw: unknown): OracleGenerationVariantRow['status'] {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'queued') return 'queued';
  if (normalized === 'running') return 'running';
  if (normalized === 'ready') return 'ready';
  if (normalized === 'failed') return 'failed';
  return 'available';
}

function normalizeRunStatus(raw: unknown): OracleGenerationRunRow['status'] {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'succeeded') return 'succeeded';
  if (normalized === 'failed') return 'failed';
  return 'running';
}

function normalizeBoolOrNull(value: unknown) {
  if (value == null || value === '') return null;
  return value === true || value === 1 || String(value).trim().toLowerCase() === 'true';
}

function normalizeIntOrNull(value: unknown, min = 0, max = 100_000) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeIssues(value: unknown) {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [];
}

function parseJsonObject(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  try {
    return normalizeObject(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseJsonArray(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizeIssues(parsed);
  } catch {
    return [];
  }
}

function mapVariantRow(row: Record<string, unknown>, nowIso?: string): OracleGenerationVariantRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const updatedAt = normalizeRequiredIso(row.updated_at, createdAt);
  return {
    id: String(row.id || '').trim() || randomUUID(),
    source_item_id: String(row.source_item_id || '').trim(),
    generation_tier: String(row.generation_tier || '').trim() || 'free',
    status: normalizeStatus(row.status),
    blueprint_id: normalizeStringOrNull(row.blueprint_id),
    active_job_id: normalizeStringOrNull(row.active_job_id),
    last_error_code: normalizeStringOrNull(row.last_error_code),
    last_error_message: normalizeStringOrNull(row.last_error_message),
    created_by_user_id: normalizeStringOrNull(row.created_by_user_id),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function mapRunRow(row: Record<string, unknown>, nowIso?: string): OracleGenerationRunRow {
  const createdAt = normalizeRequiredIso(row.created_at, nowIso);
  const startedAt = normalizeRequiredIso(row.started_at, createdAt);
  const updatedAt = normalizeRequiredIso(row.updated_at, startedAt);
  return {
    id: String(row.id || '').trim() || randomUUID(),
    run_id: String(row.run_id || '').trim() || randomUUID(),
    user_id: String(row.user_id || '').trim(),
    blueprint_id: normalizeStringOrNull(row.blueprint_id),
    source_scope: normalizeStringOrNull(row.source_scope),
    source_tag: normalizeStringOrNull(row.source_tag),
    video_id: normalizeStringOrNull(row.video_id),
    video_url: normalizeStringOrNull(row.video_url),
    status: normalizeRunStatus(row.status),
    model_primary: normalizeStringOrNull(row.model_primary),
    model_used: normalizeStringOrNull(row.model_used),
    fallback_used: normalizeBoolOrNull(row.fallback_used),
    fallback_model: normalizeStringOrNull(row.fallback_model),
    reasoning_effort: normalizeStringOrNull(row.reasoning_effort),
    quality_ok: normalizeBoolOrNull(row.quality_ok),
    quality_issues: normalizeIssues(row.quality_issues),
    quality_retries_used: normalizeIntOrNull(row.quality_retries_used),
    quality_final_mode: normalizeStringOrNull(row.quality_final_mode),
    trace_version: normalizeStringOrNull(row.trace_version),
    summary: normalizeObject(row.summary),
    error_code: normalizeStringOrNull(row.error_code),
    error_message: normalizeStringOrNull(row.error_message),
    started_at: startedAt,
    finished_at: normalizeIsoOrNull(row.finished_at),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function mapGenerationRunDbValues(row: OracleGenerationRunRow) {
  return {
    id: row.id,
    run_id: row.run_id,
    user_id: row.user_id,
    blueprint_id: row.blueprint_id,
    source_scope: row.source_scope,
    source_tag: row.source_tag,
    video_id: row.video_id,
    video_url: row.video_url,
    status: row.status,
    model_primary: row.model_primary,
    model_used: row.model_used,
    fallback_used: row.fallback_used == null ? null : (row.fallback_used ? 1 : 0),
    fallback_model: row.fallback_model,
    reasoning_effort: row.reasoning_effort,
    quality_ok: row.quality_ok == null ? null : (row.quality_ok ? 1 : 0),
    quality_issues_json: row.quality_issues == null ? null : JSON.stringify(row.quality_issues),
    quality_retries_used: row.quality_retries_used,
    quality_final_mode: row.quality_final_mode,
    trace_version: row.trace_version,
    summary_json: row.summary == null ? null : JSON.stringify(row.summary),
    error_code: row.error_code,
    error_message: row.error_message,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function upsertOracleGenerationVariantRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => mapVariantRow(row, nowIso))
    .filter((row) => Boolean(row.id && row.source_item_id && row.generation_tier));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('generation_variant_state')
        .values(row)
        .onConflict((oc) => oc.column('id').doUpdateSet(row))
        .execute();
    }
  }

  return rows;
}

export async function upsertOracleGenerationVariantRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Record<string, unknown>;
  nowIso?: string;
}) {
  const [row] = await upsertOracleGenerationVariantRows({
    controlDb: input.controlDb,
    rows: [input.row],
    nowIso: input.nowIso,
  });
  return row || null;
}

export async function getOracleGenerationVariant(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemId: string;
  generationTier: string;
}) {
  const sourceItemId = String(input.sourceItemId || '').trim();
  const generationTier = String(input.generationTier || '').trim();
  if (!sourceItemId || !generationTier) return null;

  const row = await input.controlDb.db
    .selectFrom('generation_variant_state')
    .selectAll()
    .where('source_item_id', '=', sourceItemId)
    .where('generation_tier', '=', generationTier)
    .executeTakeFirst();

  return row ? mapVariantRow(row as unknown as Record<string, unknown>) : null;
}

export async function ensureOracleGenerationVariantRecord(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemId: string;
  generationTier: string;
  createdByUserId?: string | null;
  nowIso?: string;
}) {
  const existing = await getOracleGenerationVariant(input);
  if (existing) return existing;
  const nowIso = normalizeRequiredIso(input.nowIso);
  return upsertOracleGenerationVariantRow({
    controlDb: input.controlDb,
    nowIso,
    row: {
      id: randomUUID(),
      source_item_id: input.sourceItemId,
      generation_tier: input.generationTier,
      status: 'available',
      blueprint_id: null,
      active_job_id: null,
      last_error_code: null,
      last_error_message: null,
      created_by_user_id: normalizeStringOrNull(input.createdByUserId),
      created_at: nowIso,
      updated_at: nowIso,
    },
  });
}

const VARIANT_IN_PROGRESS_STALE_MS = 20 * 60 * 1000;

function isOlderThan(rawIso: string | null | undefined, thresholdMs: number) {
  const parsed = Date.parse(String(rawIso || '').trim());
  if (!Number.isFinite(parsed)) return true;
  return (Date.now() - parsed) >= thresholdMs;
}

async function recoverOracleStaleVariant(input: {
  controlDb: OracleControlPlaneDb;
  row: OracleGenerationVariantRow;
}) {
  const nowIso = new Date().toISOString();
  await input.controlDb.db
    .updateTable('generation_variant_state')
    .set({
      status: 'failed',
      active_job_id: null,
      last_error_code: 'STALE_VARIANT_RECOVERED',
      last_error_message: 'Recovered stale in-progress variant (missing_active_job).',
      updated_at: nowIso,
    })
    .where('id', '=', input.row.id)
    .where('updated_at', '=', input.row.updated_at)
    .executeTakeFirst();
  return getOracleGenerationVariant({
    controlDb: input.controlDb,
    sourceItemId: input.row.source_item_id,
    generationTier: input.row.generation_tier,
  });
}

export async function resolveOracleGenerationVariantOrReady(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemId: string;
  generationTier: string;
  jobId?: string | null;
}) {
  const variant = await getOracleGenerationVariant(input);
  if (!variant) {
    return { state: 'needs_generation' as const, variant: null };
  }
  if (variant.blueprint_id && variant.status === 'ready') {
    return { state: 'ready' as const, variant, blueprintId: variant.blueprint_id };
  }
  if (variant.status === 'queued' || variant.status === 'running') {
    return {
      state: 'in_progress' as const,
      variant,
      ownedByCurrentJob: Boolean(input.jobId && variant.active_job_id === input.jobId),
    };
  }
  return { state: 'needs_generation' as const, variant };
}

export async function claimOracleGenerationVariantForGeneration(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemId: string;
  generationTier: string;
  userId?: string | null;
  jobId?: string | null;
  targetStatus?: 'queued' | 'running';
}) {
  const targetStatus = input.targetStatus || 'running';
  const nowIso = new Date().toISOString();
  await ensureOracleGenerationVariantRecord({
    controlDb: input.controlDb,
    sourceItemId: input.sourceItemId,
    generationTier: input.generationTier,
    createdByUserId: input.userId,
    nowIso,
  });

  const tryClaim = async () => {
    const result = await input.controlDb.db
      .updateTable('generation_variant_state')
      .set({
        status: targetStatus,
        active_job_id: normalizeStringOrNull(input.jobId),
        created_by_user_id: normalizeStringOrNull(input.userId),
        last_error_code: null,
        last_error_message: null,
        updated_at: nowIso,
      })
      .where('source_item_id', '=', input.sourceItemId)
      .where('generation_tier', '=', input.generationTier)
      .where('status', 'in', ['available', 'failed'])
      .executeTakeFirst();
    return Number(result.numUpdatedRows || 0) > 0;
  };

  if (await tryClaim()) {
    const variant = await getOracleGenerationVariant({
      controlDb: input.controlDb,
      sourceItemId: input.sourceItemId,
      generationTier: input.generationTier,
    });
    return { outcome: 'claimed' as const, variant };
  }

  let current = await getOracleGenerationVariant({
    controlDb: input.controlDb,
    sourceItemId: input.sourceItemId,
    generationTier: input.generationTier,
  });

  if (!current) {
    const ensured = await ensureOracleGenerationVariantRecord({
      controlDb: input.controlDb,
      sourceItemId: input.sourceItemId,
      generationTier: input.generationTier,
      createdByUserId: input.userId,
      nowIso,
    });
    return { outcome: 'claimed' as const, variant: ensured };
  }

  if (
    (current.status === 'queued' || current.status === 'running')
    && !current.active_job_id
    && isOlderThan(current.updated_at, VARIANT_IN_PROGRESS_STALE_MS)
  ) {
    current = (await recoverOracleStaleVariant({
      controlDb: input.controlDb,
      row: current,
    })) || current;
    if ((current.status === 'available' || current.status === 'failed') && await tryClaim()) {
      const claimed = await getOracleGenerationVariant({
        controlDb: input.controlDb,
        sourceItemId: input.sourceItemId,
        generationTier: input.generationTier,
      });
      return { outcome: 'claimed' as const, variant: claimed };
    }
  }

  if (current.status === 'ready' && current.blueprint_id) {
    return { outcome: 'ready' as const, variant: current, blueprintId: current.blueprint_id };
  }

  if (
    (current.status === 'queued' || current.status === 'running')
    && (!input.jobId || current.active_job_id !== input.jobId)
  ) {
    return { outcome: 'in_progress' as const, variant: current };
  }

  return { outcome: 'claimed' as const, variant: current };
}

export async function markOracleGenerationVariantReady(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemId: string;
  generationTier: string;
  blueprintId: string;
}) {
  const nowIso = new Date().toISOString();
  await input.controlDb.db
    .updateTable('generation_variant_state')
    .set({
      status: 'ready',
      blueprint_id: input.blueprintId,
      active_job_id: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: nowIso,
    })
    .where('source_item_id', '=', input.sourceItemId)
    .where('generation_tier', '=', input.generationTier)
    .executeTakeFirst();
  return getOracleGenerationVariant({
    controlDb: input.controlDb,
    sourceItemId: input.sourceItemId,
    generationTier: input.generationTier,
  });
}

export async function markOracleGenerationVariantFailed(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemId: string;
  generationTier: string;
  errorCode: string;
  errorMessage: string;
}) {
  const nowIso = new Date().toISOString();
  await input.controlDb.db
    .updateTable('generation_variant_state')
    .set({
      status: 'failed',
      active_job_id: null,
      last_error_code: String(input.errorCode || '').trim() || 'GENERATION_FAILED',
      last_error_message: String(input.errorMessage || '').trim().slice(0, 500) || 'Generation failed',
      updated_at: nowIso,
    })
    .where('source_item_id', '=', input.sourceItemId)
    .where('generation_tier', '=', input.generationTier)
    .executeTakeFirst();
  return getOracleGenerationVariant({
    controlDb: input.controlDb,
    sourceItemId: input.sourceItemId,
    generationTier: input.generationTier,
  });
}

export async function listOracleGenerationVariantsForSourceItem(input: {
  controlDb: OracleControlPlaneDb;
  sourceItemId: string;
}) {
  const sourceItemId = String(input.sourceItemId || '').trim();
  if (!sourceItemId) return [] as OracleGenerationVariantRow[];
  const rows = await input.controlDb.db
    .selectFrom('generation_variant_state')
    .selectAll()
    .where('source_item_id', '=', sourceItemId)
    .orderBy('generation_tier', 'asc')
    .execute();
  return rows.map((row) => mapVariantRow(row as unknown as Record<string, unknown>));
}

export async function findOracleGenerationVariantsByBlueprintId(input: {
  controlDb: OracleControlPlaneDb;
  blueprintId: string;
}) {
  const blueprintId = String(input.blueprintId || '').trim();
  if (!blueprintId) return null;

  const row = await input.controlDb.db
    .selectFrom('generation_variant_state')
    .selectAll()
    .where('blueprint_id', '=', blueprintId)
    .orderBy('updated_at', 'desc')
    .executeTakeFirst();
  if (!row) return null;

  const sourceItemId = String(row.source_item_id || '').trim();
  if (!sourceItemId) return null;
  const variants = await listOracleGenerationVariantsForSourceItem({
    controlDb: input.controlDb,
    sourceItemId,
  });
  return { sourceItemId, variants };
}

export async function upsertOracleGenerationRunRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => mapRunRow(row, nowIso))
    .filter((row) => Boolean(row.id && row.run_id && row.user_id));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      const dbRow = mapGenerationRunDbValues(row);
      await input.controlDb.db
        .insertInto('generation_run_state')
        .values(dbRow)
        .onConflict((oc) => oc.column('run_id').doUpdateSet(dbRow))
        .execute();
    }
  }

  return rows;
}

export async function upsertOracleGenerationRunRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Record<string, unknown>;
  nowIso?: string;
}) {
  const [row] = await upsertOracleGenerationRunRows({
    controlDb: input.controlDb,
    rows: [input.row],
    nowIso: input.nowIso,
  });
  return row || null;
}

export async function startOracleGenerationRun(input: {
  controlDb: OracleControlPlaneDb;
  runId: string;
  userId: string;
  sourceScope?: string | null;
  sourceTag?: string | null;
  videoId?: string | null;
  videoUrl?: string | null;
  modelPrimary?: string | null;
  reasoningEffort?: string | null;
  traceVersion?: string | null;
}) {
  const nowIso = new Date().toISOString();
  await upsertOracleGenerationRunRow({
    controlDb: input.controlDb,
    row: {
      id: input.runId,
      run_id: input.runId,
      user_id: input.userId,
      blueprint_id: null,
      source_scope: input.sourceScope || null,
      source_tag: input.sourceTag || null,
      video_id: input.videoId || null,
      video_url: input.videoUrl || null,
      status: 'running',
      model_primary: input.modelPrimary || null,
      model_used: null,
      fallback_used: null,
      fallback_model: null,
      reasoning_effort: input.reasoningEffort || null,
      quality_ok: null,
      quality_issues: [],
      quality_retries_used: null,
      quality_final_mode: null,
      trace_version: input.traceVersion || null,
      summary: null,
      error_code: null,
      error_message: null,
      started_at: nowIso,
      finished_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
    nowIso,
  });
  return input.runId;
}

export async function updateOracleGenerationRunModelInfo(input: {
  controlDb: OracleControlPlaneDb;
  runId: string;
  modelUsed?: string | null;
  fallbackUsed?: boolean | null;
  fallbackModel?: string | null;
  reasoningEffort?: string | null;
  modelPrimary?: string | null;
}) {
  const existing = await getOracleGenerationRunByRunId({
    controlDb: input.controlDb,
    runId: input.runId,
  });
  if (!existing) return null;
  return upsertOracleGenerationRunRow({
    controlDb: input.controlDb,
    row: {
      ...existing,
      model_primary: input.modelPrimary !== undefined ? input.modelPrimary : existing.model_primary,
      model_used: input.modelUsed !== undefined ? input.modelUsed : existing.model_used,
      fallback_used: input.fallbackUsed !== undefined ? input.fallbackUsed : existing.fallback_used,
      fallback_model: input.fallbackModel !== undefined ? input.fallbackModel : existing.fallback_model,
      reasoning_effort: input.reasoningEffort !== undefined ? input.reasoningEffort : existing.reasoning_effort,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function attachOracleBlueprintToGenerationRun(input: {
  controlDb: OracleControlPlaneDb;
  runId: string;
  blueprintId: string;
}) {
  const existing = await getOracleGenerationRunByRunId({
    controlDb: input.controlDb,
    runId: input.runId,
  });
  if (!existing) return null;
  return upsertOracleGenerationRunRow({
    controlDb: input.controlDb,
    row: {
      ...existing,
      blueprint_id: input.blueprintId,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function finalizeOracleGenerationRunSuccess(input: {
  controlDb: OracleControlPlaneDb;
  runId: string;
  qualityOk: boolean;
  qualityIssues: string[];
  qualityRetriesUsed: number;
  qualityFinalMode: string;
  traceVersion?: string | null;
  summary?: Record<string, unknown> | null;
}) {
  const existing = await getOracleGenerationRunByRunId({
    controlDb: input.controlDb,
    runId: input.runId,
  });
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  return upsertOracleGenerationRunRow({
    controlDb: input.controlDb,
    row: {
      ...existing,
      status: 'succeeded',
      quality_ok: Boolean(input.qualityOk),
      quality_issues: Array.from(new Set((input.qualityIssues || []).map((value) => String(value || '').trim()).filter(Boolean))),
      quality_retries_used: input.qualityRetriesUsed,
      quality_final_mode: input.qualityFinalMode || null,
      trace_version: input.traceVersion || null,
      summary: normalizeObject(input.summary),
      error_code: null,
      error_message: null,
      finished_at: nowIso,
      updated_at: nowIso,
    },
  });
}

export async function finalizeOracleGenerationRunFailure(input: {
  controlDb: OracleControlPlaneDb;
  runId: string;
  errorCode: string;
  errorMessage: string;
  traceVersion?: string | null;
  summary?: Record<string, unknown> | null;
}) {
  const existing = await getOracleGenerationRunByRunId({
    controlDb: input.controlDb,
    runId: input.runId,
  });
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  return upsertOracleGenerationRunRow({
    controlDb: input.controlDb,
    row: {
      ...existing,
      status: 'failed',
      error_code: String(input.errorCode || '').trim() || 'GENERATION_FAIL',
      error_message: String(input.errorMessage || '').trim().slice(0, 1000) || 'Generation failed.',
      trace_version: input.traceVersion || null,
      summary: normalizeObject(input.summary),
      finished_at: nowIso,
      updated_at: nowIso,
    },
  });
}

export async function getOracleGenerationRunByRunId(input: {
  controlDb: OracleControlPlaneDb;
  runId: string;
}) {
  const runId = String(input.runId || '').trim();
  if (!runId) return null;
  const row = await input.controlDb.db
    .selectFrom('generation_run_state')
    .selectAll()
    .where('run_id', '=', runId)
    .executeTakeFirst();
  return row
    ? mapRunRow({
        ...row,
        quality_issues: parseJsonArray(row.quality_issues_json),
        summary: parseJsonObject(row.summary_json),
      } as Record<string, unknown>)
    : null;
}

export async function getOracleLatestGenerationRunByBlueprintId(input: {
  controlDb: OracleControlPlaneDb;
  blueprintId: string;
}) {
  const blueprintId = String(input.blueprintId || '').trim();
  if (!blueprintId) return null;
  const row = await input.controlDb.db
    .selectFrom('generation_run_state')
    .selectAll()
    .where('blueprint_id', '=', blueprintId)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  return row
    ? mapRunRow({
        ...row,
        quality_issues: parseJsonArray(row.quality_issues_json),
        summary: parseJsonObject(row.summary_json),
      } as Record<string, unknown>)
    : null;
}

export async function listOracleFailedGenerationRunsByVideoId(input: {
  controlDb: OracleControlPlaneDb;
  videoId: string;
}) {
  const videoId = String(input.videoId || '').trim();
  if (!videoId) return [] as OracleGenerationRunRow[];
  const rows = await input.controlDb.db
    .selectFrom('generation_run_state')
    .selectAll()
    .where('video_id', '=', videoId)
    .where('status', '=', 'failed')
    .orderBy('updated_at', 'desc')
    .execute();
  return rows.map((row) => mapRunRow({
    ...row,
    quality_issues: parseJsonArray(row.quality_issues_json),
    summary: parseJsonObject(row.summary_json),
  } as Record<string, unknown>));
}

export async function syncOracleGenerationStateFromSupabase(input: {
  controlDb: OracleControlPlaneDb;
  db: DbClient;
  limit: number;
  nowIso?: string;
}) {
  const limit = Math.max(100, Math.floor(Number(input.limit) || 0));
  const pageSize = Math.min(1000, limit);
  const variantRows: Array<Record<string, unknown>> = [];
  const runRows: Array<Record<string, unknown>> = [];

  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(limit, from + pageSize) - 1;
    const { data, error } = await input.db
      .from('source_item_blueprint_variants')
      .select(VARIANT_SELECT)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) throw error;
    const batch = (data || []) as Array<Record<string, unknown>>;
    variantRows.push(...batch);
    if (batch.length < pageSize) break;
  }

  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(limit, from + pageSize) - 1;
    const { data, error } = await input.db
      .from('generation_runs')
      .select(RUN_SELECT)
      .order('updated_at', { ascending: false })
      .order('run_id', { ascending: false })
      .range(from, to);
    if (error) throw error;
    const batch = (data || []) as Array<Record<string, unknown>>;
    runRows.push(...batch);
    if (batch.length < pageSize) break;
  }

  await input.controlDb.db.deleteFrom('generation_variant_state').execute();
  await input.controlDb.db.deleteFrom('generation_run_state').execute();

  const syncedVariants = await upsertOracleGenerationVariantRows({
    controlDb: input.controlDb,
    rows: variantRows,
    nowIso: input.nowIso,
  });
  const syncedRuns = await upsertOracleGenerationRunRows({
    controlDb: input.controlDb,
    rows: runRows,
    nowIso: input.nowIso,
  });

  return {
    variantCount: syncedVariants.length,
    variantActiveCount: syncedVariants.filter((row) => row.status === 'queued' || row.status === 'running').length,
    runCount: syncedRuns.length,
    runActiveCount: syncedRuns.filter((row) => row.status === 'running').length,
  };
}

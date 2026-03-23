import type { GenerationTier } from './generationTierAccess';

type DbClient = any;

type VariantStatus = 'available' | 'queued' | 'running' | 'ready' | 'failed';

const VARIANT_IN_PROGRESS_STALE_MS = 20 * 60 * 1000;
const VARIANT_STALE_ERROR_CODE = 'STALE_VARIANT_RECOVERED';

export type SourceItemBlueprintVariantRow = {
  id: string;
  source_item_id: string;
  generation_tier: GenerationTier;
  status: VariantStatus;
  blueprint_id: string | null;
  active_job_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ResolveVariantStateResult =
  | {
      state: 'ready';
      variant: SourceItemBlueprintVariantRow;
      blueprintId: string;
    }
  | {
      state: 'in_progress';
      variant: SourceItemBlueprintVariantRow;
    }
  | {
      state: 'needs_generation';
      variant: SourceItemBlueprintVariantRow | null;
    };

function normalizeTier(raw: unknown): GenerationTier | null {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'free' || normalized === 'tier') return normalized;
  return null;
}

function normalizeStatus(raw: unknown): VariantStatus {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'queued') return 'queued';
  if (normalized === 'running') return 'running';
  if (normalized === 'ready') return 'ready';
  if (normalized === 'failed') return 'failed';
  return 'available';
}

function parseTimestampMs(raw: unknown) {
  const parsed = Date.parse(String(raw || '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isOlderThan(raw: unknown, thresholdMs: number) {
  const parsed = parseTimestampMs(raw);
  if (parsed == null) return true;
  return (Date.now() - parsed) >= thresholdMs;
}

function normalizeVariantRow(raw: any): SourceItemBlueprintVariantRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const sourceItemId = String(raw.source_item_id || '').trim();
  const tier = normalizeTier(raw.generation_tier);
  const id = String(raw.id || '').trim();
  if (!id || !sourceItemId || !tier) return null;
  return {
    id,
    source_item_id: sourceItemId,
    generation_tier: tier,
    status: normalizeStatus(raw.status),
    blueprint_id: String(raw.blueprint_id || '').trim() || null,
    active_job_id: String(raw.active_job_id || '').trim() || null,
    last_error_code: String(raw.last_error_code || '').trim() || null,
    last_error_message: String(raw.last_error_message || '').trim() || null,
    created_by_user_id: String(raw.created_by_user_id || '').trim() || null,
    created_at: String(raw.created_at || ''),
    updated_at: String(raw.updated_at || ''),
  };
}

const VARIANT_COLUMNS = [
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
].join(',');

export class BlueprintVariantInProgressError extends Error {
  sourceItemId: string;
  generationTier: GenerationTier;
  activeJobId: string | null;

  constructor(input: { sourceItemId: string; generationTier: GenerationTier; activeJobId?: string | null }) {
    super('Variant generation is already in progress.');
    this.sourceItemId = input.sourceItemId;
    this.generationTier = input.generationTier;
    this.activeJobId = input.activeJobId || null;
  }
}

export function createBlueprintVariantsService(deps: {
  getServiceSupabaseClient: () => DbClient | null;
}) {
  const getDb = () => {
    const db = deps.getServiceSupabaseClient();
    if (!db) {
      throw new Error('Service role client not configured');
    }
    return db;
  };

  async function getVariant(sourceItemId: string, generationTier: GenerationTier) {
    const db = getDb();
    const { data, error } = await db
      .from('source_item_blueprint_variants')
      .select(VARIANT_COLUMNS)
      .eq('source_item_id', sourceItemId)
      .eq('generation_tier', generationTier)
      .maybeSingle();
    if (error) throw error;
    return normalizeVariantRow(data);
  }

  async function ensureVariantRecord(input: {
    sourceItemId: string;
    generationTier: GenerationTier;
    createdByUserId?: string | null;
  }) {
    const db = getDb();
    const payload = {
      source_item_id: input.sourceItemId,
      generation_tier: input.generationTier,
      status: 'available',
      created_by_user_id: input.createdByUserId || null,
    };

    const insertResult = await db
      .from('source_item_blueprint_variants')
      .insert(payload)
      .select(VARIANT_COLUMNS)
      .maybeSingle();

    if (!insertResult.error) {
      return normalizeVariantRow(insertResult.data);
    }

    const duplicateCode = String((insertResult.error as { code?: string } | null)?.code || '');
    if (duplicateCode !== '23505') {
      throw insertResult.error;
    }

    return getVariant(input.sourceItemId, input.generationTier);
  }

  async function markVariantRecoveredFromStale(input: {
    variant: SourceItemBlueprintVariantRow;
    reason: string;
  }) {
    const db = getDb();
    const { data, error } = await db
      .from('source_item_blueprint_variants')
      .update({
        status: 'failed',
        active_job_id: null,
        last_error_code: VARIANT_STALE_ERROR_CODE,
        last_error_message: `Recovered stale in-progress variant (${input.reason}).`,
      })
      .eq('id', input.variant.id)
      .eq('updated_at', input.variant.updated_at)
      .select(VARIANT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (data) return normalizeVariantRow(data);
    return getVariant(input.variant.source_item_id, input.variant.generation_tier);
  }

  async function maybeRecoverStaleInProgressVariant(variant: SourceItemBlueprintVariantRow) {
    if (variant.status !== 'queued' && variant.status !== 'running') return variant;
    if (!isOlderThan(variant.updated_at, VARIANT_IN_PROGRESS_STALE_MS)) return variant;
    if (variant.active_job_id) return variant;
    return markVariantRecoveredFromStale({
      variant,
      reason: 'missing_active_job',
    });
  }

  async function resolveVariantOrReady(input: {
    sourceItemId: string;
    generationTier: GenerationTier;
  }): Promise<ResolveVariantStateResult> {
    const variant = await getVariant(input.sourceItemId, input.generationTier);
    if (!variant) {
      return { state: 'needs_generation', variant: null };
    }
    if (variant.blueprint_id && variant.status === 'ready') {
      return {
        state: 'ready',
        variant,
        blueprintId: variant.blueprint_id,
      };
    }
    if (variant.status === 'queued' || variant.status === 'running') {
      return {
        state: 'in_progress',
        variant,
      };
    }
    return {
      state: 'needs_generation',
      variant,
    };
  }

  async function claimVariantForGeneration(input: {
    sourceItemId: string;
    generationTier: GenerationTier;
    userId?: string | null;
    jobId?: string | null;
    targetStatus?: Extract<VariantStatus, 'queued' | 'running'>;
  }) {
    const db = getDb();
    const targetStatus = input.targetStatus || 'running';
    const tryClaim = async () => {
      const { data: updated, error: updateError } = await db
        .from('source_item_blueprint_variants')
        .update({
          status: targetStatus,
          active_job_id: input.jobId || null,
          created_by_user_id: input.userId || null,
          last_error_code: null,
          last_error_message: null,
        })
        .eq('source_item_id', input.sourceItemId)
        .eq('generation_tier', input.generationTier)
        .in('status', ['available', 'failed'])
        .select(VARIANT_COLUMNS)
        .maybeSingle();

      if (updateError) throw updateError;
      return normalizeVariantRow(updated);
    };

    await ensureVariantRecord({
      sourceItemId: input.sourceItemId,
      generationTier: input.generationTier,
      createdByUserId: input.userId || null,
    });

    let claimed = await tryClaim();
    if (claimed) {
      return {
        outcome: 'claimed' as const,
        variant: claimed,
      };
    }

    const current = await getVariant(input.sourceItemId, input.generationTier);
    if (!current) {
      const ensured = await ensureVariantRecord({
        sourceItemId: input.sourceItemId,
        generationTier: input.generationTier,
        createdByUserId: input.userId || null,
      });
      claimed = await tryClaim();
      if (claimed) {
        return {
          outcome: 'claimed' as const,
          variant: claimed,
        };
      }
      return {
        outcome: 'claimed' as const,
        variant: ensured,
      };
    }

    const recovered = await maybeRecoverStaleInProgressVariant(current);
    if (recovered && (recovered.status === 'available' || recovered.status === 'failed')) {
      claimed = await tryClaim();
      if (claimed) {
        return {
          outcome: 'claimed' as const,
          variant: claimed,
        };
      }
    }
    const resolvedCurrent = recovered || current;

    if (resolvedCurrent.status === 'ready' && resolvedCurrent.blueprint_id) {
      return {
        outcome: 'ready' as const,
        variant: resolvedCurrent,
        blueprintId: resolvedCurrent.blueprint_id,
      };
    }

    if (
      (resolvedCurrent.status === 'queued' || resolvedCurrent.status === 'running')
      && (!input.jobId || resolvedCurrent.active_job_id !== input.jobId)
    ) {
      return {
        outcome: 'in_progress' as const,
        variant: resolvedCurrent,
      };
    }

    return {
      outcome: 'claimed' as const,
      variant: resolvedCurrent,
    };
  }

  async function markVariantReady(input: {
    sourceItemId: string;
    generationTier: GenerationTier;
    blueprintId: string;
    jobId?: string | null;
  }) {
    const db = getDb();
    const { data, error } = await db
      .from('source_item_blueprint_variants')
      .update({
        status: 'ready',
        blueprint_id: input.blueprintId,
        active_job_id: null,
        last_error_code: null,
        last_error_message: null,
      })
      .eq('source_item_id', input.sourceItemId)
      .eq('generation_tier', input.generationTier)
      .select(VARIANT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return normalizeVariantRow(data);
  }

  async function markVariantFailed(input: {
    sourceItemId: string;
    generationTier: GenerationTier;
    errorCode: string;
    errorMessage: string;
  }) {
    const db = getDb();
    const { data, error } = await db
      .from('source_item_blueprint_variants')
      .update({
        status: 'failed',
        active_job_id: null,
        last_error_code: String(input.errorCode || '').trim() || 'GENERATION_FAILED',
        last_error_message: String(input.errorMessage || '').slice(0, 500) || 'Generation failed',
      })
      .eq('source_item_id', input.sourceItemId)
      .eq('generation_tier', input.generationTier)
      .select(VARIANT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    return normalizeVariantRow(data);
  }

  async function listVariantsForSourceItem(sourceItemId: string) {
    const db = getDb();
    const { data, error } = await db
      .from('source_item_blueprint_variants')
      .select(VARIANT_COLUMNS)
      .eq('source_item_id', sourceItemId)
      .order('generation_tier', { ascending: true });
    if (error) throw error;
    return (data || [])
      .map((row: unknown) => normalizeVariantRow(row))
      .filter((row: SourceItemBlueprintVariantRow | null): row is SourceItemBlueprintVariantRow => Boolean(row));
  }

  async function findVariantsByBlueprintId(blueprintId: string) {
    const db = getDb();
    const normalizedBlueprintId = String(blueprintId || '').trim();
    if (!normalizedBlueprintId) return null;

    const { data: matchRow, error: matchError } = await db
      .from('source_item_blueprint_variants')
      .select(VARIANT_COLUMNS)
      .eq('blueprint_id', normalizedBlueprintId)
      .maybeSingle();
    if (matchError) throw matchError;

    const matchedVariant = normalizeVariantRow(matchRow);
    let sourceItemId = matchedVariant?.source_item_id || null;

    if (!sourceItemId) {
      const { data: unlockRow } = await db
        .from('source_item_unlocks')
        .select('source_item_id, updated_at')
        .eq('blueprint_id', normalizedBlueprintId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sourceItemId = String(unlockRow?.source_item_id || '').trim() || null;
    }

    if (!sourceItemId) {
      const { data: feedRow } = await db
        .from('user_feed_items')
        .select('source_item_id, created_at')
        .eq('blueprint_id', normalizedBlueprintId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sourceItemId = String(feedRow?.source_item_id || '').trim() || null;
    }

    if (!sourceItemId) return null;

    const variants = await listVariantsForSourceItem(sourceItemId);
    return {
      sourceItemId,
      variants,
    };
  }

  return {
    getVariant,
    ensureVariantRecord,
    resolveVariantOrReady,
    claimVariantForGeneration,
    markVariantReady,
    markVariantFailed,
    listVariantsForSourceItem,
    findVariantsByBlueprintId,
  };
}

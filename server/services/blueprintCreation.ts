import type { GenerationTier } from './generationTierAccess';
import { DAILY_GENERATION_CAP_ERROR_CODE } from './generationDailyCap';
import { BlueprintVariantInProgressError } from './blueprintVariants';
import type { BlueprintSectionsV1 } from './blueprintSections';
type DbClient = any;

import { buildStoredPreviewSummary } from '../../src/lib/feedPreview';

function isMissingColumnError(error: unknown, column: string) {
  const e = error as { message?: unknown; details?: unknown; hint?: unknown } | null;
  const hay = `${String(e?.message || '')} ${String(e?.details || '')} ${String(e?.hint || '')}`.toLowerCase();
  return hay.includes('does not exist') && hay.includes(column.toLowerCase());
}

type CreateBlueprintFromVideoInput = {
  userId: string;
  videoUrl: string;
  videoId: string;
  videoTitle?: string | null;
  durationSeconds?: number | null;
  sourceTag:
    | 'subscription_auto'
    | 'subscription_accept'
    | 'source_page_video_library'
    | 'youtube_search_direct'
    | 'source_unlock_generation'
    | 'manual_refresh_generate';
  sourceItemId?: string | null;
  subscriptionId?: string | null;
  jobId?: string | null;
  generationTier?: GenerationTier;
  requestClass?: 'interactive' | 'background';
  onBeforeFirstModelDispatch?: () => Promise<void>;
};

type CreateBlueprintFromVideoResult = {
  blueprintId: string;
  runId: string;
  title: string;
  creationState: 'generated' | 'ready_existing';
};

export type BlueprintCreationDeps = {
  getServiceSupabaseClient: () => DbClient | null;
  safeGenerationTraceWrite: (input: {
    runId: string;
    op: string;
    fn: () => Promise<unknown>;
  }) => Promise<void>;
  startGenerationRun: (
    db: DbClient,
    input: {
      runId: string;
      userId: string;
      sourceScope: string | null;
      sourceTag: string | null;
      videoId: string | null;
      videoUrl: string | null;
      modelPrimary: string | null;
      reasoningEffort: string | null;
      traceVersion: string;
    },
  ) => Promise<void>;
  runYouTubePipeline: (input: {
    runId: string;
    videoId: string;
    videoUrl: string;
    videoTitle?: string | null;
    durationSeconds?: number | null;
    generateReview: boolean;
    generateBanner: boolean;
    authToken: string;
    generationTier?: GenerationTier;
    generationModelProfile?: {
      model?: string;
      fallbackModel?: string;
      reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    };
    requestClass?: 'interactive' | 'background';
    trace?: {
      db?: DbClient | null;
      userId?: string | null;
      sourceScope?: string | null;
      sourceTag?: string | null;
    };
    onBeforeFirstModelDispatch?: () => Promise<void>;
  }) => Promise<{
    run_id: string;
    draft: {
      title: string;
      description: string;
      steps: Array<{ name: string; notes: string; timestamp: string | null }>;
      notes: string | null;
      tags: string[];
      sectionsJson: BlueprintSectionsV1 | null;
      summaryVariants: {
        default: string;
        eli5: string;
      };
      eli5Steps: Array<{ name: string; notes: string; timestamp: string | null }>;
    };
    review: {
      summary: string | null;
    };
    meta: Record<string, unknown> | null;
  }>;
  toTagSlug: (value: string) => string;
  ensureTagId: (db: DbClient, userId: string, tagSlug: string) => Promise<string>;
  attachBlueprintToRun: (db: DbClient, input: { runId: string; blueprintId: string }) => Promise<void>;
  youtubeVideoIdRegex: RegExp;
  resolveGenerationModelProfile: (
    tier: GenerationTier,
  ) => {
    model: string;
    fallbackModel: string;
    reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  };
  claimVariantForGeneration: (input: {
    sourceItemId: string;
    generationTier: GenerationTier;
    userId?: string | null;
    jobId?: string | null;
    targetStatus?: 'queued' | 'running';
  }) => Promise<
    | { outcome: 'claimed'; variant: { active_job_id: string | null } | null }
    | { outcome: 'in_progress'; variant: { active_job_id: string | null } | null }
    | { outcome: 'ready'; variant: { active_job_id: string | null } | null; blueprintId: string }
  >;
  markVariantReady: (input: {
    sourceItemId: string;
    generationTier: GenerationTier;
    blueprintId: string;
    jobId?: string | null;
  }) => Promise<unknown>;
  markVariantFailed: (input: {
    sourceItemId: string;
    generationTier: GenerationTier;
    errorCode: string;
    errorMessage: string;
  }) => Promise<unknown>;
  enqueueBlueprintYouTubeEnrichment?: (input: {
    db: DbClient;
    traceDb?: DbClient | null;
    runId: string;
    blueprintId: string;
    explicitVideoId?: string | null;
    explicitSourceItemId?: string | null;
  }) => Promise<void>;
  registerBlueprintYouTubeRefreshState?: (input: {
    db: DbClient;
    runId: string;
    blueprintId: string;
    explicitVideoId?: string | null;
    explicitSourceItemId?: string | null;
  }) => Promise<void>;
};

export function createBlueprintCreationService(deps: BlueprintCreationDeps) {
  async function createBlueprintFromVideo(
    db: DbClient,
    input: CreateBlueprintFromVideoInput,
  ): Promise<CreateBlueprintFromVideoResult> {
    const sourceScope = input.sourceTag === 'youtube_search_direct'
      ? 'search_video_generate'
      : input.sourceTag === 'manual_refresh_generate'
        ? 'manual_refresh_selection'
        : input.sourceTag === 'source_unlock_generation'
          ? 'source_item_unlock_generation'
          : input.sourceTag;
    let sourceThumbnailUrl: string | null = null;
    let resolvedVideoTitle: string | null = String(input.videoTitle || '').trim() || null;
    const normalizedSourceItemId = String(input.sourceItemId || '').trim();
    const generationTier: GenerationTier = 'tier';
    const generationModelProfile = deps.resolveGenerationModelProfile(generationTier);
    const requestClass = (
      input.requestClass === 'interactive'
      || input.sourceTag === 'youtube_search_direct'
      || input.sourceTag === 'manual_refresh_generate'
      || input.sourceTag === 'source_page_video_library'
      || input.sourceTag === 'source_unlock_generation'
    ) ? 'interactive' : 'background';
    let claimedVariant = false;

    if (normalizedSourceItemId) {
      const variantClaim = await deps.claimVariantForGeneration({
        sourceItemId: normalizedSourceItemId,
        generationTier,
        userId: input.userId,
        jobId: input.jobId || null,
        targetStatus: 'running',
      });
      if (variantClaim.outcome === 'ready') {
        const { data: existingBlueprint, error: existingBlueprintError } = await db
          .from('blueprints')
          .select('id, title')
          .eq('id', variantClaim.blueprintId)
          .maybeSingle();
        if (existingBlueprintError) throw existingBlueprintError;
        if (existingBlueprint?.id) {
          return {
            blueprintId: existingBlueprint.id,
            runId: `variant-ready-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: String(existingBlueprint.title || '').trim() || 'Blueprint',
            creationState: 'ready_existing',
          };
        }
      }
      if (variantClaim.outcome === 'in_progress') {
        throw new BlueprintVariantInProgressError({
          sourceItemId: normalizedSourceItemId,
          generationTier,
          activeJobId: variantClaim.variant?.active_job_id || null,
        });
      }
      claimedVariant = true;
    }

    if (normalizedSourceItemId) {
      const { data: sourceRow } = await db
        .from('source_items')
        .select('thumbnail_url, title')
        .eq('id', normalizedSourceItemId)
        .maybeSingle();
      sourceThumbnailUrl = String(sourceRow?.thumbnail_url || '').trim() || null;
      if (!resolvedVideoTitle) {
        resolvedVideoTitle = String(sourceRow?.title || '').trim() || null;
      }
    }
    if (!sourceThumbnailUrl && deps.youtubeVideoIdRegex.test(String(input.videoId || '').trim())) {
      sourceThumbnailUrl = `https://i.ytimg.com/vi/${String(input.videoId || '').trim()}/hqdefault.jpg`;
    }

    const runId = `sub-${input.sourceTag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const traceDb = deps.getServiceSupabaseClient();
    if (traceDb) {
      await deps.safeGenerationTraceWrite({
        runId,
        op: 'start_run_create_blueprint',
        fn: async () => {
          await deps.startGenerationRun(traceDb, {
            runId,
            userId: input.userId,
            sourceScope,
            sourceTag: input.sourceTag,
            videoId: input.videoId,
            videoUrl: input.videoUrl,
            modelPrimary: generationModelProfile.model,
            reasoningEffort: generationModelProfile.reasoningEffort,
            traceVersion: 'yt2bp_trace_v2',
          });
        },
      });
    }
    try {
      const result = await deps.runYouTubePipeline({
        runId,
        videoId: input.videoId,
        videoUrl: input.videoUrl,
        videoTitle: resolvedVideoTitle || input.videoId,
        durationSeconds: input.durationSeconds ?? null,
        generateReview: false,
        generateBanner: false,
        authToken: '',
        generationTier,
        generationModelProfile,
        requestClass,
        trace: {
          db: traceDb,
          userId: input.userId,
          sourceScope,
          sourceTag: input.sourceTag,
        },
        onBeforeFirstModelDispatch: input.onBeforeFirstModelDispatch,
      });
      const draftTags = (result.draft.tags || [])
        .map((tag) => deps.toTagSlug(String(tag || '').trim()))
        .filter(Boolean)
        .slice(0, 5);
      const sectionsJson = result.draft.sectionsJson;
      if (!sectionsJson || sectionsJson.schema_version !== 'blueprint_sections_v1') {
        const error = new Error('Current YT2BP persistence requires canonical sections_json.');
        (error as Error & { code?: string }).code = 'CANONICAL_SECTIONS_REQUIRED';
        throw error;
      }

      const insertBlueprint = (payload: Record<string, unknown>) =>
        db
          .from('blueprints')
          .insert(payload)
          .select('id')
          .single();

      const baseInsertPayload = {
        title: result.draft.title,
        creator_user_id: input.userId,
        is_public: false,
        banner_url: sourceThumbnailUrl,
        mix_notes: result.draft.notes || null,
        llm_review: result.review.summary || null,
        preview_summary: buildStoredPreviewSummary({
          sectionsJson,
          primary: result.review.summary || null,
          secondary: result.draft.notes || null,
          fallback: result.draft.title,
          maxChars: 220,
        }),
      };

      let blueprintInsert = await insertBlueprint({
        ...baseInsertPayload,
        sections_json: sectionsJson,
      });

      if (blueprintInsert.error && isMissingColumnError(blueprintInsert.error, 'sections_json')) {
        const error = new Error('blueprints.sections_json is required for current YT2BP writes.');
        (error as Error & { code?: string }).code = 'SECTIONS_JSON_COLUMN_REQUIRED';
        throw error;
      }

      const { data: blueprint, error: blueprintError } = blueprintInsert;
      if (blueprintError) throw blueprintError;

      for (const tagSlug of draftTags) {
        if (!tagSlug) continue;
        const tagId = await deps.ensureTagId(db, input.userId, tagSlug);
        await db
          .from('blueprint_tags')
          .upsert({ blueprint_id: blueprint.id, tag_id: tagId }, { onConflict: 'blueprint_id,tag_id' });
      }

      if (normalizedSourceItemId) {
        await deps.markVariantReady({
          sourceItemId: normalizedSourceItemId,
          generationTier,
          blueprintId: blueprint.id,
        });
      }

      if (traceDb) {
        await deps.safeGenerationTraceWrite({
          runId: result.run_id,
          op: 'attach_blueprint_to_run',
          fn: async () => {
            await deps.attachBlueprintToRun(traceDb, {
              runId: result.run_id,
              blueprintId: blueprint.id,
            });
          },
        });
      }

      if (deps.enqueueBlueprintYouTubeEnrichment) {
        try {
          await deps.enqueueBlueprintYouTubeEnrichment({
            db,
            traceDb,
            runId: result.run_id,
            blueprintId: blueprint.id,
            explicitVideoId: input.videoId,
            explicitSourceItemId: normalizedSourceItemId || null,
          });
        } catch (youtubeCommentsError) {
          console.log('[blueprint_youtube_comments_enqueue_failed]', JSON.stringify({
            blueprint_id: blueprint.id,
            run_id: result.run_id,
            error: youtubeCommentsError instanceof Error ? youtubeCommentsError.message : String(youtubeCommentsError),
          }));
        }
      }

      if (deps.registerBlueprintYouTubeRefreshState) {
        try {
          await deps.registerBlueprintYouTubeRefreshState({
            db,
            runId: result.run_id,
            blueprintId: blueprint.id,
            explicitVideoId: input.videoId,
            explicitSourceItemId: normalizedSourceItemId || null,
          });
        } catch (refreshRegisterError) {
          console.log('[blueprint_youtube_refresh_register_failed]', JSON.stringify({
            blueprint_id: blueprint.id,
            run_id: result.run_id,
            error: refreshRegisterError instanceof Error ? refreshRegisterError.message : String(refreshRegisterError),
          }));
        }
      }

      return {
        blueprintId: blueprint.id,
        runId: result.run_id,
        title: result.draft.title,
        creationState: 'generated',
      };
    } catch (error) {
      if (normalizedSourceItemId && claimedVariant && !(error instanceof BlueprintVariantInProgressError)) {
        const rawErrorCode = String(
          (error as { errorCode?: unknown; code?: unknown } | null)?.errorCode
            || (error as { errorCode?: unknown; code?: unknown } | null)?.code
            || '',
        ).trim() || 'GENERATION_FAILED';
        const rawErrorMessage = error instanceof Error ? error.message : String(error);
        try {
          await deps.markVariantFailed({
            sourceItemId: normalizedSourceItemId,
            generationTier,
            errorCode: rawErrorCode,
            errorMessage: rawErrorMessage,
          });
        } catch (variantError) {
          console.log('[variant_mark_failed_error]', JSON.stringify({
            source_item_id: normalizedSourceItemId,
            generation_tier: generationTier,
            error: variantError instanceof Error ? variantError.message : String(variantError),
          }));
        }
      }
      if (
        error
        && typeof error === 'object'
        && String((error as { code?: unknown }).code || '').trim().toUpperCase() === DAILY_GENERATION_CAP_ERROR_CODE
      ) {
        throw error;
      }
      throw error;
    }
  }

  return {
    createBlueprintFromVideo,
  };
}

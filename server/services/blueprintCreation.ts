type DbClient = any;

type CreateBlueprintFromVideoInput = {
  userId: string;
  videoUrl: string;
  videoId: string;
  sourceTag:
    | 'subscription_auto'
    | 'subscription_accept'
    | 'source_page_video_library'
    | 'youtube_search_direct'
    | 'source_unlock_generation'
    | 'manual_refresh_generate';
  sourceItemId?: string | null;
  subscriptionId?: string | null;
};

type CreateBlueprintFromVideoResult = {
  blueprintId: string;
  runId: string;
  title: string;
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
    generateReview: boolean;
    generateBanner: boolean;
    authToken: string;
    requestClass?: 'interactive' | 'background';
    trace?: {
      db?: DbClient | null;
      userId?: string | null;
      sourceScope?: string | null;
      sourceTag?: string | null;
    };
  }) => Promise<{
    run_id: string;
    draft: {
      title: string;
      description: string;
      steps: Array<{ name: string; notes: string; timestamp: string | null }>;
      notes: string | null;
      tags: string[];
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
  mapDraftStepsForBlueprint: (steps: Array<{ name: string; notes: string; timestamp: string | null }>) => unknown[];
  normalizeSummaryVariantText: (value: string) => string;
  yt2bpOutputMode: 'llm_native' | 'deterministic';
  ensureTagId: (db: DbClient, userId: string, tagSlug: string) => Promise<string>;
  attachBlueprintToRun: (db: DbClient, input: { runId: string; blueprintId: string }) => Promise<void>;
  youtubeVideoIdRegex: RegExp;
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
    const normalizedSourceItemId = String(input.sourceItemId || '').trim();
    if (normalizedSourceItemId) {
      const { data: sourceRow } = await db
        .from('source_items')
        .select('thumbnail_url')
        .eq('id', normalizedSourceItemId)
        .maybeSingle();
      sourceThumbnailUrl = String(sourceRow?.thumbnail_url || '').trim() || null;
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
            modelPrimary: String(process.env.OPENAI_GENERATION_MODEL || 'gpt-5.2').trim() || 'gpt-5.2',
            reasoningEffort: String(process.env.OPENAI_GENERATION_REASONING_EFFORT || 'medium').trim().toLowerCase() || 'medium',
            traceVersion: 'yt2bp_trace_v2',
          });
        },
      });
    }
    const result = await deps.runYouTubePipeline({
      runId,
      videoId: input.videoId,
      videoUrl: input.videoUrl,
      generateReview: false,
      generateBanner: false,
      authToken: '',
      requestClass: 'background',
      trace: {
        db: traceDb,
        userId: input.userId,
        sourceScope,
        sourceTag: input.sourceTag,
      },
    });
    const draftTags = (result.draft.tags || [])
      .map((tag) => deps.toTagSlug(String(tag || '').trim()))
      .filter(Boolean)
      .slice(0, 5);
    const summaryWordCount = String(result.draft.description || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    const { data: blueprint, error: blueprintError } = await db
      .from('blueprints')
      .insert({
        title: result.draft.title,
        creator_user_id: input.userId,
        is_public: false,
        steps: deps.mapDraftStepsForBlueprint(result.draft.steps),
        selected_items: {
          source: input.sourceTag,
          run_id: result.run_id,
          video_url: input.videoUrl,
          bp_style: 'golden_v1',
          bp_origin: 'youtube_pipeline',
          bp_domain: 'deep',
          summary_word_count: summaryWordCount,
          bp_structure_ok: Boolean((result.meta as { bp_structure_ok?: unknown } | null)?.bp_structure_ok ?? true),
          bp_structure_issues: Array.isArray((result.meta as { bp_structure_issues?: unknown } | null)?.bp_structure_issues)
            ? (result.meta as { bp_structure_issues: unknown[] }).bp_structure_issues
            : [],
          bp_quality_ok: Boolean((result.meta as { bp_quality_ok?: unknown } | null)?.bp_quality_ok),
          bp_quality_issues: Array.isArray((result.meta as { bp_quality_issues?: unknown } | null)?.bp_quality_issues)
            ? (result.meta as { bp_quality_issues: unknown[] }).bp_quality_issues
            : [],
          bp_quality_retries_used: Number((result.meta as { bp_quality_retries_used?: unknown } | null)?.bp_quality_retries_used || 0),
          bp_quality_final_mode: String((result.meta as { bp_quality_final_mode?: unknown } | null)?.bp_quality_final_mode || 'direct'),
          bp_output_mode: String((result.meta as { bp_output_mode?: unknown } | null)?.bp_output_mode || deps.yt2bpOutputMode),
          bp_summary_variants: {
            default: deps.normalizeSummaryVariantText(result.draft.summaryVariants?.default || ''),
            eli5: deps.normalizeSummaryVariantText(result.draft.summaryVariants?.eli5 || ''),
          },
          bp_step_variants: {
            default: deps.mapDraftStepsForBlueprint(result.draft.steps),
            eli5: deps.mapDraftStepsForBlueprint(
              Array.isArray(result.draft.eli5Steps) && result.draft.eli5Steps.length > 0
                ? result.draft.eli5Steps
                : result.draft.steps,
            ),
          },
          bp_trace_version: String((result.meta as { bp_trace_version?: unknown } | null)?.bp_trace_version || 'yt2bp_trace_v2'),
          bp_run_id: result.run_id,
          bp_trace_source: 'generation_runs',
        },
        banner_url: sourceThumbnailUrl,
        mix_notes: result.draft.notes || null,
        llm_review: result.review.summary || null,
      })
      .select('id')
      .single();
    if (blueprintError) throw blueprintError;

    for (const tagSlug of draftTags) {
      if (!tagSlug) continue;
      const tagId = await deps.ensureTagId(db, input.userId, tagSlug);
      await db
        .from('blueprint_tags')
        .upsert({ blueprint_id: blueprint.id, tag_id: tagId }, { onConflict: 'blueprint_id,tag_id' });
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

    return {
      blueprintId: blueprint.id,
      runId: result.run_id,
      title: result.draft.title,
    };
  }

  return {
    createBlueprintFromVideo,
  };
}

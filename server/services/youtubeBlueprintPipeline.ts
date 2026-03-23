import type {
  GenerationModelEvent,
  GenerationPromptEvent,
} from '../llm/types';
import type { GenerationTier } from './generationTierAccess';
import {
  buildLegacyDraftStepsFromBlueprintSections,
  type BlueprintSectionsV1,
} from './blueprintSections';

type DbClient = any;

type YouTubeDraftStep = {
  name: string;
  notes: string;
  timestamp: string | null;
};

type YouTubeDraft = {
  title: string;
  description: string;
  steps: YouTubeDraftStep[];
  eli5Steps: YouTubeDraftStep[];
  notes: string | null;
  tags: string[];
  sectionsJson: BlueprintSectionsV1 | null;
  summaryVariants: {
    default: string;
    eli5: string;
  };
};

type TakeawaysClampMeta = {
  applied: boolean;
  beforeWords: number;
  afterWords: number;
  beforeBullets: number;
  afterBullets: number;
  truncatedLastBullet: boolean;
};

function splitWords(value: string) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function countWords(value: string) {
  return splitWords(value).length;
}

function getMinTranscriptWords() {
  const raw = Number(process.env.YT2BP_MIN_TRANSCRIPT_WORDS);
  if (!Number.isFinite(raw)) return 30;
  return Math.max(0, Math.floor(raw));
}

function normalizeRawGenerationOutput(raw: unknown, maxChars = 16000) {
  let format: 'none' | 'text' | 'json' = 'none';
  let text = '';

  if (typeof raw === 'string') {
    format = 'text';
    text = raw.trim();
  } else if (raw != null) {
    format = 'json';
    try {
      text = JSON.stringify(raw);
    } catch {
      text = String(raw).trim();
      format = 'text';
    }
  }

  const chars = text.length;
  if (!text) {
    return {
      text: '',
      chars: 0,
      truncated: false,
      format,
    };
  }

  if (chars <= maxChars) {
    return {
      text,
      chars,
      truncated: false,
      format,
    };
  }

  return {
    text: text.slice(0, maxChars),
    chars,
    truncated: true,
    format,
  };
}

export function clampTakeawaysNotesToWordBudget(input: {
  notes: string;
  maxWords?: number;
  minBullets?: number;
}) {
  const maxWords = Math.max(1, Math.floor(Number(input.maxWords ?? 100) || 100));
  const minBullets = Math.max(1, Math.floor(Number(input.minBullets ?? 3) || 3));
  const sourceLines = String(input.notes || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletItems = sourceLines
    .map((line) => {
      const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
      if (bulletMatch) return bulletMatch[1].trim();
      const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);
      if (numberedMatch) return numberedMatch[1].trim();
      return '';
    })
    .filter(Boolean);

  const beforeWords = bulletItems.reduce((sum, item) => sum + countWords(item), 0);
  const beforeBullets = bulletItems.length;
  if (beforeBullets === 0 || beforeWords <= maxWords) {
    return {
      notes: String(input.notes || '').trim(),
      meta: {
        applied: false,
        beforeWords,
        afterWords: beforeWords,
        beforeBullets,
        afterBullets: beforeBullets,
        truncatedLastBullet: false,
      } satisfies TakeawaysClampMeta,
    };
  }

  const working = bulletItems.slice();
  let truncatedLastBullet = false;
  while (working.length > minBullets) {
    const words = working.reduce((sum, item) => sum + countWords(item), 0);
    if (words <= maxWords) break;
    working.pop();
  }

  let wordsAfterDrop = working.reduce((sum, item) => sum + countWords(item), 0);
  if (wordsAfterDrop > maxWords && working.length > 0) {
    const headWords = working.slice(0, -1).reduce((sum, item) => sum + countWords(item), 0);
    const remainingBudget = Math.max(1, maxWords - headWords);
    const lastIndex = working.length - 1;
    const lastWords = splitWords(working[lastIndex] || '');
    const trimmedWords = lastWords.slice(0, remainingBudget);
    if (trimmedWords.length > 0) {
      working[lastIndex] = trimmedWords.join(' ');
      truncatedLastBullet = trimmedWords.length < lastWords.length;
    }
    wordsAfterDrop = working.reduce((sum, item) => sum + countWords(item), 0);
  }

  return {
    notes: working.map((item) => `- ${item}`).join('\n'),
    meta: {
      applied: true,
      beforeWords,
      afterWords: wordsAfterDrop,
      beforeBullets,
      afterBullets: working.length,
      truncatedLastBullet,
    } satisfies TakeawaysClampMeta,
  };
}

export function createYouTubeBlueprintPipelineService(deps: any) {
  const {
    getServiceSupabaseClient,
    getYouTubeGenerationTraceContext,
    safeGenerationTraceWrite,
    startGenerationRun,
    appendGenerationEvent,
    runWithProviderRetry,
    providerRetryDefaults,
    getTranscriptForVideo,
    createYouTubeGenerationLLMClient = () => deps.createLLMClient(),
    updateGenerationModelInfo,
    yt2bpSafetyBlockEnabled,
    readYt2bpQualityConfig,
    readYt2bpContentSafetyConfig,
    flattenDraftText,
    runSafetyChecks,
    runPiiChecks,
    makePipelineError,
    scoreYt2bpQuality,
    scoreYt2bpContentSafety,
    evaluateLlmNativeGate,
    yt2bpOutputMode,
    normalizeYouTubeDraftToGoldenV1,
    draftToNormalizationInput,
    formatGoldenQualityIssueDetails,
    buildYouTubeQualityRetryInstructions,
    GOLDEN_QUALITY_MAX_RETRIES,
    uploadBannerToSupabase,
    supabaseUrl,
    finalizeGenerationRunSuccess,
    finalizeGenerationRunFailure,
    mapPipelineError,
    canonicalSectionName,
    normalizeSummaryVariantText,
    youtubeBlueprintPromptTemplatePath = '',
    minTranscriptWords = getMinTranscriptWords(),
    pruneTranscriptForGeneration = (pruningInput: { transcriptText: string }) => ({
      text: pruningInput.transcriptText,
      meta: {
        enabled: false,
        applied: false,
        original_chars: String(pruningInput.transcriptText || '').trim().length,
        pruned_chars: String(pruningInput.transcriptText || '').trim().length,
        budget_chars: String(pruningInput.transcriptText || '').trim().length,
        window_count: 1,
        threshold_bucket: 'disabled',
        windows: [],
      },
    }),
    enforceVideoDurationPolicy = async (policyInput: {
      durationSeconds?: number | null;
    }) => policyInput.durationSeconds ?? null,
  } = deps;
async function runYouTubePipeline(input: {
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
}) {
  const startedAt = Date.now();
  const normalizeBlueprintTitle = (raw: unknown) => {
    const cleaned = String(raw || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return 'YouTube Blueprint';
    return cleaned.slice(0, 160);
  };
  const resolvedVideoTitle = normalizeBlueprintTitle(input.videoTitle || input.videoId || 'YouTube Blueprint');
  const normalizedGenerationTier: GenerationTier = 'tier';
  const structureRetryInstructionBlock = [
    'Structure fix required.',
    'Return exactly 6 steps in this exact order and exact names:',
    'Summary, Takeaways, Storyline, Deep Dive, Practical Rules, Open Questions.',
    'Return strict JSON only.',
  ].join('\n');
  const withStructureHint = (instructions?: string | null) => {
    const base = String(instructions || '').trim();
    return base
      ? `${base}\n${structureRetryInstructionBlock}`
      : structureRetryInstructionBlock;
  };
  const serviceDb = getServiceSupabaseClient();
  const traceContext = getYouTubeGenerationTraceContext({
    db: input.trace?.db || serviceDb,
    userId: input.trace?.userId || null,
    sourceScope: input.trace?.sourceScope || null,
    sourceTag: input.trace?.sourceTag || input.runId.split('-').slice(1, 2).join('-') || 'unknown',
    modelPrimary: input.generationModelProfile?.model || null,
    reasoningEffort: input.generationModelProfile?.reasoningEffort || null,
  });
  if (traceContext.db && traceContext.userId) {
    await safeGenerationTraceWrite({
      runId: input.runId,
      op: 'start_run',
      fn: async () => {
        await startGenerationRun(traceContext.db as any, {
          runId: input.runId,
          userId: traceContext.userId as string,
          sourceScope: traceContext.sourceScope,
          sourceTag: traceContext.sourceTag,
          videoId: input.videoId,
          videoUrl: input.videoUrl,
          modelPrimary: traceContext.modelPrimary,
          reasoningEffort: traceContext.reasoningEffort,
          traceVersion: traceContext.traceVersion,
        });
      },
    });
    await safeGenerationTraceWrite({
      runId: input.runId,
      op: 'event_pipeline_started',
      fn: async () => {
        await appendGenerationEvent(traceContext.db as any, {
          runId: input.runId,
          event: 'pipeline_started',
            payload: {
              source_scope: traceContext.sourceScope,
              source_tag: traceContext.sourceTag,
              video_id: input.videoId,
              generation_tier: normalizedGenerationTier,
            },
          });
        },
    });
  }

  try {
    const resolvedDurationSeconds = await enforceVideoDurationPolicy({
      videoId: input.videoId,
      videoTitle: null,
      durationSeconds: input.durationSeconds ?? null,
      userAgent: 'bleuv1-youtube-pipeline/1.0 (+https://api.bleup.app)',
    });
    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_duration_policy_checked',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            event: 'duration_policy_checked',
            payload: {
              duration_seconds: resolvedDurationSeconds,
              cap_enabled: true,
            },
          });
        },
      });
    }
    const requestClass = input.requestClass === 'interactive' ? 'interactive' : 'background';
    const transcript = await getTranscriptForVideo(input.videoId, {
      requestClass,
      reason: 'pipeline_transcript_fetch',
    });
    const rawTranscriptText = String(transcript.text || '').trim();
    const transcriptPruning = pruneTranscriptForGeneration({
      transcriptText: rawTranscriptText,
    });
    const effectiveTranscriptText = String(transcriptPruning?.text || rawTranscriptText).trim();
    const effectiveTranscriptWords = countWords(effectiveTranscriptText);
    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_transcript_loaded',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            event: 'transcript_loaded',
            payload: {
              source: transcript.source,
              chars: effectiveTranscriptText.length,
              words: effectiveTranscriptWords,
              raw_chars: rawTranscriptText.length,
              confidence: transcript.confidence,
              transport: transcript.transport || null,
              provider_trace: transcript.provider_trace || null,
            },
          });
        },
      });
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_transcript_pruning_applied',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            event: 'transcript_pruning_applied',
            payload: {
              ...(transcriptPruning?.meta || {}),
            },
          });
        },
      });
    }
    if (effectiveTranscriptWords < minTranscriptWords) {
      if (traceContext.db && traceContext.userId) {
        await safeGenerationTraceWrite({
          runId: input.runId,
          op: 'event_transcript_insufficient_context',
          fn: async () => {
            await appendGenerationEvent(traceContext.db as any, {
              runId: input.runId,
              level: 'warn',
              event: 'transcript_insufficient_context',
              payload: {
                words: effectiveTranscriptWords,
                min_words: minTranscriptWords,
                source: transcript.source,
              },
            });
          },
        });
      }
      makePipelineError(
        'TRANSCRIPT_INSUFFICIENT_CONTEXT',
        "This video has very limited speech, so a blueprint can't be generated from it right now. If that seems incorrect, try again tomorrow.",
        {
          details: {
            min_transcript_words: minTranscriptWords,
            transcript_words: effectiveTranscriptWords,
            video_id: input.videoId,
          },
        },
      );
    }
    const client = createYouTubeGenerationLLMClient({
      generationTier: normalizedGenerationTier,
    });
    let firstModelDispatchNotified = false;
    const notifyBeforeFirstModelDispatch = async () => {
      if (firstModelDispatchNotified) return;
      firstModelDispatchNotified = true;
      await input.onBeforeFirstModelDispatch?.();
    };
    const oneStepPromptTemplatePath = String(youtubeBlueprintPromptTemplatePath || '').trim() || undefined;
    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_one_step_mode_enabled',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            event: 'one_step_mode_enabled',
            payload: {
              generation_tier: normalizedGenerationTier,
              prompt_template_path: oneStepPromptTemplatePath || null,
              pipeline_mode: 'one_step_default',
            },
          });
        },
      });
    }
    const promptRenderCounts: Record<string, number> = {};
    const generationModelEventCallback = (event: GenerationModelEvent) => {
      if (!traceContext.db || !traceContext.userId) return;
      void safeGenerationTraceWrite({
        runId: input.runId,
        op: 'update_model_info',
        fn: async () => {
          await updateGenerationModelInfo(traceContext.db as any, {
            runId: input.runId,
            modelPrimary: traceContext.modelPrimary,
            modelUsed: event.model_used,
            fallbackUsed: event.fallback_used,
            fallbackModel: event.fallback_model || null,
            reasoningEffort: event.reasoning_effort || traceContext.reasoningEffort,
          });
        },
      });
      void safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_model_resolution',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            level: event.event === 'request_failed' ? 'warn' : 'info',
            event: 'model_resolution',
            payload: {
              event: event.event,
              operation: event.operation,
              model_used: event.model_used,
              fallback_used: event.fallback_used,
              fallback_model: event.fallback_model || null,
              reasoning_effort: event.reasoning_effort || null,
              status: 'status' in event ? event.status || null : null,
              message: 'message' in event ? event.message || null : null,
              provider: event.provider || 'openai_api',
            },
          });
        },
      });
    };
    const generationPromptEventCallback = (event: GenerationPromptEvent) => {
      const promptText = String(event.prompt || '');
      const instructionsText = String(event.instructions || '');
      const maxPromptChars = 120_000;
      const maxInstructionsChars = 20_000;
      const promptStored = promptText.slice(0, maxPromptChars);
      const instructionsStored = instructionsText.slice(0, maxInstructionsChars);
      const promptTruncated = promptText.length > maxPromptChars;
      const instructionsTruncated = instructionsText.length > maxInstructionsChars;
      const renderIndex = (promptRenderCounts[event.operation] || 0) + 1;
      promptRenderCounts[event.operation] = renderIndex;

      console.log('[yt2bp_prompt_rendered]', JSON.stringify({
        run_id: input.runId,
        operation: event.operation,
        render_index: renderIndex,
        prompt_chars: promptText.length,
        prompt_truncated: promptTruncated,
        instructions_chars: instructionsText.length,
        instructions_truncated: instructionsTruncated,
      }));

      if (!traceContext.db || !traceContext.userId) return;
      void safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_prompt_rendered',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            event: 'prompt_rendered',
            payload: {
              operation: event.operation,
              render_index: renderIndex,
              prompt_chars: promptText.length,
              prompt_truncated: promptTruncated,
              prompt: promptStored,
              instructions_chars: instructionsText.length,
              instructions_truncated: instructionsTruncated,
              instructions: instructionsStored,
            },
          });
        },
      });
    };
    const bypassSafetyBlock = async (payload: {
      stage: string;
      blockedTopics: string[];
      attempt: number;
      run: number;
      globalRun: number;
    }) => {
      console.warn('[yt2bp_safety_block_bypassed]', JSON.stringify({
        run_id: input.runId,
        stage: payload.stage,
        blocked_topics: payload.blockedTopics,
        attempt: payload.attempt,
        run: payload.run,
        global_run: payload.globalRun,
        safety_block_enabled: yt2bpSafetyBlockEnabled,
      }));
      if (traceContext.db && traceContext.userId) {
        await safeGenerationTraceWrite({
          runId: input.runId,
          op: 'event_safety_block_bypassed',
          fn: async () => {
            await appendGenerationEvent(traceContext.db as any, {
              runId: input.runId,
              level: 'warn',
              event: 'safety_block_bypassed',
              payload: {
                stage: payload.stage,
                blocked_topics: payload.blockedTopics,
                attempt: payload.attempt,
                run: payload.run,
                global_run: payload.globalRun,
                safety_block_enabled: yt2bpSafetyBlockEnabled,
              },
            });
          },
        });
      }
    };
    const qualityConfig = readYt2bpQualityConfig();
    const contentSafetyConfig = readYt2bpContentSafetyConfig();
    const qualityAttempts = qualityConfig.enabled ? 1 + qualityConfig.retry_policy.max_retries : 1;
    const safetyRetryBudget = contentSafetyConfig.enabled ? contentSafetyConfig.retry_policy.max_retries : 0;
  const generationTrace = {
    trace_version: traceContext.traceVersion,
    run_id: input.runId,
    video_id: input.videoId,
    source_tag: traceContext.sourceTag || 'unknown',
    transcript: {
      source: transcript.source,
      chars: effectiveTranscriptText.length,
      raw_chars: rawTranscriptText.length,
      confidence: transcript.confidence,
      pruning: transcriptPruning?.meta || null,
    },
    summary_variants: {
      default_chars: null as number | null,
      eli5_chars: null as number | null,
    },
    deterministic_checks: [] as Array<{
      stage: string;
      pass: boolean;
      safety_blocked_topics: string[];
      pii_matches: string[];
    }>,
    quality_judge_runs: [] as Array<{
      attempt: number;
      run: number;
      global_run: number;
      pass: boolean;
      overall: number | null;
      failures: string[];
      reason?: string;
    }>,
    content_safety_runs: [] as Array<{
      attempt: number;
      run: number;
      global_run: number;
      pass: boolean;
      failed_criteria: string[];
      retried_for_safety: boolean;
    }>,
    selected_candidate: {
      overall: null as number | null,
    },
    gate_initial: null as null | {
      pass: boolean;
      issues: string[];
      issue_details: string[];
    },
    gate_retries: [] as Array<{
      attempt: number;
      pass: boolean;
      issues: string[];
      issue_details: string[];
    }>,
    takeaways_clamp_runs: [] as Array<{
      stage: string;
      before_words: number;
      after_words: number;
      before_bullets: number;
      after_bullets: number;
      truncated_last_bullet: boolean;
    }>,
    gate_final: null as null | {
      mode: 'direct' | 'retry_pass' | 'repaired_after_retry' | 'llm_native_direct' | 'terminal_publish_anyway';
      pass: boolean;
      issues: string[];
      issue_details: string[];
      retries_used: number;
    },
  };
  let bestFailingQuality: {
    draft: YouTubeDraft;
    overall: number;
    failures: string[];
  } | null = null;
  const passingCandidates: Array<{ draft: YouTubeDraft; overall: number }> = [];

  const toDraft = (rawDraft: Awaited<ReturnType<typeof client.generateYouTubeBlueprint>>): YouTubeDraft => {
    const sectionsJson: BlueprintSectionsV1 = {
      schema_version: 'blueprint_sections_v1',
      tags: (rawDraft.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 8),
      summary: {
        text: String(rawDraft.summary?.text || '').trim(),
      },
      takeaways: {
        bullets: (rawDraft.takeaways?.bullets || []).map((item) => String(item || '').trim()).filter(Boolean),
      },
      storyline: {
        text: String(rawDraft.storyline?.text || '').trim(),
      },
      deep_dive: {
        bullets: (rawDraft.deep_dive?.bullets || []).map((item) => String(item || '').trim()).filter(Boolean),
      },
      practical_rules: {
        bullets: (rawDraft.practical_rules?.bullets || []).map((item) => String(item || '').trim()).filter(Boolean),
      },
      open_questions: {
        bullets: (rawDraft.open_questions?.bullets || []).map((item) => String(item || '').trim()).filter(Boolean),
      },
    };
    // Later phases can remove these compatibility fields entirely. For now they are
    // derived from the canonical sections payload instead of accepted as raw model output.
    const normalizedSteps = buildLegacyDraftStepsFromBlueprintSections(sectionsJson)
      .map((step) => ({
        name: step.name?.trim() || '',
        notes: step.notes?.trim() || '',
        timestamp: step.timestamp?.trim() || null,
      }))
      .filter((step) => step.name && step.notes);
    const summaryDefault = normalizeSummaryVariantText(sectionsJson.summary.text);
    return {
      title: resolvedVideoTitle,
      description: summaryDefault || 'AI-generated blueprint from video transcript.',
      steps: normalizedSteps,
      eli5Steps: [],
      notes: null,
      tags: sectionsJson.tags,
      sectionsJson,
      summaryVariants: {
        default: summaryDefault,
        eli5: '',
      },
    };
  };

  const buildPass1BlueprintJson = (draft: YouTubeDraft) => JSON.stringify({
    title: draft.title,
    description: draft.description,
    summary: draft.summaryVariants.default || draft.description,
    steps: draft.steps,
    notes: draft.notes || null,
    tags: draft.tags || [],
  });

  const buildEli5Steps = (defaultSteps: YouTubeDraftStep[], candidateSteps: YouTubeDraftStep[]) => {
    if (!Array.isArray(defaultSteps) || defaultSteps.length === 0) return [] as YouTubeDraftStep[];
    const byCanonical = new Map<string, YouTubeDraftStep>();
    candidateSteps.forEach((step) => {
      const key = canonicalSectionName(String(step.name || ''));
      if (!key || byCanonical.has(key)) return;
      byCanonical.set(key, step);
    });
    return defaultSteps.map((defaultStep, index) => {
      const key = canonicalSectionName(defaultStep.name);
      const byName = key ? byCanonical.get(key) : null;
      const byIndex = candidateSteps[index] || null;
      const source = byName || byIndex || null;
      const notes = String(source?.notes || '').trim() || defaultStep.notes;
      return {
        name: defaultStep.name,
        notes,
        timestamp: source?.timestamp ?? defaultStep.timestamp ?? null,
      };
    });
  };

  let safetyRetriesUsed = 0;

  const applyTakeawaysClamp = async (stage: string, draftInput: YouTubeDraft) => {
    const steps = Array.isArray(draftInput.steps) ? draftInput.steps : [];
    const takeawaysIndex = steps.findIndex((step) => canonicalSectionName(step.name) === 'takeaways');
    if (takeawaysIndex < 0) return draftInput;
    const takeawaysStep = steps[takeawaysIndex];
    const clamp = clampTakeawaysNotesToWordBudget({
      notes: takeawaysStep?.notes || '',
      maxWords: 100,
      minBullets: 3,
    });
    if (!clamp.meta.applied) return draftInput;

    const nextSteps = steps.map((step, index) => (index === takeawaysIndex
      ? { ...step, notes: clamp.notes }
      : step));
    const nextDraft: YouTubeDraft = {
      ...draftInput,
      steps: nextSteps,
    };
    generationTrace.takeaways_clamp_runs.push({
      stage,
      before_words: clamp.meta.beforeWords,
      after_words: clamp.meta.afterWords,
      before_bullets: clamp.meta.beforeBullets,
      after_bullets: clamp.meta.afterBullets,
      truncated_last_bullet: clamp.meta.truncatedLastBullet,
    });

    console.log('[bp_takeaways_clamped]', JSON.stringify({
      run_id: input.runId,
      video_id: input.videoId,
      stage,
      before_words: clamp.meta.beforeWords,
      after_words: clamp.meta.afterWords,
      before_bullets: clamp.meta.beforeBullets,
      after_bullets: clamp.meta.afterBullets,
      truncated_last_bullet: clamp.meta.truncatedLastBullet,
    }));

    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_takeaways_clamped',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            event: 'takeaways_clamped',
            payload: {
              stage,
              before_words: clamp.meta.beforeWords,
              after_words: clamp.meta.afterWords,
              before_bullets: clamp.meta.beforeBullets,
              after_bullets: clamp.meta.afterBullets,
              truncated_last_bullet: clamp.meta.truncatedLastBullet,
            },
          });
        },
      });
    }
    return nextDraft;
  };
  const captureRawOutputEvent = async (eventInput: {
    rawResponse: unknown;
    attempt: number;
    run: number;
    globalRun: number;
  }) => {
    if (!traceContext.db || !traceContext.userId) return;
    const normalized = normalizeRawGenerationOutput(eventInput.rawResponse);
    if (!normalized.text) return;
    await safeGenerationTraceWrite({
      runId: input.runId,
      op: 'event_model_raw_output_captured',
      fn: async () => {
        await appendGenerationEvent(traceContext.db as any, {
          runId: input.runId,
          event: 'model_raw_output_captured',
          payload: {
            attempt: eventInput.attempt,
            run: eventInput.run,
            global_run: eventInput.globalRun,
            raw_output: normalized.text,
            raw_output_chars: normalized.chars,
            raw_output_truncated: normalized.truncated,
            raw_output_format: normalized.format,
          },
        });
      },
    });
  };
  for (let attempt = 1; attempt <= qualityAttempts; attempt += 1) {
    let safetyRetryHint = '';
    let attemptRunCount = 0;
    const maxRunsForAttempt = 1 + safetyRetryBudget;
    while (attemptRunCount < maxRunsForAttempt) {
      attemptRunCount += 1;
      const globalRunIndex = (attempt - 1) * maxRunsForAttempt + attemptRunCount;
      const rawDraft = await runWithProviderRetry(
        {
          providerKey: 'llm_generate_blueprint',
          db: serviceDb,
          maxAttempts: providerRetryDefaults.llmAttempts,
          timeoutMs: providerRetryDefaults.llmTimeoutMs,
          baseDelayMs: 300,
          jitterMs: 200,
        },
        async () => {
          await notifyBeforeFirstModelDispatch();
          return client.generateYouTubeBlueprint({
            videoUrl: input.videoUrl,
            videoTitle: input.videoTitle || input.videoId,
            transcriptSource: transcript.source,
            transcript: effectiveTranscriptText,
            promptTemplatePath: oneStepPromptTemplatePath,
            additionalInstructions: withStructureHint(safetyRetryHint || undefined),
          }, {
            onGenerationModelEvent: generationModelEventCallback,
            onGenerationPromptEvent: generationPromptEventCallback,
            generationProfile: input.generationModelProfile,
          });
        },
      );
      await captureRawOutputEvent({
        rawResponse: rawDraft?.raw_response,
        attempt,
        run: attemptRunCount,
        globalRun: globalRunIndex,
      });
      const draft = toDraft(rawDraft);

      const flattened = flattenDraftText(draft);
      const deterministicSafety = runSafetyChecks(flattened);
      const pii = runPiiChecks(flattened);
      generationTrace.deterministic_checks.push({
        stage: `quality_attempt_${attempt}_run_${attemptRunCount}`,
        pass: deterministicSafety.ok && pii.ok,
        safety_blocked_topics: deterministicSafety.ok ? [] : deterministicSafety.blockedTopics,
        pii_matches: pii.ok ? [] : pii.matches,
      });
      if (traceContext.db && traceContext.userId) {
        await safeGenerationTraceWrite({
          runId: input.runId,
          op: 'event_draft_generated',
          fn: async () => {
            await appendGenerationEvent(traceContext.db as any, {
              runId: input.runId,
              event: 'draft_generated',
              payload: {
                attempt,
                run: attemptRunCount,
                global_run: globalRunIndex,
                step_count: draft.steps.length,
                deterministic_pass: deterministicSafety.ok && pii.ok,
                safety_blocked_topics: deterministicSafety.ok ? [] : deterministicSafety.blockedTopics,
                pii_matches: pii.ok ? [] : pii.matches,
              },
            });
          },
        });
      }
      if (!deterministicSafety.ok) {
        if (yt2bpSafetyBlockEnabled) {
          makePipelineError('SAFETY_BLOCKED', `Forbidden topics detected: ${deterministicSafety.blockedTopics.join(', ')}`);
        } else {
          await bypassSafetyBlock({
            stage: 'deterministic_draft',
            blockedTopics: deterministicSafety.blockedTopics,
            attempt,
            run: attemptRunCount,
            globalRun: globalRunIndex,
          });
        }
      }
      if (!pii.ok) {
        makePipelineError('PII_BLOCKED', `PII detected: ${pii.matches.join(', ')}`);
      }

      if (!qualityConfig.enabled) {
        passingCandidates.push({ draft, overall: 0 });
        break;
      }
      try {
        const graded = await runWithProviderRetry(
          {
            providerKey: 'llm_quality_judge',
            db: serviceDb,
            maxAttempts: providerRetryDefaults.llmAttempts,
            timeoutMs: providerRetryDefaults.llmTimeoutMs,
            baseDelayMs: 250,
            jitterMs: 200,
          },
          async () => scoreYt2bpQuality(draft, qualityConfig, normalizedGenerationTier),
        );
        const failIds = graded.failures.join(',') || 'none';
        generationTrace.quality_judge_runs.push({
          attempt,
          run: attemptRunCount,
          global_run: globalRunIndex,
          pass: graded.ok,
          overall: Number.isFinite(graded.overall) ? graded.overall : null,
          failures: graded.failures || [],
        });
        if (traceContext.db && traceContext.userId) {
          await safeGenerationTraceWrite({
            runId: input.runId,
            op: 'event_quality_judge_result',
            fn: async () => {
              await appendGenerationEvent(traceContext.db as any, {
                runId: input.runId,
                level: graded.ok ? 'info' : 'warn',
                event: 'quality_judge_result',
                payload: {
                  attempt,
                  run: attemptRunCount,
                  global_run: globalRunIndex,
                  pass: graded.ok,
                  overall: Number.isFinite(graded.overall) ? graded.overall : null,
                  failures: graded.failures || [],
                },
              });
            },
          });
        }
        console.log(
          `[yt2bp-quality] run_id=${input.runId} attempt=${attempt}/${qualityAttempts} run=${attemptRunCount}/${maxRunsForAttempt} global_run=${globalRunIndex} pass=${graded.ok} overall=${graded.overall.toFixed(2)} failures=${failIds}`
        );
        if (!graded.ok) {
          if (!bestFailingQuality || graded.overall > bestFailingQuality.overall) {
            bestFailingQuality = { draft, overall: graded.overall, failures: graded.failures };
          }
          break;
        }

        let safetyPassed = !contentSafetyConfig.enabled;
        if (contentSafetyConfig.enabled) {
          const safetyScore = await runWithProviderRetry(
            {
              providerKey: 'llm_safety_judge',
              db: serviceDb,
              maxAttempts: providerRetryDefaults.llmAttempts,
              timeoutMs: providerRetryDefaults.llmTimeoutMs,
              baseDelayMs: 250,
              jitterMs: 200,
            },
            async () => scoreYt2bpContentSafety(draft, contentSafetyConfig, normalizedGenerationTier),
          );
          const flagged = safetyScore.failedCriteria.join(',') || 'none';
          generationTrace.content_safety_runs.push({
            attempt,
            run: attemptRunCount,
            global_run: globalRunIndex,
            pass: safetyScore.ok,
            failed_criteria: safetyScore.failedCriteria || [],
            retried_for_safety: !safetyScore.ok && safetyRetriesUsed < safetyRetryBudget && attemptRunCount < maxRunsForAttempt,
          });
          if (traceContext.db && traceContext.userId) {
            await safeGenerationTraceWrite({
              runId: input.runId,
              op: 'event_content_safety_result',
              fn: async () => {
                await appendGenerationEvent(traceContext.db as any, {
                  runId: input.runId,
                  level: safetyScore.ok ? 'info' : 'warn',
                  event: 'content_safety_result',
                  payload: {
                    attempt,
                    run: attemptRunCount,
                    global_run: globalRunIndex,
                    pass: safetyScore.ok,
                    failed_criteria: safetyScore.failedCriteria || [],
                    retried_for_safety: !safetyScore.ok && safetyRetriesUsed < safetyRetryBudget && attemptRunCount < maxRunsForAttempt,
                  },
                });
              },
            });
          }
          console.log(
            `[yt2bp-content-safety] run_id=${input.runId} attempt=${attempt}/${qualityAttempts} run=${attemptRunCount}/${maxRunsForAttempt} global_run=${globalRunIndex} pass=${safetyScore.ok} flagged=${flagged}`
          );
          if (safetyScore.ok) {
            safetyPassed = true;
          } else if (safetyRetriesUsed < safetyRetryBudget && attemptRunCount < maxRunsForAttempt) {
            safetyRetriesUsed += 1;
            safetyRetryHint =
              'Avoid these forbidden topics: self_harm, sexual_minors, hate_harassment. Keep output safe and compliant.';
            continue;
          } else if (yt2bpSafetyBlockEnabled) {
            makePipelineError('SAFETY_BLOCKED', 'This video content could not be converted safely. Please try another video.');
          } else {
            await bypassSafetyBlock({
              stage: 'llm_content_safety',
              blockedTopics: safetyScore.failedCriteria || ['llm_content_safety'],
              attempt,
              run: attemptRunCount,
              globalRun: globalRunIndex,
            });
            safetyPassed = true;
          }
        }

        if (safetyPassed) {
          passingCandidates.push({ draft, overall: graded.overall });
          break;
        }
      } catch (error) {
        if (error instanceof PipelineError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        const phase = message.toLowerCase().includes('safety') ? 'yt2bp-content-safety' : 'yt2bp-quality';
        generationTrace.quality_judge_runs.push({
          attempt,
          run: attemptRunCount,
          global_run: globalRunIndex,
          pass: false,
          overall: null,
          failures: ['JUDGE_ERROR'],
          reason: message.slice(0, 180),
        });
        if (traceContext.db && traceContext.userId) {
          await safeGenerationTraceWrite({
            runId: input.runId,
            op: 'event_quality_judge_result',
            fn: async () => {
              await appendGenerationEvent(traceContext.db as any, {
                runId: input.runId,
                level: 'error',
                event: 'quality_judge_result',
                payload: {
                  attempt,
                  run: attemptRunCount,
                  global_run: globalRunIndex,
                  pass: false,
                  failures: ['JUDGE_ERROR'],
                  reason: message.slice(0, 180),
                },
              });
            },
          });
        }
        console.log(
          `[${phase}] run_id=${input.runId} attempt=${attempt}/${qualityAttempts} run=${attemptRunCount}/${maxRunsForAttempt} pass=false judge_error=${message.slice(0, 180)}`
        );
        makePipelineError('GENERATION_FAIL', GENERIC_YT2BP_FAILURE_MESSAGE);
      }
    }
  }

  const selected = passingCandidates
    .slice()
    .sort((a, b) => b.overall - a.overall)[0];
  generationTrace.selected_candidate.overall = selected ? selected.overall : null;
  if (selected && traceContext.db && traceContext.userId) {
    await safeGenerationTraceWrite({
      runId: input.runId,
      op: 'event_draft_selected',
      fn: async () => {
        await appendGenerationEvent(traceContext.db as any, {
          runId: input.runId,
          event: 'draft_selected',
          payload: {
            overall: selected.overall,
            candidate_count: passingCandidates.length,
          },
        });
      },
    });
  }
  if (!selected) {
    if (bestFailingQuality) {
      console.log(
        `[yt2bp-quality] run_id=${input.runId} selected=none best_fail_overall=${bestFailingQuality.overall.toFixed(2)} fail_ids=${bestFailingQuality.failures.join(',')}`
      );
    }
    makePipelineError('GENERATION_FAIL', GENERIC_YT2BP_FAILURE_MESSAGE);
  }

  let draft = selected.draft;
  draft = {
    ...draft,
    tags: (draft.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 5),
  };
  const useDeterministicPostProcessing = yt2bpOutputMode === 'deterministic';
  const qualityRetryBudget = Math.min(2, Math.max(0, Math.floor(Number(GOLDEN_QUALITY_MAX_RETRIES) || 0)));
  const qualityAttemptBudget = 1 + qualityRetryBudget;
  let qualityRetriesUsed = 0;
  let qualityFinalMode: 'direct' | 'retry_pass' | 'repaired_after_retry' | 'llm_native_direct' | 'terminal_publish_anyway' = useDeterministicPostProcessing
    ? 'direct'
    : 'llm_native_direct';
  let gateIssueCodes: string[] = [];
  let gateIssueDetails: string[] = [];
  let gatePassed = true;

  if (useDeterministicPostProcessing) {
    let goldenFormat = normalizeYouTubeDraftToGoldenV1(draftToNormalizationInput(draft), {
      repairQuality: false,
      transcript: effectiveTranscriptText,
    });
    gateIssueCodes = Array.from(new Set([
      ...goldenFormat.structureGate.issues,
      ...goldenFormat.qualityGate.issues,
    ]));
    gateIssueDetails = [
      ...goldenFormat.structureGate.issues.map((code) => `${code} section=structure detail=shape_or_order`),
      ...formatGoldenQualityIssueDetails(goldenFormat.qualityGate.detail),
    ];
    gatePassed = goldenFormat.structureGate.ok && goldenFormat.qualityGate.ok;
    generationTrace.gate_initial = {
      pass: gatePassed,
      issues: gateIssueCodes.slice(0, 20),
      issue_details: gateIssueDetails.slice(0, 20),
    };
    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_gate_initial',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            level: gatePassed ? 'info' : 'warn',
            event: 'gate_initial',
            payload: {
              pass: gatePassed,
              output_mode: yt2bpOutputMode,
              issues: gateIssueCodes,
              issue_details: gateIssueDetails.slice(0, 20),
            },
          });
        },
      });
    }

    console.log('[bp_quality_gate_eval]', JSON.stringify({
      run_id: input.runId,
      video_id: input.videoId,
      attempt: 0,
      retry_count: qualityRetriesUsed,
      output_mode: yt2bpOutputMode,
      pass: gatePassed,
      issues: gateIssueCodes,
      issue_details: gateIssueDetails.slice(0, 12),
      final_mode: gatePassed ? 'direct' : 'pending',
    }));

    while (!gatePassed && qualityRetriesUsed < qualityRetryBudget) {
      const retryAttempt = qualityRetriesUsed + 1;
      const promptIssueCodes = gateIssueCodes;
      const promptIssueDetails = gateIssueDetails;
      const previousOutput = JSON.stringify({
        title: draft.title,
        tags: draft.tags || [],
        sections_json: draft.sectionsJson,
      }).slice(0, 12000);

      console.log('[bp_quality_retry_requested]', JSON.stringify({
        run_id: input.runId,
        video_id: input.videoId,
        output_mode: yt2bpOutputMode,
        attempt: retryAttempt,
        retry_count: retryAttempt,
        issues: gateIssueCodes,
        issue_details: gateIssueDetails.slice(0, 12),
      }));
      if (traceContext.db && traceContext.userId) {
        await safeGenerationTraceWrite({
          runId: input.runId,
          op: 'event_gate_retry_requested',
          fn: async () => {
            await appendGenerationEvent(traceContext.db as any, {
              runId: input.runId,
              level: 'warn',
              event: 'gate_retry_requested',
              payload: {
                attempt: retryAttempt,
                output_mode: yt2bpOutputMode,
                issues: gateIssueCodes,
                issue_details: gateIssueDetails.slice(0, 20),
              },
            });
          },
        });
      }

      const retryInstructions = buildYouTubeQualityRetryInstructions({
        attempt: retryAttempt,
        maxRetries: qualityRetryBudget,
        issueCodes: promptIssueCodes,
        issueDetails: promptIssueDetails,
        previousOutput,
      });

      const retryRawDraft = await runWithProviderRetry(
        {
          providerKey: 'llm_generate_blueprint',
          db: serviceDb,
          maxAttempts: providerRetryDefaults.llmAttempts,
          timeoutMs: providerRetryDefaults.llmTimeoutMs,
          baseDelayMs: 300,
          jitterMs: 200,
        },
        async () => {
          await notifyBeforeFirstModelDispatch();
          return client.generateYouTubeBlueprint({
            videoUrl: input.videoUrl,
            videoTitle: input.videoTitle || input.videoId,
            transcriptSource: transcript.source,
            transcript: effectiveTranscriptText,
            promptTemplatePath: oneStepPromptTemplatePath,
            qualityIssueCodes: promptIssueCodes,
            qualityIssueDetails: promptIssueDetails,
            additionalInstructions: withStructureHint(retryInstructions),
          }, {
            onGenerationModelEvent: generationModelEventCallback,
            onGenerationPromptEvent: generationPromptEventCallback,
            generationProfile: input.generationModelProfile,
          });
        },
      );
      await captureRawOutputEvent({
        rawResponse: retryRawDraft?.raw_response,
        attempt: retryAttempt,
        run: 1,
        globalRun: retryAttempt,
      });
      const retryDraft = toDraft(retryRawDraft);
      const retryFlattened = flattenDraftText(retryDraft);
      const retrySafety = runSafetyChecks(retryFlattened);
      if (!retrySafety.ok) {
        if (yt2bpSafetyBlockEnabled) {
          makePipelineError('SAFETY_BLOCKED', `Forbidden topics detected: ${retrySafety.blockedTopics.join(', ')}`);
        } else {
          await bypassSafetyBlock({
            stage: 'deterministic_retry',
            blockedTopics: retrySafety.blockedTopics,
            attempt: retryAttempt,
            run: 1,
            globalRun: retryAttempt,
          });
        }
      }
      const retryPii = runPiiChecks(retryFlattened);
      if (!retryPii.ok) {
        makePipelineError('PII_BLOCKED', `PII detected: ${retryPii.matches.join(', ')}`);
      }

      draft = {
        ...retryDraft,
        tags: (retryDraft.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 5),
      };
      qualityRetriesUsed = retryAttempt;
      goldenFormat = normalizeYouTubeDraftToGoldenV1(draftToNormalizationInput(draft), {
        repairQuality: false,
        transcript: effectiveTranscriptText,
      });
      gateIssueCodes = Array.from(new Set([
        ...goldenFormat.structureGate.issues,
        ...goldenFormat.qualityGate.issues,
      ]));
      gateIssueDetails = [
        ...goldenFormat.structureGate.issues.map((code) => `${code} section=structure detail=shape_or_order`),
        ...formatGoldenQualityIssueDetails(goldenFormat.qualityGate.detail),
      ];
      gatePassed = goldenFormat.structureGate.ok && goldenFormat.qualityGate.ok;
      generationTrace.gate_retries.push({
        attempt: retryAttempt,
        pass: gatePassed,
        issues: gateIssueCodes.slice(0, 20),
        issue_details: gateIssueDetails.slice(0, 20),
      });

      console.log('[bp_quality_retry_result]', JSON.stringify({
        run_id: input.runId,
        video_id: input.videoId,
        output_mode: yt2bpOutputMode,
        attempt: retryAttempt,
        retry_count: qualityRetriesUsed,
        pass: gatePassed,
        issues: gateIssueCodes,
        issue_details: gateIssueDetails.slice(0, 12),
        final_mode: gatePassed ? 'retry_pass' : 'pending',
      }));
      if (traceContext.db && traceContext.userId) {
        await safeGenerationTraceWrite({
          runId: input.runId,
          op: 'event_gate_retry_result',
          fn: async () => {
            await appendGenerationEvent(traceContext.db as any, {
              runId: input.runId,
              level: gatePassed ? 'info' : 'warn',
              event: 'gate_retry_result',
              payload: {
                attempt: retryAttempt,
                output_mode: yt2bpOutputMode,
                pass: gatePassed,
                issues: gateIssueCodes,
                issue_details: gateIssueDetails.slice(0, 20),
              },
            });
          },
        });
      }
      if (gatePassed) {
        qualityFinalMode = 'retry_pass';
        break;
      }
    }

    if (!gatePassed) {
      goldenFormat = normalizeYouTubeDraftToGoldenV1(draftToNormalizationInput(draft), {
        repairQuality: true,
        transcript: effectiveTranscriptText,
      });
      gateIssueCodes = Array.from(new Set([
        ...goldenFormat.structureGate.issues,
        ...goldenFormat.qualityGate.issues,
      ]));
      gateIssueDetails = [
        ...goldenFormat.structureGate.issues.map((code) => `${code} section=structure detail=shape_or_order`),
        ...formatGoldenQualityIssueDetails(goldenFormat.qualityGate.detail),
      ];
      qualityFinalMode = 'repaired_after_retry';
      gatePassed = goldenFormat.structureGate.ok && goldenFormat.qualityGate.ok;

      console.log('[bp_quality_retry_exhausted_repaired]', JSON.stringify({
        run_id: input.runId,
        video_id: input.videoId,
        output_mode: yt2bpOutputMode,
        retry_count: qualityRetriesUsed,
        pass: gatePassed,
        issues: gateIssueCodes,
        issue_details: gateIssueDetails.slice(0, 12),
        final_mode: qualityFinalMode,
      }));
      if (traceContext.db && traceContext.userId) {
        await safeGenerationTraceWrite({
          runId: input.runId,
          op: 'event_gate_repaired',
          fn: async () => {
            await appendGenerationEvent(traceContext.db as any, {
              runId: input.runId,
              level: gatePassed ? 'info' : 'warn',
              event: 'gate_repaired',
              payload: {
                output_mode: yt2bpOutputMode,
                pass: gatePassed,
                issues: gateIssueCodes,
                issue_details: gateIssueDetails.slice(0, 20),
                retries_used: qualityRetriesUsed,
              },
            });
          },
        });
      }
    }
    generationTrace.gate_final = {
      mode: qualityFinalMode,
      pass: gatePassed,
      issues: gateIssueCodes.slice(0, 20),
      issue_details: gateIssueDetails.slice(0, 20),
      retries_used: qualityRetriesUsed,
    };

    draft = {
      ...draft,
      steps: goldenFormat.steps.map((step) => ({
        name: step.name,
        notes: step.notes,
        timestamp: step.timestamp || null,
      })),
      tags: goldenFormat.tags.length > 0 ? goldenFormat.tags : draft.tags,
    };
  } else {
    draft = await applyTakeawaysClamp('llm_native_initial', draft);
    let nativeGate = evaluateLlmNativeGate(draft);
    gatePassed = nativeGate.pass;
    gateIssueCodes = nativeGate.issues;
    gateIssueDetails = nativeGate.issueDetails;
    generationTrace.gate_initial = {
      pass: gatePassed,
      issues: gateIssueCodes.slice(0, 20),
      issue_details: gateIssueDetails.slice(0, 20),
    };
    console.log('[bp_quality_gate_eval]', JSON.stringify({
      run_id: input.runId,
      video_id: input.videoId,
      attempt: 0,
      retry_count: 0,
      output_mode: yt2bpOutputMode,
      pass: gatePassed,
      issues: gateIssueCodes,
      issue_details: gateIssueDetails.slice(0, 12),
      final_mode: gatePassed ? qualityFinalMode : 'pending',
      note: 'llm_native_gate_only',
    }));
    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_gate_initial',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            level: gatePassed ? 'info' : 'warn',
            event: 'gate_initial',
            payload: {
              pass: gatePassed,
              output_mode: yt2bpOutputMode,
              issues: gateIssueCodes,
              issue_details: gateIssueDetails.slice(0, 20),
              note: 'llm_native_gate_only',
            },
          });
        },
      });
    }

    while (!gatePassed && qualityRetriesUsed < qualityRetryBudget) {
      const retryAttempt = qualityRetriesUsed + 1;
      const promptIssueCodes = gateIssueCodes;
      const promptIssueDetails = gateIssueDetails;
      const previousOutput = JSON.stringify({
        title: draft.title,
        tags: draft.tags || [],
        sections_json: draft.sectionsJson,
      }).slice(0, 12000);

      console.log('[bp_quality_retry_requested]', JSON.stringify({
        run_id: input.runId,
        video_id: input.videoId,
        output_mode: yt2bpOutputMode,
        attempt: retryAttempt,
        retry_count: retryAttempt,
        issues: gateIssueCodes,
        issue_details: gateIssueDetails.slice(0, 12),
      }));
      if (traceContext.db && traceContext.userId) {
        await safeGenerationTraceWrite({
          runId: input.runId,
          op: 'event_gate_retry_requested',
          fn: async () => {
            await appendGenerationEvent(traceContext.db as any, {
              runId: input.runId,
              level: 'warn',
              event: 'gate_retry_requested',
              payload: {
                attempt: retryAttempt,
                output_mode: yt2bpOutputMode,
                issues: gateIssueCodes,
                issue_details: gateIssueDetails.slice(0, 20),
              },
            });
          },
        });
      }

      const retryInstructions = `${buildYouTubeQualityRetryInstructions({
        attempt: retryAttempt,
        maxRetries: qualityRetryBudget,
        issueCodes: promptIssueCodes,
        issueDetails: promptIssueDetails,
        previousOutput,
      })}

Keep section bullets concise:
- Takeaways: 3-4 bullets, total read should feel like 10-20 seconds, lead with the clearest plain-English interesting point, and stay light enough for a curious non-expert to skim quickly.
- Takeaways/Deep Dive/Practical Rules/Open Questions: each bullet must be 1-2 sentences max.
- Takeaways: if the bullets drift into dense analyst-style compression or become too long to skim, treat that as a quality miss and rewrite them more simply.
- Storyline: 2-3 substantial paragraphs/slides. Avoid thin one-liners or fragmented slide stacks.`;

      const retryRawDraft = await runWithProviderRetry(
        {
          providerKey: 'llm_generate_blueprint',
          db: serviceDb,
          maxAttempts: providerRetryDefaults.llmAttempts,
          timeoutMs: providerRetryDefaults.llmTimeoutMs,
          baseDelayMs: 300,
          jitterMs: 200,
        },
        async () => {
          await notifyBeforeFirstModelDispatch();
          return client.generateYouTubeBlueprint({
            videoUrl: input.videoUrl,
            videoTitle: input.videoTitle || input.videoId,
            transcriptSource: transcript.source,
            transcript: effectiveTranscriptText,
            qualityIssueCodes: promptIssueCodes,
            qualityIssueDetails: promptIssueDetails,
            additionalInstructions: withStructureHint(retryInstructions),
          }, {
            onGenerationModelEvent: generationModelEventCallback,
            onGenerationPromptEvent: generationPromptEventCallback,
            generationProfile: input.generationModelProfile,
          });
        },
      );
      await captureRawOutputEvent({
        rawResponse: retryRawDraft?.raw_response,
        attempt: retryAttempt,
        run: 1,
        globalRun: retryAttempt,
      });

      const retryDraft = toDraft(retryRawDraft);
      const retryFlattened = flattenDraftText(retryDraft);
      const retrySafety = runSafetyChecks(retryFlattened);
      if (!retrySafety.ok) {
        if (yt2bpSafetyBlockEnabled) {
          makePipelineError('SAFETY_BLOCKED', `Forbidden topics detected: ${retrySafety.blockedTopics.join(', ')}`);
        } else {
          await bypassSafetyBlock({
            stage: 'llm_native_retry',
            blockedTopics: retrySafety.blockedTopics,
            attempt: retryAttempt,
            run: 1,
            globalRun: retryAttempt,
          });
        }
      }
      const retryPii = runPiiChecks(retryFlattened);
      if (!retryPii.ok) {
        makePipelineError('PII_BLOCKED', `PII detected: ${retryPii.matches.join(', ')}`);
      }

      draft = {
        ...retryDraft,
        tags: (retryDraft.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 5),
      };
      draft = await applyTakeawaysClamp(`llm_native_retry_${retryAttempt}`, draft);
      qualityRetriesUsed = retryAttempt;
      nativeGate = evaluateLlmNativeGate(draft);
      gatePassed = nativeGate.pass;
      gateIssueCodes = nativeGate.issues;
      gateIssueDetails = nativeGate.issueDetails;
      generationTrace.gate_retries.push({
        attempt: retryAttempt,
        pass: gatePassed,
        issues: gateIssueCodes.slice(0, 20),
        issue_details: gateIssueDetails.slice(0, 20),
      });

      console.log('[bp_quality_retry_result]', JSON.stringify({
        run_id: input.runId,
        video_id: input.videoId,
        output_mode: yt2bpOutputMode,
        attempt: retryAttempt,
        retry_count: qualityRetriesUsed,
        pass: gatePassed,
        issues: gateIssueCodes,
        issue_details: gateIssueDetails.slice(0, 12),
        final_mode: gatePassed ? 'retry_pass' : 'pending',
      }));
      if (traceContext.db && traceContext.userId) {
        await safeGenerationTraceWrite({
          runId: input.runId,
          op: 'event_gate_retry_result',
          fn: async () => {
            await appendGenerationEvent(traceContext.db as any, {
              runId: input.runId,
              level: gatePassed ? 'info' : 'warn',
              event: 'gate_retry_result',
              payload: {
                attempt: retryAttempt,
                output_mode: yt2bpOutputMode,
                pass: gatePassed,
                issues: gateIssueCodes,
                issue_details: gateIssueDetails.slice(0, 20),
              },
            });
          },
        });
      }
      if (gatePassed) {
        qualityFinalMode = 'retry_pass';
        break;
      }
    }

    generationTrace.gate_final = {
      mode: qualityFinalMode,
      pass: gatePassed,
      issues: gateIssueCodes.slice(0, 20),
      issue_details: gateIssueDetails.slice(0, 20),
      retries_used: qualityRetriesUsed,
    };
  }

  if (!gatePassed) {
    qualityFinalMode = 'terminal_publish_anyway';
    generationTrace.gate_final = {
      mode: qualityFinalMode,
      pass: gatePassed,
      issues: gateIssueCodes.slice(0, 20),
      issue_details: gateIssueDetails.slice(0, 20),
      retries_used: qualityRetriesUsed,
    };
    console.log('[bp_quality_gate_failed_terminal]', JSON.stringify({
      run_id: input.runId,
      video_id: input.videoId,
      output_mode: yt2bpOutputMode,
      retries_used: qualityRetriesUsed,
      attempt_budget: qualityAttemptBudget,
      issues: gateIssueCodes.slice(0, 20),
      issue_details: gateIssueDetails.slice(0, 20),
      final_mode: qualityFinalMode,
    }));
    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_gate_failed_terminal',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            level: 'warn',
            event: 'gate_failed_terminal',
            payload: {
              output_mode: yt2bpOutputMode,
              retries_used: qualityRetriesUsed,
              attempt_budget: qualityAttemptBudget,
              issues: gateIssueCodes.slice(0, 20),
              issue_details: gateIssueDetails.slice(0, 20),
              final_mode: qualityFinalMode,
              published_anyway: true,
            },
          });
        },
      });
    }
    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_gate_publish_anyway',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            level: 'warn',
            event: 'gate_published_anyway',
            payload: {
              output_mode: yt2bpOutputMode,
              retries_used: qualityRetriesUsed,
              attempt_budget: qualityAttemptBudget,
              issues: gateIssueCodes.slice(0, 20),
              issue_details: gateIssueDetails.slice(0, 20),
              final_mode: qualityFinalMode,
            },
          });
        },
      });
    }
  }
  console.log(
    `[yt2bp] run_id=${input.runId} transcript_source=${transcript.source} transcript_chars=${effectiveTranscriptText.length}`
  );

  draft = {
    ...draft,
    eli5Steps: draft.steps.map((step) => ({ ...step })),
    summaryVariants: {
      ...draft.summaryVariants,
      eli5: draft.summaryVariants.default,
    },
  };
  if (traceContext.db && traceContext.userId) {
    await safeGenerationTraceWrite({
      runId: input.runId,
      op: 'event_pass2_transform_skipped',
      fn: async () => {
        await appendGenerationEvent(traceContext.db as any, {
          runId: input.runId,
          event: 'pass2_transform_skipped_one_step',
          payload: {
            generation_tier: normalizedGenerationTier,
            fallback: 'default_copied_to_eli5',
            pipeline_mode: 'one_step_default',
          },
        });
      },
    });
  }

  let reviewSummary: string | null = null;
  if (input.generateReview) {
    const selectedItems = {
      transcript: draft.steps.map((step) => ({ name: step.name, context: step.timestamp || undefined })),
    };
    reviewSummary = await runWithProviderRetry(
      {
        providerKey: 'llm_review',
        db: serviceDb,
        maxAttempts: providerRetryDefaults.llmAttempts,
        timeoutMs: providerRetryDefaults.llmTimeoutMs,
        baseDelayMs: 300,
        jitterMs: 200,
      },
      async () => client.analyzeBlueprint({
        title: draft.title,
        inventoryTitle: 'YouTube transcript',
        selectedItems,
        mixNotes: draft.notes || undefined,
        reviewPrompt: 'Summarize quality and clarity in a concise way.',
        reviewSections: ['Overview', 'Strengths', 'Suggestions'],
        includeScore: true,
      }),
    );
  }

  let bannerUrl: string | null = null;
  if (input.generateBanner && input.authToken && supabaseUrl) {
    const banner = await runWithProviderRetry(
      {
        providerKey: 'llm_banner',
        db: serviceDb,
        maxAttempts: providerRetryDefaults.llmAttempts,
        timeoutMs: providerRetryDefaults.llmTimeoutMs,
        baseDelayMs: 300,
        jitterMs: 200,
      },
      async () => client.generateBanner({
        title: draft.title,
        inventoryTitle: 'YouTube transcript',
        tags: draft.tags,
      }),
    );
    bannerUrl = await uploadBannerToSupabase(banner.buffer.toString('base64'), banner.mimeType, input.authToken);
  }

    generationTrace.summary_variants = {
      default_chars: draft.summaryVariants.default.length,
      eli5_chars: draft.summaryVariants.eli5.length,
    };

    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_pipeline_succeeded',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            event: 'pipeline_succeeded',
            payload: {
              output_mode: yt2bpOutputMode,
              quality_ok: gatePassed,
              quality_issues: gateIssueCodes,
              quality_retries_used: qualityRetriesUsed,
              quality_final_mode: qualityFinalMode,
              generation_tier: normalizedGenerationTier,
              summary_variant_default_chars: draft.summaryVariants.default.length,
              summary_variant_eli5_chars: draft.summaryVariants.eli5.length,
              duration_ms: Date.now() - startedAt,
            },
          });
        },
      });
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'finalize_run_success',
        fn: async () => {
          await finalizeGenerationRunSuccess(traceContext.db as any, {
            runId: input.runId,
            qualityOk: gatePassed,
            qualityIssues: gateIssueCodes,
            qualityRetriesUsed: qualityRetriesUsed,
            qualityFinalMode: qualityFinalMode,
            traceVersion: traceContext.traceVersion,
            summary: generationTrace,
          });
        },
      });
    }

    return {
      ok: true,
      run_id: input.runId,
      draft,
      review: { available: input.generateReview, summary: reviewSummary },
      banner: { available: input.generateBanner, url: bannerUrl },
      meta: {
        transcript_source: transcript.source,
        confidence: transcript.confidence,
        transcript_transport: transcript.transport || null,
        transcript_pruning: transcriptPruning?.meta || null,
        bp_output_mode: yt2bpOutputMode,
        bp_structure_ok: gatePassed,
        bp_structure_issues: gateIssueCodes,
        bp_quality_ok: gatePassed,
        bp_quality_issues: gateIssueCodes,
        bp_quality_retries_used: qualityRetriesUsed,
        bp_quality_final_mode: qualityFinalMode,
        bp_takeaways_clamp_runs: generationTrace.takeaways_clamp_runs.length,
        generation_tier: normalizedGenerationTier,
        generation_model_primary: input.generationModelProfile?.model || traceContext.modelPrimary || null,
        bp_trace_version: generationTrace.trace_version,
        bp_trace: generationTrace,
        duration_ms: Date.now() - startedAt,
      },
    };
  } catch (error) {
    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_pipeline_failed',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            level: 'error',
            event: 'pipeline_failed',
            payload: {
              error_code: mapPipelineError(error)?.error_code || 'GENERATION_FAIL',
              error_message: mapPipelineError(error)?.message || (error instanceof Error ? error.message : String(error)),
              duration_ms: Date.now() - startedAt,
            },
          });
        },
      });
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'finalize_run_failure',
        fn: async () => {
          await finalizeGenerationRunFailure(traceContext.db as any, {
            runId: input.runId,
            errorCode: mapPipelineError(error)?.error_code || 'GENERATION_FAIL',
            errorMessage: mapPipelineError(error)?.message || (error instanceof Error ? error.message : String(error)),
            traceVersion: traceContext.traceVersion,
            summary: {
              run_id: input.runId,
              video_id: input.videoId,
              source_tag: traceContext.sourceTag || 'unknown',
              duration_ms: Date.now() - startedAt,
            },
          });
        },
      });
    }
    throw error;
  }
}


  return {
    runYouTubePipeline,
  };
}

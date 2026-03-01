import type {
  GenerationModelEvent,
  GenerationPromptEvent,
} from '../llm/types';

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
  summaryVariants: {
    default: string;
    eli5: string;
  };
};

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
    createLLMClient,
    updateGenerationModelInfo,
    yt2bpSafetyBlockEnabled,
    readYt2bpQualityConfig,
    readYt2bpContentSafetyConfig,
    flattenDraftText,
    runSafetyChecks,
    runPiiChecks,
    makePipelineError,
    scoreYt2bpQualityWithOpenAI,
    scoreYt2bpContentSafetyWithOpenAI,
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
  } = deps;
async function runYouTubePipeline(input: {
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
}) {
  const startedAt = Date.now();
  const serviceDb = getServiceSupabaseClient();
  const traceContext = getYouTubeGenerationTraceContext({
    db: input.trace?.db || serviceDb,
    userId: input.trace?.userId || null,
    sourceScope: input.trace?.sourceScope || null,
    sourceTag: input.trace?.sourceTag || input.runId.split('-').slice(1, 2).join('-') || 'unknown',
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
          },
        });
      },
    });
  }

  try {
    const requestClass = input.requestClass === 'interactive' ? 'interactive' : 'background';
    const transcript = await runWithProviderRetry(
      {
        providerKey: 'transcript',
        db: serviceDb,
        maxAttempts: providerRetryDefaults.transcriptAttempts,
        timeoutMs: providerRetryDefaults.transcriptTimeoutMs,
        baseDelayMs: 250,
        jitterMs: 150,
      },
      async () => getTranscriptForVideo(input.videoId, {
        requestClass,
        reason: 'pipeline_transcript_fetch',
      }),
    );
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
              chars: transcript.text.length,
              confidence: transcript.confidence,
            },
          });
        },
      });
    }
    const client = createLLMClient();
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
      chars: transcript.text.length,
      confidence: transcript.confidence,
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
    gate_final: null as null | {
      mode: 'direct' | 'retry_pass' | 'repaired_after_retry' | 'llm_native_direct';
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
    const normalizedSteps = (rawDraft.steps || [])
      .map((step) => ({
        name: step.name?.trim() || '',
        notes: step.notes?.trim() || '',
        timestamp: step.timestamp?.trim() || null,
      }))
      .filter((step) => step.name && step.notes);
    const summaryStepNotes = normalizedSteps.find((step) => canonicalSectionName(step.name) === 'summary')?.notes || '';
    const summaryDefault = normalizeSummaryVariantText(
      rawDraft.summary_variants?.default || summaryStepNotes || rawDraft.description || '',
    );
    return {
      title: rawDraft.title?.trim() || 'YouTube Blueprint',
      description: rawDraft.description?.trim() || 'AI-generated blueprint from video transcript.',
      steps: normalizedSteps,
      eli5Steps: [],
      notes: rawDraft.notes?.trim() || null,
      tags: (rawDraft.tags || []).map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
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
        async () => client.generateYouTubeBlueprint({
          videoUrl: input.videoUrl,
          videoTitle: input.videoId,
          transcriptSource: transcript.source,
          transcript: transcript.text,
          additionalInstructions: safetyRetryHint || undefined,
        }, {
          onGenerationModelEvent: generationModelEventCallback,
          onGenerationPromptEvent: generationPromptEventCallback,
        }),
      );
      const draft = toDraft(rawDraft);

      if (!draft.steps.length) {
        generationTrace.quality_judge_runs.push({
          attempt,
          run: attemptRunCount,
          global_run: globalRunIndex,
          pass: false,
          overall: null,
          failures: ['NO_STEPS'],
          reason: 'no_steps',
        });
        if (traceContext.db && traceContext.userId) {
          await safeGenerationTraceWrite({
            runId: input.runId,
            op: 'event_quality_judge_result',
            fn: async () => {
              await appendGenerationEvent(traceContext.db as any, {
                runId: input.runId,
                level: 'warn',
                event: 'quality_judge_result',
                payload: {
                  attempt,
                  run: attemptRunCount,
                  global_run: globalRunIndex,
                  pass: false,
                  failures: ['NO_STEPS'],
                  reason: 'no_steps',
                },
              });
            },
          });
        }
        console.log(
          `[yt2bp-quality] run_id=${input.runId} attempt=${attempt}/${qualityAttempts} run=${attemptRunCount}/${maxRunsForAttempt} global_run=${globalRunIndex} pass=false reason=no_steps`
        );
        break;
      }

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
          async () => scoreYt2bpQualityWithOpenAI(draft, qualityConfig),
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
            async () => scoreYt2bpContentSafetyWithOpenAI(draft, contentSafetyConfig),
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
  let qualityRetriesUsed = 0;
  let qualityFinalMode: 'direct' | 'retry_pass' | 'repaired_after_retry' | 'llm_native_direct' = useDeterministicPostProcessing
    ? 'direct'
    : 'llm_native_direct';
  let gateIssueCodes: string[] = [];
  let gateIssueDetails: string[] = [];
  let gatePassed = true;

  if (useDeterministicPostProcessing) {
    let goldenFormat = normalizeYouTubeDraftToGoldenV1(draftToNormalizationInput(draft), {
      repairQuality: false,
      transcript: transcript.text,
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

    while (!gatePassed && qualityRetriesUsed < GOLDEN_QUALITY_MAX_RETRIES) {
      const retryAttempt = qualityRetriesUsed + 1;
      const previousOutput = JSON.stringify({
        title: draft.title,
        description: draft.description,
        summary_variants: draft.summaryVariants,
        steps: goldenFormat.steps,
        notes: draft.notes || null,
        tags: draft.tags || [],
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
        maxRetries: GOLDEN_QUALITY_MAX_RETRIES,
        issueCodes: gateIssueCodes,
        issueDetails: gateIssueDetails,
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
        async () => client.generateYouTubeBlueprint({
          videoUrl: input.videoUrl,
          videoTitle: input.videoId,
          transcriptSource: transcript.source,
          transcript: transcript.text,
          qualityIssueCodes: gateIssueCodes,
          qualityIssueDetails: gateIssueDetails,
          additionalInstructions: retryInstructions,
        }, {
          onGenerationModelEvent: generationModelEventCallback,
          onGenerationPromptEvent: generationPromptEventCallback,
        }),
      );
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
        transcript: transcript.text,
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
        transcript: transcript.text,
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

    while (!gatePassed && qualityRetriesUsed < GOLDEN_QUALITY_MAX_RETRIES) {
      const retryAttempt = qualityRetriesUsed + 1;
      const previousOutput = JSON.stringify({
        title: draft.title,
        description: draft.description,
        summary_variants: draft.summaryVariants,
        steps: draft.steps,
        notes: draft.notes || null,
        tags: draft.tags || [],
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
        maxRetries: GOLDEN_QUALITY_MAX_RETRIES,
        issueCodes: gateIssueCodes,
        issueDetails: gateIssueDetails,
        previousOutput,
      })}

Keep section bullets concise:
- Takeaways: 3-4 bullets, total read should feel like 10-20 seconds.
- Takeaways/Deep Dive/Practical Rules/Open Questions: each bullet must be 1-2 sentences max.`;

      const retryRawDraft = await runWithProviderRetry(
        {
          providerKey: 'llm_generate_blueprint',
          db: serviceDb,
          maxAttempts: providerRetryDefaults.llmAttempts,
          timeoutMs: providerRetryDefaults.llmTimeoutMs,
          baseDelayMs: 300,
          jitterMs: 200,
        },
        async () => client.generateYouTubeBlueprint({
          videoUrl: input.videoUrl,
          videoTitle: input.videoId,
          transcriptSource: transcript.source,
          transcript: transcript.text,
          qualityIssueCodes: gateIssueCodes,
          qualityIssueDetails: gateIssueDetails,
          additionalInstructions: retryInstructions,
        }, {
          onGenerationModelEvent: generationModelEventCallback,
          onGenerationPromptEvent: generationPromptEventCallback,
        }),
      );

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
  console.log(
    `[yt2bp] run_id=${input.runId} transcript_source=${transcript.source} transcript_chars=${transcript.text.length}`
  );

  try {
    const pass1BlueprintJson = buildPass1BlueprintJson(draft);
    const pass2 = await runWithProviderRetry(
      {
        providerKey: 'llm_generate_blueprint_eli5_transform',
        db: serviceDb,
        maxAttempts: providerRetryDefaults.llmAttempts,
        timeoutMs: providerRetryDefaults.llmTimeoutMs,
        baseDelayMs: 300,
        jitterMs: 200,
      },
      async () => client.generateYouTubeBlueprintPass2Transform({
        transcript: transcript.text,
        pass1BlueprintJson,
      }, {
        onGenerationModelEvent: generationModelEventCallback,
        onGenerationPromptEvent: generationPromptEventCallback,
      }),
    );
    const candidateEli5Steps = (pass2.eli5_steps || [])
      .map((step) => ({
        name: String(step.name || '').trim(),
        notes: String(step.notes || '').trim(),
        timestamp: step.timestamp?.trim() || null,
      }))
      .filter((step) => step.name && step.notes);
    const mergedEli5Steps = buildEli5Steps(draft.steps, candidateEli5Steps);
    const summaryFromPass2 = normalizeSummaryVariantText(pass2.eli5_summary || '');
    const summaryFromSteps = normalizeSummaryVariantText(
      mergedEli5Steps.find((step) => canonicalSectionName(step.name) === 'summary')?.notes || '',
    );
    const mergedSummaryEli5 = summaryFromPass2 || summaryFromSteps || draft.summaryVariants.default;

    const eli5Flattened = [
      mergedSummaryEli5,
      ...mergedEli5Steps.flatMap((step) => [step.name, step.notes, step.timestamp || '']),
    ].filter(Boolean).join('\n').toLowerCase();
    const eli5Safety = runSafetyChecks(eli5Flattened);
    if (!eli5Safety.ok) {
      if (yt2bpSafetyBlockEnabled) {
        makePipelineError('SAFETY_BLOCKED', `Forbidden topics detected: ${eli5Safety.blockedTopics.join(', ')}`);
      } else {
        await bypassSafetyBlock({
          stage: 'eli5_transform',
          blockedTopics: eli5Safety.blockedTopics,
          attempt: 1,
          run: 1,
          globalRun: 1,
        });
      }
    }
    const eli5Pii = runPiiChecks(eli5Flattened);
    if (!eli5Pii.ok) {
      makePipelineError('PII_BLOCKED', `PII detected: ${eli5Pii.matches.join(', ')}`);
    }

    draft = {
      ...draft,
      eli5Steps: mergedEli5Steps,
      summaryVariants: {
        ...draft.summaryVariants,
        eli5: mergedSummaryEli5,
      },
    };

    if (traceContext.db && traceContext.userId) {
      await safeGenerationTraceWrite({
        runId: input.runId,
        op: 'event_pass2_transform_succeeded',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            event: 'pass2_transform_succeeded',
            payload: {
              eli5_step_count: mergedEli5Steps.length,
              eli5_summary_chars: mergedSummaryEli5.length,
            },
          });
        },
      });
    }
  } catch (error) {
    console.warn('[yt2bp_pass2_transform_failed]', JSON.stringify({
      run_id: input.runId,
      error: error instanceof Error ? error.message : String(error),
    }));
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
        op: 'event_pass2_transform_failed',
        fn: async () => {
          await appendGenerationEvent(traceContext.db as any, {
            runId: input.runId,
            level: 'warn',
            event: 'pass2_transform_failed',
            payload: {
              error: error instanceof Error ? error.message : String(error),
              fallback: 'default_copied_to_eli5',
            },
          });
        },
      });
    }
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
        bp_output_mode: yt2bpOutputMode,
        bp_structure_ok: gatePassed,
        bp_structure_issues: gateIssueCodes,
        bp_quality_ok: gatePassed,
        bp_quality_issues: gateIssueCodes,
        bp_quality_retries_used: qualityRetriesUsed,
        bp_quality_final_mode: qualityFinalMode,
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

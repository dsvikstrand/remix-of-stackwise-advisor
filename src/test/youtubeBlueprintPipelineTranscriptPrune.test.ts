import { describe, expect, it } from 'vitest';
import {
  clampTakeawaysNotesToWordBudget,
  createYouTubeBlueprintPipelineService,
} from '../../server/services/youtubeBlueprintPipeline';
import {
  pruneTranscriptForGeneration,
  type TranscriptPruningConfig,
} from '../../server/services/transcriptPruning';
import { YOUTUBE_BLUEPRINT_PROMPT_TEMPLATE_PATH_DEFAULT } from '../../server/llm/prompts';
import type { ProviderRetryOptions } from '../../server/services/providerResilience';

type EventRow = {
  event: string;
  payload?: Record<string, unknown>;
};

function countWords(value: string) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function buildDeps(input: {
  transcriptText: string;
  pruningConfig: TranscriptPruningConfig;
  events: EventRow[];
  pass1Transcripts: string[];
  pass2Transcripts: string[];
  pass1PromptTemplatePaths: string[];
  transcriptFetchCounter?: { count: number };
  pass1Requests?: Array<{
    qualityIssueCodes: string[];
    qualityIssueDetails: string[];
    additionalInstructions: string;
  }>;
  safeGenerationTraceWriteImpl?: (inputWrite: { op?: string; fn: () => Promise<void> }) => Promise<void>;
  appendGenerationEventImpl?: (_db: unknown, row: EventRow) => Promise<void>;
  finalizeGenerationRunSuccessImpl?: () => Promise<void>;
  finalizeGenerationRunFailureImpl?: () => Promise<void>;
  runWithProviderRetryImpl?: (
    options: ProviderRetryOptions,
    fn: () => Promise<unknown>,
  ) => Promise<unknown>;
  gateResults?: Array<{
    pass: boolean;
    issues: string[];
    issueDetails: string[];
  }>;
  youtubeBlueprintPromptTemplatePath?: string;
  minTranscriptWords?: number;
}) {
  return {
    getServiceSupabaseClient: () => ({ id: 'db' }),
    getYouTubeGenerationTraceContext: (traceInput: Record<string, unknown>) => ({
      db: traceInput.db,
      userId: traceInput.userId,
      sourceScope: traceInput.sourceScope || null,
      sourceTag: traceInput.sourceTag || 'test',
      modelPrimary: traceInput.modelPrimary || null,
      reasoningEffort: traceInput.reasoningEffort || null,
      traceVersion: 'yt2bp_trace_v2',
    }),
    safeGenerationTraceWrite: async (inputWrite: { op?: string; fn: () => Promise<void> }) => {
      if (input.safeGenerationTraceWriteImpl) {
        await input.safeGenerationTraceWriteImpl(inputWrite);
        return;
      }
      await inputWrite.fn();
    },
    startGenerationRun: async () => undefined,
    appendGenerationEvent: async (_db: unknown, row: EventRow) => {
      if (input.appendGenerationEventImpl) {
        await input.appendGenerationEventImpl(_db, row);
        return;
      }
      input.events.push(row);
    },
    runWithProviderRetry: input.runWithProviderRetryImpl || (async (_config: unknown, fn: () => Promise<unknown>) => fn()),
    providerRetryDefaults: {
      transcriptAttempts: 1,
      transcriptTimeoutMs: 2000,
      llmAttempts: 1,
      llmTimeoutMs: 2000,
    },
    getTranscriptForVideo: async () => {
      if (input.transcriptFetchCounter) input.transcriptFetchCounter.count += 1;
      return {
        source: 'videotranscriber_temp',
        text: input.transcriptText,
        confidence: null,
      };
    },
    pruneTranscriptForGeneration: (pruneInput: { transcriptText: string }) => pruneTranscriptForGeneration({
      transcriptText: pruneInput.transcriptText,
      config: input.pruningConfig,
    }),
    createYouTubeGenerationLLMClient: () => ({
      generateYouTubeBlueprint: async (request: { transcript: string; promptTemplatePath?: string }) => {
        input.pass1Transcripts.push(request.transcript);
        input.pass1PromptTemplatePaths.push(String(request.promptTemplatePath || ''));
        input.pass1Requests?.push({
          qualityIssueCodes: Array.isArray((request as any).qualityIssueCodes) ? (request as any).qualityIssueCodes : [],
          qualityIssueDetails: Array.isArray((request as any).qualityIssueDetails) ? (request as any).qualityIssueDetails : [],
          additionalInstructions: String((request as any).additionalInstructions || ''),
        });
        const payload = {
          schema_version: 'blueprint_sections_v1' as const,
          tags: ['one'],
          summary: { text: 'summary' },
          takeaways: { bullets: ['takeaway one', 'takeaway two', 'takeaway three'] },
          storyline: { text: 'bleup story' },
          deep_dive: { bullets: ['deep one', 'deep two', 'deep three'] },
          practical_rules: { bullets: ['rule one', 'rule two', 'rule three'] },
          open_questions: { bullets: ['question one?', 'question two?', 'question three?'] },
        };
        return {
          ...payload,
          raw_response: JSON.stringify(payload),
        };
      },
      generateYouTubeBlueprintPass2Transform: async (request: { transcript: string }) => {
        input.pass2Transcripts.push(request.transcript);
        return {
          eli5_steps: [
            { name: 'Summary', notes: 'E1', timestamp: null },
            { name: 'Takeaways', notes: 'E2', timestamp: null },
          ],
          eli5_summary: 'easy summary',
        };
      },
      analyzeBlueprint: async () => 'ok',
      generateBanner: async () => ({ buffer: Buffer.from(''), mimeType: 'image/png', prompt: 'x' }),
      generateChannelLabel: async () => ({ channelSlug: 'general', confidence: 0.5, reason: 'fallback' }),
    }),
    updateGenerationModelInfo: async () => undefined,
    yt2bpSafetyBlockEnabled: false,
    readYt2bpQualityConfig: () => ({
      enabled: false,
      retry_policy: { max_retries: 0 },
    }),
    readYt2bpContentSafetyConfig: () => ({
      enabled: false,
      retry_policy: { max_retries: 0 },
    }),
    flattenDraftText: () => 'flattened',
    runSafetyChecks: () => ({ ok: true, blockedTopics: [] }),
    runPiiChecks: () => ({ ok: true, matches: [] }),
    makePipelineError: (_code: string, message: string) => {
      throw new Error(message);
    },
    scoreYt2bpQuality: async () => ({ ok: true, overall: 1, failures: [] }),
    scoreYt2bpContentSafety: async () => ({ ok: true, failedCriteria: [] }),
    evaluateLlmNativeGate: () => {
      if (Array.isArray(input.gateResults) && input.gateResults.length > 0) {
        return input.gateResults.shift();
      }
      return { pass: true, issues: [], issueDetails: [] };
    },
    yt2bpOutputMode: 'llm_native',
    normalizeYouTubeDraftToGoldenV1: () => ({
      structureGate: { ok: true, issues: [] },
      qualityGate: { ok: true, issues: [], detail: [] },
      steps: [],
      tags: [],
    }),
    draftToNormalizationInput: (draft: unknown) => draft,
    formatGoldenQualityIssueDetails: () => [],
    buildYouTubeQualityRetryInstructions: () => 'retry',
    GOLDEN_QUALITY_MAX_RETRIES: 2,
    uploadBannerToSupabase: async () => null,
    supabaseUrl: '',
    finalizeGenerationRunSuccess: async () => {
      if (input.finalizeGenerationRunSuccessImpl) {
        await input.finalizeGenerationRunSuccessImpl();
      }
    },
    finalizeGenerationRunFailure: async () => {
      if (input.finalizeGenerationRunFailureImpl) {
        await input.finalizeGenerationRunFailureImpl();
      }
    },
    mapPipelineError: () => ({ error_code: 'GENERATION_FAIL', message: 'failed' }),
    canonicalSectionName: (name: string) => String(name || '').trim().toLowerCase(),
    normalizeSummaryVariantText: (text: string) => String(text || '').trim(),
    enforceVideoDurationPolicy: async (policyInput: { durationSeconds?: number | null }) => policyInput.durationSeconds ?? null,
    youtubeBlueprintPromptTemplatePath: String(input.youtubeBlueprintPromptTemplatePath || ''),
    minTranscriptWords: input.minTranscriptWords ?? 0,
  };
}

describe('youtubeBlueprintPipeline transcript pruning', () => {
  it('uses interactive provider retry budgets for interactive pipeline runs', async () => {
    const originalInteractiveLlmAttempts = process.env.INTERACTIVE_LLM_MAX_ATTEMPTS;
    const originalInteractiveLlmTimeoutMs = process.env.INTERACTIVE_LLM_TIMEOUT_MS;
    process.env.INTERACTIVE_LLM_MAX_ATTEMPTS = '1';
    process.env.INTERACTIVE_LLM_TIMEOUT_MS = '45000';

    try {
      const events: EventRow[] = [];
      const pass1Transcripts: string[] = [];
      const pass2Transcripts: string[] = [];
      const pass1PromptTemplatePaths: string[] = [];
      const seenOptions: ProviderRetryOptions[] = [];
      const service = createYouTubeBlueprintPipelineService(buildDeps({
        transcriptText: 'one two three four five six seven eight nine ten',
        pruningConfig: {
          enabled: false,
          budgetChars: 5000,
          thresholds: [5000, 9000],
          windows: [1, 4],
        },
        events,
        pass1Transcripts,
        pass2Transcripts,
        pass1PromptTemplatePaths,
        runWithProviderRetryImpl: async (options, fn) => {
          seenOptions.push(options);
          return fn();
        },
      }));

      await service.runYouTubePipeline({
        runId: 'run-interactive-budgets',
        videoId: 'video123',
        videoUrl: 'https://youtube.com/watch?v=video123',
        videoTitle: 'Video',
        durationSeconds: 60,
        generateReview: false,
        generateBanner: false,
        authToken: '',
        requestClass: 'interactive',
      });

      const generationCall = seenOptions.find((row) => row.providerKey === 'llm_generate_blueprint');
      expect(generationCall).toMatchObject({
        maxAttempts: 1,
        timeoutMs: 2000,
      });
    } finally {
      if (originalInteractiveLlmAttempts == null) delete process.env.INTERACTIVE_LLM_MAX_ATTEMPTS;
      else process.env.INTERACTIVE_LLM_MAX_ATTEMPTS = originalInteractiveLlmAttempts;
      if (originalInteractiveLlmTimeoutMs == null) delete process.env.INTERACTIVE_LLM_TIMEOUT_MS;
      else process.env.INTERACTIVE_LLM_TIMEOUT_MS = originalInteractiveLlmTimeoutMs;
    }
  });

  it('clamps takeaways by dropping trailing bullets until budget is met', () => {
    const notes = [
      '- one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty',
      '- one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty',
      '- one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty',
      '- one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty',
    ].join('\n');

    const result = clampTakeawaysNotesToWordBudget({
      notes,
      maxWords: 100,
      minBullets: 3,
    });

    const lines = result.notes.split('\n').map((line) => line.trim()).filter(Boolean);
    const totalWords = lines.reduce((sum, line) => sum + countWords(line.replace(/^- /, '')), 0);

    expect(result.meta.applied).toBe(true);
    expect(result.meta.beforeBullets).toBe(4);
    expect(result.meta.afterBullets).toBe(3);
    expect(totalWords).toBeLessThanOrEqual(100);
  });

  it('trims the last bullet when at min bullet count and still over budget', () => {
    const notes = [
      '- one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive forty',
      '- one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive forty',
      '- one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive forty',
    ].join('\n');

    const result = clampTakeawaysNotesToWordBudget({
      notes,
      maxWords: 100,
      minBullets: 3,
    });

    const lines = result.notes.split('\n').map((line) => line.trim()).filter(Boolean);
    const totalWords = lines.reduce((sum, line) => sum + countWords(line.replace(/^- /, '')), 0);

    expect(result.meta.applied).toBe(true);
    expect(result.meta.beforeBullets).toBe(3);
    expect(result.meta.afterBullets).toBe(3);
    expect(result.meta.truncatedLastBullet).toBe(true);
    expect(totalWords).toBeLessThanOrEqual(100);
  });

  it('uses pruned transcript for the canonical one-step pass and emits pruning metadata', async () => {
    const events: EventRow[] = [];
    const pass1Transcripts: string[] = [];
    const pass2Transcripts: string[] = [];
    const pass1PromptTemplatePaths: string[] = [];
    const transcriptText = `BEGIN_SENTINEL ${'a'.repeat(7000)} MID_SENTINEL ${'b'.repeat(7000)} END_SENTINEL`;
    const pruningConfig: TranscriptPruningConfig = {
      enabled: true,
      budgetChars: 5000,
      thresholds: [5000, 9000, 16000],
      windows: [1, 4, 6, 8],
      separator: '\n\n...\n\n',
      minWindowChars: 120,
    };
    const deps = buildDeps({
      transcriptText,
      pruningConfig,
      events,
      pass1Transcripts,
      pass2Transcripts,
      pass1PromptTemplatePaths,
    });
    const service = createYouTubeBlueprintPipelineService(deps);

    const result = await service.runYouTubePipeline({
      runId: 'run-1',
      videoId: 'abc123',
      videoUrl: 'https://www.youtube.com/watch?v=abc123',
      durationSeconds: 100,
      generateReview: false,
      generateBanner: false,
      authToken: '',
      requestClass: 'background',
      trace: {
        db: { id: 'trace-db' },
        userId: 'user-1',
        sourceScope: 'search_video_generate',
        sourceTag: 'search',
      },
    });

    expect(pass1Transcripts.length).toBeGreaterThan(0);
    expect(pass2Transcripts.length).toBe(0);
    expect(YOUTUBE_BLUEPRINT_PROMPT_TEMPLATE_PATH_DEFAULT).toBe('docs/golden_blueprint/golden_bp_prompt_contract_one_step_v6.md');
    expect(pass1Transcripts[0].length).toBeLessThanOrEqual(5000);
    expect(result.meta.transcript_pruning?.applied).toBe(true);
    expect(result.meta.transcript_pruning?.pruned_chars).toBeLessThanOrEqual(5000);
    expect(events.some((row) => row.event === 'transcript_pruning_applied')).toBe(true);
  });

  it('passes full transcript through when pruning is disabled', async () => {
    const events: EventRow[] = [];
    const pass1Transcripts: string[] = [];
    const pass2Transcripts: string[] = [];
    const pass1PromptTemplatePaths: string[] = [];
    const transcriptText = `BEGIN ${'x'.repeat(6000)} END`;
    const pruningConfig: TranscriptPruningConfig = {
      enabled: false,
      budgetChars: 5000,
      thresholds: [5000, 9000, 16000],
      windows: [1, 4, 6, 8],
      separator: '\n\n...\n\n',
      minWindowChars: 120,
    };
    const deps = buildDeps({
      transcriptText,
      pruningConfig,
      events,
      pass1Transcripts,
      pass2Transcripts,
      pass1PromptTemplatePaths,
    });
    const service = createYouTubeBlueprintPipelineService(deps);

    const result = await service.runYouTubePipeline({
      runId: 'run-2',
      videoId: 'xyz789',
      videoUrl: 'https://www.youtube.com/watch?v=xyz789',
      durationSeconds: 100,
      generateReview: false,
      generateBanner: false,
      authToken: '',
      requestClass: 'background',
      trace: {
        db: { id: 'trace-db' },
        userId: 'user-2',
      },
    });

    expect(pass1Transcripts[0]).toBe(transcriptText);
    expect(pass2Transcripts.length).toBe(0);
    expect(result.meta.transcript_pruning?.applied).toBe(false);
    expect(events.some((row) => row.event === 'transcript_pruning_applied')).toBe(true);
  });

  it('uses the one-step prompt by default and skips pass2', async () => {
    const events: EventRow[] = [];
    const pass1Transcripts: string[] = [];
    const pass2Transcripts: string[] = [];
    const pass1PromptTemplatePaths: string[] = [];
    const transcriptText = `BEGIN ${'x'.repeat(5200)} END`;
    const pruningConfig: TranscriptPruningConfig = {
      enabled: true,
      budgetChars: 5000,
      thresholds: [5000, 9000, 16000],
      windows: [1, 4, 6, 8],
      separator: '\n\n...\n\n',
      minWindowChars: 120,
    };
    const deps = buildDeps({
      transcriptText,
      pruningConfig,
      events,
      pass1Transcripts,
      pass2Transcripts,
      pass1PromptTemplatePaths,
      youtubeBlueprintPromptTemplatePath: 'docs/golden_blueprint/golden_bp_prompt_contract_one_step_v1.md',
    });
    const service = createYouTubeBlueprintPipelineService(deps);

    const result = await service.runYouTubePipeline({
      runId: 'run-3',
      videoId: 'tier123',
      videoUrl: 'https://www.youtube.com/watch?v=tier123',
      durationSeconds: 100,
      generateReview: false,
      generateBanner: false,
      authToken: '',
      generationTier: 'tier',
      requestClass: 'background',
      trace: {
        db: { id: 'trace-db' },
        userId: 'user-3',
      },
    });

    expect(pass1Transcripts.length).toBeGreaterThan(0);
    expect(pass2Transcripts.length).toBe(0);
    expect(pass1PromptTemplatePaths[0]).toBe('docs/golden_blueprint/golden_bp_prompt_contract_one_step_v1.md');
    expect(result.draft.sectionsJson?.schema_version).toBe('blueprint_sections_v1');
    expect(result.draft.steps.map((step) => step.name)).toEqual([
      'Summary',
      'Takeaways',
      'Bleup',
      'Deep Dive',
      'Practical Rules',
      'Caveats',
    ]);
    expect(result.draft.summaryVariants.default).toBe('summary');
    expect(result.draft.summaryVariants.eli5).toBe(result.draft.summaryVariants.default);
    expect(result.draft.eli5Steps.length).toBe(result.draft.steps.length);
    expect(events.some((row) => row.event === 'model_raw_output_captured')).toBe(true);
    expect(events.some((row) => row.event === 'pass2_transform_skipped_one_step')).toBe(true);
  });

  it('uses provided video title instead of LLM-generated title', async () => {
    const events: EventRow[] = [];
    const pass1Transcripts: string[] = [];
    const pass2Transcripts: string[] = [];
    const pass1PromptTemplatePaths: string[] = [];
    const transcriptText = 'tiny transcript';
    const pruningConfig: TranscriptPruningConfig = {
      enabled: true,
      budgetChars: 5000,
      thresholds: [5000, 9000, 16000],
      windows: [1, 4, 6, 8],
      separator: '\n\n...\n\n',
      minWindowChars: 120,
    };
    const deps = buildDeps({
      transcriptText,
      pruningConfig,
      events,
      pass1Transcripts,
      pass2Transcripts,
      pass1PromptTemplatePaths,
    });
    const service = createYouTubeBlueprintPipelineService(deps);

    const result = await service.runYouTubePipeline({
      runId: 'run-3b',
      videoId: 'title123',
      videoTitle: '  My\u200B   Video   Title  ',
      videoUrl: 'https://www.youtube.com/watch?v=title123',
      durationSeconds: 100,
      generateReview: false,
      generateBanner: false,
      authToken: '',
      generationTier: 'tier',
      requestClass: 'background',
      trace: {
        db: { id: 'trace-db' },
        userId: 'user-3',
      },
    });

    expect(result.draft.title).toBe('My Video Title');
  });

  it('publishes with terminal gate issues after max retries and injects issues into retries', async () => {
    const events: EventRow[] = [];
    const pass1Transcripts: string[] = [];
    const pass2Transcripts: string[] = [];
    const pass1PromptTemplatePaths: string[] = [];
    const pass1Requests: Array<{
      qualityIssueCodes: string[];
      qualityIssueDetails: string[];
      additionalInstructions: string;
    }> = [];
    const transcriptText = `BEGIN ${'x'.repeat(2200)} END`;
    const pruningConfig: TranscriptPruningConfig = {
      enabled: true,
      budgetChars: 5000,
      thresholds: [5000, 9000, 16000],
      windows: [1, 4, 6, 8],
      separator: '\n\n...\n\n',
      minWindowChars: 120,
    };
    const deps = buildDeps({
      transcriptText,
      pruningConfig,
      events,
      pass1Transcripts,
      pass2Transcripts,
      pass1PromptTemplatePaths,
      pass1Requests,
      gateResults: [
        { pass: false, issues: ['SUMMARY_MISSING'], issueDetails: ['SUMMARY_MISSING section=summary'] },
        { pass: false, issues: ['SUMMARY_MISSING'], issueDetails: ['SUMMARY_MISSING section=summary'] },
        { pass: false, issues: ['SUMMARY_MISSING'], issueDetails: ['SUMMARY_MISSING section=summary'] },
      ],
    });
    const service = createYouTubeBlueprintPipelineService(deps);

    const result = await service.runYouTubePipeline({
      runId: 'run-4',
      videoId: 'gatefail123',
      videoUrl: 'https://www.youtube.com/watch?v=gatefail123',
      durationSeconds: 120,
      generateReview: false,
      generateBanner: false,
      authToken: '',
      requestClass: 'background',
      trace: {
        db: { id: 'trace-db' },
        userId: 'user-4',
      },
    });

    expect(pass1Requests.length).toBe(3);
    expect(pass1Requests[0].qualityIssueCodes).toEqual([]);
    expect(pass1Requests[1].qualityIssueCodes).toEqual(['SUMMARY_MISSING']);
    expect(pass1Requests[2].qualityIssueCodes).toEqual(['SUMMARY_MISSING']);
    expect(pass1Requests[1].qualityIssueDetails).toEqual(['SUMMARY_MISSING section=summary']);
    expect(pass1Requests[2].qualityIssueDetails).toEqual(['SUMMARY_MISSING section=summary']);
    expect(pass1Requests[0].additionalInstructions).toContain('Return exactly 6 sections in this exact order and exact names:');
    expect(pass1Requests[1].additionalInstructions).toContain('Return exactly 6 sections in this exact order and exact names:');
    expect(pass1Requests[2].additionalInstructions).toContain('Return exactly 6 sections in this exact order and exact names:');
    expect(pass1Requests[0].additionalInstructions).toContain('Summary, Takeaways, Storyline, Deep Dive, Practical Rules, Caveats.');
    expect(pass1Requests[1].additionalInstructions).toContain('Summary, Takeaways, Storyline, Deep Dive, Practical Rules, Caveats.');
    expect(pass1Requests[2].additionalInstructions).toContain('Summary, Takeaways, Storyline, Deep Dive, Practical Rules, Caveats.');
    expect(pass1Requests[0].additionalInstructions).toContain('Return Caveats content in the existing open_questions field.');
    expect(pass1Requests[0].additionalInstructions).toContain('Do not treat expected transcript pruning/truncation as a caveat by itself');
    expect(pass2Transcripts.length).toBe(0);
    expect(events.some((row) => row.event === 'gate_failed_terminal')).toBe(true);
    expect(events.some((row) => row.event === 'gate_published_anyway')).toBe(true);
    expect((result.meta as Record<string, unknown>).bp_structure_ok).toBe(false);
    expect((result.meta as Record<string, unknown>).bp_quality_final_mode).toBe('terminal_publish_anyway');
  });

  it('still finalizes the generation run when success event logging is swallowed', async () => {
    const events: EventRow[] = [];
    const finalized: string[] = [];
    const service = createYouTubeBlueprintPipelineService(buildDeps({
      transcriptText: `BEGIN ${'x'.repeat(1800)} END`,
      pruningConfig: {
        enabled: true,
        budgetChars: 5000,
        thresholds: [5000, 9000, 16000],
        windows: [1, 4, 6, 8],
        separator: '\n\n...\n\n',
        minWindowChars: 120,
      },
      events,
      pass1Transcripts: [],
      pass2Transcripts: [],
      pass1PromptTemplatePaths: [],
      safeGenerationTraceWriteImpl: async ({ op, fn }) => {
        if (op === 'event_pipeline_succeeded') {
          try {
            await fn();
          } catch {
            return;
          }
          return;
        }
        await fn();
      },
      appendGenerationEventImpl: async (_db, row) => {
        if (row.event === 'pipeline_succeeded') {
          throw new Error('event append failed');
        }
        events.push(row);
      },
      finalizeGenerationRunSuccessImpl: async () => {
        finalized.push('success');
      },
    }));

    await service.runYouTubePipeline({
      runId: 'run-finalize-success',
      videoId: 'fin12345678',
      videoUrl: 'https://www.youtube.com/watch?v=fin12345678',
      durationSeconds: 100,
      generateReview: false,
      generateBanner: false,
      authToken: '',
      requestClass: 'background',
      trace: {
        db: { id: 'trace-db' },
        userId: 'user-finalize',
      },
    });

    expect(finalized).toEqual(['success']);
  });

  it('blocks generation when transcript has too few words', async () => {
    const events: EventRow[] = [];
    const service = createYouTubeBlueprintPipelineService(buildDeps({
      transcriptText: 'Ben',
      pruningConfig: {
        enabled: false,
        budgetChars: 1000,
        thresholds: [1000, 2000, 4000],
        windows: [1, 2, 4],
        separator: '\n\n...\n\n',
        minWindowChars: 50,
      },
      events,
      pass1Transcripts: [],
      pass2Transcripts: [],
      pass1PromptTemplatePaths: [],
      minTranscriptWords: 30,
    }));

    await expect(service.runYouTubePipeline({
      runId: 'run-low-transcript',
      videoId: 'VZUFiElNSbk',
      videoUrl: 'https://www.youtube.com/watch?v=VZUFiElNSbk',
      videoTitle: 'Derm Spring Skincare Must-Haves',
      durationSeconds: 15,
      generateReview: false,
      generateBanner: false,
      authToken: '',
      requestClass: 'interactive',
      trace: {
        db: { id: 'trace-db' },
        userId: 'user-low',
      },
    })).rejects.toThrow("This video has very limited speech, so a blueprint can't be generated from it right now. If that seems incorrect, try again tomorrow.");

    expect(events.some((row) => row.event === 'transcript_insufficient_context')).toBe(true);
  });
});

import { z } from 'zod';
import type {
  BannerRequest,
  BannerResult,
  BlueprintAnalysisRequest,
  ChannelLabelRequest,
  ChannelLabelResult,
  GenerationModelEvent,
  GenerationPromptEvent,
  LLMClient,
  LLMGenerationOptions,
  YouTubeBlueprintPass2TransformRequest,
  YouTubeBlueprintPass2TransformResult,
  YouTubeBlueprintRequest,
  YouTubeBlueprintSectionsResult,
} from './types';
import {
  BLUEPRINT_SYSTEM_PROMPT,
  YOUTUBE_BLUEPRINT_SYSTEM_PROMPT,
  buildBlueprintUserPrompt,
  buildYouTubeBlueprintRepairPrompt,
  buildYouTubeBlueprintPass2TransformPrompt,
  buildYouTubeBlueprintUserPrompt,
  extractJson,
} from './prompts';
import { CodexExecError } from './codexExec';
import {
  BlueprintJsonInvalidError,
  isBlueprintJsonInvalidError,
  parseBlueprintJsonOutput,
} from './blueprintJsonGuard';

const YouTubeBlueprintSectionsValidator = z.object({
  schema_version: z.literal('blueprint_sections_v1'),
  tags: z.array(z.string()).optional(),
  summary: z.object({
    text: z.string(),
  }),
  takeaways: z.object({
    bullets: z.array(z.string()),
  }),
  storyline: z.object({
    text: z.string(),
  }),
  deep_dive: z.object({
    bullets: z.array(z.string()),
  }),
  practical_rules: z.object({
    bullets: z.array(z.string()),
  }),
  open_questions: z.object({
    bullets: z.array(z.string()),
  }),
});

const YouTubeBlueprintPass2TransformValidator = z.object({
  eli5_steps: z.array(
    z.object({
      name: z.string(),
      notes: z.string(),
      timestamp: z.string().nullable().optional(),
    }),
  ).min(1),
  eli5_summary: z.string(),
});

function normalizeReasoningEffort(raw: unknown): 'none' | 'low' | 'medium' | 'high' | 'xhigh' {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'none') return 'none';
  if (normalized === 'low') return 'low';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'high') return 'high';
  if (normalized === 'xhigh') return 'xhigh';
  return 'low';
}

type GenerationOperation = 'generateYouTubeBlueprint' | 'generateYouTubeBlueprintPass2Transform' | 'analyzeBlueprint';
const BLUEPRINT_JSON_HARD_RETRY_INSTRUCTION = [
  'RETRY REQUIREMENT:',
  'Return strict valid JSON only.',
  'Do not include markdown fences or commentary.',
  'Ensure all arrays and objects are syntactically complete.',
].join(' ');

export function createCodexGenerationClient(input: {
  fallbackClientFactory: () => LLMClient;
  fallbackEnabled: boolean;
  codexModel: string;
  codexReasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
  codexTimeoutMs: number;
  runCodexPrompt: (payload: {
    operation: GenerationOperation;
    model: string;
    reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    prompt: string;
  }) => Promise<{
    outputText: string;
    durationMs: number;
  }>;
  onCodexFallback?: (payload: {
    operation: GenerationOperation;
    errorCode: string;
    message: string;
  }) => void;
}): LLMClient {
  let fallbackClientRef: LLMClient | null = null;
  const getFallbackClient = () => {
    if (!fallbackClientRef) fallbackClientRef = input.fallbackClientFactory();
    return fallbackClientRef;
  };

  const emitModelEvent = (options: LLMGenerationOptions | undefined, event: GenerationModelEvent) => {
    try {
      options?.onGenerationModelEvent?.(event);
    } catch (callbackError) {
      console.warn('[llm_generation_model_callback_error]', String(callbackError instanceof Error ? callbackError.message : callbackError));
    }
  };

  const emitPromptEvent = (options: LLMGenerationOptions | undefined, event: GenerationPromptEvent) => {
    try {
      options?.onGenerationPromptEvent?.(event);
    } catch (callbackError) {
      console.warn('[llm_generation_prompt_callback_error]', String(callbackError instanceof Error ? callbackError.message : callbackError));
    }
  };

  const resolveProfile = (options: LLMGenerationOptions | undefined) => {
    const model = String(input.codexModel || '').trim() || 'gpt-5-mini';
    const reasoningEffort = normalizeReasoningEffort(
      options?.generationProfile?.reasoningEffort || input.codexReasoningEffort,
    );
    return { model, reasoningEffort };
  };

  async function runCodexJson<T>(payload: {
    operation: GenerationOperation;
    instructions: string;
    prompt: string;
    options?: LLMGenerationOptions;
    parse: (raw: string) => T;
    fallback: () => Promise<T>;
  }) {
    const profile = resolveProfile(payload.options);
    emitPromptEvent(payload.options, {
      operation: payload.operation,
      instructions: payload.instructions,
      prompt: payload.prompt,
    });

    try {
      const response = await input.runCodexPrompt({
        operation: payload.operation,
        model: profile.model,
        reasoningEffort: profile.reasoningEffort,
        prompt: buildCodexPrompt({
          instructions: payload.instructions,
          prompt: payload.prompt,
        }),
      });
      emitModelEvent(payload.options, {
        event: 'primary_success',
        provider: 'codex_cli',
        operation: payload.operation,
        model_used: profile.model,
        fallback_used: false,
        fallback_model: null,
        reasoning_effort: profile.reasoningEffort,
      });
      return payload.parse(response.outputText);
    } catch (error) {
      emitModelEvent(payload.options, {
        event: 'request_failed',
        provider: 'codex_cli',
        operation: payload.operation,
        model_used: profile.model,
        fallback_used: false,
        fallback_model: null,
        reasoning_effort: profile.reasoningEffort,
        status: null,
        message: error instanceof Error ? error.message : String(error),
      });
      if (!input.fallbackEnabled) throw error;
      input.onCodexFallback?.({
        operation: payload.operation,
        errorCode: error instanceof CodexExecError ? error.code : 'PROCESS_FAIL',
        message: error instanceof Error ? error.message : String(error),
      });
      return payload.fallback();
    }
  }

  return {
    async analyzeBlueprint(request: BlueprintAnalysisRequest): Promise<string> {
      const prompt = buildBlueprintUserPrompt(request);
      return runCodexJson({
        operation: 'analyzeBlueprint',
        instructions: BLUEPRINT_SYSTEM_PROMPT,
        prompt,
        parse: (rawText) => String(rawText || '').trim(),
        fallback: () => getFallbackClient().analyzeBlueprint(request),
      });
    },
    async generateBanner(request: BannerRequest): Promise<BannerResult> {
      return getFallbackClient().generateBanner(request);
    },
    async generateYouTubeBlueprint(
      request: YouTubeBlueprintRequest,
      options?: LLMGenerationOptions,
    ): Promise<YouTubeBlueprintSectionsResult> {
      const basePrompt = buildYouTubeBlueprintUserPrompt(request);
      const profile = resolveProfile(options);
      const fallback = async (errorCode: string, message: string) => {
        if (!input.fallbackEnabled) {
          if (errorCode === 'BLUEPRINT_JSON_INVALID') {
            throw new BlueprintJsonInvalidError({
              failureClass: 'invalid_json',
              detail: message,
              message,
            });
          }
          throw new CodexExecError({ code: 'INVALID_OUTPUT', message });
        }
        input.onCodexFallback?.({
          operation: 'generateYouTubeBlueprint',
          errorCode,
          message,
        });
        return getFallbackClient().generateYouTubeBlueprint(request, options);
      };

      const attempts: Array<{
        attempt: number;
        attemptType: 'primary' | 'repair' | 'retry';
        prompt: string;
      }> = [
        {
          attempt: 1,
          attemptType: 'primary',
          prompt: basePrompt,
        },
      ];
      let repairSeed: { rawText: string; failureClass: string; failureDetail: string } | null = null;

      for (const attemptConfig of attempts) {
        emitPromptEvent(options, {
          operation: 'generateYouTubeBlueprint',
          instructions: YOUTUBE_BLUEPRINT_SYSTEM_PROMPT,
          prompt: attemptConfig.prompt,
        });

        let response: { outputText: string; durationMs: number };
        try {
          response = await input.runCodexPrompt({
            operation: 'generateYouTubeBlueprint',
            model: profile.model,
            reasoningEffort: profile.reasoningEffort,
            prompt: buildCodexPrompt({
              instructions: YOUTUBE_BLUEPRINT_SYSTEM_PROMPT,
              prompt: attemptConfig.prompt,
            }),
          });
          emitModelEvent(options, {
            event: 'primary_success',
            provider: 'codex_cli',
            operation: 'generateYouTubeBlueprint',
            model_used: profile.model,
            fallback_used: false,
            fallback_model: null,
            reasoning_effort: profile.reasoningEffort,
          });
        } catch (error) {
          emitModelEvent(options, {
            event: 'request_failed',
            provider: 'codex_cli',
            operation: 'generateYouTubeBlueprint',
            model_used: profile.model,
            fallback_used: false,
            fallback_model: null,
            reasoning_effort: profile.reasoningEffort,
            status: null,
            message: error instanceof Error ? error.message : String(error),
          });
          return fallback(
            error instanceof CodexExecError ? error.code : 'PROCESS_FAIL',
            error instanceof Error ? error.message : String(error),
          );
        }

        try {
          return {
            ...parseBlueprintJsonOutput({
              rawText: response.outputText,
              validator: YouTubeBlueprintSectionsValidator,
            }),
            raw_response: response.outputText,
          };
        } catch (error) {
          if (!isBlueprintJsonInvalidError(error)) {
            throw error;
          }
          const rawText = String(response.outputText || '').trim();
          const nextAttempt = attemptConfig.attempt + 1;

          if (attemptConfig.attemptType === 'primary') {
            repairSeed = {
              rawText,
              failureClass: error.failureClass,
              failureDetail: error.detail,
            };
            attempts.push({
              attempt: nextAttempt,
              attemptType: 'repair',
              prompt: buildYouTubeBlueprintRepairPrompt({
                ...request,
                previousOutput: rawText,
                failureClass: error.failureClass,
                failureDetail: error.detail,
              }),
            });
            console.warn('[llm_blueprint_json_retry]', JSON.stringify({
              provider: 'codex_cli',
              operation: 'generateYouTubeBlueprint',
              attempt: attemptConfig.attempt,
              attempt_type: attemptConfig.attemptType,
              next_attempt: nextAttempt,
              next_attempt_type: 'repair',
              failure_class: error.failureClass,
              detail: error.detail,
            }));
            continue;
          }

          if (attemptConfig.attemptType === 'repair') {
            attempts.push({
              attempt: nextAttempt,
              attemptType: 'retry',
              prompt: `${basePrompt}\n\n${BLUEPRINT_JSON_HARD_RETRY_INSTRUCTION}`,
            });
            console.warn('[llm_blueprint_json_retry]', JSON.stringify({
              provider: 'codex_cli',
              operation: 'generateYouTubeBlueprint',
              attempt: attemptConfig.attempt,
              attempt_type: attemptConfig.attemptType,
              next_attempt: nextAttempt,
              next_attempt_type: 'retry',
              failure_class: error.failureClass,
              detail: error.detail,
              initial_failure_class: repairSeed?.failureClass || null,
              initial_failure_detail: repairSeed?.failureDetail || null,
            }));
            continue;
          }

          if (attemptConfig.attemptType === 'retry') {
            return fallback(error.code, error.message);
          }
          throw error;
        }
      }

      return fallback('BLUEPRINT_JSON_INVALID', 'Blueprint generation returned malformed structured output. Please try again.');
    },
    async generateYouTubeBlueprintPass2Transform(
      request: YouTubeBlueprintPass2TransformRequest,
      options?: LLMGenerationOptions,
    ): Promise<YouTubeBlueprintPass2TransformResult> {
      const prompt = buildYouTubeBlueprintPass2TransformPrompt(request);
      return runCodexJson({
        operation: 'generateYouTubeBlueprintPass2Transform',
        instructions: YOUTUBE_BLUEPRINT_SYSTEM_PROMPT,
        prompt,
        options,
        parse: (rawText) => {
          const parsed = JSON.parse(extractJson(String(rawText || '').trim()));
          return YouTubeBlueprintPass2TransformValidator.parse(parsed);
        },
        fallback: () => getFallbackClient().generateYouTubeBlueprintPass2Transform(request, options),
      });
    },
    async generateChannelLabel(request: ChannelLabelRequest): Promise<ChannelLabelResult> {
      return getFallbackClient().generateChannelLabel(request);
    },
  };
}

function buildCodexPrompt(input: {
  instructions: string;
  prompt: string;
}) {
  const instructions = String(input.instructions || '').trim();
  const prompt = String(input.prompt || '').trim();
  return [
    instructions || '',
    instructions ? '\n' : '',
    prompt,
    '',
    'Output rules:',
    '- Return only the final answer.',
    '- If JSON is requested, return strict JSON without markdown.',
  ].join('\n').trim();
}

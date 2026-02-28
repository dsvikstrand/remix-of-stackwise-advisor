import OpenAI from 'openai';
import { z } from 'zod';
import type {
  BannerRequest,
  BannerResult,
  BlueprintAnalysisRequest,
  ChannelLabelRequest,
  ChannelLabelResult,
  GenerationOperation,
  GenerationPromptEvent,
  GenerationModelEvent,
  LLMGenerationOptions,
  LLMClient,
  YouTubeBlueprintResult,
  YouTubeBlueprintPass2TransformResult,
  YouTubeBlueprintPass2TransformRequest,
  YouTubeBlueprintRequest,
} from './types';
import {
  BLUEPRINT_SYSTEM_PROMPT,
  CHANNEL_LABEL_SYSTEM_PROMPT,
  YOUTUBE_BLUEPRINT_SYSTEM_PROMPT,
  buildBlueprintUserPrompt,
  buildChannelLabelUserPrompt,
  buildYouTubeBlueprintPass2TransformPrompt,
  buildYouTubeBlueprintUserPrompt,
  extractJson,
} from './prompts';

const YouTubeBlueprintValidator = z.object({
  title: z.string(),
  description: z.string(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  summary_variants: z.object({
    default: z.string().nullable().optional(),
    eli5: z.string().nullable().optional(),
  }).nullable().optional(),
  steps: z.array(
    z.object({
      name: z.string(),
      notes: z.string(),
      timestamp: z.string().nullable().optional(),
    })
  ).min(1),
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

const ChannelLabelValidator = z.object({
  channel_slug: z.string().min(1),
  reason: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

type GenerationReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

function normalizeGenerationReasoningEffort(raw: string | undefined): GenerationReasoningEffort {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'none') return 'none';
  if (normalized === 'low') return 'low';
  if (normalized === 'medium') return 'medium';
  if (normalized === 'high') return 'high';
  if (normalized === 'xhigh') return 'xhigh';
  return 'medium';
}

function isModelCompatibilityError(error: unknown) {
  const status = Number((error as { status?: unknown })?.status || 0);
  const message = String((error as { message?: unknown })?.message || '').toLowerCase();
  return (
    status === 400
    || status === 404
    || message.includes('model')
    || message.includes('unsupported')
    || message.includes('not found')
    || message.includes('does not exist')
    || message.includes('reasoning')
  );
}

function logGenerationModelEvent(event: 'primary_success' | 'fallback_success' | 'request_failed', payload: {
  operation: GenerationOperation;
  model_used: string;
  fallback_used: boolean;
  fallback_model?: string | null;
  reasoning_effort?: GenerationReasoningEffort | null;
  status?: number | null;
  message?: string | null;
}) {
  console.info(`[llm_generation_model] ${JSON.stringify({ event, ...payload })}`);
}

export function createOpenAIClient(): LLMClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const generationModel = process.env.OPENAI_GENERATION_MODEL || 'gpt-5.2';
  const generationFallbackModel = process.env.OPENAI_GENERATION_FALLBACK_MODEL || 'o4-mini';
  const generationReasoningEffort = normalizeGenerationReasoningEffort(process.env.OPENAI_GENERATION_REASONING_EFFORT);
  const imageModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const imageSize = process.env.OPENAI_IMAGE_SIZE || '1536x1024';
  const imageQuality = process.env.OPENAI_IMAGE_QUALITY || 'low';
  const client = new OpenAI({ apiKey });

  async function runGenerationRequest(input: {
    operation: GenerationOperation;
    instructions?: string;
    prompt: string;
    options?: LLMGenerationOptions;
  }) {
    const emitModelEvent = (event: GenerationModelEvent) => {
      try {
        input.options?.onGenerationModelEvent?.(event);
      } catch (callbackError) {
        console.warn('[llm_generation_model_callback_error]', String(callbackError instanceof Error ? callbackError.message : callbackError));
      }
    };
    const emitPromptEvent = (event: GenerationPromptEvent) => {
      try {
        input.options?.onGenerationPromptEvent?.(event);
      } catch (callbackError) {
        console.warn('[llm_generation_prompt_callback_error]', String(callbackError instanceof Error ? callbackError.message : callbackError));
      }
    };

    emitPromptEvent({
      operation: input.operation,
      instructions: String(input.instructions || ''),
      prompt: input.prompt,
    });

    const runOnce = async (selectedModel: string, includeReasoning: boolean) => {
      const payload: {
        model: string;
        instructions?: string;
        input: string;
        reasoning?: { effort: Exclude<GenerationReasoningEffort, 'none'> };
      } = {
        model: selectedModel,
        input: input.prompt,
      };
      const instructions = String(input.instructions || '').trim();
      if (instructions) {
        payload.instructions = instructions;
      }
      if (includeReasoning && generationReasoningEffort !== 'none') {
        payload.reasoning = { effort: generationReasoningEffort };
      }
      return client.responses.create(payload);
    };

    try {
      const response = await runOnce(generationModel, true);
      logGenerationModelEvent('primary_success', {
        operation: input.operation,
        model_used: generationModel,
        fallback_used: false,
        fallback_model: generationFallbackModel || null,
        reasoning_effort: generationReasoningEffort,
      });
      emitModelEvent({
        event: 'primary_success',
        operation: input.operation,
        model_used: generationModel,
        fallback_used: false,
        fallback_model: generationFallbackModel || null,
        reasoning_effort: generationReasoningEffort,
      });
      return response;
    } catch (error) {
      const shouldFallback =
        generationFallbackModel
        && generationFallbackModel !== generationModel
        && isModelCompatibilityError(error);

      if (!shouldFallback) {
        logGenerationModelEvent('request_failed', {
          operation: input.operation,
          model_used: generationModel,
          fallback_used: false,
          fallback_model: generationFallbackModel || null,
          reasoning_effort: generationReasoningEffort,
          status: Number((error as { status?: unknown })?.status || 0) || null,
          message: String((error as { message?: unknown })?.message || '').slice(0, 240) || null,
        });
        emitModelEvent({
          event: 'request_failed',
          operation: input.operation,
          model_used: generationModel,
          fallback_used: false,
          fallback_model: generationFallbackModel || null,
          reasoning_effort: generationReasoningEffort,
          status: Number((error as { status?: unknown })?.status || 0) || null,
          message: String((error as { message?: unknown })?.message || '').slice(0, 240) || null,
        });
        throw error;
      }

      console.warn(
        `[llm] ${input.operation} primary model ${generationModel} failed; retrying fallback ${generationFallbackModel}`,
      );
      const response = await runOnce(generationFallbackModel, false);
      logGenerationModelEvent('fallback_success', {
        operation: input.operation,
        model_used: generationFallbackModel,
        fallback_used: true,
        fallback_model: generationFallbackModel,
        reasoning_effort: null,
      });
      emitModelEvent({
        event: 'fallback_success',
        operation: input.operation,
        model_used: generationFallbackModel,
        fallback_used: true,
        fallback_model: generationFallbackModel,
        reasoning_effort: null,
      });
      return response;
    }
  }

  return {
    async analyzeBlueprint(input: BlueprintAnalysisRequest): Promise<string> {
      const response = await client.responses.create({
        model,
        instructions: BLUEPRINT_SYSTEM_PROMPT,
        input: buildBlueprintUserPrompt(input),
      });

      const outputText = response.output_text?.trim();
      if (!outputText) {
        throw new Error('No output text from OpenAI');
      }

      return outputText;
    },
    async generateBanner(input: BannerRequest): Promise<BannerResult> {
      const prompt = buildBannerPrompt(input);
      const response = await client.images.generate({
        model: imageModel,
        prompt,
        size: imageSize,
        quality: imageQuality,
      });

      const imagePayload = response.data?.[0];
      const base64 = imagePayload?.b64_json;
      if (base64) {
        return {
          buffer: Buffer.from(base64, 'base64'),
          mimeType: 'image/png',
          prompt,
        };
      }

      const imageUrl = imagePayload?.url;
      if (!imageUrl) {
        throw new Error('No image data returned');
      }

      const downloaded = await fetchImageBuffer(imageUrl);
      return {
        buffer: downloaded.buffer,
        mimeType: downloaded.mimeType,
        prompt,
      };
    },
    async generateYouTubeBlueprint(input: YouTubeBlueprintRequest, options?: LLMGenerationOptions): Promise<YouTubeBlueprintResult> {
      const response = await runGenerationRequest({
        operation: 'generateYouTubeBlueprint',
        instructions: YOUTUBE_BLUEPRINT_SYSTEM_PROMPT,
        prompt: buildYouTubeBlueprintUserPrompt(input),
        options,
      });

      const outputText = response.output_text?.trim();
      if (!outputText) {
        throw new Error('No output text from OpenAI');
      }
      const parsed = JSON.parse(extractJson(outputText));
      return YouTubeBlueprintValidator.parse(parsed);
    },
    async generateYouTubeBlueprintPass2Transform(
      input: YouTubeBlueprintPass2TransformRequest,
      options?: LLMGenerationOptions,
    ): Promise<YouTubeBlueprintPass2TransformResult> {
      const response = await runGenerationRequest({
        operation: 'generateYouTubeBlueprintPass2Transform',
        instructions: YOUTUBE_BLUEPRINT_SYSTEM_PROMPT,
        prompt: buildYouTubeBlueprintPass2TransformPrompt(input),
        options,
      });

      const outputText = response.output_text?.trim();
      if (!outputText) {
        throw new Error('No output text from OpenAI');
      }
      const parsed = JSON.parse(extractJson(outputText));
      return YouTubeBlueprintPass2TransformValidator.parse(parsed);
    },
    async generateChannelLabel(input: ChannelLabelRequest): Promise<ChannelLabelResult> {
      const response = await client.responses.create({
        model,
        instructions: CHANNEL_LABEL_SYSTEM_PROMPT,
        input: buildChannelLabelUserPrompt(input),
      });

      const outputText = response.output_text?.trim();
      if (!outputText) {
        throw new Error('No output text from OpenAI');
      }

      const parsed = JSON.parse(extractJson(outputText));
      const validated = ChannelLabelValidator.parse(parsed);
      return {
        channelSlug: String(validated.channel_slug || '').trim().toLowerCase(),
        reason: validated.reason || null,
        confidence: validated.confidence ?? null,
      };
    },
  };
}

async function fetchImageBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'image/png';
  return { buffer: Buffer.from(arrayBuffer), mimeType: contentType };
}

function buildBannerPrompt(input: BannerRequest) {
  const title = input.title.trim();
  const inventoryTitle = input.inventoryTitle?.trim();
  const tags = (input.tags || [])
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 6);

  const parts = [
    `A clean, modern, purely visual landscape banner for a community blueprint inspired by this topic: ${title}.`,
  ];

  if (inventoryTitle) {
    parts.push(`Based on the inventory "${inventoryTitle}".`);
  }

  if (tags.length > 0) {
    parts.push(`Theme keywords: ${tags.join(', ')}.`);
  }

  parts.push(
    'Strict constraints: no readable text, no letters, no words, no numbers, no typography, no logos, no watermarks, no UI screenshots, no signage.',
    'Never render the title or keywords as text. Interpret them as visual concepts only.',
    'Wide landscape composition, minimal, tasteful gradients, soft lighting, clean abstract/iconic visuals only.'
  );

  return parts.join(' ');
}

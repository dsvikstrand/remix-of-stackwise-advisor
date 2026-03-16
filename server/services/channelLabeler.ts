import { CHANNELS_CATALOG } from '../../src/lib/channelsCatalog';
import { normalizeTag } from '../../src/lib/tagging';
import { createLLMClient } from '../llm/client';
import type { LLMClient } from '../llm/types';

export type LlmChannelClassifierReason = 'llm_valid' | 'llm_retry_valid' | 'fallback_general';
export type ChannelLabelReasonCode = 'LLM_VALID' | 'LLM_RETRY_VALID' | 'LLM_INVALID_FALLBACK_GENERAL';
export type ChannelLabelFailureClass = 'invalid_json' | 'invalid_schema' | 'invalid_slug' | 'provider_error';

export type ChannelLabelerInput = {
  title: string;
  summary?: string | null;
  tagSlugs: string[];
  fallbackSlug: string;
  llmClient?: LLMClient;
};

export type ChannelLabelerResult = {
  channelSlug: string;
  classifierReason: LlmChannelClassifierReason;
  reasonCode: ChannelLabelReasonCode;
  rawConfidence: number | null;
  retryUsed: boolean;
  fallbackUsed: boolean;
  attemptCount: number;
  failureClass: ChannelLabelFailureClass | null;
  failureDetail: string | null;
  returnedSlug: string | null;
};

function normalizeSlug(value: string) {
  return normalizeTag(String(value || '').replace(/^#/, ''));
}

function getAllowedChannels() {
  return CHANNELS_CATALOG
    .filter((channel) => channel.status === 'active')
    .map((channel) => ({
      slug: channel.slug,
      name: channel.name,
      description: channel.description,
      aliases: channel.aliases,
    }));
}

function getValidatedFallbackSlug(fallbackSlug: string, allowedSlugs: Set<string>) {
  const normalized = normalizeSlug(fallbackSlug);
  if (normalized && allowedSlugs.has(normalized)) return normalized;
  if (allowedSlugs.has('general')) return 'general';
  const first = Array.from(allowedSlugs)[0];
  return first || 'general';
}

function toSummary(summary: string | null | undefined) {
  return String(summary || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

function toTags(tagSlugs: string[]) {
  return Array.from(
    new Set(
      (tagSlugs || [])
        .map((tag) => normalizeSlug(tag))
        .filter(Boolean),
    ),
  ).slice(0, 16);
}

type LabelAttemptOutcome =
  | {
      ok: true;
      slug: string;
      confidence: number | null;
      returnedSlug: string | null;
      failureClass: null;
      failureDetail: null;
    }
  | {
      ok: false;
      confidence: number | null;
      returnedSlug: string | null;
      failureClass: ChannelLabelFailureClass;
      failureDetail: string | null;
    };

function inferFailureClassFromError(error: unknown): ChannelLabelFailureClass {
  const message = error instanceof Error ? error.message : String(error || '');
  if (
    /json|unexpected token|expected .*after array element|unterminated|parse/i.test(message)
  ) {
    return 'invalid_json';
  }
  if (
    /channelslug|required|invalid type|validation|schema|zod/i.test(message)
  ) {
    return 'invalid_schema';
  }
  return 'provider_error';
}

async function attemptLabel(
  llm: LLMClient,
  requestPayload: {
    title: string;
    summary: string;
    tags: string[];
    fallbackSlug: string;
    allowedChannels: ReturnType<typeof getAllowedChannels>;
  },
  allowedSlugs: Set<string>,
): Promise<LabelAttemptOutcome> {
  try {
    const result = await llm.generateChannelLabel(requestPayload);
    const rawSlug = typeof result?.channelSlug === 'string' ? result.channelSlug : null;
    const normalizedSlug = normalizeSlug(rawSlug || '');
    const confidence = typeof result?.confidence === 'number' ? result.confidence : null;

    if (!rawSlug || !normalizedSlug) {
      return {
        ok: false,
        confidence,
        returnedSlug: rawSlug,
        failureClass: 'invalid_schema',
        failureDetail: 'Missing or empty channel_slug',
      };
    }

    if (!allowedSlugs.has(normalizedSlug)) {
      return {
        ok: false,
        confidence,
        returnedSlug: rawSlug,
        failureClass: 'invalid_slug',
        failureDetail: `Channel slug "${normalizedSlug}" is not in the allowed catalog`,
      };
    }

    return {
      ok: true,
      slug: normalizedSlug,
      confidence,
      returnedSlug: rawSlug,
      failureClass: null,
      failureDetail: null,
    };
  } catch (error) {
    return {
      ok: false,
      confidence: null,
      returnedSlug: null,
      failureClass: inferFailureClassFromError(error),
      failureDetail: error instanceof Error ? error.message : String(error || 'Unknown label error'),
    };
  }
}

export async function labelChannelFromArtifact(input: ChannelLabelerInput): Promise<ChannelLabelerResult> {
  const allowedChannels = getAllowedChannels();
  const allowedSlugs = new Set(allowedChannels.map((channel) => channel.slug));
  const fallbackSlug = getValidatedFallbackSlug(input.fallbackSlug, allowedSlugs);
  let llm: LLMClient;
  try {
    llm = input.llmClient || createLLMClient();
  } catch {
    return {
      channelSlug: fallbackSlug,
      classifierReason: 'fallback_general',
      reasonCode: 'LLM_INVALID_FALLBACK_GENERAL',
      rawConfidence: null,
      retryUsed: false,
      fallbackUsed: true,
      attemptCount: 0,
      failureClass: 'provider_error',
      failureDetail: 'Unable to create LLM client for channel labeling',
      returnedSlug: null,
    };
  }

  const requestPayload = {
    title: String(input.title || '').trim() || 'Untitled Blueprint',
    summary: toSummary(input.summary),
    tags: toTags(input.tagSlugs),
    fallbackSlug,
    allowedChannels,
  };

  const firstAttempt = await attemptLabel(llm, requestPayload, allowedSlugs);
  if (firstAttempt.ok) {
    return {
      channelSlug: firstAttempt.slug,
      classifierReason: 'llm_valid',
      reasonCode: 'LLM_VALID',
      rawConfidence: firstAttempt.confidence,
      retryUsed: false,
      fallbackUsed: false,
      attemptCount: 1,
      failureClass: null,
      failureDetail: null,
      returnedSlug: firstAttempt.returnedSlug,
    };
  }

  const secondAttempt = await attemptLabel(llm, requestPayload, allowedSlugs);
  if (secondAttempt.ok) {
    return {
      channelSlug: secondAttempt.slug,
      classifierReason: 'llm_retry_valid',
      reasonCode: 'LLM_RETRY_VALID',
      rawConfidence: secondAttempt.confidence,
      retryUsed: true,
      fallbackUsed: false,
      attemptCount: 2,
      failureClass: firstAttempt.failureClass,
      failureDetail: firstAttempt.failureDetail,
      returnedSlug: firstAttempt.returnedSlug,
    };
  }

  return {
    channelSlug: fallbackSlug,
    classifierReason: 'fallback_general',
    reasonCode: 'LLM_INVALID_FALLBACK_GENERAL',
    rawConfidence: firstAttempt.confidence,
    retryUsed: true,
    fallbackUsed: true,
    attemptCount: 2,
    failureClass: secondAttempt.failureClass || firstAttempt.failureClass,
    failureDetail: secondAttempt.failureDetail || firstAttempt.failureDetail,
    returnedSlug: secondAttempt.returnedSlug || firstAttempt.returnedSlug,
  };
}

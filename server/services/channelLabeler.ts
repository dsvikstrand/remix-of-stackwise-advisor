import { CHANNELS_CATALOG } from '../../src/lib/channelsCatalog';
import { normalizeTag } from '../../src/lib/tagging';
import { createLLMClient } from '../llm/client';
import type { LLMClient } from '../llm/types';

export type LlmChannelClassifierReason = 'llm_valid' | 'llm_retry_valid' | 'fallback_general';
export type ChannelLabelReasonCode = 'LLM_VALID' | 'LLM_RETRY_VALID' | 'LLM_INVALID_FALLBACK_GENERAL';

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
    };
  }

  const requestPayload = {
    title: String(input.title || '').trim() || 'Untitled Blueprint',
    summary: toSummary(input.summary),
    tags: toTags(input.tagSlugs),
    fallbackSlug,
    allowedChannels,
  };

  let firstConfidence: number | null = null;
  try {
    const first = await llm.generateChannelLabel(requestPayload);
    const firstSlug = normalizeSlug(first.channelSlug);
    firstConfidence = typeof first.confidence === 'number' ? first.confidence : null;
    if (firstSlug && allowedSlugs.has(firstSlug)) {
      return {
        channelSlug: firstSlug,
        classifierReason: 'llm_valid',
        reasonCode: 'LLM_VALID',
        rawConfidence: firstConfidence,
        retryUsed: false,
        fallbackUsed: false,
      };
    }
  } catch {
    // Retry once on parse/provider/output errors.
  }

  try {
    const second = await llm.generateChannelLabel(requestPayload);
    const secondSlug = normalizeSlug(second.channelSlug);
    const secondConfidence = typeof second.confidence === 'number' ? second.confidence : null;
    if (secondSlug && allowedSlugs.has(secondSlug)) {
      return {
        channelSlug: secondSlug,
        classifierReason: 'llm_retry_valid',
        reasonCode: 'LLM_RETRY_VALID',
        rawConfidence: secondConfidence,
        retryUsed: true,
        fallbackUsed: false,
      };
    }
  } catch {
    // Fall back to general after second failure.
  }

  return {
    channelSlug: fallbackSlug,
    classifierReason: 'fallback_general',
    reasonCode: 'LLM_INVALID_FALLBACK_GENERAL',
    rawConfidence: firstConfidence,
    retryUsed: true,
    fallbackUsed: true,
  };
}

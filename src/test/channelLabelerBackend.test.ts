import { describe, expect, it } from 'vitest';
import { labelChannelFromArtifact } from '../../server/services/channelLabeler';
import type { ChannelLabelResult, LLMClient } from '../../server/llm/types';

function createStubClient(sequence: Array<ChannelLabelResult | Error>): LLMClient {
  let index = 0;
  return {
    analyzeBlueprint: async () => { throw new Error('not-used'); },
    generateBanner: async () => { throw new Error('not-used'); },
    generateYouTubeBlueprint: async () => { throw new Error('not-used'); },
    generateChannelLabel: async () => {
      const next = sequence[index] ?? sequence[sequence.length - 1];
      index += 1;
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

describe('channelLabeler (backend)', () => {
  it('accepts first valid LLM label result', async () => {
    const result = await labelChannelFromArtifact({
      title: 'AI prompt automation workflow',
      llmReview: 'A concise system for automation with LLM prompts.',
      tagSlugs: ['ai', 'automation'],
      stepHints: ['Choose model', 'Run prompt'],
      fallbackSlug: 'general',
      llmClient: createStubClient([
        { channelSlug: 'ai-tools-automation', reason: 'best fit', confidence: 0.86 },
      ]),
    });

    expect(result.channelSlug).toBe('ai-tools-automation');
    expect(result.classifierReason).toBe('llm_valid');
    expect(result.reasonCode).toBe('LLM_VALID');
    expect(result.retryUsed).toBe(false);
    expect(result.fallbackUsed).toBe(false);
  });

  it('retries once when first result is invalid and accepts second valid slug', async () => {
    const result = await labelChannelFromArtifact({
      title: 'Meal prep systems',
      llmReview: 'Nutrition workflow for weekly planning.',
      tagSlugs: ['nutrition'],
      stepHints: ['Plan meals', 'Batch cook'],
      fallbackSlug: 'general',
      llmClient: createStubClient([
        { channelSlug: 'not-in-catalog', reason: 'bad', confidence: 0.77 },
        { channelSlug: 'nutrition-meal-planning', reason: 'good', confidence: 0.88 },
      ]),
    });

    expect(result.channelSlug).toBe('nutrition-meal-planning');
    expect(result.classifierReason).toBe('llm_retry_valid');
    expect(result.reasonCode).toBe('LLM_RETRY_VALID');
    expect(result.retryUsed).toBe(true);
    expect(result.fallbackUsed).toBe(false);
  });

  it('falls back to general after retry fails', async () => {
    const result = await labelChannelFromArtifact({
      title: 'Unknown topic',
      llmReview: null,
      tagSlugs: ['novel-topic'],
      stepHints: ['Do something'],
      fallbackSlug: 'general',
      llmClient: createStubClient([
        new Error('invalid json'),
        { channelSlug: 'also-invalid', reason: 'still bad', confidence: 0.11 },
      ]),
    });

    expect(result.channelSlug).toBe('general');
    expect(result.classifierReason).toBe('fallback_general');
    expect(result.reasonCode).toBe('LLM_INVALID_FALLBACK_GENERAL');
    expect(result.retryUsed).toBe(true);
    expect(result.fallbackUsed).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { labelChannelFromArtifact } from '../../server/services/channelLabeler';
import type { ChannelLabelRequest, ChannelLabelResult, LLMClient } from '../../server/llm/types';

function createStubClient(
  sequence: Array<ChannelLabelResult | Error>,
  requests?: ChannelLabelRequest[],
): LLMClient {
  let index = 0;
  return {
    analyzeBlueprint: async () => { throw new Error('not-used'); },
    generateBanner: async () => { throw new Error('not-used'); },
    generateYouTubeBlueprint: async () => { throw new Error('not-used'); },
    generateChannelLabel: async (input) => {
      requests?.push(input);
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
      summary: 'A concise system for automation with LLM prompts.',
      tagSlugs: ['ai', 'automation'],
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
      summary: 'Nutrition workflow for weekly planning.',
      tagSlugs: ['nutrition'],
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
      summary: null,
      tagSlugs: ['novel-topic'],
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

  it('clamps summary payload to 600 chars before label request', async () => {
    const requests: ChannelLabelRequest[] = [];
    await labelChannelFromArtifact({
      title: 'Long summary case',
      summary: `${'a'.repeat(700)} ${'b'.repeat(700)}`,
      tagSlugs: ['ai'],
      fallbackSlug: 'general',
      llmClient: createStubClient([
        { channelSlug: 'general', reason: 'fallback', confidence: 0.5 },
      ], requests),
    });

    expect(requests.length).toBe(1);
    expect((requests[0]?.summary || '').length).toBe(600);
    expect(requests[0]?.summary).toBe('a'.repeat(600));
  });
});

import { describe, expect, it } from 'vitest';
import { createCodexGenerationClient } from '../../server/llm/codexGenerationClient';
import { CodexExecError } from '../../server/llm/codexExec';
import type { LLMClient } from '../../server/llm/types';

function createFallbackClient(): LLMClient {
  return {
    analyzeBlueprint: async () => 'fallback-review',
    generateBanner: async () => ({ buffer: Buffer.from('x'), mimeType: 'image/png', prompt: 'fallback' }),
    generateYouTubeBlueprint: async (_input, options) => {
      options?.onGenerationModelEvent?.({
        event: 'fallback_success',
        provider: 'openai_api',
        operation: 'generateYouTubeBlueprint',
        model_used: 'gpt-fallback',
        fallback_used: true,
        fallback_model: 'gpt-fallback',
        reasoning_effort: null,
      });
      return {
        title: 'fallback',
        description: 'fallback',
        steps: [{ name: 'S1', notes: 'N1', timestamp: null }],
      };
    },
    generateYouTubeBlueprintPass2Transform: async () => ({
      eli5_steps: [{ name: 'S1', notes: 'N1', timestamp: null }],
      eli5_summary: 'fallback',
    }),
    generateChannelLabel: async () => ({ channelSlug: 'general' }),
  };
}

describe('codex generation client', () => {
  it('returns codex output when codex succeeds', async () => {
    const client = createCodexGenerationClient({
      fallbackClientFactory: () => createFallbackClient(),
      fallbackEnabled: true,
      codexModel: 'gpt-codex',
      codexReasoningEffort: 'low',
      codexTimeoutMs: 10_000,
      runCodexPrompt: async () => ({
        outputText: JSON.stringify({
          title: 'codex',
          description: 'codex',
          steps: [{ name: 'A', notes: 'B', timestamp: null }],
        }),
        durationMs: 10,
      }),
    });

    const result = await client.generateYouTubeBlueprint({
      videoUrl: 'https://youtube.com/watch?v=abc',
      transcript: 'hello',
    });
    expect(result.title).toBeUndefined();
    expect(result.description).toBe('codex');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.name).toBe('A');
    expect(result.raw_response).toContain('"description":"codex"');
  });

  it('falls back to API client when codex fails', async () => {
    const client = createCodexGenerationClient({
      fallbackClientFactory: () => createFallbackClient(),
      fallbackEnabled: true,
      codexModel: 'gpt-codex',
      codexReasoningEffort: 'low',
      codexTimeoutMs: 10_000,
      runCodexPrompt: async () => {
        throw new CodexExecError({
          code: 'RATE_LIMITED',
          message: 'rate',
        });
      },
    });

    const events: string[] = [];
    const result = await client.generateYouTubeBlueprint({
      videoUrl: 'https://youtube.com/watch?v=abc',
      transcript: 'hello',
    }, {
      onGenerationModelEvent: (event) => {
        events.push(`${event.provider}:${event.event}`);
      },
    });
    expect(result.description).toBe('fallback');
    expect(result.steps).toHaveLength(1);
    expect(events).toContain('codex_cli:request_failed');
    expect(events).toContain('openai_api:fallback_success');
  });
});

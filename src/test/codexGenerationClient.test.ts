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
        schema_version: 'blueprint_sections_v1',
        tags: ['fallback'],
        summary: { text: 'fallback summary' },
        takeaways: { bullets: ['fallback takeaway'] },
        storyline: { text: 'fallback storyline' },
        deep_dive: { bullets: ['fallback deep dive'] },
        practical_rules: { bullets: ['fallback rule'] },
        open_questions: { bullets: ['fallback question?'] },
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
          schema_version: 'blueprint_sections_v1',
          tags: ['codex'],
          summary: { text: 'codex summary' },
          takeaways: { bullets: ['codex takeaway'] },
          storyline: { text: 'codex storyline' },
          deep_dive: { bullets: ['codex deep dive'] },
          practical_rules: { bullets: ['codex rule'] },
          open_questions: { bullets: ['codex question?'] },
        }),
        durationMs: 10,
      }),
    });

    const result = await client.generateYouTubeBlueprint({
      videoUrl: 'https://youtube.com/watch?v=abc',
      transcript: 'hello',
    });
    expect(result.schema_version).toBe('blueprint_sections_v1');
    expect(result.summary.text).toBe('codex summary');
    expect(result.takeaways.bullets).toEqual(['codex takeaway']);
    expect(result.raw_response).toContain('"schema_version":"blueprint_sections_v1"');
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
    expect(result.summary.text).toBe('fallback summary');
    expect(result.takeaways.bullets).toEqual(['fallback takeaway']);
    expect(events).toContain('codex_cli:request_failed');
    expect(events).toContain('openai_api:fallback_success');
  });

  it('rejects legacy steps-only codex output at the client boundary', async () => {
    const client = createCodexGenerationClient({
      fallbackClientFactory: () => createFallbackClient(),
      fallbackEnabled: false,
      codexModel: 'gpt-codex',
      codexReasoningEffort: 'low',
      codexTimeoutMs: 10_000,
      runCodexPrompt: async () => ({
        outputText: JSON.stringify({
          description: 'legacy',
          steps: [{ name: 'A', notes: 'B', timestamp: null }],
        }),
        durationMs: 10,
      }),
    });

    await expect(client.generateYouTubeBlueprint({
      videoUrl: 'https://youtube.com/watch?v=abc',
      transcript: 'hello',
    })).rejects.toThrow();
  });

  it('retries malformed blueprint JSON once before succeeding', async () => {
    let calls = 0;
    const client = createCodexGenerationClient({
      fallbackClientFactory: () => createFallbackClient(),
      fallbackEnabled: true,
      codexModel: 'gpt-codex',
      codexReasoningEffort: 'low',
      codexTimeoutMs: 10_000,
      runCodexPrompt: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            outputText: '{"schema_version":"blueprint_sections_v1","tags":["bad" "json"]}',
            durationMs: 10,
          };
        }
        return {
          outputText: JSON.stringify({
            schema_version: 'blueprint_sections_v1',
            tags: ['codex'],
            summary: { text: 'retried summary' },
            takeaways: { bullets: ['codex takeaway'] },
            storyline: { text: 'codex storyline' },
            deep_dive: { bullets: ['codex deep dive'] },
            practical_rules: { bullets: ['codex rule'] },
            open_questions: { bullets: ['codex question?'] },
          }),
          durationMs: 10,
        };
      },
    });

    const result = await client.generateYouTubeBlueprint({
      videoUrl: 'https://youtube.com/watch?v=abc',
      transcript: 'hello',
    });

    expect(calls).toBe(2);
    expect(result.summary.text).toBe('retried summary');
  });

  it('falls back after repeated malformed blueprint JSON output', async () => {
    let calls = 0;
    const client = createCodexGenerationClient({
      fallbackClientFactory: () => createFallbackClient(),
      fallbackEnabled: true,
      codexModel: 'gpt-codex',
      codexReasoningEffort: 'low',
      codexTimeoutMs: 10_000,
      runCodexPrompt: async () => {
        calls += 1;
        return {
          outputText: '{"schema_version":"blueprint_sections_v1","tags":["bad" "json"]}',
          durationMs: 10,
        };
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

    expect(calls).toBe(2);
    expect(result.summary.text).toBe('fallback summary');
    expect(events.filter((entry) => entry === 'codex_cli:primary_success')).toHaveLength(2);
    expect(events).toContain('openai_api:fallback_success');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const responseCreateMock = vi.fn(async (payload: Record<string, unknown>) => ({
  output_text: JSON.stringify({
    schema_version: 'blueprint_sections_v1',
    tags: ['test'],
    summary: { text: 'summary' },
    takeaways: { bullets: ['takeaway'] },
    storyline: { text: 'storyline' },
    deep_dive: { bullets: ['deep dive'] },
    practical_rules: { bullets: ['rule'] },
    open_questions: { bullets: ['question'] },
  }),
  _payload: payload,
}));

vi.mock('../../server/llm/openaiRuntime', () => ({
  getOpenAIConstructor() {
    return class FakeOpenAI {
      responses = {
        create: responseCreateMock,
      };

      images = {
        generate: vi.fn(),
      };
    };
  },
}));

describe('openai client generation service tier', () => {
  const originalEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_GENERATION_MODEL: process.env.OPENAI_GENERATION_MODEL,
    OPENAI_GENERATION_FALLBACK_MODEL: process.env.OPENAI_GENERATION_FALLBACK_MODEL,
    OPENAI_GENERATION_SERVICE_TIER: process.env.OPENAI_GENERATION_SERVICE_TIER,
  };

  afterEach(() => {
    responseCreateMock.mockClear();
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
    process.env.OPENAI_GENERATION_MODEL = originalEnv.OPENAI_GENERATION_MODEL;
    process.env.OPENAI_GENERATION_FALLBACK_MODEL = originalEnv.OPENAI_GENERATION_FALLBACK_MODEL;
    process.env.OPENAI_GENERATION_SERVICE_TIER = originalEnv.OPENAI_GENERATION_SERVICE_TIER;
    vi.resetModules();
  });

  it('passes flex service tier for blueprint generation when configured', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_GENERATION_MODEL = 'gpt-5.4-mini';
    process.env.OPENAI_GENERATION_FALLBACK_MODEL = 'gpt-5.4-mini';
    process.env.OPENAI_GENERATION_SERVICE_TIER = 'flex';

    const { createOpenAIClient } = await import('../../server/llm/openaiClient');
    const client = createOpenAIClient();

    await client.generateYouTubeBlueprint({
      videoUrl: 'https://youtube.com/watch?v=abc12345678',
      transcript: 'A sufficiently long transcript for testing valid blueprint generation.',
    });

    expect(responseCreateMock).toHaveBeenCalledTimes(1);
    expect(responseCreateMock.mock.calls[0]?.[0]).toMatchObject({
      model: 'gpt-5.4-mini',
      service_tier: 'flex',
    });
  });

  it('omits service tier when not configured', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_GENERATION_MODEL = 'gpt-5.4-mini';
    process.env.OPENAI_GENERATION_FALLBACK_MODEL = 'gpt-5.4-mini';
    delete process.env.OPENAI_GENERATION_SERVICE_TIER;

    const { createOpenAIClient } = await import('../../server/llm/openaiClient');
    const client = createOpenAIClient();

    await client.generateYouTubeBlueprint({
      videoUrl: 'https://youtube.com/watch?v=abc12345678',
      transcript: 'A sufficiently long transcript for testing valid blueprint generation.',
    });

    expect(responseCreateMock).toHaveBeenCalledTimes(1);
    expect(responseCreateMock.mock.calls[0]?.[0]).not.toHaveProperty('service_tier');
  });
});

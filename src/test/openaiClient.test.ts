import { afterEach, describe, expect, it, vi } from 'vitest';

function validBlueprintJson() {
  return JSON.stringify({
    schema_version: 'blueprint_sections_v1',
    tags: ['test'],
    summary: { text: 'summary' },
    takeaways: { bullets: ['takeaway'] },
    storyline: { text: 'storyline' },
    deep_dive: { bullets: ['deep dive'] },
    practical_rules: { bullets: ['rule'] },
    open_questions: { bullets: ['question'] },
  });
}

const responseCreateMock = vi.fn(async (payload: Record<string, unknown>) => ({
  output_text: validBlueprintJson(),
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

  it('throws normalized provider metadata for OpenAI generation 429s', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_GENERATION_MODEL = 'gpt-5.4-mini';
    process.env.OPENAI_GENERATION_FALLBACK_MODEL = 'gpt-5.4-mini';
    delete process.env.OPENAI_GENERATION_SERVICE_TIER;

    const rawError = new Error("429 We're currently processing too many requests — please try again later.") as Error & {
      status?: number;
      code?: string;
      headers?: { get: (name: string) => string | null };
    };
    rawError.status = 429;
    rawError.code = 'rate_limit_exceeded';
    rawError.headers = {
      get: (name: string) => name.toLowerCase() === 'retry-after' ? '30' : null,
    };
    responseCreateMock.mockRejectedValueOnce(rawError);

    const { createOpenAIClient } = await import('../../server/llm/openaiClient');
    const client = createOpenAIClient();

    await expect(client.generateYouTubeBlueprint({
      videoUrl: 'https://youtube.com/watch?v=abc12345678',
      transcript: 'A sufficiently long transcript for testing valid blueprint generation.',
    })).rejects.toMatchObject({
      name: 'OpenAIGenerationProviderError',
      provider: 'openai_api',
      status: 429,
      code: 'rate_limit_exceeded',
      retryAfterSeconds: 30,
    });
  });
});

describe('openai client blueprint repair ladder', () => {
  const originalEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_GENERATION_MODEL: process.env.OPENAI_GENERATION_MODEL,
    OPENAI_GENERATION_FALLBACK_MODEL: process.env.OPENAI_GENERATION_FALLBACK_MODEL,
    OPENAI_GENERATION_SERVICE_TIER: process.env.OPENAI_GENERATION_SERVICE_TIER,
  };

  afterEach(() => {
    responseCreateMock.mockReset();
    responseCreateMock.mockImplementation(async (payload: Record<string, unknown>) => ({
      output_text: validBlueprintJson(),
      _payload: payload,
    }));
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
    process.env.OPENAI_GENERATION_MODEL = originalEnv.OPENAI_GENERATION_MODEL;
    process.env.OPENAI_GENERATION_FALLBACK_MODEL = originalEnv.OPENAI_GENERATION_FALLBACK_MODEL;
    process.env.OPENAI_GENERATION_SERVICE_TIER = originalEnv.OPENAI_GENERATION_SERVICE_TIER;
    vi.resetModules();
  });

  it('repairs malformed first output before doing a hard retry', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_GENERATION_MODEL = 'gpt-5.4-mini';
    process.env.OPENAI_GENERATION_FALLBACK_MODEL = 'gpt-5.4-mini';
    delete process.env.OPENAI_GENERATION_SERVICE_TIER;

    responseCreateMock
      .mockResolvedValueOnce({
        output_text: '{"schema_version":"blueprint_sections_v1","tags":["x"]',
      })
      .mockResolvedValueOnce({
        output_text: validBlueprintJson(),
      });

    const { createOpenAIClient } = await import('../../server/llm/openaiClient');
    const client = createOpenAIClient();

    const result = await client.generateYouTubeBlueprint({
      videoUrl: 'https://youtube.com/watch?v=abc12345678',
      transcript: 'A sufficiently long transcript for testing valid blueprint generation.',
    });

    expect(result.storyline.text).toBe('storyline');
    expect(responseCreateMock).toHaveBeenCalledTimes(2);
    expect(String(responseCreateMock.mock.calls[1]?.[0]?.input || '')).toContain('REPAIR MODE:');
    expect(String(responseCreateMock.mock.calls[1]?.[0]?.input || '')).toContain('Previous output to repair:');
    expect(String(responseCreateMock.mock.calls[1]?.[0]?.input || '')).toContain('Failure class: invalid_json');
  });

  it('falls back to a hard retry when repair still fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_GENERATION_MODEL = 'gpt-5.4-mini';
    process.env.OPENAI_GENERATION_FALLBACK_MODEL = 'gpt-5.4-mini';

    responseCreateMock
      .mockResolvedValueOnce({
        output_text: '{"schema_version":"blueprint_sections_v1","tags":["x"]',
      })
      .mockResolvedValueOnce({
        output_text: '{"schema_version":"blueprint_sections_v1","summary":"bad shape"}',
      })
      .mockResolvedValueOnce({
        output_text: validBlueprintJson(),
      });

    const { createOpenAIClient } = await import('../../server/llm/openaiClient');
    const client = createOpenAIClient();

    const result = await client.generateYouTubeBlueprint({
      videoUrl: 'https://youtube.com/watch?v=abc12345678',
      transcript: 'A sufficiently long transcript for testing valid blueprint generation.',
    });

    expect(result.summary.text).toBe('summary');
    expect(responseCreateMock).toHaveBeenCalledTimes(3);
    expect(String(responseCreateMock.mock.calls[1]?.[0]?.input || '')).toContain('REPAIR MODE:');
    expect(String(responseCreateMock.mock.calls[2]?.[0]?.input || '')).toContain('RETRY REQUIREMENT:');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTranscriptFromTranscriptApi } from '../../server/transcript/providers/transcriptApiProvider';
import { TranscriptProviderError } from '../../server/transcript/types';

const originalFetch = global.fetch;
const originalApiKey = process.env.TRANSCRIPTAPI_APIKEY;

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
  if (originalApiKey == null) delete process.env.TRANSCRIPTAPI_APIKEY;
  else process.env.TRANSCRIPTAPI_APIKEY = originalApiKey;
});

describe('transcriptApiProvider', () => {
  it('returns normalized transcript text from TranscriptAPI', async () => {
    process.env.TRANSCRIPTAPI_APIKEY = 'test-key';
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      video_id: 'video123',
      language: 'en',
      transcript: ' Hello   world ',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

    const result = await getTranscriptFromTranscriptApi('video123');

    expect(result).toEqual({
      text: 'Hello world',
      source: 'transcriptapi',
      confidence: null,
    });
  });

  it('maps 404 unavailable responses to VIDEO_UNAVAILABLE', async () => {
    process.env.TRANSCRIPTAPI_APIKEY = 'test-key';
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      detail: 'Video aaaaaaaaaaa not found or unavailable',
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(getTranscriptFromTranscriptApi('aaaaaaaaaaa')).rejects.toMatchObject({
      code: 'VIDEO_UNAVAILABLE',
      providerDebug: {
        provider: 'transcriptapi',
        stage: 'transcript',
        http_status: 404,
        provider_error_code: 'VIDEO_UNAVAILABLE',
      },
    });
  });

  it('maps caption-unavailable 404 responses to NO_CAPTIONS', async () => {
    process.env.TRANSCRIPTAPI_APIKEY = 'test-key';
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      detail: 'If a video has auto-generated captions disabled and no manual captions, transcription may not be available.',
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;

    await expect(getTranscriptFromTranscriptApi('video123')).rejects.toMatchObject({
      code: 'NO_CAPTIONS',
      providerDebug: {
        provider: 'transcriptapi',
        stage: 'transcript',
        http_status: 404,
        provider_error_code: 'NO_CAPTIONS',
      },
    });
  });

  it('maps 429 responses to RATE_LIMITED and preserves retry-after', async () => {
    process.env.TRANSCRIPTAPI_APIKEY = 'test-key';
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
      detail: 'Too many requests',
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '7',
      },
    })) as unknown as typeof fetch;

    let caught: unknown = null;
    try {
      await getTranscriptFromTranscriptApi('video123');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TranscriptProviderError);
    expect((caught as TranscriptProviderError).code).toBe('RATE_LIMITED');
    expect((caught as TranscriptProviderError).retryAfterSeconds).toBe(7);
  });
});

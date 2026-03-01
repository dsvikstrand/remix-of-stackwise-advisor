import { describe, expect, it } from 'vitest';
import {
  createTranscriptService,
  resolveTranscriptProvider,
} from '../../server/transcript/transcriptService';
import {
  TranscriptProviderError,
  type TranscriptProviderAdapter,
} from '../../server/transcript/types';

describe('transcript service modularity (backend)', () => {
  it('resolves primary provider from TRANSCRIPT_PROVIDER', () => {
    const previous = process.env.TRANSCRIPT_PROVIDER;
    delete process.env.TRANSCRIPT_PROVIDER;
    expect(resolveTranscriptProvider()).toBe('yt_to_text');

    process.env.TRANSCRIPT_PROVIDER = 'youtube_timedtext';
    expect(resolveTranscriptProvider()).toBe('youtube_timedtext');

    process.env.TRANSCRIPT_PROVIDER = 'unsupported_provider';
    expect(resolveTranscriptProvider()).toBe('yt_to_text');

    if (previous === undefined) delete process.env.TRANSCRIPT_PROVIDER;
    else process.env.TRANSCRIPT_PROVIDER = previous;
  });

  it('keeps probe matrix semantics for mixed success/failure outcomes', async () => {
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'yt_to_text',
        getTranscript: async () => ({
          text: 'ok',
          source: 'test_primary',
          confidence: null,
        }),
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          throw new TranscriptProviderError('NO_CAPTIONS', 'No captions');
        },
      },
    ];

    const service = createTranscriptService({
      listProvidersForProbe: () => providers,
      getProviderById: (providerId) => providers.find((row) => row.id === providerId) || null,
      timeoutMs: 1000,
    });

    const result = await service.probeTranscriptProviders('video123');
    expect(result.providers).toEqual([
      { provider: 'yt_to_text', ok: true, error_code: null },
      { provider: 'youtube_timedtext', ok: false, error_code: 'NO_CAPTIONS' },
    ]);
    expect(result.any_success).toBe(true);
    expect(result.all_no_captions).toBe(false);
  });

  it('marks all_no_captions when every provider returns NO_CAPTIONS', async () => {
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'yt_to_text',
        getTranscript: async () => {
          throw new TranscriptProviderError('NO_CAPTIONS', 'No captions');
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          throw new TranscriptProviderError('NO_CAPTIONS', 'No captions');
        },
      },
    ];

    const service = createTranscriptService({
      listProvidersForProbe: () => providers,
      getProviderById: (providerId) => providers.find((row) => row.id === providerId) || null,
      timeoutMs: 1000,
    });

    const result = await service.probeTranscriptProviders('video123');
    expect(result.providers).toEqual([
      { provider: 'yt_to_text', ok: false, error_code: 'NO_CAPTIONS' },
      { provider: 'youtube_timedtext', ok: false, error_code: 'NO_CAPTIONS' },
    ]);
    expect(result.any_success).toBe(false);
    expect(result.all_no_captions).toBe(true);
  });

  it('normalizes unknown provider errors as TRANSCRIPT_FETCH_FAIL', async () => {
    const providers: TranscriptProviderAdapter[] = [
      {
        id: 'yt_to_text',
        getTranscript: async () => {
          throw new Error('Unexpected parse failure');
        },
      },
      {
        id: 'youtube_timedtext',
        getTranscript: async () => {
          throw new TranscriptProviderError('NO_CAPTIONS', 'No captions');
        },
      },
    ];

    const service = createTranscriptService({
      listProvidersForProbe: () => providers,
      getProviderById: (providerId) => providers.find((row) => row.id === providerId) || null,
      timeoutMs: 1000,
    });

    const result = await service.probeTranscriptProviders('video123');
    expect(result.providers[0]).toEqual({
      provider: 'yt_to_text',
      ok: false,
      error_code: 'TRANSCRIPT_FETCH_FAIL',
    });
    expect(result.providers[1]).toEqual({
      provider: 'youtube_timedtext',
      ok: false,
      error_code: 'NO_CAPTIONS',
    });
    expect(result.any_success).toBe(false);
    expect(result.all_no_captions).toBe(false);
  });
});

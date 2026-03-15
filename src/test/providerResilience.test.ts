import { describe, expect, it } from 'vitest';
import { runWithProviderRetry } from '../../server/services/providerResilience';
import { TranscriptProviderError } from '../../server/transcript/types';

describe('providerResilience', () => {
  it('retries plain fetch failed transport errors', async () => {
    let attempts = 0;

    const result = await runWithProviderRetry(
      {
        providerKey: 'test_transcript_fetch_failed_retry',
        timeoutMs: 5_000,
        maxAttempts: 3,
        baseDelayMs: 1,
        jitterMs: 0,
      },
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('fetch failed');
        return 'ok';
      },
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('does not retry non-retryable generic errors', async () => {
    let attempts = 0;

    await expect(
      runWithProviderRetry(
        {
          providerKey: 'test_transcript_non_retryable',
          timeoutMs: 5_000,
          maxAttempts: 3,
          baseDelayMs: 1,
          jitterMs: 0,
        },
        async () => {
          attempts += 1;
          throw new Error('validation failed');
        },
      ),
    ).rejects.toThrow('validation failed');

    expect(attempts).toBe(1);
  });

  it('does not retry terminal transcript provider errors', async () => {
    let attempts = 0;

    await expect(
      runWithProviderRetry(
        {
          providerKey: 'test_transcript_terminal_non_retryable',
          timeoutMs: 5_000,
          maxAttempts: 3,
          baseDelayMs: 1,
          jitterMs: 0,
        },
        async () => {
          attempts += 1;
          throw new TranscriptProviderError('VIDEO_UNAVAILABLE', 'Video unavailable');
        },
      ),
    ).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });

    expect(attempts).toBe(1);
  });

  it('retries temp-provider upstream-unavailable transcript errors', async () => {
    let attempts = 0;

    const result = await runWithProviderRetry(
      {
        providerKey: 'test_videotranscriber_upstream_unavailable_retry',
        timeoutMs: 5_000,
        maxAttempts: 3,
        baseDelayMs: 1,
        jitterMs: 0,
      },
      async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new TranscriptProviderError(
            'VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE',
            'Temporary transcript provider upstream is unavailable. Please retry shortly.',
          );
        }
        return 'ok';
      },
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('does not retry temp-provider daily-limit transcript errors', async () => {
    let attempts = 0;

    await expect(
      runWithProviderRetry(
        {
          providerKey: 'test_videotranscriber_daily_limit_non_retryable',
          timeoutMs: 5_000,
          maxAttempts: 3,
          baseDelayMs: 1,
          jitterMs: 0,
        },
        async () => {
          attempts += 1;
          throw new TranscriptProviderError(
            'VIDEOTRANSCRIBER_DAILY_LIMIT',
            'Temporary transcript provider daily limit reached. Please retry later.',
          );
        },
      ),
    ).rejects.toMatchObject({ code: 'VIDEOTRANSCRIBER_DAILY_LIMIT' });

    expect(attempts).toBe(1);
  });

  it('uses the provided timeout error factory when a retry attempt times out', async () => {
    let attempts = 0;

    await expect(
      runWithProviderRetry(
        {
          providerKey: 'test_transcript_timeout_error_factory',
          timeoutMs: 10,
          maxAttempts: 1,
          baseDelayMs: 1,
          jitterMs: 0,
          timeoutErrorFactory: () => new TranscriptProviderError('TIMEOUT', 'Transcript request timed out.'),
        },
        async () => {
          attempts += 1;
          return new Promise(() => undefined);
        },
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });

    expect(attempts).toBe(1);
  });
});

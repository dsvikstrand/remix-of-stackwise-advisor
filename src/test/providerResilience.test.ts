import { describe, expect, it } from 'vitest';
import { runWithProviderRetry } from '../../server/services/providerResilience';

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
});

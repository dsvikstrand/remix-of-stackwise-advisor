import { describe, expect, it } from 'vitest';
import { createTranscriptThrottle } from '../../server/services/transcriptThrottle';
import { TranscriptProviderError } from '../../server/transcript/types';

describe('transcript throttle', () => {
  it('serializes queued transcript work with FIFO order and cooldown spacing', async () => {
    let nowMs = 0;
    const starts: number[] = [];

    const throttle = createTranscriptThrottle(
      {
        enabled: true,
        tiersMs: [3000],
        jitterMs: 0,
        interactiveMaxWaitMs: 2000,
      },
      {
        now: () => nowMs,
        sleep: async (ms) => {
          nowMs += ms;
        },
        random: () => 0,
        log: () => undefined,
      },
    );

    const results = await Promise.all([
      throttle.runTranscriptTask({ requestClass: 'background', reason: 'job_1' }, async () => {
        starts.push(nowMs);
        return 'job_1';
      }),
      throttle.runTranscriptTask({ requestClass: 'background', reason: 'job_2' }, async () => {
        starts.push(nowMs);
        return 'job_2';
      }),
      throttle.runTranscriptTask({ requestClass: 'background', reason: 'job_3' }, async () => {
        starts.push(nowMs);
        return 'job_3';
      }),
    ]);

    expect(results).toEqual(['job_1', 'job_2', 'job_3']);
    expect(starts).toEqual([0, 3000, 6000]);
  });

  it('escalates cooldown on unstable errors and decays on success', async () => {
    let nowMs = 0;
    const starts: number[] = [];

    const throttle = createTranscriptThrottle(
      {
        enabled: true,
        tiersMs: [3, 10, 30, 60],
        jitterMs: 0,
        interactiveMaxWaitMs: 2000,
      },
      {
        now: () => nowMs,
        sleep: async (ms) => {
          nowMs += ms;
        },
        random: () => 0,
        log: () => undefined,
      },
    );

    const outcomes = await Promise.allSettled([
      throttle.runTranscriptTask({ requestClass: 'background', reason: 'rate_limited' }, async () => {
        starts.push(nowMs);
        throw new TranscriptProviderError('RATE_LIMITED', '429');
      }),
      throttle.runTranscriptTask({ requestClass: 'background', reason: 'timeout' }, async () => {
        starts.push(nowMs);
        throw new TranscriptProviderError('TIMEOUT', 'timed out');
      }),
      throttle.runTranscriptTask({ requestClass: 'background', reason: 'success_1' }, async () => {
        starts.push(nowMs);
        return 'ok_1';
      }),
      throttle.runTranscriptTask({ requestClass: 'background', reason: 'success_2' }, async () => {
        starts.push(nowMs);
        return 'ok_2';
      }),
    ]);

    expect(outcomes[0].status).toBe('rejected');
    expect(outcomes[1].status).toBe('rejected');
    expect(outcomes[2].status).toBe('fulfilled');
    expect(outcomes[3].status).toBe('fulfilled');
    expect(starts).toEqual([0, 10, 40, 50]);
  });

  it('fails fast for interactive requests that exceed max queue wait', async () => {
    const throttle = createTranscriptThrottle({
      enabled: true,
      tiersMs: [50],
      jitterMs: 0,
      interactiveMaxWaitMs: 20,
    }, {
      log: () => undefined,
    });

    const background = throttle.runTranscriptTask(
      { requestClass: 'background', reason: 'long_job' },
      async () => new Promise((resolve) => setTimeout(() => resolve('background_done'), 80)),
    );

    await new Promise((resolve) => setTimeout(resolve, 5));

    let caught: unknown = null;
    try {
      await throttle.runTranscriptTask(
        { requestClass: 'interactive', reason: 'interactive_job' },
        async () => 'interactive_done',
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TranscriptProviderError);
    expect((caught as TranscriptProviderError).code).toBe('RATE_LIMITED');
    expect(((caught as TranscriptProviderError).retryAfterSeconds || 0) > 0).toBe(true);

    await background;
  });
});


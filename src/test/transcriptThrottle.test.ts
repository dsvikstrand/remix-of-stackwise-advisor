import { describe, expect, it, vi } from 'vitest';
import { createTranscriptThrottle } from '../../server/services/transcriptThrottle';
import { TranscriptProviderError } from '../../server/transcript/types';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createTranscriptThrottle', () => {
  it('serializes queued transcript work with FIFO order and cooldown spacing', async () => {
    const starts: number[] = [];
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const throttle = createTranscriptThrottle(
        {
          enabled: true,
          tiersMs: [3000],
          jitterMs: 0,
          interactiveMaxWaitMs: 2000,
        },
        {
          now: () => Date.now(),
          random: () => 0,
          log: () => undefined,
        },
      );

      const resultsPromise = Promise.all([
        throttle.runTranscriptTask({ requestClass: 'background', reason: 'job_1' }, async () => {
          starts.push(Date.now());
          return 'job_1';
        }),
        throttle.runTranscriptTask({ requestClass: 'background', reason: 'job_2' }, async () => {
          starts.push(Date.now());
          return 'job_2';
        }),
        throttle.runTranscriptTask({ requestClass: 'background', reason: 'job_3' }, async () => {
          starts.push(Date.now());
          return 'job_3';
        }),
      ]);

      await vi.advanceTimersByTimeAsync(6000);
      const results = await resultsPromise;
      expect(results).toEqual(['job_1', 'job_2', 'job_3']);
      expect(starts).toEqual([0, 3000, 6000]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('escalates cooldown on unstable errors and decays on success', async () => {
    const starts: number[] = [];
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const throttle = createTranscriptThrottle(
        {
          enabled: true,
          tiersMs: [3, 10, 30, 60],
          jitterMs: 0,
          interactiveMaxWaitMs: 2000,
        },
        {
          now: () => Date.now(),
          random: () => 0,
          log: () => undefined,
        },
      );

      const outcomesPromise = Promise.allSettled([
        throttle.runTranscriptTask({ requestClass: 'background', reason: 'rate_limited' }, async () => {
          starts.push(Date.now());
          throw new TranscriptProviderError('RATE_LIMITED', '429');
        }),
        throttle.runTranscriptTask({ requestClass: 'background', reason: 'timeout' }, async () => {
          starts.push(Date.now());
          throw new TranscriptProviderError('TIMEOUT', 'timed out');
        }),
        throttle.runTranscriptTask({ requestClass: 'background', reason: 'success_1' }, async () => {
          starts.push(Date.now());
          return 'ok_1';
        }),
        throttle.runTranscriptTask({ requestClass: 'background', reason: 'success_2' }, async () => {
          starts.push(Date.now());
          return 'ok_2';
        }),
      ]);

      await vi.advanceTimersByTimeAsync(50);
      const outcomes = await outcomesPromise;
      expect(outcomes[0].status).toBe('rejected');
      expect(outcomes[1].status).toBe('rejected');
      expect(outcomes[2].status).toBe('fulfilled');
      expect(outcomes[3].status).toBe('fulfilled');
      expect(starts).toEqual([0, 10, 40, 50]);
    } finally {
      vi.useRealTimers();
    }
  });

  it.skip('fails fast for interactive requests that exceed max queue wait', async () => {
    vi.useFakeTimers();
    try {
      const throttle = createTranscriptThrottle({
        enabled: true,
        tiersMs: [50],
        jitterMs: 0,
        interactiveMaxWaitMs: 20,
      }, {
        log: () => undefined,
      });

      const backgroundWork = deferred<string>();
      const background = throttle.runTranscriptTask(
        { requestClass: 'background', reason: 'long_job' },
        async () => backgroundWork.promise,
      );

      await Promise.resolve();

      const interactivePromise = throttle.runTranscriptTask(
        { requestClass: 'interactive', reason: 'interactive_job' },
        async () => 'interactive_done',
      );

      await vi.advanceTimersByTimeAsync(25);

      const caught = await interactivePromise.catch((error) => error);
      expect(caught).toBeInstanceOf(TranscriptProviderError);
      expect((caught as TranscriptProviderError).code).toBe('RATE_LIMITED');
      expect(((caught as TranscriptProviderError).retryAfterSeconds || 0) > 0).toBe(true);

      backgroundWork.resolve('background_done');
      await background;
    } finally {
      vi.useRealTimers();
    }
  });

  it('serializes transcript tasks when maxConcurrency is 1', async () => {
    const started: string[] = [];
    const first = deferred<string>();
    const second = deferred<string>();
    vi.useFakeTimers();
    try {
      const throttle = createTranscriptThrottle({
        enabled: true,
        tiersMs: [1],
        jitterMs: 0,
        interactiveMaxWaitMs: 60_000,
        maxConcurrency: 1,
      });

      const firstPromise = throttle.runTranscriptTask({ videoId: 'video-1' }, async () => {
        started.push('first');
        return first.promise;
      });
      const secondPromise = throttle.runTranscriptTask({ videoId: 'video-2' }, async () => {
        started.push('second');
        return second.promise;
      });

      await Promise.resolve();
      expect(started).toEqual(['first']);

      first.resolve('done-1');
      await vi.advanceTimersByTimeAsync(10);
      expect(started).toEqual(['first', 'second']);

      second.resolve('done-2');
      await expect(firstPromise).resolves.toBe('done-1');
      await expect(secondPromise).resolves.toBe('done-2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows bounded parallel transcript tasks when maxConcurrency is greater than 1', async () => {
    const started: string[] = [];
    const first = deferred<string>();
    const second = deferred<string>();
    const third = deferred<string>();
    vi.useFakeTimers();
    try {
      const throttle = createTranscriptThrottle({
        enabled: true,
        tiersMs: [1],
        jitterMs: 0,
        interactiveMaxWaitMs: 60_000,
        maxConcurrency: 2,
      });

      const firstPromise = throttle.runTranscriptTask({ videoId: 'video-1' }, async () => {
        started.push('first');
        return first.promise;
      });
      const secondPromise = throttle.runTranscriptTask({ videoId: 'video-2' }, async () => {
        started.push('second');
        return second.promise;
      });
      const thirdPromise = throttle.runTranscriptTask({ videoId: 'video-3' }, async () => {
        started.push('third');
        return third.promise;
      });

      await Promise.resolve();
      expect(started).toEqual(['first', 'second']);

      first.resolve('done-1');
      await vi.advanceTimersByTimeAsync(10);
      expect(started).toEqual(['first', 'second', 'third']);

      second.resolve('done-2');
      third.resolve('done-3');
      await expect(firstPromise).resolves.toBe('done-1');
      await expect(secondPromise).resolves.toBe('done-2');
      await expect(thirdPromise).resolves.toBe('done-3');
    } finally {
      vi.useRealTimers();
    }
  });
});

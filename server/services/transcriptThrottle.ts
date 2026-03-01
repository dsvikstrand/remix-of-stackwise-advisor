import { TranscriptProviderError } from '../transcript/types';

export type TranscriptRequestClass = 'interactive' | 'background';

export type TranscriptThrottleConfig = {
  enabled: boolean;
  tiersMs: number[];
  jitterMs: number;
  interactiveMaxWaitMs: number;
};

type TranscriptTaskInput = {
  requestClass?: TranscriptRequestClass;
  reason?: string;
  videoId?: string;
};

type TranscriptTaskQueueItem<T> = {
  id: number;
  task: () => Promise<T>;
  requestClass: TranscriptRequestClass;
  enqueuedAt: number;
  reason: string;
  videoId: string | null;
  started: boolean;
  cancelled: boolean;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  waitTimer: ReturnType<typeof setTimeout> | null;
};

type TranscriptThrottleDeps = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  log: (event: string, payload: Record<string, unknown>) => void;
};

function clampInt(raw: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeTiers(raw: number[]) {
  const normalized = raw
    .map((value) => clampInt(value, 0, 0, 24 * 60 * 60 * 1000))
    .filter((value) => value > 0);
  return normalized.length > 0 ? normalized : [3000, 10_000, 30_000, 60_000];
}

function isUnstableTranscriptError(error: unknown) {
  if (error instanceof TranscriptProviderError) {
    return error.code === 'RATE_LIMITED'
      || error.code === 'TIMEOUT'
      || error.code === 'TRANSCRIPT_FETCH_FAIL';
  }
  const code = String((error as { code?: string } | null)?.code || '').trim().toUpperCase();
  return code === 'RATE_LIMITED' || code === 'TIMEOUT' || code === 'TRANSCRIPT_FETCH_FAIL';
}

export function createTranscriptThrottle(config: TranscriptThrottleConfig, partialDeps: Partial<TranscriptThrottleDeps> = {}) {
  const deps: TranscriptThrottleDeps = {
    now: partialDeps.now || (() => Date.now()),
    sleep: partialDeps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    random: partialDeps.random || (() => Math.random()),
    log: partialDeps.log || ((event, payload) => {
      console.log(`[transcript_throttle_${event}]`, JSON.stringify(payload));
    }),
  };

  const tiersMs = normalizeTiers(config.tiersMs);
  const jitterMs = clampInt(config.jitterMs, 500, 0, 5000);
  const interactiveMaxWaitMs = clampInt(config.interactiveMaxWaitMs, 2000, 100, 60_000);
  const enabled = Boolean(config.enabled);

  let queue: Array<TranscriptTaskQueueItem<any>> = [];
  let running = false;
  let nextTaskId = 0;
  let cooldownTierIndex = 0;
  let nextAvailableAtMs = 0;

  function currentTierDelayMs() {
    return tiersMs[Math.max(0, Math.min(cooldownTierIndex, tiersMs.length - 1))] || tiersMs[0];
  }

  function estimateRetryAfterSeconds() {
    const nowMs = deps.now();
    const queueDepth = queue.filter((item) => !item.cancelled).length;
    const earliestMs = Math.max(0, nextAvailableAtMs - nowMs);
    const projectedMs = earliestMs + (queueDepth * currentTierDelayMs());
    return Math.max(1, Math.ceil(projectedMs / 1000));
  }

  function applyCooldown(outcome: 'success' | 'unstable' | 'neutral') {
    if (outcome === 'success') {
      cooldownTierIndex = Math.max(0, cooldownTierIndex - 1);
    } else if (outcome === 'unstable') {
      cooldownTierIndex = Math.min(tiersMs.length - 1, cooldownTierIndex + 1);
    }
    const baseDelay = currentTierDelayMs();
    const jitter = jitterMs > 0 ? Math.floor(deps.random() * (jitterMs + 1)) : 0;
    nextAvailableAtMs = deps.now() + baseDelay + jitter;
    deps.log('cooldown_updated', {
      outcome,
      cooldown_tier_index: cooldownTierIndex,
      cooldown_base_ms: baseDelay,
      cooldown_jitter_ms: jitter,
      cooldown_total_ms: baseDelay + jitter,
      queue_depth: queue.filter((item) => !item.cancelled).length,
    });
  }

  function removeQueuedItem(id: number) {
    queue = queue.filter((item) => item.id !== id);
  }

  async function runLoop() {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0) {
        const head = queue[0];
        if (!head || head.cancelled) {
          queue.shift();
          continue;
        }

        const waitMs = Math.max(0, nextAvailableAtMs - deps.now());
        if (waitMs > 0) await deps.sleep(waitMs);

        const item = queue.shift();
        if (!item || item.cancelled) continue;
        item.started = true;
        if (item.waitTimer) {
          clearTimeout(item.waitTimer);
          item.waitTimer = null;
        }

        deps.log('task_started', {
          id: item.id,
          request_class: item.requestClass,
          reason: item.reason,
          video_id: item.videoId,
          queue_wait_ms: Math.max(0, deps.now() - item.enqueuedAt),
          queue_depth_remaining: queue.filter((candidate) => !candidate.cancelled).length,
        });

        try {
          const result = await item.task();
          applyCooldown('success');
          item.resolve(result);
        } catch (error) {
          applyCooldown(isUnstableTranscriptError(error) ? 'unstable' : 'neutral');
          item.reject(error);
        }
      }
    } finally {
      running = false;
      if (queue.length > 0) {
        void runLoop();
      }
    }
  }

  async function runTranscriptTask<T>(
    input: TranscriptTaskInput,
    task: () => Promise<T>,
  ): Promise<T> {
    if (!enabled) {
      return task();
    }

    const requestClass = input.requestClass === 'interactive' ? 'interactive' : 'background';
    const reason = String(input.reason || 'transcript_task').trim() || 'transcript_task';
    const videoId = String(input.videoId || '').trim() || null;

    return new Promise<T>((resolve, reject) => {
      const item: TranscriptTaskQueueItem<T> = {
        id: ++nextTaskId,
        task,
        requestClass,
        enqueuedAt: deps.now(),
        reason,
        videoId,
        started: false,
        cancelled: false,
        resolve,
        reject,
        waitTimer: null,
      };

      if (requestClass === 'interactive') {
        item.waitTimer = setTimeout(() => {
          if (item.started || item.cancelled) return;
          item.cancelled = true;
          removeQueuedItem(item.id);
          const retryAfterSeconds = estimateRetryAfterSeconds();
          deps.log('interactive_timeout', {
            id: item.id,
            reason: item.reason,
            video_id: item.videoId,
            queue_wait_ms: Math.max(0, deps.now() - item.enqueuedAt),
            retry_after_seconds: retryAfterSeconds,
            queue_depth_remaining: queue.filter((candidate) => !candidate.cancelled).length,
          });
          reject(new TranscriptProviderError(
            'RATE_LIMITED',
            'Transcript queue is currently busy. Please retry shortly.',
            { retryAfterSeconds },
          ));
        }, interactiveMaxWaitMs);
      }

      queue.push(item);
      deps.log('task_enqueued', {
        id: item.id,
        request_class: requestClass,
        reason: item.reason,
        video_id: item.videoId,
        queue_depth: queue.filter((candidate) => !candidate.cancelled).length,
      });
      void runLoop();
    });
  }

  return {
    runTranscriptTask,
  };
}


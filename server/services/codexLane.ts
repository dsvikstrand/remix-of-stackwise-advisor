type CodexLaneLogPayload = {
  event: 'queued' | 'started' | 'completed' | 'failed';
  stage: string;
  queue_length: number;
  wait_ms: number;
  run_ms?: number;
  error?: string;
};

type CodexLaneTaskMeta = {
  stage: string;
};

type CodexLaneDeps = {
  now?: () => number;
  log?: (payload: CodexLaneLogPayload) => void;
};

type QueueEntry<T> = {
  meta: CodexLaneTaskMeta;
  enqueuedAt: number;
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export function createCodexLane(
  input: {
    enabled: boolean;
    concurrency?: number;
  },
  deps: CodexLaneDeps = {},
) {
  const enabled = Boolean(input.enabled);
  const now = deps.now || (() => Date.now());
  const log = deps.log || ((payload: CodexLaneLogPayload) => {
    console.log('[codex_lane]', JSON.stringify(payload));
  });
  const configuredConcurrency = Number.isFinite(Number(input.concurrency))
    ? Math.max(1, Math.floor(Number(input.concurrency)))
    : 1;
  const concurrency = enabled ? Math.min(1, configuredConcurrency) : configuredConcurrency;
  const queue: Array<QueueEntry<unknown>> = [];
  let running = 0;

  const runNext = () => {
    if (!enabled) return;
    if (running >= concurrency) return;
    const next = queue.shift();
    if (!next) return;
    running += 1;
    const startedAt = now();
    const waitMs = Math.max(0, startedAt - next.enqueuedAt);
    log({
      event: 'started',
      stage: next.meta.stage,
      queue_length: queue.length,
      wait_ms: waitMs,
    });
    Promise.resolve()
      .then(() => next.task())
      .then((value) => {
        const completedAt = now();
        log({
          event: 'completed',
          stage: next.meta.stage,
          queue_length: queue.length,
          wait_ms: waitMs,
          run_ms: Math.max(0, completedAt - startedAt),
        });
        next.resolve(value);
      })
      .catch((error) => {
        const completedAt = now();
        log({
          event: 'failed',
          stage: next.meta.stage,
          queue_length: queue.length,
          wait_ms: waitMs,
          run_ms: Math.max(0, completedAt - startedAt),
          error: error instanceof Error ? error.message : String(error),
        });
        next.reject(error);
      })
      .finally(() => {
        running = Math.max(0, running - 1);
        runNext();
      });
  };

  async function runCodexTask<T>(
    meta: CodexLaneTaskMeta,
    task: () => Promise<T>,
  ) {
    if (!enabled) return task();
    return new Promise<T>((resolve, reject) => {
      const enqueuedAt = now();
      queue.push({
        meta,
        enqueuedAt,
        task,
        resolve,
        reject,
      });
      log({
        event: 'queued',
        stage: meta.stage,
        queue_length: queue.length,
        wait_ms: 0,
      });
      runNext();
    });
  }

  return {
    enabled,
    concurrency,
    runCodexTask,
    getQueueLength: () => queue.length,
  };
}

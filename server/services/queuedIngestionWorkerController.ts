import type { IngestionJobRow } from './ingestionQueue';

export type QueueSweepPlanEntry = {
  scopes: readonly string[];
  maxJobs: number;
};

export type QueuedIngestionWorkerController = {
  start: (delayMs?: number) => void;
  schedule: (delayMs?: number) => void;
  getRunning: () => boolean;
};

export type QueuedIngestionWorkerControllerDeps<DbClient> = {
  getServiceSupabaseClient: () => DbClient | null;
  runUnlockSweeps: (db: DbClient, input: { mode: 'cron' | 'opportunistic' | 'manual'; force?: boolean; traceId?: string }) => Promise<void>;
  recoverStaleIngestionJobs: (db: DbClient, input: { scope: string }) => Promise<IngestionJobRow[]>;
  queuedIngestionScopes: readonly string[];
  queuedWorkerId: string;
  workerLeaseMs: number;
  keepAliveEnabled: boolean;
  keepAliveDelayMs?: number;
  keepAliveIdleBaseDelayMs?: number;
  keepAliveIdleMaxDelayMs?: number;
  keepAliveIdleJitterRatio?: number;
  getQueueSweepPlan: () => readonly QueueSweepPlanEntry[];
  claimQueuedIngestionJobs: (db: DbClient, input: {
    scopes: string[];
    maxJobs: number;
    workerId: string;
    leaseSeconds: number;
  }) => Promise<IngestionJobRow[]>;
  processClaimedIngestionJobs: (db: DbClient, jobs: IngestionJobRow[]) => Promise<void>;
  onRecoveredJobs?: (input: { scope: string; recoveredJobs: IngestionJobRow[]; workerId: string }) => void;
  onWorkerFailure?: (input: { workerId: string; error: unknown }) => void;
};

export function resolveWorkerLeaseHeartbeatMs(input: {
  workerLeaseMs: number;
  configuredHeartbeatMs: number;
}) {
  const normalizedLeaseMs = Math.max(5_000, Math.floor(Number(input.workerLeaseMs) || 0));
  const normalizedConfiguredHeartbeatMs = Math.max(
    1_000,
    Math.floor(Number(input.configuredHeartbeatMs) || 0),
  );
  const leaseBasedHeartbeatMs = Math.max(
    1_000,
    Math.min(
      normalizedLeaseMs - 1_000,
      Math.floor(normalizedLeaseMs / 3),
    ),
  );
  return Math.max(normalizedConfiguredHeartbeatMs, leaseBasedHeartbeatMs);
}

export function createQueuedIngestionWorkerController<DbClient>(
  deps: QueuedIngestionWorkerControllerDeps<DbClient>,
): QueuedIngestionWorkerController {
  const keepAliveDelayMs = Math.max(0, Math.floor(deps.keepAliveDelayMs ?? 1500));
  const keepAliveIdleBaseDelayMs = Math.max(
    keepAliveDelayMs,
    Math.floor(deps.keepAliveIdleBaseDelayMs ?? 15_000),
  );
  const keepAliveIdleMaxDelayMs = Math.max(
    keepAliveIdleBaseDelayMs,
    Math.floor(deps.keepAliveIdleMaxDelayMs ?? 60_000),
  );
  const keepAliveIdleJitterRatio = Math.min(
    0.5,
    Math.max(0, Number.isFinite(deps.keepAliveIdleJitterRatio) ? Number(deps.keepAliveIdleJitterRatio) : 0.2),
  );
  let queuedWorkerTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedWorkerNextRunAt = 0;
  let queuedWorkerRunning = false;
  let queuedWorkerRequested = false;
  let idlePollStreak = 0;

  function computeIdleDelayMs() {
    const baseDelay = Math.min(
      keepAliveIdleMaxDelayMs,
      keepAliveIdleBaseDelayMs * (2 ** Math.max(0, idlePollStreak)),
    );
    if (keepAliveIdleJitterRatio <= 0) {
      return baseDelay;
    }

    const jitterSpan = Math.floor(baseDelay * keepAliveIdleJitterRatio);
    if (jitterSpan <= 0) {
      return baseDelay;
    }

    const jitter = Math.floor(Math.random() * ((jitterSpan * 2) + 1)) - jitterSpan;
    return Math.max(keepAliveDelayMs, baseDelay + jitter);
  }

  async function runQueuedIngestionProcessing() {
    if (queuedWorkerRunning) {
      queuedWorkerRequested = true;
      return;
    }
    const db = deps.getServiceSupabaseClient();
    if (!db) return;

    let claimedWorkThisRun = false;
    queuedWorkerRunning = true;
    try {
      do {
        queuedWorkerRequested = false;
        await deps.runUnlockSweeps(db, { mode: 'cron' });
        for (const scope of deps.queuedIngestionScopes) {
          const recoveredJobs = await deps.recoverStaleIngestionJobs(db, { scope });
          if (recoveredJobs.length > 0) {
            deps.onRecoveredJobs?.({
              scope,
              recoveredJobs,
              workerId: deps.queuedWorkerId,
            });
          }
        }

        const sweepPlan = deps.getQueueSweepPlan();
        while (true) {
          let claimedAny = false;
          for (const planEntry of sweepPlan) {
            const claimed = await deps.claimQueuedIngestionJobs(db, {
              scopes: [...planEntry.scopes],
              maxJobs: planEntry.maxJobs,
              workerId: deps.queuedWorkerId,
              leaseSeconds: Math.max(5, Math.ceil(deps.workerLeaseMs / 1000)),
            });
            if (claimed.length === 0) continue;
            claimedAny = true;
            claimedWorkThisRun = true;
            await deps.processClaimedIngestionJobs(db, claimed);
          }
          if (!claimedAny) break;
        }
      } while (queuedWorkerRequested);

    } catch (error) {
      idlePollStreak = 0;
      deps.onWorkerFailure?.({
        workerId: deps.queuedWorkerId,
        error,
      });
    } finally {
      queuedWorkerRunning = false;
      if (deps.keepAliveEnabled) {
        let nextDelayMs = keepAliveDelayMs;
        if (claimedWorkThisRun || queuedWorkerRequested) {
          idlePollStreak = 0;
        } else {
          nextDelayMs = computeIdleDelayMs();
          idlePollStreak += 1;
        }
        schedule(nextDelayMs);
      }
    }
  }

  function schedule(delayMs = 0) {
    if (queuedWorkerRunning) {
      queuedWorkerRequested = true;
      return;
    }

    const waitMs = Math.max(0, Math.floor(delayMs));
    const nextRunAt = Date.now() + waitMs;
    if (queuedWorkerTimer) {
      if (nextRunAt >= queuedWorkerNextRunAt) {
        return;
      }
      clearTimeout(queuedWorkerTimer);
      queuedWorkerTimer = null;
      queuedWorkerNextRunAt = 0;
    }

    queuedWorkerNextRunAt = nextRunAt;
    queuedWorkerTimer = setTimeout(() => {
      queuedWorkerTimer = null;
      queuedWorkerNextRunAt = 0;
      void runQueuedIngestionProcessing();
    }, waitMs);
  }

  return {
    start(delayMs = 0) {
      schedule(delayMs);
    },
    schedule,
    getRunning() {
      return queuedWorkerRunning;
    },
  };
}

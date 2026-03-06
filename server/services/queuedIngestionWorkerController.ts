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
  getQueueSweepPlan: () => readonly QueueSweepPlanEntry[];
  claimQueuedIngestionJobs: (db: DbClient, input: {
    scopes: string[];
    maxJobs: number;
    workerId: string;
    leaseSeconds: number;
  }) => Promise<IngestionJobRow[]>;
  processClaimedIngestionJobs: (db: DbClient, jobs: IngestionJobRow[]) => Promise<void>;
  shouldAutoReschedule: () => boolean;
  onRecoveredJobs?: (input: { scope: string; recoveredJobs: IngestionJobRow[]; workerId: string }) => void;
  onWorkerFailure?: (input: { workerId: string; error: unknown }) => void;
};

export function createQueuedIngestionWorkerController<DbClient>(
  deps: QueuedIngestionWorkerControllerDeps<DbClient>,
): QueuedIngestionWorkerController {
  let queuedWorkerTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedWorkerRunning = false;
  let queuedWorkerRequested = false;

  async function runQueuedIngestionProcessing() {
    if (queuedWorkerRunning) {
      queuedWorkerRequested = true;
      return;
    }
    const db = deps.getServiceSupabaseClient();
    if (!db) return;

    queuedWorkerRunning = true;
    try {
      do {
        queuedWorkerRequested = false;
        await deps.runUnlockSweeps(db, { mode: 'cron', force: true });
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
            await deps.processClaimedIngestionJobs(db, claimed);
          }
          if (!claimedAny) break;
        }
      } while (queuedWorkerRequested);
    } catch (error) {
      deps.onWorkerFailure?.({
        workerId: deps.queuedWorkerId,
        error,
      });
    } finally {
      queuedWorkerRunning = false;
      if (deps.shouldAutoReschedule()) {
        schedule(1500);
      }
    }
  }

  function schedule(delayMs = 0) {
    if (queuedWorkerRunning) {
      queuedWorkerRequested = true;
      return;
    }

    if (queuedWorkerTimer) return;
    const waitMs = Math.max(0, Math.floor(delayMs));
    queuedWorkerTimer = setTimeout(() => {
      queuedWorkerTimer = null;
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

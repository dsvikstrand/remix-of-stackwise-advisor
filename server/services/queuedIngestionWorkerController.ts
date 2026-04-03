import type { IngestionJobRow } from './ingestionQueue';
import type { QueuePriorityTier } from './queuePriority';
import { isLowPriorityQueueScope } from './queuePriority';

export type QueueSweepPlanEntry = {
  tier?: QueuePriorityTier;
  scopes: readonly string[];
  maxJobs: number;
};

export type QueuedIngestionWorkerController = {
  start: (delayMs?: number) => void;
  schedule: (delayMs?: number) => void;
  requestRefill: (input?: { delayMs?: number; scopes?: readonly string[]; reason?: string | null }) => void;
  getRunning: () => boolean;
};

export type QueuedIngestionWorkerControllerDeps<DbClient> = {
  getServiceSupabaseClient: () => DbClient | null;
  runUnlockSweeps: (db: DbClient, input: { mode: 'cron' | 'opportunistic' | 'manual'; force?: boolean; traceId?: string }) => Promise<void>;
  recoverStaleIngestionJobs: (db: DbClient, input: { scope: string }) => Promise<IngestionJobRow[]>;
  queuedIngestionScopes: readonly string[];
  queuedWorkerId: string;
  workerLeaseMs: number;
  workerConcurrency?: number;
  getActiveClaimedJobCount?: () => number;
  keepAliveEnabled: boolean;
  keepAliveDelayMs?: number;
  keepAliveIdleBaseDelayMs?: number;
  keepAliveIdleMaxDelayMs?: number;
  keepAliveIdleJitterRatio?: number;
  maintenanceMinIntervalMs?: number;
  getQueueSweepPlan: () => readonly QueueSweepPlanEntry[];
  selectQueueSweepPlan?: (input: {
    basePlan: readonly QueueSweepPlanEntry[];
    nowIso?: string;
  }) => Promise<readonly QueueSweepPlanEntry[] | null>;
  claimQueuedIngestionJobs: (db: DbClient, input: {
    scopes: string[];
    maxJobs: number;
    workerId: string;
    leaseSeconds: number;
  }) => Promise<IngestionJobRow[]>;
  shouldAttemptQueueClaim?: (input: {
    tier?: QueuePriorityTier;
    scopes: readonly string[];
    maxJobs: number;
    nowIso?: string;
  }) => Promise<{ allowed: boolean } | null>;
  recordQueueClaimResult?: (input: {
    tier?: QueuePriorityTier;
    scopes: readonly string[];
    maxJobs: number;
    claimedCount: number;
    nowIso?: string;
  }) => Promise<void>;
  recordQueueSweepResult?: (input: {
    tier?: QueuePriorityTier;
    scopes: readonly string[];
    maxJobs: number;
    claimedCount: number;
    nowIso?: string;
  }) => Promise<void>;
  getKeepAliveDelayOverrideMs?: (input: {
    baseIdleDelayMs: number;
    lowPriorityOnly: boolean;
    nowIso?: string;
  }) => Promise<number | null>;
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

const DEFERRED_WORKER_HEARTBEAT_SCOPES = new Set([
  'source_auto_unlock_retry',
  'source_transcript_revalidate',
  'blueprint_youtube_enrichment',
  'blueprint_youtube_refresh',
]);

export function resolveWorkerLeaseHeartbeatStartupDelayMs(input: {
  scope: string;
  workerLeaseMs: number;
  heartbeatMs: number;
}) {
  const normalizedHeartbeatMs = Math.max(
    1_000,
    Math.floor(Number(input.heartbeatMs) || 0),
  );
  const normalizedLeaseMs = Math.max(
    normalizedHeartbeatMs + 1_000,
    Math.floor(Number(input.workerLeaseMs) || 0),
  );
  const normalizedScope = String(input.scope || '').trim();
  if (!DEFERRED_WORKER_HEARTBEAT_SCOPES.has(normalizedScope)) {
    return normalizedHeartbeatMs;
  }

  const safeLatestFirstHeartbeatMs = Math.max(
    normalizedHeartbeatMs,
    normalizedLeaseMs - Math.max(5_000, normalizedHeartbeatMs),
  );
  return Math.min(
    safeLatestFirstHeartbeatMs,
    Math.max(normalizedHeartbeatMs, Math.floor(normalizedLeaseMs / 2)),
  );
}

function filterQueueSweepPlanByScopes(
  basePlan: readonly QueueSweepPlanEntry[],
  scopes: readonly string[],
) {
  const requestedScopes = new Set(
    scopes
      .map((scope) => String(scope || '').trim())
      .filter(Boolean),
  );
  if (requestedScopes.size === 0) return [];
  return basePlan.filter((entry) => entry.scopes.some((scope) => requestedScopes.has(scope)));
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
  const maintenanceMinIntervalMs = Math.max(0, Math.floor(deps.maintenanceMinIntervalMs ?? 0));
  let queuedWorkerTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedWorkerNextRunAt = 0;
  let queuedWorkerRunning = false;
  let queuedWorkerRequested = false;
  let idlePollStreak = 0;
  let lastMaintenanceRunAt = 0;
  let refillTimer: ReturnType<typeof setTimeout> | null = null;
  let refillNextRunAt = 0;
  let refillRunning = false;
  let refillRequested = false;
  let refillReason: string | null = null;
  const refillScopes = new Set<string>();

  function computeIdleDelayMs(input?: { lowPriorityOnly?: boolean }) {
    const lowPriorityOnly = Boolean(input?.lowPriorityOnly);
    const idleBaseDelayMs = lowPriorityOnly
      ? Math.max(keepAliveIdleBaseDelayMs, 30_000)
      : keepAliveIdleBaseDelayMs;
    const idleMaxDelayMs = lowPriorityOnly
      ? Math.max(keepAliveIdleMaxDelayMs, 180_000)
      : keepAliveIdleMaxDelayMs;
    const baseDelay = Math.min(
      idleMaxDelayMs,
      idleBaseDelayMs * (2 ** Math.max(0, idlePollStreak)),
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
    let lowPriorityOnlySweepPlan = false;
    queuedWorkerRunning = true;
    try {
      do {
        queuedWorkerRequested = false;
        const nowMs = Date.now();
        const shouldRunMaintenance = maintenanceMinIntervalMs <= 0
          || lastMaintenanceRunAt <= 0
          || nowMs - lastMaintenanceRunAt >= maintenanceMinIntervalMs;
        if (shouldRunMaintenance) {
          lastMaintenanceRunAt = nowMs;
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
        }

        const baseSweepPlan = deps.getQueueSweepPlan();
        const sweepPlan = await deps.selectQueueSweepPlan?.({
          basePlan: baseSweepPlan,
          nowIso: new Date().toISOString(),
        }) ?? baseSweepPlan;
        lowPriorityOnlySweepPlan = sweepPlan.length > 0
          && sweepPlan.every((entry) => (
            entry.scopes.length > 0
            && entry.scopes.every((scope) => isLowPriorityQueueScope(scope))
          ));
        while (true) {
          let claimedAny = false;
          for (const planEntry of sweepPlan) {
            const nowIso = new Date().toISOString();
            const claimAttempt = await deps.shouldAttemptQueueClaim?.({
              tier: planEntry.tier,
              scopes: planEntry.scopes,
              maxJobs: planEntry.maxJobs,
              nowIso,
            });
            if (claimAttempt && !claimAttempt.allowed) {
              await deps.recordQueueSweepResult?.({
                tier: planEntry.tier,
                scopes: planEntry.scopes,
                maxJobs: planEntry.maxJobs,
                claimedCount: 0,
                nowIso,
              });
              continue;
            }
            const claimed = await deps.claimQueuedIngestionJobs(db, {
              scopes: [...planEntry.scopes],
              maxJobs: planEntry.maxJobs,
              workerId: deps.queuedWorkerId,
              leaseSeconds: Math.max(5, Math.ceil(deps.workerLeaseMs / 1000)),
            });
            await deps.recordQueueClaimResult?.({
              tier: planEntry.tier,
              scopes: planEntry.scopes,
              maxJobs: planEntry.maxJobs,
              claimedCount: claimed.length,
              nowIso,
            });
            await deps.recordQueueSweepResult?.({
              tier: planEntry.tier,
              scopes: planEntry.scopes,
              maxJobs: planEntry.maxJobs,
              claimedCount: claimed.length,
              nowIso,
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
          nextDelayMs = computeIdleDelayMs({ lowPriorityOnly: lowPriorityOnlySweepPlan });
          const nextDelayOverrideMs = await deps.getKeepAliveDelayOverrideMs?.({
            baseIdleDelayMs: nextDelayMs,
            lowPriorityOnly: lowPriorityOnlySweepPlan,
            nowIso: new Date().toISOString(),
          });
          if (Number.isFinite(nextDelayOverrideMs) && nextDelayOverrideMs != null) {
            nextDelayMs = Math.max(0, Math.floor(nextDelayOverrideMs));
          }
          idlePollStreak += 1;
        }
        schedule(nextDelayMs);
      }
    }
  }

  async function runQueuedIngestionRefill() {
    if (refillRunning) {
      refillRequested = true;
      return;
    }
    if (!queuedWorkerRunning) {
      const requestedDelayMs = refillNextRunAt > 0 ? Math.max(0, refillNextRunAt - Date.now()) : 0;
      refillScopes.clear();
      refillReason = null;
      refillRequested = false;
      schedule(requestedDelayMs);
      return;
    }
    const db = deps.getServiceSupabaseClient();
    if (!db) return;

    const workerConcurrency = Math.max(1, Math.floor(Number(deps.workerConcurrency) || 1));
    let availableCapacity = Math.max(
      0,
      workerConcurrency - Math.max(0, Math.floor(Number(deps.getActiveClaimedJobCount?.() || 0))),
    );
    if (availableCapacity <= 0) {
      return;
    }

    const requestedScopes = [...refillScopes];
    const requestedReason = refillReason;
    refillScopes.clear();
    refillReason = null;
    refillRequested = false;

    const refillPlan = filterQueueSweepPlanByScopes(deps.getQueueSweepPlan(), requestedScopes);
    if (refillPlan.length === 0) {
      return;
    }

    refillRunning = true;
    try {
      console.log('[interactive_queue_refill_requested]', JSON.stringify({
        scopes: requestedScopes,
        reason: requestedReason,
        available_capacity: availableCapacity,
      }));

      for (const planEntry of refillPlan) {
        if (availableCapacity <= 0) break;
        const claimed = await deps.claimQueuedIngestionJobs(db, {
          scopes: [...planEntry.scopes],
          maxJobs: Math.min(planEntry.maxJobs, availableCapacity),
          workerId: deps.queuedWorkerId,
          leaseSeconds: Math.max(5, Math.ceil(deps.workerLeaseMs / 1000)),
        });
        if (claimed.length === 0) continue;

        console.log('[interactive_queue_refill_claimed]', JSON.stringify({
          scopes: planEntry.scopes,
          reason: requestedReason,
          claimed_count: claimed.length,
        }));
        availableCapacity = Math.max(0, availableCapacity - claimed.length);
        await deps.processClaimedIngestionJobs(db, claimed);
      }
    } finally {
      refillRunning = false;
      if (refillRequested && queuedWorkerRunning) {
        requestRefill({
          delayMs: 0,
          scopes: [...refillScopes],
          reason: refillReason,
        });
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

  function requestRefill(input?: { delayMs?: number; scopes?: readonly string[]; reason?: string | null }) {
    const scopes = (input?.scopes || [])
      .map((scope) => String(scope || '').trim())
      .filter(Boolean);
    if (scopes.length === 0) {
      schedule(Math.max(0, Math.floor(Number(input?.delayMs) || 0)));
      return;
    }

    for (const scope of scopes) refillScopes.add(scope);
    const normalizedReason = String(input?.reason || '').trim();
    if (normalizedReason) {
      refillReason = normalizedReason;
    }

    const waitMs = Math.max(0, Math.floor(Number(input?.delayMs) || 0));
    if (!queuedWorkerRunning) {
      schedule(waitMs);
      return;
    }
    if (refillRunning) {
      refillRequested = true;
      return;
    }

    const nextRunAt = Date.now() + waitMs;
    if (refillTimer) {
      if (nextRunAt >= refillNextRunAt) {
        return;
      }
      clearTimeout(refillTimer);
      refillTimer = null;
      refillNextRunAt = 0;
    }

    refillRequested = true;
    refillNextRunAt = nextRunAt;
    refillTimer = setTimeout(() => {
      refillTimer = null;
      refillNextRunAt = 0;
      void runQueuedIngestionRefill();
    }, waitMs);
  }

  return {
    start(delayMs = 0) {
      schedule(delayMs);
    },
    schedule,
    requestRefill,
    getRunning() {
      return queuedWorkerRunning;
    },
  };
}

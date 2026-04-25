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
  transcriptBoundSlotCapacity?: number;
  getActiveClaimedJobCount?: () => number;
  getActiveTranscriptBoundJobCount?: () => number;
  isTranscriptBoundScope?: (scope: string) => boolean;
  keepAliveEnabled: boolean;
  keepAliveDelayMs?: number;
  keepAliveIdleBaseDelayMs?: number;
  keepAliveIdleMaxDelayMs?: number;
  keepAliveIdleJitterRatio?: number;
  maintenanceMinIntervalMs?: number;
  unlockSweepsEnabled?: boolean;
  staleJobRecoveryEnabled?: boolean;
  queueSweepControlEnabled?: boolean;
  memoryLoggingEnabled?: boolean;
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

const MIN_WORKER_KEEPALIVE_DELAY_MS = 1_000;
const IDLE_SPIN_WARNING_WINDOW_MS = 60_000;
const IDLE_SPIN_WARNING_THRESHOLD = 120;

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

function logMemoryCheckpoint(enabled: boolean, phase: string, extra?: Record<string, unknown>) {
  if (!enabled) return;
  const memory = process.memoryUsage();
  console.log('[queued_worker_memory_checkpoint]', JSON.stringify({
    phase,
    rss_mb: Math.round(memory.rss / 1024 / 1024),
    heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
    external_mb: Math.round(memory.external / 1024 / 1024),
    array_buffers_mb: Math.round(memory.arrayBuffers / 1024 / 1024),
    ...extra,
  }));
}

function getMemorySnapshot() {
  const memory = process.memoryUsage();
  return {
    rss_mb: Math.round(memory.rss / 1024 / 1024),
    heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
    heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
    external_mb: Math.round(memory.external / 1024 / 1024),
    array_buffers_mb: Math.round(memory.arrayBuffers / 1024 / 1024),
  };
}

function warnQueuedWorker(event: string, payload: Record<string, unknown>) {
  console.warn(`[${event}]`, JSON.stringify({
    ...payload,
    ...getMemorySnapshot(),
  }));
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
  const unlockSweepsEnabled = deps.unlockSweepsEnabled !== false;
  const staleJobRecoveryEnabled = deps.staleJobRecoveryEnabled !== false;
  const queueSweepControlEnabled = deps.queueSweepControlEnabled !== false;
  const memoryLoggingEnabled = deps.memoryLoggingEnabled === true;
  let queuedWorkerTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedWorkerNextRunAt = 0;
  let queuedWorkerRunning = false;
  let queuedWorkerRequested = false;
  let idlePollStreak = 0;
  let idleSpinWarningWindowStartedAt = 0;
  let idleSpinWarningCount = 0;
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

  function getWorkerConcurrency() {
    return Math.max(1, Math.floor(Number(deps.workerConcurrency) || 1));
  }

  function getTranscriptBoundSlotCapacity() {
    const workerConcurrency = getWorkerConcurrency();
    return Math.max(
      1,
      Math.min(
        workerConcurrency,
        Math.floor(Number(deps.transcriptBoundSlotCapacity) || workerConcurrency),
      ),
    );
  }

  function getActiveClaimedJobCount() {
    return Math.max(0, Math.floor(Number(deps.getActiveClaimedJobCount?.() || 0)));
  }

  function getActiveTranscriptBoundJobCount() {
    return Math.max(0, Math.floor(Number(deps.getActiveTranscriptBoundJobCount?.() || 0)));
  }

  function normalizeKeepAliveDelayMs(delayMs: number, input: {
    phase: 'busy' | 'idle';
    lowPriorityOnly?: boolean;
    overrideMs?: number | null;
  }) {
    if (Number.isFinite(delayMs) && delayMs >= MIN_WORKER_KEEPALIVE_DELAY_MS) {
      return Math.floor(delayMs);
    }

    const fallbackMs = Math.max(MIN_WORKER_KEEPALIVE_DELAY_MS, keepAliveDelayMs);
    warnQueuedWorker('queued_worker_idle_delay_guard', {
      worker_id: deps.queuedWorkerId,
      phase: input.phase,
      requested_delay_ms: delayMs,
      fallback_delay_ms: fallbackMs,
      override_ms: input.overrideMs ?? null,
      low_priority_only: Boolean(input.lowPriorityOnly),
      idle_poll_streak: idlePollStreak,
      unlock_sweeps_enabled: unlockSweepsEnabled,
      stale_job_recovery_enabled: staleJobRecoveryEnabled,
      queue_sweep_control_enabled: queueSweepControlEnabled,
    });
    return fallbackMs;
  }

  function recordIdlePollForSpinDetection(nextDelayMs: number, lowPriorityOnly: boolean) {
    const nowMs = Date.now();
    if (
      idleSpinWarningWindowStartedAt <= 0
      || nowMs - idleSpinWarningWindowStartedAt > IDLE_SPIN_WARNING_WINDOW_MS
    ) {
      idleSpinWarningWindowStartedAt = nowMs;
      idleSpinWarningCount = 0;
    }

    idleSpinWarningCount += 1;
    if (idleSpinWarningCount !== IDLE_SPIN_WARNING_THRESHOLD) {
      return;
    }

    warnQueuedWorker('queued_worker_idle_spin_warning', {
      worker_id: deps.queuedWorkerId,
      window_ms: IDLE_SPIN_WARNING_WINDOW_MS,
      idle_cycles_in_window: idleSpinWarningCount,
      next_delay_ms: nextDelayMs,
      low_priority_only: lowPriorityOnly,
      idle_poll_streak: idlePollStreak,
      unlock_sweeps_enabled: unlockSweepsEnabled,
      stale_job_recovery_enabled: staleJobRecoveryEnabled,
      queue_sweep_control_enabled: queueSweepControlEnabled,
    });
  }

  function resolvePlanEntryAvailableCapacity(planEntry: QueueSweepPlanEntry) {
    const workerConcurrency = getWorkerConcurrency();
    const transcriptBoundSlotCapacity = getTranscriptBoundSlotCapacity();
    const activeClaimedJobCount = getActiveClaimedJobCount();
    const activeTranscriptBoundJobCount = getActiveTranscriptBoundJobCount();
    const availableGeneralCapacity = Math.max(0, workerConcurrency - activeClaimedJobCount);
    const transcriptBoundPlanEntry = planEntry.scopes.some((scope) => deps.isTranscriptBoundScope?.(scope) === true);
    const availableTranscriptBoundCapacity = Math.max(
      0,
      transcriptBoundSlotCapacity - activeTranscriptBoundJobCount,
    );
    return {
      transcriptBoundPlanEntry,
      transcriptBoundSlotCapacity,
      availableGeneralCapacity,
      availableTranscriptBoundCapacity,
      availableCapacity: transcriptBoundPlanEntry
        ? Math.min(availableGeneralCapacity, availableTranscriptBoundCapacity)
        : availableGeneralCapacity,
    };
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
      logMemoryCheckpoint(memoryLoggingEnabled, 'cycle_start', {
        worker_id: deps.queuedWorkerId,
        unlock_sweeps_enabled: unlockSweepsEnabled,
        stale_job_recovery_enabled: staleJobRecoveryEnabled,
        queue_sweep_control_enabled: queueSweepControlEnabled,
      });
      do {
        queuedWorkerRequested = false;
        const nowMs = Date.now();
        const shouldRunMaintenance = maintenanceMinIntervalMs <= 0
          || lastMaintenanceRunAt <= 0
          || nowMs - lastMaintenanceRunAt >= maintenanceMinIntervalMs;
        if (shouldRunMaintenance) {
          logMemoryCheckpoint(memoryLoggingEnabled, 'maintenance_start', {
            worker_id: deps.queuedWorkerId,
          });
          lastMaintenanceRunAt = nowMs;
          if (unlockSweepsEnabled) {
            logMemoryCheckpoint(memoryLoggingEnabled, 'unlock_sweeps_start', {
              worker_id: deps.queuedWorkerId,
            });
            await deps.runUnlockSweeps(db, { mode: 'cron' });
            logMemoryCheckpoint(memoryLoggingEnabled, 'unlock_sweeps_complete', {
              worker_id: deps.queuedWorkerId,
            });
          }
          if (staleJobRecoveryEnabled) {
            logMemoryCheckpoint(memoryLoggingEnabled, 'stale_recovery_start', {
              worker_id: deps.queuedWorkerId,
              scope_count: deps.queuedIngestionScopes.length,
            });
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
            logMemoryCheckpoint(memoryLoggingEnabled, 'stale_recovery_complete', {
              worker_id: deps.queuedWorkerId,
              scope_count: deps.queuedIngestionScopes.length,
            });
          }
          logMemoryCheckpoint(memoryLoggingEnabled, 'maintenance_complete', {
            worker_id: deps.queuedWorkerId,
          });
        }

        const baseSweepPlan = deps.getQueueSweepPlan();
        logMemoryCheckpoint(memoryLoggingEnabled, 'sweep_plan_select_start', {
          worker_id: deps.queuedWorkerId,
          base_plan_count: baseSweepPlan.length,
          queue_sweep_control_enabled: queueSweepControlEnabled,
        });
        const sweepPlan = queueSweepControlEnabled
          ? await deps.selectQueueSweepPlan?.({
            basePlan: baseSweepPlan,
            nowIso: new Date().toISOString(),
          }) ?? baseSweepPlan
          : baseSweepPlan;
        logMemoryCheckpoint(memoryLoggingEnabled, 'sweep_plan_select_complete', {
          worker_id: deps.queuedWorkerId,
          sweep_plan_count: sweepPlan.length,
        });
        lowPriorityOnlySweepPlan = sweepPlan.length > 0
          && sweepPlan.every((entry) => (
            entry.scopes.length > 0
            && entry.scopes.every((scope) => isLowPriorityQueueScope(scope))
          ));
        while (true) {
          let claimedAny = false;
          logMemoryCheckpoint(memoryLoggingEnabled, 'claim_loop_start', {
            worker_id: deps.queuedWorkerId,
            sweep_plan_count: sweepPlan.length,
          });
          for (const planEntry of sweepPlan) {
            const capacity = resolvePlanEntryAvailableCapacity(planEntry);
            if (capacity.availableCapacity <= 0) {
              console.log('[queued_processing_claim_blocked]', JSON.stringify({
                scopes: planEntry.scopes,
                transcript_bound: capacity.transcriptBoundPlanEntry,
                available_general_capacity: capacity.availableGeneralCapacity,
                available_transcript_bound_capacity: capacity.availableTranscriptBoundCapacity,
              }));
              continue;
            }
            const nowIso = new Date().toISOString();
            const claimAttempt = await deps.shouldAttemptQueueClaim?.({
              tier: planEntry.tier,
              scopes: planEntry.scopes,
              maxJobs: Math.min(planEntry.maxJobs, capacity.availableCapacity),
              nowIso,
            });
            if (claimAttempt && !claimAttempt.allowed) {
              if (queueSweepControlEnabled) {
                await deps.recordQueueSweepResult?.({
                  tier: planEntry.tier,
                  scopes: planEntry.scopes,
                  maxJobs: Math.min(planEntry.maxJobs, capacity.availableCapacity),
                  claimedCount: 0,
                  nowIso,
                });
              }
              continue;
            }
            const claimed = await deps.claimQueuedIngestionJobs(db, {
              scopes: [...planEntry.scopes],
              maxJobs: Math.min(planEntry.maxJobs, capacity.availableCapacity),
              workerId: deps.queuedWorkerId,
              leaseSeconds: Math.max(5, Math.ceil(deps.workerLeaseMs / 1000)),
            });
            await deps.recordQueueClaimResult?.({
              tier: planEntry.tier,
              scopes: planEntry.scopes,
              maxJobs: Math.min(planEntry.maxJobs, capacity.availableCapacity),
              claimedCount: claimed.length,
              nowIso,
            });
            if (queueSweepControlEnabled) {
              await deps.recordQueueSweepResult?.({
                tier: planEntry.tier,
                scopes: planEntry.scopes,
                maxJobs: Math.min(planEntry.maxJobs, capacity.availableCapacity),
                claimedCount: claimed.length,
                nowIso,
              });
            }
            if (claimed.length === 0) continue;
            claimedAny = true;
            claimedWorkThisRun = true;
            await deps.processClaimedIngestionJobs(db, claimed);
          }
          logMemoryCheckpoint(memoryLoggingEnabled, 'claim_loop_complete', {
            worker_id: deps.queuedWorkerId,
            claimed_any: claimedAny,
          });
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
        let nextDelayOverrideMs: number | null | undefined = null;
        if (claimedWorkThisRun || queuedWorkerRequested) {
          idlePollStreak = 0;
          idleSpinWarningWindowStartedAt = 0;
          idleSpinWarningCount = 0;
        } else {
          nextDelayMs = computeIdleDelayMs({ lowPriorityOnly: lowPriorityOnlySweepPlan });
          nextDelayOverrideMs = queueSweepControlEnabled
            ? await deps.getKeepAliveDelayOverrideMs?.({
              baseIdleDelayMs: nextDelayMs,
              lowPriorityOnly: lowPriorityOnlySweepPlan,
              nowIso: new Date().toISOString(),
            })
            : null;
          if (Number.isFinite(nextDelayOverrideMs) && nextDelayOverrideMs != null) {
            const normalizedOverrideMs = Math.floor(nextDelayOverrideMs);
            if (normalizedOverrideMs > 0) {
              nextDelayMs = normalizedOverrideMs;
            }
          }
          idlePollStreak += 1;
          nextDelayMs = normalizeKeepAliveDelayMs(nextDelayMs, {
            phase: 'idle',
            lowPriorityOnly: lowPriorityOnlySweepPlan,
            overrideMs: nextDelayOverrideMs,
          });
          recordIdlePollForSpinDetection(nextDelayMs, lowPriorityOnlySweepPlan);
        }
        nextDelayMs = normalizeKeepAliveDelayMs(nextDelayMs, {
          phase: claimedWorkThisRun || queuedWorkerRequested ? 'busy' : 'idle',
          lowPriorityOnly: lowPriorityOnlySweepPlan,
          overrideMs: nextDelayOverrideMs,
        });
        logMemoryCheckpoint(memoryLoggingEnabled, 'cycle_complete', {
          worker_id: deps.queuedWorkerId,
          claimed_work: claimedWorkThisRun,
          queued_worker_requested: queuedWorkerRequested,
          next_delay_ms: nextDelayMs,
          idle_poll_streak: idlePollStreak,
        });
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

    const transcriptBoundSlotCapacity = getTranscriptBoundSlotCapacity();
    let availableGeneralCapacity = resolvePlanEntryAvailableCapacity({
      scopes: [],
      maxJobs: 0,
    }).availableGeneralCapacity;
    if (availableGeneralCapacity <= 0) {
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
        available_general_capacity: availableGeneralCapacity,
        transcript_bound_slot_capacity: transcriptBoundSlotCapacity,
        active_transcript_bound_job_count: getActiveTranscriptBoundJobCount(),
      }));

      for (const planEntry of refillPlan) {
        if (availableGeneralCapacity <= 0) break;
        const capacity = resolvePlanEntryAvailableCapacity(planEntry);
        const availableCapacity = Math.min(availableGeneralCapacity, capacity.availableCapacity);
        if (availableCapacity <= 0) {
          console.log('[interactive_queue_refill_blocked]', JSON.stringify({
            scopes: planEntry.scopes,
            reason: requestedReason,
            transcript_bound: capacity.transcriptBoundPlanEntry,
            available_general_capacity: availableGeneralCapacity,
            available_transcript_bound_capacity: capacity.availableTranscriptBoundCapacity,
          }));
          continue;
        }
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
          transcript_bound: capacity.transcriptBoundPlanEntry,
          claimed_count: claimed.length,
        }));
        availableGeneralCapacity = Math.max(0, availableGeneralCapacity - claimed.length);
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

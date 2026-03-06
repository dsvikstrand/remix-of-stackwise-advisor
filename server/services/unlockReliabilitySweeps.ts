import type { SupabaseClient } from '@supabase/supabase-js';
import { refundReservation } from './creditWallet';
import { releaseAutoUnlockIntent } from './autoUnlockBilling';
import {
  failUnlock,
  findExpiredReservedUnlocks,
  type SourceItemUnlockRow,
} from './sourceUnlocks';
import { logUnlockEvent } from './unlockTrace';

type DbClient = SupabaseClient<any, 'public', any>;

type UnlockJobRow = {
  id: string;
  status: string;
  scope: string;
  started_at: string | null;
  updated_at: string | null;
};

type UnlockReliabilityDeps = {
  now: () => Date;
  findExpiredReservedUnlocks: typeof findExpiredReservedUnlocks;
  failUnlock: typeof failUnlock;
  refundReservation: typeof refundReservation;
  listProcessingUnlocks: (db: DbClient, limit: number) => Promise<SourceItemUnlockRow[]>;
  getJobsByIds: (db: DbClient, ids: string[]) => Promise<Map<string, UnlockJobRow>>;
  listRunningUnlockJobs: (db: DbClient, limit: number, staleBeforeIso: string) => Promise<UnlockJobRow[]>;
  countActiveUnlockLinksForJobs: (db: DbClient, jobIds: string[]) => Promise<Map<string, number>>;
  markJobsFailed: (db: DbClient, input: { jobIds: string[]; errorCode: string; errorMessage: string }) => Promise<number>;
  releaseAutoUnlockIntent: typeof releaseAutoUnlockIntent;
};

export type UnlockSweepResult = {
  skipped: boolean;
  skip_reason: string | null;
  run_started_at: string | null;
  run_finished_at: string | null;
  expired_recovered: number;
  processing_recovered: number;
  orphan_jobs_recovered: number;
  inspected: {
    expired_candidates: number;
    processing_candidates: number;
    running_jobs: number;
  };
};

export type RunUnlockReliabilitySweepsInput = {
  enabled?: boolean;
  force?: boolean;
  mode?: 'opportunistic' | 'cron';
  batchSize?: number;
  processingStaleMs?: number;
  minIntervalMs?: number;
  dryLogs?: boolean;
  traceId?: string;
};

const unlockSelect =
  'id, source_item_id, source_page_id, status, estimated_cost, reserved_by_user_id, reservation_expires_at, reserved_ledger_id, auto_unlock_intent_id, blueprint_id, job_id, last_error_code, last_error_message, created_at, updated_at';

function toMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function hasExpired(iso: string | null | undefined, nowMs: number) {
  const parsed = toMs(iso);
  if (parsed == null) return false;
  return parsed <= nowMs;
}

function shouldRefundUnlock(unlock: SourceItemUnlockRow) {
  const userId = String(unlock.reserved_by_user_id || '').trim();
  const ledgerId = String(unlock.reserved_ledger_id || '').trim();
  const amount = Number(unlock.estimated_cost || 0);
  return Boolean(userId) && Boolean(ledgerId) && Number.isFinite(amount) && amount > 0;
}

async function listProcessingUnlocks(db: DbClient, limit: number) {
  const fetchLimit = Math.max(1, Math.min(1000, limit * 3));
  const { data, error } = await db
    .from('source_item_unlocks')
    .select(unlockSelect)
    .eq('status', 'processing')
    .order('updated_at', { ascending: true })
    .limit(fetchLimit);
  if (error) throw error;
  return (data || []) as SourceItemUnlockRow[];
}

async function getJobsByIds(db: DbClient, ids: string[]) {
  const unique = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  if (unique.length === 0) return new Map<string, UnlockJobRow>();

  const { data, error } = await db
    .from('ingestion_jobs')
    .select('id, status, scope, started_at, updated_at')
    .in('id', unique);
  if (error) throw error;

  const map = new Map<string, UnlockJobRow>();
  for (const row of data || []) {
    const jobId = String((row as { id?: string }).id || '').trim();
    if (!jobId) continue;
    map.set(jobId, {
      id: jobId,
      status: String((row as { status?: string }).status || '').trim(),
      scope: String((row as { scope?: string }).scope || '').trim(),
      started_at: ((row as { started_at?: string | null }).started_at ?? null),
      updated_at: ((row as { updated_at?: string | null }).updated_at ?? null),
    });
  }
  return map;
}

async function listRunningUnlockJobs(db: DbClient, limit: number, staleBeforeIso: string) {
  const { data, error } = await db
    .from('ingestion_jobs')
    .select('id, status, scope, started_at, updated_at')
    .eq('scope', 'source_item_unlock_generation')
    .eq('status', 'running')
    .not('started_at', 'is', null)
    .lt('started_at', staleBeforeIso)
    .order('started_at', { ascending: true })
    .limit(Math.max(1, Math.min(1000, limit)));
  if (error) throw error;

  return (data || []).map((row) => ({
    id: String((row as { id?: string }).id || '').trim(),
    status: String((row as { status?: string }).status || '').trim(),
    scope: String((row as { scope?: string }).scope || '').trim(),
    started_at: (row as { started_at?: string | null }).started_at ?? null,
    updated_at: (row as { updated_at?: string | null }).updated_at ?? null,
  }));
}

async function countActiveUnlockLinksForJobs(db: DbClient, jobIds: string[]) {
  const unique = Array.from(new Set(jobIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const map = new Map<string, number>();
  if (unique.length === 0) return map;

  const { data, error } = await db
    .from('source_item_unlocks')
    .select('job_id, status')
    .in('job_id', unique)
    .in('status', ['reserved', 'processing']);
  if (error) throw error;

  for (const row of data || []) {
    const jobId = String((row as { job_id?: string | null }).job_id || '').trim();
    if (!jobId) continue;
    map.set(jobId, (map.get(jobId) || 0) + 1);
  }
  return map;
}

async function markJobsFailed(db: DbClient, input: {
  jobIds: string[];
  errorCode: string;
  errorMessage: string;
}) {
  const unique = Array.from(new Set(input.jobIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (unique.length === 0) return 0;

  const finishedAt = new Date().toISOString();
  let updated = 0;
  for (const jobId of unique) {
    const { data, error } = await db
      .from('ingestion_jobs')
      .update({
        status: 'failed',
        finished_at: finishedAt,
        error_code: input.errorCode,
        error_message: input.errorMessage.slice(0, 500),
      })
      .eq('id', jobId)
      .eq('status', 'running')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (data?.id) updated += 1;
  }
  return updated;
}

const defaultDeps: UnlockReliabilityDeps = {
  now: () => new Date(),
  findExpiredReservedUnlocks,
  failUnlock,
  refundReservation,
  listProcessingUnlocks,
  getJobsByIds,
  listRunningUnlockJobs,
  countActiveUnlockLinksForJobs,
  markJobsFailed,
  releaseAutoUnlockIntent,
};

let lastRunAtMs = 0;
let activeRun: Promise<UnlockSweepResult> | null = null;

export function resetUnlockSweepRuntimeStateForTests() {
  lastRunAtMs = 0;
  activeRun = null;
}

export async function runUnlockReliabilitySweeps(
  db: DbClient,
  input: RunUnlockReliabilitySweepsInput = {},
  overrides: Partial<UnlockReliabilityDeps> = {},
): Promise<UnlockSweepResult> {
  const deps: UnlockReliabilityDeps = { ...defaultDeps, ...overrides };
  const enabled = input.enabled !== false;
  const batchSize = Math.max(10, Math.min(1000, Number(input.batchSize || 100)));
  const processingStaleMs = Math.max(60_000, Math.min(24 * 60 * 60 * 1000, Number(input.processingStaleMs || 10 * 60_000)));
  const minIntervalMs = Math.max(1_000, Math.min(10 * 60_000, Number(input.minIntervalMs || 30_000)));
  const force = Boolean(input.force);
  const mode = input.mode || 'opportunistic';
  const dryLogs = input.dryLogs !== false;
  const traceId = String(input.traceId || '').trim() || undefined;

  if (!enabled) {
    return {
      skipped: true,
      skip_reason: 'disabled',
      run_started_at: null,
      run_finished_at: null,
      expired_recovered: 0,
      processing_recovered: 0,
      orphan_jobs_recovered: 0,
      inspected: {
        expired_candidates: 0,
        processing_candidates: 0,
        running_jobs: 0,
      },
    };
  }

  const nowMs = deps.now().getTime();
  if (!force && activeRun) {
    return activeRun;
  }
  if (!force && nowMs - lastRunAtMs < minIntervalMs) {
    return {
      skipped: true,
      skip_reason: 'cooldown',
      run_started_at: null,
      run_finished_at: null,
      expired_recovered: 0,
      processing_recovered: 0,
      orphan_jobs_recovered: 0,
      inspected: {
        expired_candidates: 0,
        processing_candidates: 0,
        running_jobs: 0,
      },
    };
  }

  const runPromise = (async () => {
    const now = deps.now();
    const runStartedAt = now.toISOString();
    const staleBeforeIso = new Date(now.getTime() - processingStaleMs).toISOString();

    let expiredRecovered = 0;
    let processingRecovered = 0;
    let orphanJobsRecovered = 0;
    let expiredCandidates = 0;
    let processingCandidates = 0;
    let runningJobs = 0;

    const expiredUnlocks = await deps.findExpiredReservedUnlocks(db, batchSize);
    expiredCandidates = expiredUnlocks.length;
    for (const unlock of expiredUnlocks) {
      const amount = Math.max(0, Number(unlock.estimated_cost || 0));
      const autoIntentId = String(unlock.auto_unlock_intent_id || '').trim() || null;
      if (autoIntentId) {
        await deps.releaseAutoUnlockIntent(db, {
          intentId: autoIntentId,
          reasonCode: 'UNLOCK_RESERVATION_EXPIRED_RECOVERED',
          lastErrorCode: 'UNLOCK_RESERVATION_EXPIRED_RECOVERED',
          lastErrorMessage: 'Recovered expired auto-unlock reservation.',
        });
      } else if (shouldRefundUnlock(unlock)) {
        await deps.refundReservation(db, {
          userId: String(unlock.reserved_by_user_id || '').trim(),
          amount,
          idempotencyKey: `unlock:${unlock.id}:sweep_reserved_expired_refund`,
          reasonCode: 'UNLOCK_RESERVATION_EXPIRED_REFUND',
          context: {
            source_item_id: unlock.source_item_id,
            source_page_id: unlock.source_page_id,
            unlock_id: unlock.id,
            metadata: {
              source: 'unlock_reliability_sweep',
              trace_id: traceId || null,
              reason: 'reserved_expired',
            },
          },
        });
      }

      await deps.failUnlock(db, {
        unlockId: unlock.id,
        errorCode: 'UNLOCK_RESERVATION_EXPIRED_RECOVERED',
        errorMessage: 'Recovered expired unlock reservation.',
      });
      expiredRecovered += 1;

      if (dryLogs) {
        logUnlockEvent('unlock_sweep_recovered_item', { trace_id: traceId || 'sweep', unlock_id: unlock.id }, {
          mode,
          reason: 'reserved_expired',
          source_item_id: unlock.source_item_id,
          source_page_id: unlock.source_page_id,
        });
      }
    }

    const processingRows = await deps.listProcessingUnlocks(db, batchSize);
    processingCandidates = processingRows.length;
    const processingJobIds = Array.from(
      new Set(processingRows.map((row) => String(row.job_id || '').trim()).filter(Boolean)),
    );
    const processingJobs = await deps.getJobsByIds(db, processingJobIds);
    const nowEpoch = now.getTime();

    for (const unlock of processingRows) {
      const jobId = String(unlock.job_id || '').trim();
      const job = jobId ? processingJobs.get(jobId) || null : null;
      const staleReason = hasExpired(unlock.reservation_expires_at, nowEpoch)
        ? 'reservation_expired'
        : !jobId
          ? 'missing_job_id'
          : !job
            ? 'job_missing'
            : job.status !== 'running'
              ? `job_${job.status}`
              : null;
      if (!staleReason) continue;

      const amount = Math.max(0, Number(unlock.estimated_cost || 0));
      const autoIntentId = String(unlock.auto_unlock_intent_id || '').trim() || null;
      if (autoIntentId) {
        await deps.releaseAutoUnlockIntent(db, {
          intentId: autoIntentId,
          reasonCode: 'UNLOCK_PROCESSING_STALE_RECOVERED',
          lastErrorCode: 'UNLOCK_PROCESSING_STALE_RECOVERED',
          lastErrorMessage: `Recovered stale processing auto-unlock (${staleReason}).`,
        });
      } else if (shouldRefundUnlock(unlock)) {
        await deps.refundReservation(db, {
          userId: String(unlock.reserved_by_user_id || '').trim(),
          amount,
          idempotencyKey: `unlock:${unlock.id}:sweep_processing_stale_refund`,
          reasonCode: 'UNLOCK_PROCESSING_STALE_REFUND',
          context: {
            source_item_id: unlock.source_item_id,
            source_page_id: unlock.source_page_id,
            unlock_id: unlock.id,
            metadata: {
              source: 'unlock_reliability_sweep',
              trace_id: traceId || null,
              reason: staleReason,
            },
          },
        });
      }

      await deps.failUnlock(db, {
        unlockId: unlock.id,
        errorCode: 'UNLOCK_PROCESSING_STALE_RECOVERED',
        errorMessage: `Recovered stale processing unlock (${staleReason}).`,
      });
      processingRecovered += 1;

      if (dryLogs) {
        logUnlockEvent('unlock_sweep_recovered_item', { trace_id: traceId || 'sweep', unlock_id: unlock.id, job_id: jobId || null }, {
          mode,
          reason: staleReason,
          source_item_id: unlock.source_item_id,
          source_page_id: unlock.source_page_id,
        });
      }
    }

    const runningUnlockJobs = await deps.listRunningUnlockJobs(db, batchSize, staleBeforeIso);
    runningJobs = runningUnlockJobs.length;
    const runningJobIds = runningUnlockJobs.map((job) => job.id);
    const activeLinksByJob = await deps.countActiveUnlockLinksForJobs(db, runningJobIds);
    const orphanJobIds = runningJobIds.filter((jobId) => (activeLinksByJob.get(jobId) || 0) === 0);
    if (orphanJobIds.length > 0) {
      orphanJobsRecovered = await deps.markJobsFailed(db, {
        jobIds: orphanJobIds,
        errorCode: 'ORPHAN_UNLOCK_JOB_RECOVERED',
        errorMessage: 'Recovered running unlock job with no active unlock rows.',
      });
      if (dryLogs && orphanJobsRecovered > 0) {
        logUnlockEvent('unlock_sweep_recovered_orphan_jobs', { trace_id: traceId || 'sweep' }, {
          mode,
          orphan_job_ids: orphanJobIds,
          recovered: orphanJobsRecovered,
        });
      }
    }

    const runFinishedAt = deps.now().toISOString();
    const summary: UnlockSweepResult = {
      skipped: false,
      skip_reason: null,
      run_started_at: runStartedAt,
      run_finished_at: runFinishedAt,
      expired_recovered: expiredRecovered,
      processing_recovered: processingRecovered,
      orphan_jobs_recovered: orphanJobsRecovered,
      inspected: {
        expired_candidates: expiredCandidates,
        processing_candidates: processingCandidates,
        running_jobs: runningJobs,
      },
    };

    logUnlockEvent('unlock_sweep_summary', { trace_id: traceId || 'sweep' }, {
      mode,
      dry_logs: dryLogs,
      ...summary,
    });
    return summary;
  })();

  activeRun = runPromise;
  try {
    const result = await runPromise;
    lastRunAtMs = deps.now().getTime();
    return result;
  } finally {
    if (activeRun === runPromise) {
      activeRun = null;
    }
  }
}

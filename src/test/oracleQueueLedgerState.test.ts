import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  buildOracleQueueLedgerJobFromInsertValues,
  claimOracleQueuedIngestionJobs,
  countOracleQueueLedgerJobs,
  failOracleQueueJob,
  getOracleLatestQueueJob,
  finalizeOracleQueueJob,
  getOracleLatestQueueJobForScope,
  listOracleQueueLedgerJobs,
  readOracleQueueLedgerBootstrapSummary,
  touchOracleQueueJobLease,
  upsertOracleQueueLedgerRow,
} from '../../server/services/oracleQueueLedgerState';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-queue-ledger-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle queue ledger state', () => {
  it('tracks latest job by scope from the local ledger', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T12:00:00.000Z',
          values: {
            id: 'job_scope_old',
            trigger: 'service_cron',
            scope: 'all_active_subscriptions',
            status: 'queued',
            next_run_at: '2026-04-01T12:00:00.000Z',
            created_at: '2026-04-01T12:00:00.000Z',
            updated_at: '2026-04-01T12:00:00.000Z',
          },
        }),
      });
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T12:05:00.000Z',
          values: {
            id: 'job_scope_new',
            trigger: 'service_cron',
            scope: 'all_active_subscriptions',
            status: 'running',
            next_run_at: '2026-04-01T12:05:00.000Z',
            started_at: '2026-04-01T12:05:00.000Z',
            created_at: '2026-04-01T12:05:00.000Z',
            updated_at: '2026-04-01T12:05:00.000Z',
          },
        }),
      });

      const latest = await getOracleLatestQueueJobForScope({
        controlDb,
        scope: 'all_active_subscriptions',
      });

      expect(latest).toMatchObject({
        id: 'job_scope_new',
        status: 'running',
        scope: 'all_active_subscriptions',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('claims, heartbeats, retries, and finalizes queued jobs locally', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T13:00:00.000Z',
          values: {
            id: 'job_retryable',
            trigger: 'service_cron',
            scope: 'search_video_generate',
            status: 'queued',
            next_run_at: '2026-04-01T12:59:00.000Z',
            max_attempts: 3,
            payload: { items: [{ title: 'Video A' }] },
            created_at: '2026-04-01T12:58:00.000Z',
            updated_at: '2026-04-01T12:58:00.000Z',
          },
        }),
      });

      const claimed = await claimOracleQueuedIngestionJobs({
        controlDb,
        scopes: ['search_video_generate'],
        maxJobs: 1,
        workerId: 'worker_1',
        leaseSeconds: 90,
        nowIso: '2026-04-01T13:00:00.000Z',
      });

      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({
        id: 'job_retryable',
        status: 'running',
        worker_id: 'worker_1',
        attempts: 1,
      });

      const touched = await touchOracleQueueJobLease({
        controlDb,
        jobId: 'job_retryable',
        workerId: 'worker_1',
        leaseSeconds: 120,
        nowIso: '2026-04-01T13:01:00.000Z',
      });

      expect(touched).toMatchObject({
        id: 'job_retryable',
        status: 'running',
        worker_id: 'worker_1',
        last_heartbeat_at: '2026-04-01T13:01:00.000Z',
      });

      const retried = await failOracleQueueJob({
        controlDb,
        jobId: 'job_retryable',
        errorCode: 'TEMP_FAIL',
        errorMessage: 'temporary failure',
        scheduleRetryInSeconds: 60,
        maxAttempts: 3,
        currentAttempts: 1,
        nowIso: '2026-04-01T13:02:00.000Z',
      });

      expect(retried).toMatchObject({
        id: 'job_retryable',
        status: 'queued',
        next_run_at: '2026-04-01T13:03:00.000Z',
        error_code: 'TEMP_FAIL',
        worker_id: null,
      });

      const claimedAgain = await claimOracleQueuedIngestionJobs({
        controlDb,
        scopes: ['search_video_generate'],
        maxJobs: 1,
        workerId: 'worker_2',
        leaseSeconds: 90,
        nowIso: '2026-04-01T13:03:00.000Z',
      });

      expect(claimedAgain).toHaveLength(1);
      expect(claimedAgain[0]).toMatchObject({
        id: 'job_retryable',
        status: 'running',
        worker_id: 'worker_2',
        attempts: 2,
      });

      const finalized = await finalizeOracleQueueJob({
        controlDb,
        jobId: 'job_retryable',
        status: 'succeeded',
        processedCount: 1,
        insertedCount: 1,
        skippedCount: 0,
        finishedAt: '2026-04-01T13:04:00.000Z',
        heartbeatAt: '2026-04-01T13:04:00.000Z',
      });

      expect(finalized).toMatchObject({
        id: 'job_retryable',
        status: 'succeeded',
        processed_count: 1,
        inserted_count: 1,
        skipped_count: 0,
        worker_id: null,
      });
    } finally {
      await controlDb.close();
    }
  });

  it('lists and counts queue ledger jobs by scope, user, and status', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T14:00:00.000Z',
          values: {
            id: 'job_user_queued',
            trigger: 'user',
            scope: 'manual_refresh_selection',
            status: 'queued',
            requested_by_user_id: 'user_1',
            next_run_at: '2026-04-01T14:00:00.000Z',
            payload: { items: [{ id: 'a' }, { id: 'b' }] },
            created_at: '2026-04-01T14:00:00.000Z',
            updated_at: '2026-04-01T14:00:00.000Z',
          },
        }),
      });
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T14:01:00.000Z',
          values: {
            id: 'job_user_running',
            trigger: 'user',
            scope: 'manual_refresh_selection',
            status: 'running',
            requested_by_user_id: 'user_1',
            next_run_at: '2026-04-01T14:00:00.000Z',
            started_at: '2026-04-01T14:01:00.000Z',
            created_at: '2026-04-01T14:01:00.000Z',
            updated_at: '2026-04-01T14:01:00.000Z',
          },
        }),
      });
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T14:02:00.000Z',
          values: {
            id: 'job_other_scope',
            trigger: 'service_cron',
            scope: 'all_active_subscriptions',
            status: 'queued',
            next_run_at: '2026-04-01T14:02:00.000Z',
            created_at: '2026-04-01T14:02:00.000Z',
            updated_at: '2026-04-01T14:02:00.000Z',
          },
        }),
      });

      const latestGlobal = await getOracleLatestQueueJob({
        controlDb,
      });
      expect(latestGlobal?.id).toBe('job_other_scope');

      const userRows = await listOracleQueueLedgerJobs({
        controlDb,
        userId: 'user_1',
        statuses: ['queued', 'running'],
        limit: 10,
        orderBy: 'created_desc',
      });
      expect(userRows.map((row) => row.id)).toEqual(['job_user_running', 'job_user_queued']);

      const queuedCount = await countOracleQueueLedgerJobs({
        controlDb,
        scope: 'manual_refresh_selection',
        userId: 'user_1',
        statuses: ['queued'],
      });
      expect(queuedCount).toBe(1);

      const runningRows = await listOracleQueueLedgerJobs({
        controlDb,
        scope: 'manual_refresh_selection',
        statuses: ['running'],
        startedBeforeIso: '2026-04-01T14:05:00.000Z',
        limit: 10,
        orderBy: 'started_asc',
      });
      expect(runningRows).toHaveLength(1);
      expect(runningRows[0]?.id).toBe('job_user_running');
    } finally {
      await controlDb.close();
    }
  });

  it('summarizes the local ledger without replacing Oracle-primary queue truth', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T15:00:00.000Z',
          values: {
            id: 'oracle_terminal_job',
            trigger: 'service_cron',
            scope: 'all_active_subscriptions',
            status: 'succeeded',
            next_run_at: '2026-04-01T15:00:00.000Z',
            finished_at: '2026-04-01T15:01:00.000Z',
            created_at: '2026-04-01T15:00:00.000Z',
            updated_at: '2026-04-01T15:01:00.000Z',
          },
        }),
      });
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T15:02:00.000Z',
          values: {
            id: 'oracle_active_job',
            trigger: 'user',
            scope: 'source_item_unlock_generation',
            status: 'queued',
            next_run_at: '2026-04-01T15:02:00.000Z',
            created_at: '2026-04-01T15:02:00.000Z',
            updated_at: '2026-04-01T15:02:00.000Z',
          },
        }),
      });

      const summary = await readOracleQueueLedgerBootstrapSummary({ controlDb });

      expect(summary).toEqual({
        rowCount: 2,
        activeCount: 1,
      });

      const terminal = await listOracleQueueLedgerJobs({
        controlDb,
        statuses: ['succeeded'],
        limit: 10,
      });
      expect(terminal.map((row) => row.id)).toEqual(['oracle_terminal_job']);
    } finally {
      await controlDb.close();
    }
  });
});

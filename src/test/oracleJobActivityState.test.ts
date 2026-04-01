import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  findOracleStaleRunningJobs,
  getOracleActiveJobForUserScope,
  getOracleLatestIngestionJob,
  listOracleActiveJobsForScope,
  listOracleJobsByIds,
  listOracleActiveJobsForUser,
  listOracleLatestJobsForUserScope,
  listOracleRunningJobsByScope,
  recordOracleJobLeaseHeartbeat,
  syncOracleJobActivityMirrorFromSupabase,
  upsertOracleJobActivityRow,
} from '../../server/services/oracleJobActivityState';
import {
  buildOracleQueueLedgerJobFromInsertValues,
  upsertOracleQueueLedgerRow,
} from '../../server/services/oracleQueueLedgerState';
import { readOracleQueueAdmissionCounts } from '../../server/services/oracleQueueAdmissionState';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-job-activity-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle job activity state', () => {
  it('tracks active manual-refresh jobs and queue admission counts locally', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleJobActivityRow({
        controlDb,
        nowIso: '2026-04-01T10:00:00.000Z',
        job: {
          id: 'job_manual_1',
          trigger: 'user_sync',
          scope: 'manual_refresh_selection',
          status: 'queued',
          requested_by_user_id: 'user_1',
          payload: {
            items: [{ title: 'Creator upload' }],
          },
          created_at: '2026-04-01T10:00:00.000Z',
          updated_at: '2026-04-01T10:00:00.000Z',
        },
      });

      const active = await getOracleActiveJobForUserScope({
        controlDb,
        userId: 'user_1',
        scope: 'manual_refresh_selection',
      });
      const counts = await readOracleQueueAdmissionCounts({
        controlDb,
        db: {} as any,
        refreshStaleMs: 60_000,
        userId: 'user_1',
        scope: 'manual_refresh_selection',
        nowIso: '2026-04-01T10:00:10.000Z',
      });

      expect(active).toMatchObject({
        id: 'job_manual_1',
        status: 'queued',
        requested_by_user_id: 'user_1',
      });
      expect(counts.queue_depth).toBe(1);
      expect(counts.user_queue_depth).toBe(1);
    } finally {
      await controlDb.close();
    }
  });

  it('removes completed jobs from active queue admission counts', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleJobActivityRow({
        controlDb,
        nowIso: '2026-04-01T11:00:00.000Z',
        job: {
          id: 'job_search_1',
          trigger: 'user_sync',
          scope: 'search_video_generate',
          status: 'running',
          requested_by_user_id: 'user_2',
          started_at: '2026-04-01T11:00:00.000Z',
          created_at: '2026-04-01T10:59:00.000Z',
          updated_at: '2026-04-01T11:00:00.000Z',
        },
      });

      await upsertOracleJobActivityRow({
        controlDb,
        nowIso: '2026-04-01T11:03:00.000Z',
        job: {
          id: 'job_search_1',
          trigger: 'user_sync',
          scope: 'search_video_generate',
          status: 'succeeded',
          requested_by_user_id: 'user_2',
          started_at: '2026-04-01T11:00:00.000Z',
          finished_at: '2026-04-01T11:03:00.000Z',
          processed_count: 1,
          inserted_count: 1,
          skipped_count: 0,
          created_at: '2026-04-01T10:59:00.000Z',
          updated_at: '2026-04-01T11:03:00.000Z',
        },
      });

      const activeRows = await listOracleActiveJobsForUser({
        controlDb,
        userId: 'user_2',
        scopes: ['search_video_generate'],
      });
      const counts = await readOracleQueueAdmissionCounts({
        controlDb,
        db: {} as any,
        refreshStaleMs: 60_000,
        userId: 'user_2',
        scope: 'search_video_generate',
        nowIso: '2026-04-01T11:03:10.000Z',
      });

      expect(activeRows).toEqual([]);
      expect(counts.queue_depth).toBe(0);
      expect(counts.user_queue_depth).toBe(0);
    } finally {
      await controlDb.close();
    }
  });

  it('lists latest rows and finds stale running jobs from the mirror', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleJobActivityRow({
        controlDb,
        nowIso: '2026-04-01T12:00:00.000Z',
        job: {
          id: 'job_old_running',
          trigger: 'user_sync',
          scope: 'manual_refresh_selection',
          status: 'running',
          requested_by_user_id: 'user_3',
          started_at: '2026-04-01T11:00:00.000Z',
          created_at: '2026-04-01T10:59:00.000Z',
          updated_at: '2026-04-01T12:00:00.000Z',
        },
      });
      await upsertOracleJobActivityRow({
        controlDb,
        nowIso: '2026-04-01T12:05:00.000Z',
        job: {
          id: 'job_latest_done',
          trigger: 'user_sync',
          scope: 'manual_refresh_selection',
          status: 'succeeded',
          requested_by_user_id: 'user_3',
          finished_at: '2026-04-01T12:05:00.000Z',
          created_at: '2026-04-01T12:04:00.000Z',
          updated_at: '2026-04-01T12:05:00.000Z',
        },
      });

      const latestRows = await listOracleLatestJobsForUserScope({
        controlDb,
        userId: 'user_3',
        scope: 'manual_refresh_selection',
        limit: 2,
      });
      const staleRows = await findOracleStaleRunningJobs({
        controlDb,
        olderThanMs: 30 * 60_000,
        nowIso: '2026-04-01T12:10:00.000Z',
        scope: 'manual_refresh_selection',
        userId: 'user_3',
      });

      expect(latestRows.map((row) => row.id)).toEqual(['job_latest_done', 'job_old_running']);
      expect(staleRows).toEqual([
        expect.objectContaining({
          id: 'job_old_running',
          scope: 'manual_refresh_selection',
          requested_by_user_id: 'user_3',
        }),
      ]);
    } finally {
      await controlDb.close();
    }
  });

  it('lists scope-active jobs, latest job, and jobs by id from the mirror', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleJobActivityRow({
        controlDb,
        nowIso: '2026-04-01T13:00:00.000Z',
        job: {
          id: 'job_retry_1',
          trigger: 'service_cron',
          scope: 'source_auto_unlock_retry',
          status: 'queued',
          payload: {
            source_item_id: 'source_1',
          },
          created_at: '2026-04-01T13:00:00.000Z',
          updated_at: '2026-04-01T13:00:00.000Z',
        },
      });
      await upsertOracleJobActivityRow({
        controlDb,
        nowIso: '2026-04-01T13:01:00.000Z',
        job: {
          id: 'job_unlock_running',
          trigger: 'service_cron',
          scope: 'source_item_unlock_generation',
          status: 'running',
          started_at: '2026-04-01T12:40:00.000Z',
          created_at: '2026-04-01T12:39:00.000Z',
          updated_at: '2026-04-01T13:01:00.000Z',
        },
      });

      const scopeRows = await listOracleActiveJobsForScope({
        controlDb,
        scope: 'source_auto_unlock_retry',
      });
      const runningRows = await listOracleRunningJobsByScope({
        controlDb,
        scope: 'source_item_unlock_generation',
        staleBeforeIso: '2026-04-01T12:50:00.000Z',
      });
      const byIdRows = await listOracleJobsByIds({
        controlDb,
        jobIds: ['job_retry_1', 'job_unlock_running'],
      });
      const latestRow = await getOracleLatestIngestionJob({
        controlDb,
      });

      expect(scopeRows.map((row) => row.id)).toEqual(['job_retry_1']);
      expect(runningRows.map((row) => row.id)).toEqual(['job_unlock_running']);
      expect(byIdRows.map((row) => row.id).sort()).toEqual(['job_retry_1', 'job_unlock_running']);
      expect(latestRow?.id).toBe('job_retry_1');
    } finally {
      await controlDb.close();
    }
  });

  it('refreshes running lease heartbeats locally without reviving terminal rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      const runningJob = {
        id: 'job_running_heartbeat',
        trigger: 'service_cron',
        scope: 'all_active_subscriptions',
        status: 'running',
        started_at: '2026-04-01T14:00:00.000Z',
        lease_expires_at: '2026-04-01T14:01:30.000Z',
        created_at: '2026-04-01T13:59:30.000Z',
        updated_at: '2026-04-01T14:00:00.000Z',
      } as const;

      await upsertOracleJobActivityRow({
        controlDb,
        nowIso: '2026-04-01T14:00:00.000Z',
        job: runningJob,
      });

      await recordOracleJobLeaseHeartbeat({
        controlDb,
        job: runningJob,
        leaseSeconds: 90,
        heartbeatAtIso: '2026-04-01T14:00:30.000Z',
      });

      let byIdRows = await listOracleJobsByIds({
        controlDb,
        jobIds: ['job_running_heartbeat'],
      });

      expect(byIdRows[0]).toMatchObject({
        id: 'job_running_heartbeat',
        status: 'running',
        lease_expires_at: '2026-04-01T14:02:00.000Z',
        updated_at: '2026-04-01T14:00:30.000Z',
      });

      await upsertOracleJobActivityRow({
        controlDb,
        nowIso: '2026-04-01T14:01:00.000Z',
        job: {
          ...runningJob,
          status: 'succeeded',
          finished_at: '2026-04-01T14:01:00.000Z',
          updated_at: '2026-04-01T14:01:00.000Z',
        },
      });

      await recordOracleJobLeaseHeartbeat({
        controlDb,
        job: runningJob,
        leaseSeconds: 90,
        heartbeatAtIso: '2026-04-01T14:01:10.000Z',
      });

      byIdRows = await listOracleJobsByIds({
        controlDb,
        jobIds: ['job_running_heartbeat'],
      });

      expect(byIdRows[0]).toMatchObject({
        id: 'job_running_heartbeat',
        status: 'succeeded',
        finished_at: '2026-04-01T14:01:00.000Z',
        updated_at: '2026-04-01T14:01:00.000Z',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('rebuilds the job activity mirror from the Oracle queue ledger before Supabase fallback', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T14:00:00.000Z',
          values: {
            id: 'job_from_ledger',
            trigger: 'service_cron',
            scope: 'all_active_subscriptions',
            status: 'queued',
            next_run_at: '2026-04-01T14:00:00.000Z',
            created_at: '2026-04-01T14:00:00.000Z',
            updated_at: '2026-04-01T14:00:00.000Z',
          },
        }),
      });

      const result = await syncOracleJobActivityMirrorFromSupabase({
        controlDb,
        db: {} as any,
        recentLimit: 100,
        nowIso: '2026-04-01T14:01:00.000Z',
      });
      const latest = await getOracleLatestIngestionJob({
        controlDb,
      });

      expect(result.rowCount).toBe(1);
      expect(result.activeCount).toBe(1);
      expect(latest).toMatchObject({
        id: 'job_from_ledger',
        scope: 'all_active_subscriptions',
        status: 'queued',
      });
    } finally {
      await controlDb.close();
    }
  });

  it('prefers queue ledger rows over stale mirror rows for active and stale-job reads', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleJobActivityRow({
        controlDb,
        nowIso: '2026-04-01T16:00:00.000Z',
        job: {
          id: 'mirror_manual_old',
          trigger: 'user_sync',
          scope: 'manual_refresh_selection',
          status: 'running',
          requested_by_user_id: 'user_ledger',
          started_at: '2026-04-01T14:00:00.000Z',
          created_at: '2026-04-01T14:00:00.000Z',
          updated_at: '2026-04-01T16:00:00.000Z',
        },
      });
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T16:05:00.000Z',
          values: {
            id: 'ledger_manual_new',
            trigger: 'user_sync',
            scope: 'manual_refresh_selection',
            status: 'queued',
            requested_by_user_id: 'user_ledger',
            next_run_at: '2026-04-01T16:05:00.000Z',
            created_at: '2026-04-01T16:05:00.000Z',
            updated_at: '2026-04-01T16:05:00.000Z',
          },
        }),
      });
      await upsertOracleQueueLedgerRow({
        controlDb,
        job: buildOracleQueueLedgerJobFromInsertValues({
          nowIso: '2026-04-01T16:06:00.000Z',
          values: {
            id: 'ledger_manual_stale',
            trigger: 'user_sync',
            scope: 'manual_refresh_selection',
            status: 'running',
            requested_by_user_id: 'user_ledger',
            started_at: '2026-04-01T15:00:00.000Z',
            next_run_at: '2026-04-01T15:00:00.000Z',
            created_at: '2026-04-01T15:00:00.000Z',
            updated_at: '2026-04-01T16:06:00.000Z',
          },
        }),
      });

      const active = await getOracleActiveJobForUserScope({
        controlDb,
        userId: 'user_ledger',
        scope: 'manual_refresh_selection',
      });
      const staleRows = await findOracleStaleRunningJobs({
        controlDb,
        olderThanMs: 30 * 60_000,
        nowIso: '2026-04-01T16:10:00.000Z',
        scope: 'manual_refresh_selection',
        userId: 'user_ledger',
      });

      expect(active?.id).toBe('ledger_manual_new');
      expect(staleRows.map((row) => row.id)).toEqual(['ledger_manual_stale']);
    } finally {
      await controlDb.close();
    }
  });
});

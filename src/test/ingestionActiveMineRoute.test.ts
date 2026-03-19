import { describe, expect, it } from 'vitest';
import {
  buildActiveIngestionJobsPayload,
  buildQueueAheadByJobId,
  compareQueuedJobsForPosition,
  estimateStartSeconds,
  parseScopeCsv,
  pickLatestRelevantIngestionJob,
  resolveQueuePositionScopes,
  type ActiveIngestionJobRow,
} from '../../server/routes/ingestion';

describe('ingestion active-mine payload helpers', () => {
  it('builds summary and queue estimate fields for running and queued jobs', () => {
    const rows: ActiveIngestionJobRow[] = [
      {
        id: 'job_running',
        trigger: 'manual',
        scope: 'manual_refresh_selection',
        status: 'running',
        started_at: '2026-03-01T09:00:00.000Z',
        finished_at: null,
        processed_count: 3,
        inserted_count: 1,
        skipped_count: 1,
        error_code: null,
        error_message: null,
        attempts: 1,
        max_attempts: 3,
        next_run_at: null,
        lease_expires_at: null,
        trace_id: null,
        created_at: '2026-03-01T08:59:00.000Z',
        updated_at: '2026-03-01T09:00:00.000Z',
      },
      {
        id: 'job_queued',
        trigger: 'manual',
        scope: 'manual_refresh_selection',
        status: 'queued',
        started_at: null,
        finished_at: null,
        processed_count: 0,
        inserted_count: 0,
        skipped_count: 0,
        error_code: null,
        error_message: null,
        attempts: 0,
        max_attempts: 3,
        next_run_at: '2026-03-01T10:00:00.000Z',
        lease_expires_at: null,
        trace_id: null,
        created_at: '2026-03-01T09:50:00.000Z',
        updated_at: '2026-03-01T09:50:00.000Z',
      },
    ];
    const queueAheadByJobId = new Map<string, number>([['job_queued', 1]]);

    const payload = buildActiveIngestionJobsPayload({
      rows,
      queueAheadByJobId,
      workerConcurrency: 2,
    });

    expect(payload.summary).toEqual({
      active_count: 2,
      queued_count: 1,
      running_count: 1,
    });
    expect(payload.items[0]).toMatchObject({
      job_id: 'job_running',
      status: 'running',
      queue_position: null,
      queue_ahead_count: 0,
      estimated_start_seconds: 0,
      is_position_estimate: false,
    });
    expect(payload.items[1]).toMatchObject({
      job_id: 'job_queued',
      status: 'queued',
      queue_position: 2,
      queue_ahead_count: 1,
      estimated_start_seconds: 4,
      is_position_estimate: true,
    });
  });

  it('marks queued jobs as position unavailable when queue index is missing', () => {
    const rows: ActiveIngestionJobRow[] = [
      {
        id: 'job_queued_missing',
        trigger: 'manual',
        scope: 'search_video_generate',
        status: 'queued',
        started_at: null,
        finished_at: null,
        processed_count: 0,
        inserted_count: 0,
        skipped_count: 0,
        error_code: null,
        error_message: null,
        attempts: 0,
        max_attempts: 3,
        next_run_at: '2026-03-01T10:10:00.000Z',
        lease_expires_at: null,
        trace_id: null,
        created_at: '2026-03-01T10:05:00.000Z',
        updated_at: '2026-03-01T10:05:00.000Z',
      },
    ];

    const payload = buildActiveIngestionJobsPayload({
      rows,
      queueAheadByJobId: new Map<string, number>(),
      workerConcurrency: 2,
    });

    expect(payload.items[0]).toMatchObject({
      job_id: 'job_queued_missing',
      queue_position: null,
      queue_ahead_count: null,
      estimated_start_seconds: null,
      is_position_estimate: true,
    });
  });
});

describe('ingestion queue helpers', () => {
  it('parses scope CSV and ignores blank values', () => {
    expect(parseScopeCsv('manual_refresh_selection, search_video_generate, ,')).toEqual([
      'manual_refresh_selection',
      'search_video_generate',
    ]);
    expect(parseScopeCsv(undefined)).toEqual([]);
  });

  it('keeps deterministic queued ordering by next_run_at, created_at, id', () => {
    const rows = [
      { id: 'job_b', next_run_at: '2026-03-01T10:00:00.000Z', created_at: '2026-03-01T09:00:00.000Z' },
      { id: 'job_a', next_run_at: '2026-03-01T10:00:00.000Z', created_at: '2026-03-01T09:00:00.000Z' },
      { id: 'job_c', next_run_at: '2026-03-01T10:01:00.000Z', created_at: '2026-03-01T09:00:00.000Z' },
    ];
    const sorted = [...rows].sort(compareQueuedJobsForPosition).map((row) => row.id);
    expect(sorted).toEqual(['job_a', 'job_b', 'job_c']);

    const aheadMap = buildQueueAheadByJobId(rows);
    expect(aheadMap.get('job_a')).toBe(0);
    expect(aheadMap.get('job_b')).toBe(1);
    expect(aheadMap.get('job_c')).toBe(2);
  });

  it('uses worker concurrency in ETA estimate', () => {
    expect(estimateStartSeconds(0, 1)).toBe(4);
    expect(estimateStartSeconds(1, 2)).toBe(4);
    expect(estimateStartSeconds(5, 2)).toBe(12);
  });

  it('prefers an active job over a newer terminal job in recent latest-mine rows', () => {
    const picked = pickLatestRelevantIngestionJob([
      { id: 'job_terminal', status: 'succeeded' },
      { id: 'job_active', status: 'running' },
      { id: 'job_oldest', status: 'failed' },
    ]);

    expect(picked?.id).toBe('job_active');
  });

  it('falls back to the newest row when no active job exists', () => {
    const picked = pickLatestRelevantIngestionJob([
      { id: 'job_latest', status: 'succeeded' },
      { id: 'job_older', status: 'failed' },
    ]);

    expect(picked?.id).toBe('job_latest');
  });

  it('uses explicit requested scopes before broad queue scope filters', () => {
    const scopes = resolveQueuePositionScopes({
      requestedScopes: ['manual_refresh_selection', 'search_video_generate'],
      rows: [{
        id: 'job_queued',
        trigger: 'manual',
        scope: 'manual_refresh_selection',
        status: 'queued',
        started_at: null,
        finished_at: null,
        processed_count: 0,
        inserted_count: 0,
        skipped_count: 0,
        error_code: null,
        error_message: null,
        attempts: 0,
        max_attempts: 3,
        next_run_at: null,
        lease_expires_at: null,
        trace_id: null,
        created_at: '2026-03-01T10:00:00.000Z',
        updated_at: '2026-03-01T10:00:00.000Z',
      }],
      queuedIngestionScopes: ['manual_refresh_selection', 'source_item_unlock_generation'],
    });

    expect(scopes).toEqual(['manual_refresh_selection', 'search_video_generate']);
  });

  it('falls back to queued row scopes when no explicit scope filter is requested', () => {
    const scopes = resolveQueuePositionScopes({
      requestedScopes: [],
      rows: [{
        id: 'job_queued',
        trigger: 'manual',
        scope: 'source_item_unlock_generation',
        status: 'queued',
        started_at: null,
        finished_at: null,
        processed_count: 0,
        inserted_count: 0,
        skipped_count: 0,
        error_code: null,
        error_message: null,
        attempts: 0,
        max_attempts: 3,
        next_run_at: null,
        lease_expires_at: null,
        trace_id: null,
        created_at: '2026-03-01T10:00:00.000Z',
        updated_at: '2026-03-01T10:00:00.000Z',
      }],
      queuedIngestionScopes: ['manual_refresh_selection', 'source_item_unlock_generation'],
    });

    expect(scopes).toEqual(['source_item_unlock_generation']);
  });
});

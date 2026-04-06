import { describe, expect, it } from 'vitest';
import {
  mapQueueShadowInsertValues,
  mapQueueShadowUpdateValues,
} from '../../server/services/queueShadowPolicy';

describe('queue shadow policy', () => {
  const job = {
    id: 'job_1',
    trigger: 'service_cron',
    scope: 'blueprint_youtube_refresh',
    status: 'queued',
    requested_by_user_id: 'user_1',
    subscription_id: 'sub_1',
    started_at: null,
    finished_at: null,
    processed_count: 0,
    inserted_count: 0,
    skipped_count: 0,
    error_code: null,
    error_message: null,
    attempts: 0,
    max_attempts: 3,
    next_run_at: '2026-04-06T07:00:00.000Z',
    lease_expires_at: null,
    last_heartbeat_at: null,
    worker_id: null,
    trace_id: 'trace_1',
    payload: { refresh_kind: 'comments' },
    created_at: '2026-04-06T06:59:00.000Z',
    updated_at: '2026-04-06T06:59:00.000Z',
  } as any;

  it('keeps id and created_at only on insert payloads', () => {
    const payload = mapQueueShadowInsertValues(job);

    expect(payload.id).toBe('job_1');
    expect(payload.created_at).toBe('2026-04-06T06:59:00.000Z');
    expect(payload.updated_at).toBe('2026-04-06T06:59:00.000Z');
  });

  it('builds update payloads without id or created_at', () => {
    const payload = mapQueueShadowUpdateValues(job);

    expect(payload).toEqual({
      trigger: 'service_cron',
      scope: 'blueprint_youtube_refresh',
      status: 'queued',
      requested_by_user_id: 'user_1',
      subscription_id: 'sub_1',
      started_at: null,
      finished_at: null,
      processed_count: 0,
      inserted_count: 0,
      skipped_count: 0,
      error_code: null,
      error_message: null,
      attempts: 0,
      max_attempts: 3,
      next_run_at: '2026-04-06T07:00:00.000Z',
      lease_expires_at: null,
      last_heartbeat_at: null,
      worker_id: null,
      trace_id: 'trace_1',
      payload: { refresh_kind: 'comments' },
      updated_at: '2026-04-06T06:59:00.000Z',
    });
    expect('id' in payload).toBe(false);
    expect('created_at' in payload).toBe(false);
  });
});

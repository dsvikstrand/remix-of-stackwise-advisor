import { describe, expect, it } from 'vitest';
import {
  getQueueShadowChangedFields,
  getQueueShadowSkipReason,
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

  it('surfaces material queue shadow changes', () => {
    const changedFields = getQueueShadowChangedFields(job, {
      ...job,
      status: 'failed',
      error_code: 'WORKER_TIMEOUT',
      error_message: 'Job timed out.',
      finished_at: '2026-04-06T07:05:00.000Z',
      updated_at: '2026-04-06T07:05:00.000Z',
    });

    expect(changedFields).toEqual([
      'status',
      'finished_at',
      'error_code',
      'error_message',
    ]);
  });

  it('skips Oracle-primary retry-state queue shadows', () => {
    expect(getQueueShadowSkipReason({
      action: 'queued_job_fail_transition_shadow',
      primaryEnabled: true,
      next: {
        ...job,
        status: 'queued',
        error_code: 'PROVIDER_DEGRADED',
        error_message: 'Retry later.',
        next_run_at: '2026-04-06T07:10:00.000Z',
        updated_at: '2026-04-06T07:05:00.000Z',
      },
    })).toBe('oracle_primary_retry_state');
  });

  it('keeps terminal or non-primary queue shadows', () => {
    expect(getQueueShadowSkipReason({
      action: 'queued_job_fail_transition_shadow',
      primaryEnabled: true,
      next: {
        ...job,
        status: 'failed',
        error_code: 'WORKER_TIMEOUT',
        error_message: 'Terminal failure.',
        finished_at: '2026-04-06T07:05:00.000Z',
        updated_at: '2026-04-06T07:05:00.000Z',
      },
    })).toBeNull();

    expect(getQueueShadowSkipReason({
      action: 'queued_job_fail_transition_shadow',
      primaryEnabled: false,
      next: {
        ...job,
        status: 'queued',
        error_code: 'PROVIDER_DEGRADED',
        error_message: 'Retry later.',
        next_run_at: '2026-04-06T07:10:00.000Z',
        updated_at: '2026-04-06T07:05:00.000Z',
      },
    })).toBeNull();
  });
});

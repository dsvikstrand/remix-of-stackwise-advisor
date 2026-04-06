import type { IngestionJobRow } from './ingestionQueue';

export function mapQueueShadowInsertValues(job: IngestionJobRow) {
  return {
    id: job.id,
    trigger: job.trigger,
    scope: job.scope,
    status: job.status,
    requested_by_user_id: job.requested_by_user_id,
    subscription_id: job.subscription_id,
    started_at: job.started_at,
    finished_at: job.finished_at,
    processed_count: job.processed_count,
    inserted_count: job.inserted_count,
    skipped_count: job.skipped_count,
    error_code: job.error_code,
    error_message: job.error_message,
    attempts: job.attempts,
    max_attempts: job.max_attempts,
    next_run_at: job.next_run_at,
    lease_expires_at: job.lease_expires_at,
    last_heartbeat_at: job.last_heartbeat_at,
    worker_id: job.worker_id,
    trace_id: job.trace_id,
    payload: job.payload,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}

export function mapQueueShadowUpdateValues(job: IngestionJobRow) {
  return {
    trigger: job.trigger,
    scope: job.scope,
    status: job.status,
    requested_by_user_id: job.requested_by_user_id,
    subscription_id: job.subscription_id,
    started_at: job.started_at,
    finished_at: job.finished_at,
    processed_count: job.processed_count,
    inserted_count: job.inserted_count,
    skipped_count: job.skipped_count,
    error_code: job.error_code,
    error_message: job.error_message,
    attempts: job.attempts,
    max_attempts: job.max_attempts,
    next_run_at: job.next_run_at,
    lease_expires_at: job.lease_expires_at,
    last_heartbeat_at: job.last_heartbeat_at,
    worker_id: job.worker_id,
    trace_id: job.trace_id,
    payload: job.payload,
    updated_at: job.updated_at,
  };
}

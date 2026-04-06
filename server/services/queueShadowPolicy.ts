import type { IngestionJobRow } from './ingestionQueue';

type QueueShadowComparableField =
  | 'trigger'
  | 'scope'
  | 'status'
  | 'requested_by_user_id'
  | 'subscription_id'
  | 'started_at'
  | 'finished_at'
  | 'processed_count'
  | 'inserted_count'
  | 'skipped_count'
  | 'error_code'
  | 'error_message'
  | 'attempts'
  | 'max_attempts'
  | 'next_run_at'
  | 'lease_expires_at'
  | 'last_heartbeat_at'
  | 'worker_id'
  | 'trace_id'
  | 'payload';

const QUEUE_SHADOW_COMPARABLE_FIELDS: QueueShadowComparableField[] = [
  'trigger',
  'scope',
  'status',
  'requested_by_user_id',
  'subscription_id',
  'started_at',
  'finished_at',
  'processed_count',
  'inserted_count',
  'skipped_count',
  'error_code',
  'error_message',
  'attempts',
  'max_attempts',
  'next_run_at',
  'lease_expires_at',
  'last_heartbeat_at',
  'worker_id',
  'trace_id',
  'payload',
];

function normalizeComparableValue(job: IngestionJobRow | null | undefined, field: QueueShadowComparableField) {
  if (field === 'payload') {
    return JSON.stringify(job?.payload || null);
  }
  return job?.[field] ?? null;
}

export function getQueueShadowChangedFields(
  current: IngestionJobRow | null | undefined,
  next: IngestionJobRow,
) {
  const changedFields: QueueShadowComparableField[] = [];
  for (const field of QUEUE_SHADOW_COMPARABLE_FIELDS) {
    if (normalizeComparableValue(current, field) !== normalizeComparableValue(next, field)) {
      changedFields.push(field);
    }
  }
  return changedFields;
}

export function getQueueShadowSkipReason(input: {
  action: string;
  primaryEnabled: boolean;
  next: IngestionJobRow;
}) {
  if (!input.primaryEnabled) return null;
  const action = String(input.action || '').trim();
  if (action === 'queued_job_fail_transition_shadow' && String(input.next.status || '').trim() === 'queued') {
    return 'oracle_primary_retry_state';
  }
  return null;
}

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

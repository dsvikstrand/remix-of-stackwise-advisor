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

export type QueueShadowActionClass =
  | 'terminal'
  | 'retry_requeue'
  | 'claim_start'
  | 'heartbeat_lease'
  | 'generic';

export function isOracleOnlyQueueEnabled(input: {
  primaryEnabled: boolean;
  supabaseCompatEnabled: boolean;
}) {
  return input.primaryEnabled && !input.supabaseCompatEnabled;
}

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

export function getQueueShadowActionClass(input: {
  action: string;
  current?: IngestionJobRow | null;
  next: IngestionJobRow;
  changedFields?: QueueShadowComparableField[] | null;
}): QueueShadowActionClass {
  const action = String(input.action || '').trim();
  const currentStatus = String(input.current?.status || '').trim();
  const nextStatus = String(input.next.status || '').trim();
  const changedFields = input.changedFields || [];

  if (
    action.includes('finalize')
    || action.includes('terminal')
    || nextStatus === 'succeeded'
    || nextStatus === 'failed'
  ) {
    return 'terminal';
  }

  if (nextStatus === 'queued' && currentStatus === 'running') {
    return 'retry_requeue';
  }

  if (
    nextStatus === 'running'
    && currentStatus === 'queued'
  ) {
    return 'claim_start';
  }

  if (
    nextStatus === 'running'
    && changedFields.length > 0
    && changedFields.every((field) => (
      field === 'lease_expires_at'
      || field === 'last_heartbeat_at'
      || field === 'worker_id'
    ))
  ) {
    return 'heartbeat_lease';
  }

  return 'generic';
}

export function getQueueShadowSkipReason(input: {
  action: string;
  primaryEnabled: boolean;
  current?: IngestionJobRow | null;
  next: IngestionJobRow;
  changedFields?: QueueShadowComparableField[] | null;
}) {
  if (!input.primaryEnabled) return null;
  const actionClass = getQueueShadowActionClass({
    action: input.action,
    current: input.current,
    next: input.next,
    changedFields: input.changedFields,
  });
  if (actionClass === 'retry_requeue') {
    return 'oracle_primary_retry_state';
  }
  if (actionClass === 'claim_start') {
    return 'oracle_primary_claim_state';
  }
  if (actionClass === 'heartbeat_lease') {
    return 'oracle_primary_lease_state';
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

export function mapQueueShadowUpdateValues(
  job: IngestionJobRow,
  input?: {
    action?: string;
    current?: IngestionJobRow | null;
    changedFields?: QueueShadowComparableField[] | null;
  },
) {
  const actionClass = getQueueShadowActionClass({
    action: input?.action || '',
    current: input?.current,
    next: job,
    changedFields: input?.changedFields,
  });

  const payload: Record<string, unknown> = {};
  const include = (field: keyof IngestionJobRow) => {
    payload[field] = job[field];
  };

  if (actionClass === 'terminal') {
    include('status');
    include('finished_at');
    include('processed_count');
    include('inserted_count');
    include('skipped_count');
    include('lease_expires_at');
    include('last_heartbeat_at');
    include('worker_id');
    include('error_code');
    include('error_message');
    include('updated_at');
    return payload;
  }

  if (actionClass === 'retry_requeue') {
    include('status');
    include('finished_at');
    include('next_run_at');
    include('lease_expires_at');
    include('last_heartbeat_at');
    include('worker_id');
    include('error_code');
    include('error_message');
    include('max_attempts');
    include('updated_at');
    return payload;
  }

  if (actionClass === 'claim_start') {
    include('status');
    include('started_at');
    include('lease_expires_at');
    include('last_heartbeat_at');
    include('worker_id');
    include('updated_at');
    return payload;
  }

  if (actionClass === 'heartbeat_lease') {
    include('lease_expires_at');
    include('last_heartbeat_at');
    include('worker_id');
    include('updated_at');
    return payload;
  }

  for (const field of QUEUE_SHADOW_COMPARABLE_FIELDS) {
    include(field);
  }
  include('updated_at');
  return payload;
}

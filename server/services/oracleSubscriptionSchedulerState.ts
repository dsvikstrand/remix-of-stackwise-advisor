import type { OracleControlPlaneDb } from './oracleControlPlaneDb';

export type OracleBootstrapSubscription = {
  id: string;
  user_id: string;
  source_channel_id: string;
  last_polled_at?: string | null;
  is_active?: boolean | null;
};

export type OracleSubscriptionSyncResultCode =
  | 'bootstrap'
  | 'new_items'
  | 'checked_no_insert'
  | 'noop'
  | 'feed_transient_error'
  | 'feed_not_found'
  | 'error';

export type OracleScopeDecisionCode =
  | 'bootstrap_only'
  | 'shadow_scheduler_disabled'
  | 'shadow_existing_job'
  | 'shadow_min_interval'
  | 'shadow_queue_backpressure'
  | 'shadow_low_priority_suppressed'
  | 'shadow_no_due_subscriptions'
  | 'shadow_enqueue'
  | 'actual_existing_job'
  | 'actual_min_interval'
  | 'actual_queue_backpressure'
  | 'actual_low_priority_suppressed'
  | 'actual_no_due_subscriptions'
  | 'actual_enqueued'
  | 'actual_job_started'
  | 'actual_job_succeeded'
  | 'actual_job_failed';

export type OracleDueSubscriptionRow = {
  subscriptionId: string;
  userId: string;
  sourceChannelId: string;
  nextDueAt: string;
  lastCheckedAt: string | null;
  lastCompletedAt: string | null;
  lastResultCode: string | null;
  consecutiveNoopCount: number;
  consecutiveErrorCount: number;
  starvationScore: number;
};

export type OracleScopeControlStateRow = {
  scope: string;
  schedulerEnabled: boolean;
  lastTriggeredAt: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  minIntervalUntil: string | null;
  suppressionUntil: string | null;
  lastDecisionCode: string | null;
  lastQueueDepth: number | null;
  lastResultSummaryJson: string | null;
  updatedAt: string;
};

const QUIET_AFTER_CONSECUTIVE_NOOPS = 3;
const FEED_NOT_FOUND_BACKOFF_MAX_MS = 24 * 60 * 60_000;

function normalizeInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function normalizeIsoOrNull(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function addMsToIso(value: string, ms: number) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed + Math.max(0, Math.floor(ms))).toISOString();
}

function resolveFeedNotFoundRevisitMs(baseMs: number, consecutiveFeedNotFoundCount?: number) {
  const base = Math.max(0, Math.floor(Number(baseMs) || 0));
  const count = Math.max(1, Math.floor(Number(consecutiveFeedNotFoundCount) || 1));
  let multiplier = 1;
  if (count >= 5) {
    multiplier = 16;
  } else if (count >= 3) {
    multiplier = 4;
  } else if (count >= 2) {
    multiplier = 2;
  }
  const maxMs = Math.max(base, FEED_NOT_FOUND_BACKOFF_MAX_MS);
  return Math.min(base * multiplier, maxMs);
}

function resolveSubscriptionSourceHealth(input: {
  resultCode: OracleSubscriptionSyncResultCode;
  consecutiveErrorCount: number;
  errorMessage?: string | null;
}) {
  const errorMessage = String(input.errorMessage || '').trim() || null;
  if (input.resultCode === 'feed_not_found') {
    return {
      state: input.consecutiveErrorCount >= 5
        ? 'feed_not_found_quarantine_candidate'
        : input.consecutiveErrorCount >= 2
          ? 'feed_not_found_degraded'
          : 'feed_not_found_observed',
      quarantineCandidate: input.consecutiveErrorCount >= 5,
      errorClass: errorMessage?.startsWith('FEED_FETCH_FAILED:404') ? 'youtube_feed_404' : 'feed_not_found',
    };
  }
  if (input.resultCode === 'feed_transient_error') {
    return {
      state: 'feed_transient_error',
      quarantineCandidate: false,
      errorClass: errorMessage?.startsWith('FEED_FETCH_FAILED:500') ? 'youtube_feed_5xx' : 'feed_transient_error',
    };
  }
  if (input.resultCode === 'error') {
    return {
      state: 'sync_error',
      quarantineCandidate: false,
      errorClass: 'sync_error',
    };
  }
  return {
    state: 'healthy',
    quarantineCandidate: false,
    errorClass: null,
  };
}

export function resolveOracleNextDueAtFromOutcome(input: {
  nowIso?: string;
  resultCode: OracleSubscriptionSyncResultCode;
  consecutiveNoopCount?: number;
  consecutiveFeedNotFoundCount?: number;
  activeRevisitMs: number;
  normalRevisitMs: number;
  quietRevisitMs: number;
  errorRetryMs: number;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  if (input.resultCode === 'error') {
    return addMsToIso(nowIso, input.errorRetryMs);
  }
  if (input.resultCode === 'feed_transient_error') {
    return addMsToIso(nowIso, input.errorRetryMs);
  }
  if (input.resultCode === 'feed_not_found') {
    return addMsToIso(
      nowIso,
      resolveFeedNotFoundRevisitMs(input.quietRevisitMs, input.consecutiveFeedNotFoundCount),
    );
  }
  if (input.resultCode === 'new_items') {
    return addMsToIso(nowIso, input.activeRevisitMs);
  }
  const consecutiveNoopCount = Math.max(0, Math.floor(Number(input.consecutiveNoopCount) || 0));
  if (consecutiveNoopCount >= QUIET_AFTER_CONSECUTIVE_NOOPS) {
    return addMsToIso(nowIso, input.quietRevisitMs);
  }
  return addMsToIso(nowIso, input.normalRevisitMs);
}

function mapScopeControlStateRow(row: {
  scope: string;
  scheduler_enabled: number;
  last_triggered_at: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_success_at: string | null;
  min_interval_until: string | null;
  suppression_until: string | null;
  last_decision_code: string | null;
  last_queue_depth: number | null;
  last_result_summary_json: string | null;
  updated_at: string;
}): OracleScopeControlStateRow {
  return {
    scope: row.scope,
    schedulerEnabled: row.scheduler_enabled === 1,
    lastTriggeredAt: row.last_triggered_at,
    lastStartedAt: row.last_started_at,
    lastFinishedAt: row.last_finished_at,
    lastSuccessAt: row.last_success_at,
    minIntervalUntil: row.min_interval_until,
    suppressionUntil: row.suppression_until,
    lastDecisionCode: row.last_decision_code,
    lastQueueDepth: row.last_queue_depth,
    lastResultSummaryJson: row.last_result_summary_json,
    updatedAt: row.updated_at,
  };
}

function mapDueSubscriptionRow(row: {
  subscription_id: string;
  user_id: string;
  source_channel_id: string;
  next_due_at: string;
  last_checked_at: string | null;
  last_completed_at: string | null;
  last_result_code: string | null;
  consecutive_noop_count: number;
  consecutive_error_count: number;
  starvation_score: number;
}): OracleDueSubscriptionRow {
  return {
    subscriptionId: row.subscription_id,
    userId: row.user_id,
    sourceChannelId: row.source_channel_id,
    nextDueAt: row.next_due_at,
    lastCheckedAt: row.last_checked_at,
    lastCompletedAt: row.last_completed_at,
    lastResultCode: row.last_result_code,
    consecutiveNoopCount: normalizeInt(row.consecutive_noop_count),
    consecutiveErrorCount: normalizeInt(row.consecutive_error_count),
    starvationScore: normalizeInt(row.starvation_score),
  };
}

function resolveBootstrapNextDueAt(subscription: OracleBootstrapSubscription, nowIso: string) {
  return normalizeIsoOrNull(subscription.last_polled_at) || nowIso;
}

async function upsertScopeControlState(input: {
  controlDb: OracleControlPlaneDb;
  scope: string;
  nowIso: string;
  patch: {
    scheduler_enabled?: number;
    last_triggered_at?: string | null;
    last_started_at?: string | null;
    last_finished_at?: string | null;
    last_success_at?: string | null;
    min_interval_until?: string | null;
    suppression_until?: string | null;
    last_decision_code?: string | null;
    last_queue_depth?: number | null;
    last_result_summary_json?: string | null;
  };
}) {
  const scope = String(input.scope || '').trim();
  const patch = Object.fromEntries(
    Object.entries({
      ...input.patch,
      updated_at: input.nowIso,
    }).filter(([, value]) => value !== undefined),
  ) as {
    scheduler_enabled?: number;
    last_triggered_at?: string | null;
    last_started_at?: string | null;
    last_finished_at?: string | null;
    last_success_at?: string | null;
    min_interval_until?: string | null;
    suppression_until?: string | null;
    last_decision_code?: string | null;
    last_queue_depth?: number | null;
    last_result_summary_json?: string | null;
    updated_at: string;
  };
  await input.controlDb.db
    .insertInto('scope_control_state')
    .values({
      scope,
      scheduler_enabled: patch.scheduler_enabled ?? 1,
      last_triggered_at: patch.last_triggered_at ?? null,
      last_started_at: patch.last_started_at ?? null,
      last_finished_at: patch.last_finished_at ?? null,
      last_success_at: patch.last_success_at ?? null,
      min_interval_until: patch.min_interval_until ?? null,
      suppression_until: patch.suppression_until ?? null,
      last_decision_code: patch.last_decision_code ?? null,
      last_queue_depth: patch.last_queue_depth ?? null,
      last_result_summary_json: patch.last_result_summary_json ?? null,
      updated_at: patch.updated_at,
    })
    .onConflict((oc) => oc.column('scope').doUpdateSet(patch))
    .execute();
}

export async function getOracleScopeControlState(input: {
  controlDb: OracleControlPlaneDb;
  scope?: string;
}) {
  const scope = String(input.scope || 'all_active_subscriptions').trim() || 'all_active_subscriptions';
  const row = await input.controlDb.db
    .selectFrom('scope_control_state')
    .selectAll()
    .where('scope', '=', scope)
    .executeTakeFirst();
  return row ? mapScopeControlStateRow(row) : null;
}

export async function listOracleDueSubscriptions(input: {
  controlDb: OracleControlPlaneDb;
  nowIso?: string;
  limit: number;
  lookaheadMs?: number;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const lookaheadMs = Math.max(0, Math.floor(Number(input.lookaheadMs) || 0));
  const dueUntilIso = addMsToIso(nowIso, lookaheadMs);
  const limit = Math.max(1, Math.floor(Number(input.limit) || 1));

  const [rows, countRow, nextDueRow] = await Promise.all([
    input.controlDb.db
      .selectFrom('subscription_schedule_state')
      .select([
        'subscription_id',
        'user_id',
        'source_channel_id',
        'next_due_at',
        'last_checked_at',
        'last_completed_at',
        'last_result_code',
        'consecutive_noop_count',
        'consecutive_error_count',
        'starvation_score',
      ])
      .where('active', '=', 1)
      .where('next_due_at', '<=', dueUntilIso)
      .orderBy('starvation_score', 'desc')
      .orderBy('next_due_at', 'asc')
      .orderBy('updated_at', 'asc')
      .limit(limit)
      .execute(),
    input.controlDb.db
      .selectFrom('subscription_schedule_state')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('active', '=', 1)
      .where('next_due_at', '<=', dueUntilIso)
      .executeTakeFirst(),
    input.controlDb.db
      .selectFrom('subscription_schedule_state')
      .select(['next_due_at'])
      .where('active', '=', 1)
      .orderBy('next_due_at', 'asc')
      .limit(1)
      .executeTakeFirst(),
  ]);

  return {
    nowIso,
    dueUntilIso,
    dueCount: normalizeInt(countRow?.count),
    nextDueAt: nextDueRow?.next_due_at || null,
    rows: rows.map(mapDueSubscriptionRow),
  };
}

export async function recordOracleSubscriptionSchedulerObservation(input: {
  controlDb: OracleControlPlaneDb;
  scope?: string;
  nowIso?: string;
  actualDecisionCode: OracleScopeDecisionCode;
  oracleDecisionCode: OracleScopeDecisionCode;
  queueDepth?: number | null;
  dueSubscriptionCount?: number;
  dueSubscriptionIds?: string[];
  nextDueAt?: string | null;
  minIntervalUntil?: string | null;
  suppressionUntil?: string | null;
  latestJobId?: string | null;
  latestJobStatus?: string | null;
  latestActivityAt?: string | null;
  existingJobId?: string | null;
  existingJobStatus?: string | null;
  enqueuedJobId?: string | null;
  minIntervalMs?: number;
  suppressionMs?: number;
}) {
  const scope = String(input.scope || 'all_active_subscriptions').trim() || 'all_active_subscriptions';
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const summary = JSON.stringify({
    actual_decision_code: input.actualDecisionCode,
    oracle_decision_code: input.oracleDecisionCode,
    due_subscription_count: normalizeInt(input.dueSubscriptionCount),
    due_subscription_ids: (input.dueSubscriptionIds || []).slice(0, 10),
    next_due_at: normalizeIsoOrNull(input.nextDueAt),
    latest_job_id: input.latestJobId || null,
    latest_job_status: input.latestJobStatus || null,
    latest_activity_at: normalizeIsoOrNull(input.latestActivityAt),
    existing_job_id: input.existingJobId || null,
    existing_job_status: input.existingJobStatus || null,
    enqueued_job_id: input.enqueuedJobId || null,
  });

  let minIntervalUntil: string | null | undefined;
  let suppressionUntil: string | null | undefined;
  let lastTriggeredAt: string | null | undefined;
  const explicitMinIntervalUntil = normalizeIsoOrNull(input.minIntervalUntil);
  const explicitSuppressionUntil = normalizeIsoOrNull(input.suppressionUntil);

  if (input.actualDecisionCode === 'actual_enqueued') {
    lastTriggeredAt = nowIso;
    minIntervalUntil = explicitMinIntervalUntil
      || addMsToIso(nowIso, Math.max(0, Math.floor(Number(input.minIntervalMs) || 0)));
    suppressionUntil = explicitSuppressionUntil ?? null;
  } else if (input.actualDecisionCode === 'actual_min_interval') {
    if (explicitMinIntervalUntil) {
      minIntervalUntil = explicitMinIntervalUntil;
    } else {
      const latestActivityAt = normalizeIsoOrNull(input.latestActivityAt);
      if (latestActivityAt) {
        minIntervalUntil = addMsToIso(latestActivityAt, Math.max(0, Math.floor(Number(input.minIntervalMs) || 0)));
      }
    }
  } else if (input.actualDecisionCode === 'actual_low_priority_suppressed') {
    suppressionUntil = explicitSuppressionUntil
      || addMsToIso(nowIso, Math.max(0, Math.floor(Number(input.suppressionMs) || 0)));
  }

  await upsertScopeControlState({
    controlDb: input.controlDb,
    scope,
    nowIso,
    patch: {
      last_triggered_at: lastTriggeredAt,
      min_interval_until: minIntervalUntil,
      suppression_until: suppressionUntil,
      last_decision_code: input.actualDecisionCode,
      last_queue_depth: input.queueDepth == null ? null : Math.max(0, Math.floor(input.queueDepth)),
      last_result_summary_json: summary,
    },
  });
}

export async function markOracleAllActiveSubscriptionsRunStarted(input: {
  controlDb: OracleControlPlaneDb;
  nowIso?: string;
  scope?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  await upsertScopeControlState({
    controlDb: input.controlDb,
    scope: input.scope || 'all_active_subscriptions',
    nowIso,
    patch: {
      last_started_at: nowIso,
      last_decision_code: 'actual_job_started',
    },
  });
}

export async function markOracleAllActiveSubscriptionsRunFinished(input: {
  controlDb: OracleControlPlaneDb;
  nowIso?: string;
  scope?: string;
  processed: number;
  inserted: number;
  skipped: number;
  failureCount: number;
  softFailureCount?: number;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const failureCount = normalizeInt(input.failureCount);
  const softFailureCount = normalizeInt(input.softFailureCount);
  await upsertScopeControlState({
    controlDb: input.controlDb,
    scope: input.scope || 'all_active_subscriptions',
    nowIso,
    patch: {
      last_finished_at: nowIso,
      last_success_at: failureCount === 0 ? nowIso : undefined,
      last_decision_code: failureCount === 0 ? 'actual_job_succeeded' : 'actual_job_failed',
      last_result_summary_json: JSON.stringify({
        processed: normalizeInt(input.processed),
        inserted: normalizeInt(input.inserted),
        skipped: normalizeInt(input.skipped),
        failure_count: failureCount,
        soft_failure_count: softFailureCount,
      }),
    },
  });
}

export async function recordOracleSubscriptionSyncOutcome(input: {
  controlDb: OracleControlPlaneDb;
  subscriptionId: string;
  nowIso?: string;
  resultCode: OracleSubscriptionSyncResultCode;
  activeRevisitMs: number;
  normalRevisitMs: number;
  quietRevisitMs: number;
  errorRetryMs: number;
  processed?: number;
  inserted?: number;
  skipped?: number;
  trigger?: string | null;
  errorMessage?: string | null;
}) {
  const subscriptionId = String(input.subscriptionId || '').trim();
  if (!subscriptionId) return;
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const existing = await input.controlDb.db
    .selectFrom('subscription_schedule_state')
    .select([
      'subscription_id',
      'last_result_code',
      'consecutive_noop_count',
      'consecutive_error_count',
      'starvation_score',
      'created_at',
    ])
    .where('subscription_id', '=', subscriptionId)
    .executeTakeFirst();
  if (!existing) return;

  const isError =
    input.resultCode === 'error'
    || input.resultCode === 'feed_transient_error'
    || input.resultCode === 'feed_not_found';
  const isNoop = input.resultCode === 'noop' || input.resultCode === 'checked_no_insert';
  const consecutiveNoopCount = isNoop
    ? normalizeInt(existing.consecutive_noop_count) + 1
    : 0;
  const consecutiveErrorCount = isError
    ? normalizeInt(existing.consecutive_error_count) + 1
    : 0;
  const consecutiveFeedNotFoundCount = input.resultCode === 'feed_not_found'
    ? (existing.last_result_code === 'feed_not_found'
      ? normalizeInt(existing.consecutive_error_count) + 1
      : 1)
    : 0;
  const nextDueAt = resolveOracleNextDueAtFromOutcome({
    nowIso,
    resultCode: input.resultCode,
    consecutiveNoopCount,
    consecutiveFeedNotFoundCount,
    activeRevisitMs: input.activeRevisitMs,
    normalRevisitMs: input.normalRevisitMs,
    quietRevisitMs: input.quietRevisitMs,
    errorRetryMs: input.errorRetryMs,
  });
  const sourceHealth = resolveSubscriptionSourceHealth({
    resultCode: input.resultCode,
    consecutiveErrorCount,
    errorMessage: input.errorMessage,
  });

  await input.controlDb.db
    .updateTable('subscription_schedule_state')
    .set({
      next_due_at: nextDueAt,
      last_checked_at: nowIso,
      last_completed_at: isError ? null : nowIso,
      last_result_code: input.resultCode,
      consecutive_noop_count: consecutiveNoopCount,
      consecutive_error_count: consecutiveErrorCount,
      starvation_score: 0,
      scheduler_notes_json: JSON.stringify({
        processed: normalizeInt(input.processed),
        inserted: normalizeInt(input.inserted),
        skipped: normalizeInt(input.skipped),
        trigger: String(input.trigger || '').trim() || null,
        error_message: input.errorMessage ? String(input.errorMessage).slice(0, 500) : null,
        source_health_state: sourceHealth.state,
        source_health_error_class: sourceHealth.errorClass,
        quarantine_candidate: sourceHealth.quarantineCandidate,
        consecutive_error_count: consecutiveErrorCount,
        next_due_at: nextDueAt,
      }),
      updated_at: nowIso,
    })
    .where('subscription_id', '=', subscriptionId)
    .execute();
}

export async function bootstrapOracleSubscriptionSchedulerState(input: {
  controlDb: OracleControlPlaneDb;
  subscriptions: OracleBootstrapSubscription[];
  nowIso?: string;
  scope?: string;
}) {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const scope = String(input.scope || 'all_active_subscriptions').trim() || 'all_active_subscriptions';
  const activeSubscriptions = input.subscriptions
    .filter((subscription) => String(subscription.id || '').trim())
    .map((subscription) => ({
      subscription_id: String(subscription.id).trim(),
      user_id: String(subscription.user_id || '').trim(),
      source_channel_id: String(subscription.source_channel_id || '').trim(),
      active: subscription.is_active === false ? 0 : 1,
      priority_tier: 'normal',
      next_due_at: resolveBootstrapNextDueAt(subscription, nowIso),
      last_checked_at: normalizeIsoOrNull(subscription.last_polled_at),
      last_completed_at: null,
      last_result_code: null,
      consecutive_noop_count: 0,
      consecutive_error_count: 0,
      starvation_score: 0,
      scheduler_notes_json: null,
      created_at: nowIso,
      updated_at: nowIso,
    }));
  const activeIds = activeSubscriptions.map((subscription) => subscription.subscription_id);

  await input.controlDb.db.transaction().execute(async (trx) => {
    for (const subscription of activeSubscriptions) {
      await trx
        .insertInto('subscription_schedule_state')
        .values(subscription)
        .onConflict((oc) => oc.column('subscription_id').doUpdateSet({
          user_id: subscription.user_id,
          source_channel_id: subscription.source_channel_id,
          active: subscription.active,
          priority_tier: subscription.priority_tier,
          updated_at: nowIso,
        }))
        .execute();
    }

    if (activeIds.length > 0) {
      await trx
        .updateTable('subscription_schedule_state')
        .set({
          active: 0,
          updated_at: nowIso,
        })
        .where('subscription_id', 'not in', activeIds)
        .execute();
    } else {
      await trx
        .updateTable('subscription_schedule_state')
        .set({
          active: 0,
          updated_at: nowIso,
        })
        .execute();
    }

    await trx
      .insertInto('scope_control_state')
      .values({
        scope,
        scheduler_enabled: 1,
        last_triggered_at: null,
        last_started_at: null,
        last_finished_at: null,
        last_success_at: null,
        min_interval_until: null,
        suppression_until: null,
        last_decision_code: 'bootstrap_only',
        last_queue_depth: null,
        last_result_summary_json: JSON.stringify({
          subscription_count: activeSubscriptions.length,
        }),
        updated_at: nowIso,
      })
      .onConflict((oc) => oc.column('scope').doUpdateSet({
        scheduler_enabled: 1,
        last_decision_code: 'bootstrap_only',
        last_result_summary_json: JSON.stringify({
          subscription_count: activeSubscriptions.length,
        }),
        updated_at: nowIso,
      }))
      .execute();
  });

  return {
    activeCount: activeSubscriptions.length,
  };
}

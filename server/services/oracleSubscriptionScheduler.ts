import type { OracleControlPlaneConfig } from './oracleControlPlaneConfig';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import {
  getOracleScopeControlState,
  listOracleDueSubscriptions,
  normalizeIsoOrNull,
  resolveOracleNextDueAtFromOutcome,
  type OracleScopeDecisionCode,
  type OracleSubscriptionSyncResultCode,
} from './oracleSubscriptionSchedulerState';

function parseDateMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type OracleShadowSchedulerDecision = {
  nowIso: string;
  oracleDecisionCode: OracleScopeDecisionCode;
  shouldEnqueue: boolean;
  dueSubscriptionCount: number;
  dueSubscriptionIds: string[];
  nextDueAt: string | null;
  minIntervalUntil: string | null;
  suppressionUntil: string | null;
  queueDepth: number | null;
};

export type OraclePrimarySchedulerDecision = OracleShadowSchedulerDecision & {
  actualDecisionCode:
    | 'actual_existing_job'
    | 'actual_min_interval'
    | 'actual_queue_backpressure'
    | 'actual_low_priority_suppressed'
    | 'actual_no_due_subscriptions'
    | 'actual_enqueued';
  retryAfterSeconds: number | null;
};

export function resolveOracleNextDueAt(input: {
  nowIso?: string;
  resultCode: OracleSubscriptionSyncResultCode;
  consecutiveNoopCount?: number;
  activeRevisitMs: number;
  normalRevisitMs: number;
  quietRevisitMs: number;
  errorRetryMs: number;
}) {
  return resolveOracleNextDueAtFromOutcome(input);
}

export function mapOracleSchedulerDecisionToActualCode(decisionCode: OracleScopeDecisionCode) {
  if (decisionCode === 'shadow_existing_job') return 'actual_existing_job' as const;
  if (decisionCode === 'shadow_min_interval') return 'actual_min_interval' as const;
  if (decisionCode === 'shadow_queue_backpressure') return 'actual_queue_backpressure' as const;
  if (decisionCode === 'shadow_low_priority_suppressed') return 'actual_low_priority_suppressed' as const;
  if (decisionCode === 'shadow_no_due_subscriptions') return 'actual_no_due_subscriptions' as const;
  if (decisionCode === 'shadow_enqueue') return 'actual_enqueued' as const;
  return null;
}

function resolveRetryAfterSeconds(targetIso: string | null, nowIso: string, fallbackSeconds: number | null = null) {
  const nowMs = Date.parse(nowIso);
  const targetMs = parseDateMs(targetIso);
  if (targetMs == null || !Number.isFinite(nowMs)) return fallbackSeconds;
  return Math.max(1, Math.ceil(Math.max(0, targetMs - nowMs) / 1000));
}

export async function evaluateOracleShadowSchedulerDecision(input: {
  controlDb: OracleControlPlaneDb;
  config: Pick<
    OracleControlPlaneConfig,
    'shadowBatchLimit' | 'shadowLookaheadMs'
  >;
  nowIso?: string;
  queueDepth?: number | null;
  queueDepthHardLimit?: number;
  queuePrioritySuppressed?: boolean;
  actualExistingJob?: { id: string; status: string } | null;
}) : Promise<OracleShadowSchedulerDecision> {
  const nowIso = normalizeIsoOrNull(input.nowIso) || new Date().toISOString();
  const scopeState = await getOracleScopeControlState({
    controlDb: input.controlDb,
    scope: 'all_active_subscriptions',
  });
  const dueSnapshot = await listOracleDueSubscriptions({
    controlDb: input.controlDb,
    nowIso,
    limit: input.config.shadowBatchLimit,
    lookaheadMs: input.config.shadowLookaheadMs,
  });
  const nowMs = Date.parse(nowIso);
  const minIntervalUntilMs = parseDateMs(scopeState?.minIntervalUntil || null);
  const suppressionUntilMs = parseDateMs(scopeState?.suppressionUntil || null);

  let oracleDecisionCode: OracleScopeDecisionCode = 'shadow_enqueue';
  if (scopeState && !scopeState.schedulerEnabled) {
    oracleDecisionCode = 'shadow_scheduler_disabled';
  } else if (input.actualExistingJob?.id) {
    oracleDecisionCode = 'shadow_existing_job';
  } else if (minIntervalUntilMs != null && minIntervalUntilMs > nowMs) {
    oracleDecisionCode = 'shadow_min_interval';
  } else if (suppressionUntilMs != null && suppressionUntilMs > nowMs) {
    oracleDecisionCode = 'shadow_low_priority_suppressed';
  } else if (
    input.queueDepth != null
    && input.queueDepthHardLimit != null
    && input.queueDepth >= input.queueDepthHardLimit
  ) {
    oracleDecisionCode = 'shadow_queue_backpressure';
  } else if (input.queuePrioritySuppressed) {
    oracleDecisionCode = 'shadow_low_priority_suppressed';
  } else if (dueSnapshot.dueCount <= 0) {
    oracleDecisionCode = 'shadow_no_due_subscriptions';
  }

  return {
    nowIso,
    oracleDecisionCode,
    shouldEnqueue: oracleDecisionCode === 'shadow_enqueue',
    dueSubscriptionCount: dueSnapshot.dueCount,
    dueSubscriptionIds: dueSnapshot.rows.map((row) => row.subscriptionId),
    nextDueAt: dueSnapshot.nextDueAt,
    minIntervalUntil: scopeState?.minIntervalUntil || null,
    suppressionUntil: scopeState?.suppressionUntil || null,
    queueDepth: input.queueDepth == null ? null : Math.max(0, Math.floor(input.queueDepth)),
  };
}

export async function evaluateOraclePrimarySchedulerDecision(input: {
  controlDb: OracleControlPlaneDb;
  config: Pick<
    OracleControlPlaneConfig,
    'schedulerTickMs' | 'shadowBatchLimit' | 'shadowLookaheadMs'
  >;
  nowIso?: string;
  queueDepth?: number | null;
  queueDepthHardLimit?: number;
  queuePrioritySuppressed?: boolean;
  actualExistingJob?: { id: string; status: string } | null;
}): Promise<OraclePrimarySchedulerDecision | null> {
  const shadowDecision = await evaluateOracleShadowSchedulerDecision(input);
  const actualDecisionCode = mapOracleSchedulerDecisionToActualCode(shadowDecision.oracleDecisionCode);
  if (!actualDecisionCode) return null;

  let retryAfterSeconds: number | null = null;
  if (shadowDecision.oracleDecisionCode === 'shadow_min_interval') {
    retryAfterSeconds = resolveRetryAfterSeconds(shadowDecision.minIntervalUntil, shadowDecision.nowIso);
  } else if (shadowDecision.oracleDecisionCode === 'shadow_low_priority_suppressed') {
    retryAfterSeconds = resolveRetryAfterSeconds(
      shadowDecision.suppressionUntil,
      shadowDecision.nowIso,
      Math.max(1, Math.ceil(input.config.schedulerTickMs / 1000)),
    );
  } else if (shadowDecision.oracleDecisionCode === 'shadow_no_due_subscriptions') {
    retryAfterSeconds = resolveRetryAfterSeconds(
      shadowDecision.nextDueAt,
      shadowDecision.nowIso,
      Math.max(1, Math.ceil(input.config.schedulerTickMs / 1000)),
    );
  } else if (shadowDecision.oracleDecisionCode === 'shadow_queue_backpressure') {
    retryAfterSeconds = 30;
  }

  return {
    ...shadowDecision,
    actualDecisionCode,
    retryAfterSeconds,
  };
}

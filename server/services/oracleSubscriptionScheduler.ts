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

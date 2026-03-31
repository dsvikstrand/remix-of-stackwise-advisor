import type { OracleControlPlaneDb } from './oracleControlPlaneDb';

export type OracleBootstrapSubscription = {
  id: string;
  user_id: string;
  source_channel_id: string;
  last_polled_at?: string | null;
  is_active?: boolean | null;
};

function normalizeIsoOrNull(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function resolveBootstrapNextDueAt(subscription: OracleBootstrapSubscription, nowIso: string) {
  return normalizeIsoOrNull(subscription.last_polled_at) || nowIso;
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
          next_due_at: subscription.next_due_at,
          last_checked_at: subscription.last_checked_at,
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

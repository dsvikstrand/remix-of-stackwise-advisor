import { refundReservation, reserveCredits, settleReservation } from './creditWallet';

type DbClient = any;

export const AUTO_UNLOCK_TOTAL_CENTS = 100;

export type AutoUnlockIntentStatus = 'reserved' | 'settled' | 'released' | 'ready';
export type AutoUnlockParticipantFundingStatus = 'held' | 'settled' | 'released';

export type AutoUnlockIntentRow = {
  id: string;
  source_item_id: string;
  source_page_id: string | null;
  unlock_id: string | null;
  source_channel_id: string | null;
  intent_owner_user_id: string | null;
  status: AutoUnlockIntentStatus;
  trigger: string | null;
  snapshot_count: number;
  funded_count: number;
  total_share_cents: number;
  job_id: string | null;
  blueprint_id: string | null;
  release_reason_code: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  settled_at: string | null;
  released_at: string | null;
  ready_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AutoUnlockParticipantRow = {
  id: string;
  intent_id: string;
  user_id: string;
  stable_sort_order: number;
  funding_status: AutoUnlockParticipantFundingStatus;
  share_cents: number;
  hold_idempotency_key: string;
  settle_idempotency_key: string;
  release_idempotency_key: string;
  hold_ledger_id: string | null;
  settle_ledger_id: string | null;
  release_ledger_id: string | null;
  release_reason_code: string | null;
  created_at: string;
  updated_at: string;
};

export type AutoUnlockReservationResult =
  | {
    state: 'reserved' | 'existing_intent';
    intent: AutoUnlockIntentRow;
    participants: AutoUnlockParticipantRow[];
    reservedNow: boolean;
    snapshotCount: number;
    fundedCount: number;
  }
  | {
    state: 'empty_funded_set' | 'invalid_source_item';
    reservedNow: false;
    intent: null;
    participants: [];
    snapshotCount: number;
    fundedCount: 0;
  };

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIntentRow(row: any): AutoUnlockIntentRow {
  return {
    id: String(row.id || '').trim(),
    source_item_id: String(row.source_item_id || '').trim(),
    source_page_id: row.source_page_id == null ? null : String(row.source_page_id || '').trim() || null,
    unlock_id: row.unlock_id == null ? null : String(row.unlock_id || '').trim() || null,
    source_channel_id: row.source_channel_id == null ? null : String(row.source_channel_id || '').trim() || null,
    intent_owner_user_id: row.intent_owner_user_id == null ? null : String(row.intent_owner_user_id || '').trim() || null,
    status: String(row.status || 'released').trim() as AutoUnlockIntentStatus,
    trigger: row.trigger == null ? null : String(row.trigger || '').trim() || null,
    snapshot_count: Math.max(0, Math.floor(asNumber(row.snapshot_count))),
    funded_count: Math.max(0, Math.floor(asNumber(row.funded_count))),
    total_share_cents: Math.max(0, Math.floor(asNumber(row.total_share_cents, AUTO_UNLOCK_TOTAL_CENTS))),
    job_id: row.job_id == null ? null : String(row.job_id || '').trim() || null,
    blueprint_id: row.blueprint_id == null ? null : String(row.blueprint_id || '').trim() || null,
    release_reason_code: row.release_reason_code == null ? null : String(row.release_reason_code || '').trim() || null,
    last_error_code: row.last_error_code == null ? null : String(row.last_error_code || '').trim() || null,
    last_error_message: row.last_error_message == null ? null : String(row.last_error_message || '').trim() || null,
    settled_at: row.settled_at == null ? null : String(row.settled_at || '').trim() || null,
    released_at: row.released_at == null ? null : String(row.released_at || '').trim() || null,
    ready_at: row.ready_at == null ? null : String(row.ready_at || '').trim() || null,
    created_at: String(row.created_at || '').trim(),
    updated_at: String(row.updated_at || '').trim(),
  };
}

function normalizeParticipantRow(row: any): AutoUnlockParticipantRow {
  return {
    id: String(row.id || '').trim(),
    intent_id: String(row.intent_id || '').trim(),
    user_id: String(row.user_id || '').trim(),
    stable_sort_order: Math.max(1, Math.floor(asNumber(row.stable_sort_order, 1))),
    funding_status: String(row.funding_status || 'held').trim() as AutoUnlockParticipantFundingStatus,
    share_cents: Math.max(0, Math.floor(asNumber(row.share_cents))),
    hold_idempotency_key: String(row.hold_idempotency_key || '').trim(),
    settle_idempotency_key: String(row.settle_idempotency_key || '').trim(),
    release_idempotency_key: String(row.release_idempotency_key || '').trim(),
    hold_ledger_id: row.hold_ledger_id == null ? null : String(row.hold_ledger_id || '').trim() || null,
    settle_ledger_id: row.settle_ledger_id == null ? null : String(row.settle_ledger_id || '').trim() || null,
    release_ledger_id: row.release_ledger_id == null ? null : String(row.release_ledger_id || '').trim() || null,
    release_reason_code: row.release_reason_code == null ? null : String(row.release_reason_code || '').trim() || null,
    created_at: String(row.created_at || '').trim(),
    updated_at: String(row.updated_at || '').trim(),
  };
}

export function computeAutoUnlockFundedShares(input: Array<{ userId: string; balance: number }>) {
  const normalized = Array.from(
    new Map(
      input
        .map((row) => ({
          userId: String(row.userId || '').trim(),
          balanceCents: Math.max(0, Math.floor(Math.round(asNumber(row.balance) * 100))),
        }))
        .filter((row) => row.userId)
        .sort((left, right) => left.userId.localeCompare(right.userId))
        .map((row) => [row.userId, row]),
    ).values(),
  );

  let working = normalized.slice();
  while (working.length > 0) {
    const base = Math.floor(AUTO_UNLOCK_TOTAL_CENTS / working.length);
    const leftover = AUTO_UNLOCK_TOTAL_CENTS - (base * working.length);
    const next = working.filter((row, index) => {
      const shareCents = base + (index < leftover ? 1 : 0);
      return row.balanceCents >= shareCents;
    });
    if (next.length === 0) {
      return {
        snapshotCount: normalized.length,
        fundedCount: 0,
        participants: [] as Array<{ userId: string; shareCents: number; sortOrder: number }>,
      };
    }
    if (next.length === working.length && next.every((row, index) => row.userId === working[index]?.userId)) {
      const settledBase = Math.floor(AUTO_UNLOCK_TOTAL_CENTS / next.length);
      const settledLeftover = AUTO_UNLOCK_TOTAL_CENTS - (settledBase * next.length);
      return {
        snapshotCount: normalized.length,
        fundedCount: next.length,
        participants: next.map((row, index) => ({
          userId: row.userId,
          shareCents: settledBase + (index < settledLeftover ? 1 : 0),
          sortOrder: index + 1,
        })),
      };
    }
    working = next;
  }

  return {
    snapshotCount: normalized.length,
    fundedCount: 0,
    participants: [] as Array<{ userId: string; shareCents: number; sortOrder: number }>,
  };
}

async function getAutoUnlockIntentById(db: DbClient, intentId: string) {
  const normalizedIntentId = String(intentId || '').trim();
  if (!normalizedIntentId) return null;
  const { data, error } = await db
    .from('source_auto_unlock_intents')
    .select('*')
    .eq('id', normalizedIntentId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeIntentRow(data) : null;
}

export async function getActiveAutoUnlockIntentBySourceItemId(db: DbClient, sourceItemId: string) {
  const normalizedSourceItemId = String(sourceItemId || '').trim();
  if (!normalizedSourceItemId) return null;
  const { data, error } = await db
    .from('source_auto_unlock_intents')
    .select('*')
    .eq('source_item_id', normalizedSourceItemId)
    .in('status', ['reserved', 'settled', 'ready'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeIntentRow(data) : null;
}

export async function listAutoUnlockParticipants(db: DbClient, intentId: string) {
  const normalizedIntentId = String(intentId || '').trim();
  if (!normalizedIntentId) return [] as AutoUnlockParticipantRow[];
  const { data, error } = await db
    .from('source_auto_unlock_participants')
    .select('*')
    .eq('intent_id', normalizedIntentId)
    .order('stable_sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => normalizeParticipantRow(row));
}

async function getWalletBalancesForUsers(db: DbClient, userIds: string[]) {
  const normalizedUserIds = Array.from(new Set(userIds.map((value) => String(value || '').trim()).filter(Boolean)));
  if (normalizedUserIds.length === 0) return new Map<string, number>();
  const { data, error } = await db
    .from('user_credit_wallets')
    .select('user_id, balance')
    .in('user_id', normalizedUserIds);
  if (error) throw error;
  const result = new Map<string, number>();
  for (const row of data || []) {
    const userId = String(row.user_id || '').trim();
    if (!userId) continue;
    result.set(userId, round2(asNumber(row.balance)));
  }
  return result;
}

async function createFallbackAutoUnlockIntent(db: DbClient, input: {
  sourceItemId: string;
  sourcePageId: string | null;
  unlockId: string | null;
  sourceChannelId: string | null;
  eligibleUserIds: string[];
  trigger: string;
  videoId: string;
}) {
  const balances = await getWalletBalancesForUsers(db, input.eligibleUserIds);
  const computed = computeAutoUnlockFundedShares(
    input.eligibleUserIds.map((userId) => ({
      userId,
      balance: balances.get(userId) ?? 0,
    })),
  );

  if (computed.fundedCount === 0) {
    return {
      state: 'empty_funded_set' as const,
      reservedNow: false,
      intent: null,
      participants: [] as [],
      snapshotCount: computed.snapshotCount,
      fundedCount: 0,
    };
  }

  const ownerUserId = computed.participants[0]?.userId || null;
  const { data: insertedIntent, error: intentError } = await db
    .from('source_auto_unlock_intents')
    .insert({
      source_item_id: input.sourceItemId,
      source_page_id: input.sourcePageId,
      unlock_id: input.unlockId,
      source_channel_id: input.sourceChannelId,
      intent_owner_user_id: ownerUserId,
      status: 'reserved',
      trigger: input.trigger,
      snapshot_count: computed.snapshotCount,
      funded_count: computed.fundedCount,
      total_share_cents: AUTO_UNLOCK_TOTAL_CENTS,
    })
    .select('*')
    .single();
  if (intentError) throw intentError;

  const intent = normalizeIntentRow(insertedIntent);
  const participantRows: AutoUnlockParticipantRow[] = [];
  for (const participant of computed.participants) {
    const amount = round2(participant.shareCents / 100);
    const holdKey = `auto_unlock:${intent.id}:user:${participant.userId}:hold`;
    const releaseKey = `auto_unlock:${intent.id}:user:${participant.userId}:release`;
    const settleKey = `auto_unlock:${intent.id}:user:${participant.userId}:settle`;
    const hold = await refundSafeReserve(db, {
      userId: participant.userId,
      amount,
      idempotencyKey: holdKey,
      sourceItemId: input.sourceItemId,
      sourcePageId: input.sourcePageId,
      unlockId: input.unlockId,
      intentId: intent.id,
      videoId: input.videoId,
    });
    if (!hold.ok) {
      await releaseAutoUnlockIntent(db, {
        intentId: intent.id,
        reasonCode: 'AUTO_UNLOCK_EMPTY_FUNDED_SET',
      });
      return {
        state: 'empty_funded_set' as const,
        reservedNow: false,
        intent: null,
        participants: [] as [],
        snapshotCount: computed.snapshotCount,
        fundedCount: 0,
      };
    }
    const { data: insertedParticipant, error: participantError } = await db
      .from('source_auto_unlock_participants')
      .insert({
        intent_id: intent.id,
        user_id: participant.userId,
        stable_sort_order: participant.sortOrder,
        funding_status: 'held',
        share_cents: participant.shareCents,
        hold_idempotency_key: holdKey,
        settle_idempotency_key: settleKey,
        release_idempotency_key: releaseKey,
        hold_ledger_id: hold.ledger_id,
      })
      .select('*')
      .single();
    if (participantError) throw participantError;
    participantRows.push(normalizeParticipantRow(insertedParticipant));
  }

  return {
    state: 'reserved' as const,
    reservedNow: true,
    intent,
    participants: participantRows,
    snapshotCount: computed.snapshotCount,
    fundedCount: computed.fundedCount,
  };
}

async function refundSafeReserve(db: DbClient, input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  sourceItemId: string;
  sourcePageId: string | null;
  unlockId: string | null;
  intentId: string;
  videoId: string;
}) {
  return reserveCredits(db, {
    userId: input.userId,
    amount: input.amount,
    idempotencyKey: input.idempotencyKey,
    reasonCode: 'AUTO_UNLOCK_HOLD',
    context: {
      source_item_id: input.sourceItemId,
      source_page_id: input.sourcePageId,
      unlock_id: input.unlockId,
      metadata: {
        intent_id: input.intentId,
        video_id: input.videoId,
        source: 'subscription_auto_unlock',
      },
    },
  });
}

export async function reserveAutoUnlockIntent(db: DbClient, input: {
  sourceItemId: string;
  sourcePageId: string | null;
  unlockId: string | null;
  sourceChannelId: string | null;
  eligibleUserIds: string[];
  trigger: string;
  videoId: string;
}) : Promise<AutoUnlockReservationResult> {
  const normalizedSourceItemId = String(input.sourceItemId || '').trim();
  if (!normalizedSourceItemId) {
    return {
      state: 'invalid_source_item',
      reservedNow: false,
      intent: null,
      participants: [],
      snapshotCount: 0,
      fundedCount: 0,
    };
  }

  if (typeof db?.rpc === 'function') {
    try {
      const { data, error } = await db.rpc('reserve_source_auto_unlock_intent', {
        p_source_item_id: normalizedSourceItemId,
        p_source_page_id: input.sourcePageId || null,
        p_unlock_id: input.unlockId || null,
        p_source_channel_id: input.sourceChannelId || null,
        p_video_id: input.videoId,
        p_trigger: input.trigger,
        p_eligible_user_ids: input.eligibleUserIds,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const state = String(row?.state || '').trim();
      if (state === 'empty_funded_set' || state === 'invalid_source_item') {
        return {
          state,
          reservedNow: false,
          intent: null,
          participants: [],
          snapshotCount: Math.max(0, Math.floor(asNumber(row?.snapshot_count))),
          fundedCount: 0,
        };
      }

      const intent = row?.intent_id
        ? await getAutoUnlockIntentById(db, String(row.intent_id))
        : null;
      if (!intent) {
        throw new Error('AUTO_UNLOCK_INTENT_NOT_FOUND');
      }
      const participants = await listAutoUnlockParticipants(db, intent.id);
      return {
        state: state === 'reserved' ? 'reserved' : 'existing_intent',
        intent,
        participants,
        reservedNow: Boolean(row?.reserved_now),
        snapshotCount: Math.max(0, Math.floor(asNumber(row?.snapshot_count, intent.snapshot_count))),
        fundedCount: Math.max(0, Math.floor(asNumber(row?.funded_count, intent.funded_count))),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/reserve_source_auto_unlock_intent/i.test(message) && !/rpc/i.test(message)) {
        throw error;
      }
    }
  }

  const existing = await getActiveAutoUnlockIntentBySourceItemId(db, normalizedSourceItemId);
  if (existing) {
    return {
      state: 'existing_intent',
      reservedNow: false,
      intent: existing,
      participants: await listAutoUnlockParticipants(db, existing.id),
      snapshotCount: existing.snapshot_count,
      fundedCount: existing.funded_count,
    };
  }

  return createFallbackAutoUnlockIntent(db, {
    sourceItemId: normalizedSourceItemId,
    sourcePageId: input.sourcePageId || null,
    unlockId: input.unlockId || null,
    sourceChannelId: input.sourceChannelId || null,
    eligibleUserIds: input.eligibleUserIds,
    trigger: input.trigger,
    videoId: input.videoId,
  });
}

export async function releaseAutoUnlockIntent(db: DbClient, input: {
  intentId: string;
  reasonCode: string;
  blueprintId?: string | null;
  jobId?: string | null;
  traceId?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
}) {
  const intent = await getAutoUnlockIntentById(db, input.intentId);
  if (!intent) return { intent: null, releasedCount: 0 };
  if (intent.status === 'released') return { intent, releasedCount: 0 };
  if (intent.status === 'settled' || intent.status === 'ready') {
    return { intent, releasedCount: 0 };
  }

  const participants = await listAutoUnlockParticipants(db, intent.id);
  let releasedCount = 0;
  for (const participant of participants) {
    if (participant.funding_status === 'released' || participant.funding_status === 'settled') continue;
    const amount = round2(participant.share_cents / 100);
    const release = await refundReservation(db, {
      userId: participant.user_id,
      amount,
      idempotencyKey: participant.release_idempotency_key,
      reasonCode: 'AUTO_UNLOCK_RELEASE',
      context: {
        source_item_id: intent.source_item_id,
        source_page_id: intent.source_page_id,
        unlock_id: intent.unlock_id,
        metadata: {
          intent_id: intent.id,
          blueprint_id: input.blueprintId || null,
          job_id: input.jobId || null,
          trace_id: input.traceId || null,
          reason_code: input.reasonCode,
          last_error_code: input.lastErrorCode || null,
        },
      },
    });
    await db
      .from('source_auto_unlock_participants')
      .update({
        funding_status: 'released',
        release_ledger_id: release.ledger_id || null,
        release_reason_code: input.reasonCode,
      })
      .eq('id', participant.id);
    releasedCount += 1;
  }

  const { data, error } = await db
    .from('source_auto_unlock_intents')
    .update({
      status: 'released',
      release_reason_code: input.reasonCode,
      last_error_code: input.lastErrorCode || null,
      last_error_message: input.lastErrorMessage || null,
      released_at: new Date().toISOString(),
      blueprint_id: input.blueprintId || null,
      job_id: input.jobId || null,
    })
    .eq('id', intent.id)
    .select('*')
    .single();
  if (error) throw error;
  return {
    intent: normalizeIntentRow(data),
    releasedCount,
  };
}

export async function settleAutoUnlockIntent(db: DbClient, input: {
  intentId: string;
  blueprintId?: string | null;
  jobId?: string | null;
  traceId?: string | null;
}) {
  const intent = await getAutoUnlockIntentById(db, input.intentId);
  if (!intent) return { intent: null, settledCount: 0 };
  if (intent.status === 'settled' || intent.status === 'ready') return { intent, settledCount: 0 };
  if (intent.status === 'released') return { intent, settledCount: 0 };

  const participants = await listAutoUnlockParticipants(db, intent.id);
  let settledCount = 0;
  for (const participant of participants) {
    if (participant.funding_status === 'settled') continue;
    if (participant.funding_status === 'released') continue;
    const amount = round2(participant.share_cents / 100);
    const settle = await settleReservation(db, {
      userId: participant.user_id,
      amount,
      idempotencyKey: participant.settle_idempotency_key,
      reasonCode: 'AUTO_UNLOCK_SETTLE',
      context: {
        source_item_id: intent.source_item_id,
        source_page_id: intent.source_page_id,
        unlock_id: intent.unlock_id,
        metadata: {
          intent_id: intent.id,
          blueprint_id: input.blueprintId || null,
          job_id: input.jobId || null,
          trace_id: input.traceId || null,
        },
      },
    });
    await db
      .from('source_auto_unlock_participants')
      .update({
        funding_status: 'settled',
        settle_ledger_id: settle.ledger_id || null,
      })
      .eq('id', participant.id);
    settledCount += 1;
  }

  const { data, error } = await db
    .from('source_auto_unlock_intents')
    .update({
      status: 'settled',
      settled_at: new Date().toISOString(),
      blueprint_id: input.blueprintId || null,
      job_id: input.jobId || null,
    })
    .eq('id', intent.id)
    .select('*')
    .single();
  if (error) throw error;
  return {
    intent: normalizeIntentRow(data),
    settledCount,
  };
}

export async function markAutoUnlockIntentReady(db: DbClient, input: {
  intentId: string;
  blueprintId: string;
  jobId?: string | null;
}) {
  const { data, error } = await db
    .from('source_auto_unlock_intents')
    .update({
      status: 'ready',
      blueprint_id: input.blueprintId,
      job_id: input.jobId || null,
      ready_at: new Date().toISOString(),
    })
    .eq('id', input.intentId)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeIntentRow(data);
}

import type { SupabaseClient } from '@supabase/supabase-js';

type DbClient = SupabaseClient<any, 'public', any>;

type WalletRow = {
  user_id: string;
  balance: string | number;
  capacity: string | number;
  refill_rate_per_sec: string | number;
  last_refill_at: string;
};

type LedgerRow = {
  id: string;
  user_id: string;
  delta: string | number;
  entry_type: 'grant' | 'hold' | 'settle' | 'refund' | 'adjust';
  reason_code: string;
  source_item_id: string | null;
  source_page_id: string | null;
  unlock_id: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const DEFAULT_CAPACITY = clampNumber(process.env.CREDIT_WALLET_CAPACITY, 10, 1, 10_000);
const FREE_DAILY_GRANT = clampNumber(process.env.CREDIT_WALLET_FREE_DAILY_GRANT, 3, 0.01, 10_000);
const PLUS_DAILY_GRANT = clampNumber(process.env.CREDIT_WALLET_PLUS_DAILY_GRANT, 20, 0.01, 10_000);
const ADMIN_DAILY_GRANT = clampNumber(process.env.CREDIT_WALLET_ADMIN_DAILY_GRANT, PLUS_DAILY_GRANT, 0.01, 10_000);
const DEFAULT_REFILL_RATE_PER_SEC = 0;
const DEFAULT_INITIAL_BALANCE = round2(Math.min(
  DEFAULT_CAPACITY,
  clampNumber(process.env.CREDIT_WALLET_INITIAL_BALANCE, FREE_DAILY_GRANT, 0, DEFAULT_CAPACITY),
));
const CREDITS_BYPASS = /^(1|true|yes)$/i.test(process.env.AI_CREDITS_BYPASS ?? '');

function clampNumber(raw: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function asNumber(value: string | number | null | undefined, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function getNowIso() {
  return new Date().toISOString();
}

function computeDailyWindow(nowMs: number) {
  const now = new Date(nowMs);
  const windowStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
  const nextReset = new Date(windowStart.getTime());
  nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  return {
    windowStartIso: windowStart.toISOString(),
    nextResetIso: nextReset.toISOString(),
    usageDay: windowStart.toISOString().slice(0, 10),
    secondsToReset: Math.max(0, Math.ceil((nextReset.getTime() - nowMs) / 1000)),
  };
}

function isBeforeWindow(lastRefillAt: string, windowStartIso: string) {
  const lastMs = Date.parse(lastRefillAt);
  const windowStartMs = Date.parse(windowStartIso);
  if (!Number.isFinite(windowStartMs)) return false;
  if (!Number.isFinite(lastMs)) return true;
  return lastMs < windowStartMs;
}

type WalletEntitlement = {
  plan: 'free' | 'plus' | 'admin';
  dailyGrant: number;
  bypass: boolean;
};

async function resolveWalletEntitlement(db: DbClient, userId: string): Promise<WalletEntitlement> {
  const fallback: WalletEntitlement = {
    plan: 'free',
    dailyGrant: round2(FREE_DAILY_GRANT),
    bypass: CREDITS_BYPASS,
  };
  if (!db || typeof (db as { rpc?: unknown }).rpc !== 'function') {
    return fallback;
  }

  try {
    const { data, error } = await db.rpc('get_generation_plan_for_user', {
      p_user_id: userId,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    const normalizedPlan = String((row as { plan?: unknown } | null)?.plan || 'free').trim().toLowerCase();
    const plan = normalizedPlan === 'admin' ? 'admin' : normalizedPlan === 'plus' ? 'plus' : 'free';
    const overrideValue = (row as { daily_limit_override?: unknown } | null)?.daily_limit_override;
    const overrideRaw = (
      overrideValue === null
      || overrideValue === undefined
      || String(overrideValue).trim() === ''
    )
      ? NaN
      : Number(overrideValue);
    const override = Number.isFinite(overrideRaw) ? overrideRaw : null;
    const defaultGrant = plan === 'plus' ? PLUS_DAILY_GRANT : plan === 'admin' ? ADMIN_DAILY_GRANT : FREE_DAILY_GRANT;
    const dailyGrant = round2(override != null && override >= 0 ? override : defaultGrant);
    return {
      plan,
      dailyGrant,
      bypass: CREDITS_BYPASS || plan === 'admin',
    };
  } catch {
    return fallback;
  }
}

async function getLedgerByIdempotencyKey(db: DbClient, idempotencyKey: string) {
  const key = String(idempotencyKey || '').trim();
  if (!key) return null;
  const { data, error } = await db
    .from('credit_ledger')
    .select('id, user_id, delta, entry_type, reason_code, source_item_id, source_page_id, unlock_id, idempotency_key, metadata, created_at')
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as LedgerRow | null;
}

export type CreditWalletSnapshot = {
  user_id: string;
  balance: number;
  capacity: number;
  refill_rate_per_sec: number;
  last_refill_at: string;
  seconds_to_full: number;
  daily_grant: number;
  next_reset_at: string;
  seconds_to_reset: number;
  plan: 'free' | 'plus' | 'admin';
  bypass: boolean;
};

export type CreditReserveSuccess = {
  ok: true;
  ledger_id: string | null;
  reserved_amount: number;
  wallet: CreditWalletSnapshot;
  bypass: boolean;
};

export type CreditReserveInsufficient = {
  ok: false;
  reason: 'insufficient';
  required: number;
  wallet: CreditWalletSnapshot;
};

export type CreditReserveResult = CreditReserveSuccess | CreditReserveInsufficient;

export type CreditLedgerContext = {
  source_item_id?: string | null;
  source_page_id?: string | null;
  unlock_id?: string | null;
  metadata?: Record<string, unknown>;
};

async function ensureWalletRow(db: DbClient, userId: string) {
  const nowMs = Date.now();
  const { windowStartIso } = computeDailyWindow(nowMs);
  const entitlement = await resolveWalletEntitlement(db, userId);
  const { error } = await db
    .from('user_credit_wallets')
    .upsert({
      user_id: userId,
      balance: entitlement.dailyGrant || DEFAULT_INITIAL_BALANCE,
      capacity: entitlement.dailyGrant || DEFAULT_CAPACITY,
      refill_rate_per_sec: DEFAULT_REFILL_RATE_PER_SEC,
      last_refill_at: windowStartIso,
    }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (error) throw error;
}

async function getWalletRow(db: DbClient, userId: string) {
  const { data, error } = await db
    .from('user_credit_wallets')
    .select('user_id, balance, capacity, refill_rate_per_sec, last_refill_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as WalletRow | null;
}

async function updateWalletRefill(db: DbClient, input: {
  userId: string;
  fromLastRefillAt: string;
  fromBalance: number;
  nextBalance: number;
  nextCapacity: number;
  nowIso: string;
}) {
  const { data, error } = await db
    .from('user_credit_wallets')
    .update({
      balance: round2(input.nextBalance),
      capacity: round2(input.nextCapacity),
      refill_rate_per_sec: DEFAULT_REFILL_RATE_PER_SEC,
      last_refill_at: input.nowIso,
    })
    .eq('user_id', input.userId)
    .eq('last_refill_at', input.fromLastRefillAt)
    .eq('balance', round2(input.fromBalance))
    .select('user_id, balance, capacity, refill_rate_per_sec, last_refill_at')
    .maybeSingle();
  if (error) throw error;
  return (data || null) as WalletRow | null;
}

function toSnapshot(row: WalletRow, entitlement: WalletEntitlement): CreditWalletSnapshot {
  const nowMs = Date.now();
  const dailyWindow = computeDailyWindow(nowMs);
  const balance = round2(asNumber(row.balance));
  const capacity = round2(asNumber(row.capacity, entitlement.dailyGrant || DEFAULT_CAPACITY));
  const refillRate = round6(asNumber(row.refill_rate_per_sec, DEFAULT_REFILL_RATE_PER_SEC));
  return {
    user_id: row.user_id,
    balance,
    capacity,
    refill_rate_per_sec: refillRate,
    last_refill_at: row.last_refill_at,
    seconds_to_full: 0,
    daily_grant: round2(entitlement.dailyGrant),
    next_reset_at: dailyWindow.nextResetIso,
    seconds_to_reset: dailyWindow.secondsToReset,
    plan: entitlement.plan,
    bypass: entitlement.bypass,
  };
}

async function refreshWallet(db: DbClient, userId: string) {
  await ensureWalletRow(db, userId);
  let row = await getWalletRow(db, userId);
  if (!row) {
    throw new Error('WALLET_NOT_FOUND');
  }

  let entitlement = await resolveWalletEntitlement(db, userId);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nowIso = getNowIso();
    const dailyWindow = computeDailyWindow(Date.now());
    const currentBalance = round2(asNumber(row.balance));
    const currentCapacity = round2(asNumber(row.capacity, entitlement.dailyGrant || DEFAULT_CAPACITY));
    const targetCapacity = round2(entitlement.dailyGrant);
    const shouldReset = isBeforeWindow(row.last_refill_at, dailyWindow.windowStartIso);
    const nextBalance = shouldReset
      ? targetCapacity
      : round2(Math.min(targetCapacity, Math.max(0, currentBalance)));
    const balanceChanged = nextBalance !== currentBalance;
    const capacityChanged = currentCapacity !== targetCapacity;

    if (!balanceChanged && !capacityChanged && row.last_refill_at === dailyWindow.windowStartIso) {
      return {
        row,
        snapshot: toSnapshot(row, entitlement),
      };
    }
    if (!balanceChanged && !capacityChanged && !shouldReset) {
      return {
        row,
        snapshot: toSnapshot({
          ...row,
          capacity: targetCapacity,
        }, entitlement),
      };
    }

    const updated = await updateWalletRefill(db, {
      userId,
      fromLastRefillAt: row.last_refill_at,
      fromBalance: currentBalance,
      nextBalance,
      nowIso: shouldReset ? dailyWindow.windowStartIso : nowIso,
      nextCapacity: targetCapacity,
    });

    if (updated) {
      row = updated;
      return {
        row,
        snapshot: toSnapshot(updated, entitlement),
      };
    }

    const latest = await getWalletRow(db, userId);
    if (latest) {
      row = latest;
      entitlement = await resolveWalletEntitlement(db, userId);
      continue;
    }
  }

  row = (await getWalletRow(db, userId)) as WalletRow;
  return {
    row,
    snapshot: toSnapshot(row, entitlement),
  };
}

async function insertLedgerEntry(db: DbClient, input: {
  userId: string;
  delta: number;
  entryType: LedgerRow['entry_type'];
  reasonCode: string;
  idempotencyKey: string;
  context?: CreditLedgerContext;
}) {
  const { data, error } = await db
    .from('credit_ledger')
    .insert({
      user_id: input.userId,
      delta: round2(input.delta),
      entry_type: input.entryType,
      reason_code: input.reasonCode,
      source_item_id: input.context?.source_item_id || null,
      source_page_id: input.context?.source_page_id || null,
      unlock_id: input.context?.unlock_id || null,
      idempotency_key: input.idempotencyKey,
      metadata: input.context?.metadata || {},
    })
    .select('id, user_id, delta, entry_type, reason_code, source_item_id, source_page_id, unlock_id, idempotency_key, metadata, created_at')
    .single();

  if (error) {
    const code = String((error as { code?: string }).code || '').trim();
    if (code === '23505') {
      const existing = await getLedgerByIdempotencyKey(db, input.idempotencyKey);
      if (existing) return existing;
    }
    throw error;
  }

  return data as LedgerRow;
}

export async function getWallet(db: DbClient, userId: string): Promise<CreditWalletSnapshot> {
  const { snapshot } = await refreshWallet(db, userId);
  return snapshot;
}

export async function reserveCredits(db: DbClient, input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  reasonCode: string;
  context?: CreditLedgerContext;
}): Promise<CreditReserveResult> {
  const userId = String(input.userId || '').trim();
  const amount = round2(Math.max(0, Number(input.amount || 0)));
  if (!userId) throw new Error('AUTH_REQUIRED');
  if (!(amount > 0)) throw new Error('INVALID_RESERVE_AMOUNT');

  const entitlement = await resolveWalletEntitlement(db, userId);
  if (entitlement.bypass) {
    const wallet = await getWallet(db, userId);
    return {
      ok: true,
      ledger_id: null,
      reserved_amount: amount,
      wallet,
      bypass: true,
    };
  }

  const existingLedger = await getLedgerByIdempotencyKey(db, input.idempotencyKey);
  if (existingLedger && existingLedger.entry_type === 'hold') {
    const wallet = await getWallet(db, userId);
    return {
      ok: true,
      ledger_id: existingLedger.id,
      reserved_amount: Math.abs(round2(asNumber(existingLedger.delta))),
      wallet,
      bypass: false,
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const refreshed = await refreshWallet(db, userId);
    const currentRow = refreshed.row;
    const currentBalance = round2(asNumber(currentRow.balance));

    if (currentBalance < amount) {
      return {
        ok: false,
        reason: 'insufficient',
        required: amount,
        wallet: refreshed.snapshot,
      };
    }

    const nowIso = getNowIso();
    const nextBalance = round2(currentBalance - amount);
    const { data: updatedWallet, error: updateError } = await db
      .from('user_credit_wallets')
      .update({
        balance: nextBalance,
        last_refill_at: nowIso,
      })
      .eq('user_id', userId)
      .eq('balance', currentBalance)
      .eq('last_refill_at', currentRow.last_refill_at)
      .select('user_id, balance, capacity, refill_rate_per_sec, last_refill_at')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updatedWallet) continue;

    try {
      const entitlement = await resolveWalletEntitlement(db, userId);
      const ledger = await insertLedgerEntry(db, {
        userId,
        delta: -amount,
        entryType: 'hold',
        reasonCode: input.reasonCode,
        idempotencyKey: input.idempotencyKey,
        context: input.context,
      });

      const wallet = toSnapshot(updatedWallet as WalletRow, entitlement);
      return {
        ok: true,
        ledger_id: ledger.id,
        reserved_amount: amount,
        wallet,
        bypass: false,
      };
    } catch (error) {
      await db
        .from('user_credit_wallets')
        .update({
          balance: round2(nextBalance + amount),
          last_refill_at: nowIso,
        })
        .eq('user_id', userId)
        .eq('balance', nextBalance);
      throw error;
    }
  }

  const wallet = await getWallet(db, userId);
  if (wallet.balance < amount) {
    return {
      ok: false,
      reason: 'insufficient',
      required: amount,
      wallet,
    };
  }
  throw new Error('WALLET_RESERVE_CONFLICT');
}

export async function settleReservation(db: DbClient, input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  reasonCode: string;
  context?: CreditLedgerContext;
}) {
  const amount = round2(Math.max(0, Number(input.amount || 0)));
  if (!(amount >= 0)) throw new Error('INVALID_SETTLE_AMOUNT');
  const entitlement = await resolveWalletEntitlement(db, input.userId);
  if (entitlement.bypass) {
    return { bypass: true, ledger_id: null };
  }

  const ledger = await insertLedgerEntry(db, {
    userId: input.userId,
    delta: 0,
    entryType: 'settle',
    reasonCode: input.reasonCode,
    idempotencyKey: input.idempotencyKey,
    context: {
      ...(input.context || {}),
      metadata: {
        ...(input.context?.metadata || {}),
        settled_amount: amount,
      },
    },
  });

  return {
    bypass: false,
    ledger_id: ledger.id,
  };
}

export async function refundReservation(db: DbClient, input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  reasonCode: string;
  context?: CreditLedgerContext;
}) {
  const amount = round2(Math.max(0, Number(input.amount || 0)));
  if (!(amount > 0)) throw new Error('INVALID_REFUND_AMOUNT');

  const entitlement = await resolveWalletEntitlement(db, input.userId);
  if (entitlement.bypass) {
    return {
      bypass: true,
      ledger_id: null,
      wallet: await getWallet(db, input.userId),
    };
  }

  const existing = await getLedgerByIdempotencyKey(db, input.idempotencyKey);
  if (existing && existing.entry_type === 'refund') {
    return {
      bypass: false,
      ledger_id: existing.id,
      wallet: await getWallet(db, input.userId),
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const refreshed = await refreshWallet(db, input.userId);
    const row = refreshed.row;
    const balance = round2(asNumber(row.balance));
    const capacity = round2(asNumber(row.capacity));
    const nowIso = getNowIso();
    const nextBalance = round2(Math.min(capacity, balance + amount));

    const { data: updated, error: updateError } = await db
      .from('user_credit_wallets')
      .update({
        balance: nextBalance,
        last_refill_at: nowIso,
      })
      .eq('user_id', input.userId)
      .eq('balance', balance)
      .eq('last_refill_at', row.last_refill_at)
      .select('user_id, balance, capacity, refill_rate_per_sec, last_refill_at')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) continue;

    const entitlement = await resolveWalletEntitlement(db, input.userId);
    const ledger = await insertLedgerEntry(db, {
      userId: input.userId,
      delta: amount,
      entryType: 'refund',
      reasonCode: input.reasonCode,
      idempotencyKey: input.idempotencyKey,
      context: input.context,
    });

    return {
      bypass: false,
      ledger_id: ledger.id,
      wallet: toSnapshot(updated as WalletRow, entitlement),
    };
  }

  throw new Error('WALLET_REFUND_CONFLICT');
}

export async function consumeFlatCredit(db: DbClient, input: {
  userId: string;
  amount?: number;
  reasonCode: string;
  idempotencyKey: string;
  context?: CreditLedgerContext;
}): Promise<CreditReserveResult> {
  const amount = round2(Math.max(0.01, Number(input.amount ?? 1)));
  const hold = await reserveCredits(db, {
    userId: input.userId,
    amount,
    idempotencyKey: `${input.idempotencyKey}:hold`,
    reasonCode: `${input.reasonCode}_HOLD`,
    context: input.context,
  });

  if (!hold.ok) return hold;

  await settleReservation(db, {
    userId: input.userId,
    amount,
    idempotencyKey: `${input.idempotencyKey}:settle`,
    reasonCode: `${input.reasonCode}_SETTLE`,
    context: input.context,
  });

  return hold;
}

export function getWalletDefaults() {
  return {
    capacity: round2(FREE_DAILY_GRANT),
    daily_grant_free: round2(FREE_DAILY_GRANT),
    daily_grant_plus: round2(PLUS_DAILY_GRANT),
    daily_grant_admin: round2(ADMIN_DAILY_GRANT),
    refill_rate_per_sec: DEFAULT_REFILL_RATE_PER_SEC,
    initial_balance: DEFAULT_INITIAL_BALANCE,
    bypass: CREDITS_BYPASS,
  };
}

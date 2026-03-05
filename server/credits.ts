import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { consumeFlatCredit, getWallet, getWalletDefaults, type CreditLedgerContext } from './services/creditWallet';

type UsageState = {
  global: {
    timestamps: number[];
  };
};

const GLOBAL_WINDOW_MS = Number(process.env.AI_GLOBAL_WINDOW_MS) || 10 * 60 * 1000;
const GLOBAL_MAX = Number(process.env.AI_GLOBAL_MAX) || 25;
const CREDITS_UNAVAILABLE_ERROR_CODE = 'CREDITS_UNAVAILABLE' as const;

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

let serviceClient: SupabaseClient<any, 'public', any> | null = null;

const state: UsageState = {
  global: {
    timestamps: [],
  },
};

function getServiceClient() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  if (!serviceClient) {
    serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  }
  return serviceClient;
}

function pruneGlobal(nowMs: number) {
  state.global.timestamps = state.global.timestamps.filter((ts) => nowMs - ts <= GLOBAL_WINDOW_MS);
}

function nextResetAtFromWallet(secondsToFull: number) {
  const seconds = Math.max(0, Number(secondsToFull || 0));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || '').trim();
  return message || fallback;
}

export class CreditsUnavailableError extends Error {
  readonly code = CREDITS_UNAVAILABLE_ERROR_CODE;
  constructor(message = 'Credits backend unavailable.') {
    super(message);
    this.name = 'CreditsUnavailableError';
  }
}

function throwCreditsUnavailable(message: string): never {
  throw new CreditsUnavailableError(message);
}

export async function getCredits(userId: string) {
  const db = getServiceClient();
  const defaults = getWalletDefaults();
  if (!db) {
    throwCreditsUnavailable('SUPABASE_SERVICE_ROLE_KEY is missing for credits backend.');
  }

  try {
    const wallet = await getWallet(db, userId);
    return {
      remaining: wallet.balance,
      limit: wallet.capacity,
      resetAt: nextResetAtFromWallet(wallet.seconds_to_full),
      bypass: wallet.bypass,
      balance: wallet.balance,
      capacity: wallet.capacity,
      refill_rate_per_sec: wallet.refill_rate_per_sec,
      seconds_to_full: wallet.seconds_to_full,
      credits_backend_mode: wallet.bypass ? 'bypass' : 'db',
      credits_backend_ok: true,
      credits_backend_error: null,
      credits_backend_defaults: {
        capacity: defaults.capacity,
        refill_rate_per_sec: defaults.refill_rate_per_sec,
      },
    };
  } catch (error) {
    throwCreditsUnavailable(normalizeErrorMessage(error, 'Failed to read credits wallet.'));
  }
}

export async function consumeCredit(
  userId: string,
  input?: {
    amount?: number;
    reasonCode?: string;
    idempotencyKey?: string;
    context?: CreditLedgerContext;
  },
) {
  const db = getServiceClient();
  if (!db) {
    return {
      ok: false as const,
      reason: 'service' as const,
      errorCode: CREDITS_UNAVAILABLE_ERROR_CODE,
      message: 'Credits backend unavailable.',
    };
  }

  const nowMs = Date.now();
  pruneGlobal(nowMs);
  if (state.global.timestamps.length >= GLOBAL_MAX) {
    const oldest = state.global.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + GLOBAL_WINDOW_MS - nowMs) / 1000));
    return {
      ok: false as const,
      reason: 'global' as const,
      retryAfterSeconds,
    };
  }

  const amount = Math.max(0.001, Number(input?.amount ?? 1));
  const reasonCode = String(input?.reasonCode || 'AI_FLAT').trim() || 'AI_FLAT';
  const idempotencyKey = String(input?.idempotencyKey || `${reasonCode}:${userId}:${randomUUID()}`).trim();

  let consumed;
  try {
    consumed = await consumeFlatCredit(db, {
      userId,
      amount,
      reasonCode,
      idempotencyKey,
      context: input?.context,
    });
  } catch (error) {
    return {
      ok: false as const,
      reason: 'service' as const,
      errorCode: CREDITS_UNAVAILABLE_ERROR_CODE,
      message: normalizeErrorMessage(error, 'Credits backend unavailable.'),
    };
  }

  if (!consumed.ok) {
    return {
      ok: false as const,
      reason: 'user' as const,
      remaining: consumed.wallet.balance,
      limit: consumed.wallet.capacity,
      resetAt: nextResetAtFromWallet(consumed.wallet.seconds_to_full),
      balance: consumed.wallet.balance,
      capacity: consumed.wallet.capacity,
      refill_rate_per_sec: consumed.wallet.refill_rate_per_sec,
      seconds_to_full: consumed.wallet.seconds_to_full,
    };
  }

  state.global.timestamps.push(nowMs);

  const wallet = consumed.wallet;
  return {
    ok: true as const,
    remaining: wallet.balance,
    limit: wallet.capacity,
    resetAt: nextResetAtFromWallet(wallet.seconds_to_full),
    bypass: wallet.bypass,
    balance: wallet.balance,
    capacity: wallet.capacity,
    refill_rate_per_sec: wallet.refill_rate_per_sec,
    seconds_to_full: wallet.seconds_to_full,
  };
}

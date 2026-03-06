import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';

export type CreditsResponse = {
  remaining: number;
  limit: number;
  resetAt: string;
  bypass?: boolean;
  balance?: number;
  capacity?: number;
  daily_grant?: number;
  next_reset_at?: string;
  seconds_to_reset?: number;
  plan?: 'free' | 'plus' | 'admin' | string | null;
  refill_rate_per_sec?: number;
  seconds_to_full?: number;
  generation_daily_limit?: number | null;
  generation_daily_effective_limit?: number | null;
  generation_daily_used?: number | null;
  generation_daily_remaining?: number | null;
  generation_daily_reset_at?: string | null;
  generation_daily_bypass?: boolean | null;
  generation_plan?: 'free' | 'plus' | 'admin' | string | null;
  credits_backend_mode?: 'db' | 'bypass' | 'unavailable' | string;
  credits_backend_ok?: boolean;
  credits_backend_error?: string | null;
};

export type AiCreditsView = CreditsResponse & {
  displayBalance: number;
  displayCapacity: number;
  secondsToNextCredit: number | null;
  nextRefillLabel: string;
};

export type UseAiCreditsOptions = {
  enabled: boolean;
  refetchIntervalMs?: number | false;
};

function formatDurationShort(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function toAiCreditsView(credits: CreditsResponse): AiCreditsView {
  const displayBalance = Number(credits.balance ?? credits.remaining ?? 0);
  const displayCapacity = Math.max(0.001, Number(credits.capacity ?? credits.limit ?? 0));
  const secondsPerCredit = Number.isFinite(Number(credits.seconds_to_reset))
    ? Math.max(0, Math.floor(Number(credits.seconds_to_reset)))
    : null;
  const secondsToNextCredit = credits.bypass
    ? null
    : displayBalance >= displayCapacity - 0.0005
      ? 0
      : secondsPerCredit;
  const nextRefillLabel = credits.bypass
    ? 'Unlimited'
    : secondsPerCredit === 0
      ? 'Full'
      : secondsToNextCredit === null
        ? 'Reset unknown'
        : `Reset in ${formatDurationShort(secondsToNextCredit)}`;

  return {
    ...credits,
    displayBalance,
    displayCapacity,
    secondsToNextCredit,
    nextRefillLabel,
  };
}

function toFallbackCreditsFromWallet(wallet: {
  balance: number;
  capacity: number;
  refill_rate_per_sec: number;
  last_refill_at: string;
}): CreditsResponse {
  const nowMs = Date.now();
  const nextReset = new Date();
  nextReset.setUTCHours(24, 0, 0, 0);
  const secondsToReset = Math.max(0, Math.ceil((nextReset.getTime() - nowMs) / 1000));

  return {
    remaining: wallet.balance,
    limit: wallet.capacity,
    resetAt: nextReset.toISOString(),
    bypass: false,
    balance: wallet.balance,
    capacity: wallet.capacity,
    daily_grant: wallet.capacity,
    next_reset_at: nextReset.toISOString(),
    seconds_to_reset: secondsToReset,
    plan: null,
    refill_rate_per_sec: wallet.refill_rate_per_sec,
    seconds_to_full: 0,
    generation_daily_limit: wallet.capacity,
    generation_daily_effective_limit: wallet.capacity,
    generation_daily_used: Math.max(0, Number((wallet.capacity - wallet.balance).toFixed(2))),
    generation_daily_remaining: wallet.balance,
    generation_daily_reset_at: nextReset.toISOString(),
    generation_daily_bypass: false,
    generation_plan: null,
  };
}

async function fetchCreditsFromWalletFallback(): Promise<CreditsResponse> {
  const { data: wallet, error } = await supabase
    .from('user_credit_wallets')
    .select('balance, capacity, refill_rate_per_sec, last_refill_at')
    .maybeSingle();

  if (error) {
    throw new Error('Unable to load credits');
  }

  if (!wallet) {
    throw new Error('Unable to load credits');
  }

  return toFallbackCreditsFromWallet({
    balance: Number(wallet.balance || 0),
    capacity: Number(wallet.capacity || 0),
    refill_rate_per_sec: Number(wallet.refill_rate_per_sec || 0),
    last_refill_at: String(wallet.last_refill_at || new Date().toISOString()),
  });
}

async function fetchCredits(): Promise<CreditsResponse> {
  if (!config.agenticBackendUrl) {
    return fetchCreditsFromWalletFallback();
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated');
  }

  const url = `${config.agenticBackendUrl!.replace(/\/$/, '')}/api/credits`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorCode = '';
      let message = 'Unable to load credits';
      try {
        const payload = await response.json() as { error_code?: string; error?: string; message?: string };
        errorCode = String(payload.error_code || '').trim().toUpperCase();
        message = String(payload.message || payload.error || message);
      } catch {
        // Ignore json parse failures and keep fallback message.
      }
      if (errorCode === 'CREDITS_UNAVAILABLE') {
        throw new Error('CREDITS_UNAVAILABLE');
      }
      throw new Error(message);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function getAiCreditsRefetchIntervalMs(input?: number | false) {
  if (input === false || input == null) return false;
  const parsed = Math.max(0, Math.floor(Number(input) || 0));
  return parsed > 0 ? parsed : false;
}

export function useAiCredits(options: UseAiCreditsOptions) {
  return useQuery({
    queryKey: ['ai-credits'],
    queryFn: fetchCredits,
    enabled: options.enabled,
    staleTime: 60_000,
    refetchInterval: getAiCreditsRefetchIntervalMs(options.refetchIntervalMs),
    select: toAiCreditsView,
  });
}

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
  const refillRate = Math.max(0, Number(credits.refill_rate_per_sec ?? 0));
  const atCapacity = !credits.bypass && displayBalance >= displayCapacity - 0.0005;
  const secondsPerCredit = refillRate > 0 ? Math.max(1, Math.ceil(1 / refillRate)) : null;
  const secondsToNextCredit = credits.bypass
    ? null
    : atCapacity
      ? 0
      : secondsPerCredit;
  const nextRefillLabel = credits.bypass
    ? 'Unlimited'
    : atCapacity
      ? 'Full'
      : secondsToNextCredit === null
        ? 'Refill unknown'
        : `+1 in ${formatDurationShort(secondsToNextCredit)}`;

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
  const lastMs = Number.isFinite(Date.parse(wallet.last_refill_at)) ? Date.parse(wallet.last_refill_at) : nowMs;
  const elapsedSeconds = Math.max(0, (nowMs - lastMs) / 1000);
  const refilledBalance = Math.min(
    wallet.capacity,
    Math.max(0, wallet.balance + elapsedSeconds * Math.max(0, wallet.refill_rate_per_sec)),
  );
  const remainingToFull = Math.max(0, wallet.capacity - refilledBalance);
  const secondsToFull = wallet.refill_rate_per_sec > 0
    ? Math.ceil(remainingToFull / wallet.refill_rate_per_sec)
    : 0;

  return {
    remaining: refilledBalance,
    limit: wallet.capacity,
    resetAt: new Date(nowMs + Math.max(0, secondsToFull) * 1000).toISOString(),
    bypass: false,
    balance: refilledBalance,
    capacity: wallet.capacity,
    refill_rate_per_sec: wallet.refill_rate_per_sec,
    seconds_to_full: Math.max(0, secondsToFull),
    generation_daily_limit: null,
    generation_daily_effective_limit: null,
    generation_daily_used: null,
    generation_daily_remaining: null,
    generation_daily_reset_at: null,
    generation_daily_bypass: null,
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

export function useAiCredits(enabled: boolean) {
  return useQuery({
    queryKey: ['ai-credits'],
    queryFn: fetchCredits,
    enabled,
    staleTime: 15_000,
    refetchInterval: 15_000,
    select: toAiCreditsView,
  });
}

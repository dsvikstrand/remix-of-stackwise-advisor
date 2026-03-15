import type { TranscriptProvider } from '../transcript/types';

const DEFAULT_TIMEDTEXT_COOLDOWN_SECONDS = 600;

const providerCooldownUntilMs = new Map<TranscriptProvider, number>();

function getTimedtextCooldownMs() {
  const raw = Number(process.env.TRANSCRIPT_YOUTUBE_TIMEDTEXT_COOLDOWN_SECONDS);
  const seconds = Number.isFinite(raw)
    ? Math.max(5, Math.floor(raw))
    : DEFAULT_TIMEDTEXT_COOLDOWN_SECONDS;
  return seconds * 1000;
}

export function getTranscriptProviderCooldownUntil(provider: TranscriptProvider, nowMs = Date.now()) {
  const untilMs = providerCooldownUntilMs.get(provider);
  if (!Number.isFinite(untilMs) || !untilMs) return null;
  if (untilMs <= nowMs) {
    providerCooldownUntilMs.delete(provider);
    return null;
  }
  return untilMs;
}

export function getTranscriptProviderCooldownRemainingSeconds(provider: TranscriptProvider, nowMs = Date.now()) {
  const untilMs = getTranscriptProviderCooldownUntil(provider, nowMs);
  if (!untilMs) return null;
  return Math.max(1, Math.ceil((untilMs - nowMs) / 1000));
}

export function startTranscriptProviderCooldown(provider: TranscriptProvider, nowMs = Date.now()) {
  const cooldownMs =
    provider === 'youtube_timedtext'
      ? getTimedtextCooldownMs()
      : getTimedtextCooldownMs();
  const untilMs = nowMs + cooldownMs;
  providerCooldownUntilMs.set(provider, untilMs);
  return {
    untilMs,
    cooldownSeconds: Math.ceil(cooldownMs / 1000),
  };
}

export function resetTranscriptProviderCooldownsForTests() {
  providerCooldownUntilMs.clear();
}

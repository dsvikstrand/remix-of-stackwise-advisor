type UnlockDisplayStateInput = {
  status?: string | null;
  reservationExpiresAt?: string | null;
};

function parseIsoMs(value: string | null | undefined) {
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function isUnlockDisplayExpired(
  input: UnlockDisplayStateInput | null | undefined,
  nowMs = Date.now(),
) {
  if (!input) return false;
  const status = String(input.status || '').trim();
  if (status !== 'reserved' && status !== 'processing') return false;
  const expiresAtMs = parseIsoMs(input.reservationExpiresAt);
  if (expiresAtMs == null) return false;
  return expiresAtMs <= nowMs;
}

export function getEffectiveUnlockDisplayStatus(
  input: UnlockDisplayStateInput | null | undefined,
  nowMs = Date.now(),
) {
  const status = String(input?.status || '').trim() || 'available';
  if ((status === 'reserved' || status === 'processing') && isUnlockDisplayExpired(input, nowMs)) {
    return 'available';
  }
  return status;
}

export function isEffectiveUnlockDisplayInProgress(
  input: UnlockDisplayStateInput | null | undefined,
  nowMs = Date.now(),
) {
  const status = getEffectiveUnlockDisplayStatus(input, nowMs);
  return status === 'reserved' || status === 'processing';
}

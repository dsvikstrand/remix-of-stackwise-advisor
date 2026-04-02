export function normalizeIsoOrNull(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function normalizeRequiredIso(value: unknown, fallbackIso?: string) {
  return normalizeIsoOrNull(value) || fallbackIso || new Date().toISOString();
}

export function normalizeStringOrNull(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export function normalizeObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

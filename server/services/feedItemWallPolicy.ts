export function resolveFeedItemWallCreatedAt(input: {
  existingCreatedAt?: string | null;
  nowIso: string;
}) {
  const existingCreatedAt = String(input.existingCreatedAt || '').trim();
  if (existingCreatedAt) return existingCreatedAt;
  return input.nowIso;
}

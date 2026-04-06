export function resolveFeedItemWallCreatedAt(input: {
  existingCreatedAt?: string | null;
  nowIso: string;
}) {
  const existingCreatedAt = String(input.existingCreatedAt || '').trim();
  if (existingCreatedAt) return existingCreatedAt;
  return input.nowIso;
}

export function resolveFeedItemGeneratedAtOnWall(input: {
  existingGeneratedAtOnWall?: string | null;
  existingBlueprintId?: string | null;
  nextBlueprintId?: string | null;
  nowIso: string;
}) {
  const existingGeneratedAtOnWall = String(input.existingGeneratedAtOnWall || '').trim();
  if (existingGeneratedAtOnWall) return existingGeneratedAtOnWall;

  const existingBlueprintId = String(input.existingBlueprintId || '').trim();
  const nextBlueprintId = String(input.nextBlueprintId || '').trim();
  if (!nextBlueprintId) return null;
  if (existingBlueprintId) return null;
  return input.nowIso;
}

export function resolveFeedItemWallDisplayAt(input: {
  blueprintId?: string | null;
  createdAt?: string | null;
  generatedAtOnWall?: string | null;
}) {
  const blueprintId = String(input.blueprintId || '').trim();
  const createdAt = String(input.createdAt || '').trim();
  const generatedAtOnWall = String(input.generatedAtOnWall || '').trim();
  if (blueprintId) {
    return generatedAtOnWall || createdAt;
  }
  return createdAt;
}

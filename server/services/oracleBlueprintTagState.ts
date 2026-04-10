import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import { normalizeRequiredIso, normalizeStringOrNull } from './oracleValueNormalization';

export type OracleBlueprintTagRow = {
  id: string;
  blueprint_id: string;
  tag_id: string;
  tag_slug: string;
  created_at: string;
  updated_at: string;
};

function normalizeRequiredString(value: unknown) {
  return String(value || '').trim();
}

function normalizeTagSlug(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function buildBlueprintTagRowId(input: {
  blueprintId: string;
  tagId: string;
}) {
  return `${input.blueprintId}:${input.tagId}`;
}

function mapBlueprintTagRow(row: Record<string, unknown>, fallbackIso?: string): OracleBlueprintTagRow {
  const blueprintId = normalizeRequiredString(row.blueprint_id);
  const tagId = normalizeRequiredString(row.tag_id);
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    id: normalizeRequiredString(row.id) || buildBlueprintTagRowId({ blueprintId, tagId }),
    blueprint_id: blueprintId,
    tag_id: tagId,
    tag_slug: normalizeTagSlug(row.tag_slug),
    created_at: createdAt,
    updated_at: normalizeRequiredIso(row.updated_at, createdAt),
  };
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function upsertOracleBlueprintTagRows(input: {
  controlDb: OracleControlPlaneDb;
  rows: Array<Record<string, unknown>>;
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const rows = input.rows
    .map((row) => {
      const blueprintId = normalizeRequiredString(row.blueprint_id);
      const tagId = normalizeRequiredString(row.tag_id);
      const tagSlug = normalizeTagSlug(row.tag_slug);
      if (!blueprintId || !tagId || !tagSlug) return null;
      return mapBlueprintTagRow({
        id: normalizeRequiredString(row.id) || buildBlueprintTagRowId({ blueprintId, tagId }),
        blueprint_id: blueprintId,
        tag_id: tagId,
        tag_slug: tagSlug,
        created_at: normalizeStringOrNull(row.created_at) || nowIso,
        updated_at: nowIso,
      }, nowIso);
    })
    .filter((row): row is OracleBlueprintTagRow => Boolean(row));

  for (const chunk of chunkArray(rows, 100)) {
    for (const row of chunk) {
      await input.controlDb.db
        .insertInto('blueprint_tag_state')
        .values(row)
        .onConflict((oc) => oc.column('id').doUpdateSet({
          blueprint_id: row.blueprint_id,
          tag_id: row.tag_id,
          tag_slug: row.tag_slug,
          updated_at: row.updated_at,
        }))
        .execute();
    }
  }

  return rows;
}

export async function upsertOracleBlueprintTagRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Record<string, unknown>;
  nowIso?: string;
}) {
  const [row] = await upsertOracleBlueprintTagRows({
    controlDb: input.controlDb,
    rows: [input.row],
    nowIso: input.nowIso,
  });
  return row || null;
}

export async function listOracleBlueprintTagRows(input: {
  controlDb: OracleControlPlaneDb;
  blueprintIds: string[];
}) {
  const blueprintIds = [...new Set((input.blueprintIds || []).map((value) => normalizeRequiredString(value)).filter(Boolean))];
  if (blueprintIds.length === 0) return [] as OracleBlueprintTagRow[];

  const rows = await input.controlDb.db
    .selectFrom('blueprint_tag_state')
    .selectAll()
    .where('blueprint_id', 'in', blueprintIds)
    .orderBy('blueprint_id', 'asc')
    .orderBy('tag_slug', 'asc')
    .orderBy('id', 'asc')
    .execute();

  return rows.map((row) => mapBlueprintTagRow(row as unknown as Record<string, unknown>));
}

export async function listOracleBlueprintTagSlugs(input: {
  controlDb: OracleControlPlaneDb;
  blueprintId: string;
}) {
  const blueprintId = normalizeRequiredString(input.blueprintId);
  if (!blueprintId) return [] as string[];

  const rows = await listOracleBlueprintTagRows({
    controlDb: input.controlDb,
    blueprintIds: [blueprintId],
  });

  return Array.from(new Set(
    rows
      .map((row) => normalizeTagSlug(row.tag_slug))
      .filter(Boolean),
  ));
}

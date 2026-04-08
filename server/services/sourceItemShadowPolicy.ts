type SourceItemShadowRowLike = {
  source_type: string | null;
  source_native_id: string | null;
  canonical_key: string | null;
  source_url: string | null;
  title: string | null;
  published_at: string | null;
  ingest_status: string | null;
  source_channel_id: string | null;
  source_channel_title: string | null;
  source_page_id: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const SOURCE_ITEM_SHADOW_COMPARABLE_FIELDS = [
  'source_type',
  'source_native_id',
  'canonical_key',
  'source_url',
  'title',
  'published_at',
  'ingest_status',
  'source_channel_id',
  'source_channel_title',
  'source_page_id',
  'thumbnail_url',
  'metadata',
  'created_at',
] as const;

type SourceItemShadowComparableField = typeof SOURCE_ITEM_SHADOW_COMPARABLE_FIELDS[number];

export function shouldLookupSupabaseSourceItemCurrent(input: {
  primaryEnabled: boolean;
  hasOracleCurrent: boolean;
}) {
  return !input.primaryEnabled && !input.hasOracleCurrent;
}

export function shouldWriteSupabaseSourceItemShadow(input: {
  primaryEnabled: boolean;
}) {
  return !input.primaryEnabled;
}

export function getSourceItemShadowChangedFields(
  current: SourceItemShadowRowLike | null | undefined,
  next: SourceItemShadowRowLike,
) {
  const changedFields: SourceItemShadowComparableField[] = [];
  for (const field of SOURCE_ITEM_SHADOW_COMPARABLE_FIELDS) {
    const currentValue = field === 'metadata'
      ? JSON.stringify(current?.metadata || null)
      : (current?.[field] ?? null);
    const nextValue = field === 'metadata'
      ? JSON.stringify(next.metadata || null)
      : (next[field] ?? null);
    if (currentValue !== nextValue) {
      changedFields.push(field);
    }
  }
  return changedFields;
}

export function mapSourceItemShadowUpdateValues(row: SourceItemShadowRowLike) {
  return {
    source_type: row.source_type,
    source_native_id: row.source_native_id,
    canonical_key: row.canonical_key,
    source_url: row.source_url,
    title: row.title,
    published_at: row.published_at,
    ingest_status: row.ingest_status,
    source_channel_id: row.source_channel_id,
    source_channel_title: row.source_channel_title,
    source_page_id: row.source_page_id,
    thumbnail_url: row.thumbnail_url,
    metadata: row.metadata,
    updated_at: row.updated_at,
  };
}

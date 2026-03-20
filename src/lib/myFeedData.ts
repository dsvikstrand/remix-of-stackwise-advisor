import { buildFeedSummary } from '@/lib/feedPreview';

type DbClient = {
  from: (table: string) => any;
};

function parseSourceViewCount(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  const candidates = [metadata.view_count, metadata.viewCount];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return Math.floor(numeric);
    }
  }
  return null;
}

function isPermanentNoTranscriptErrorCode(code: string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === 'NO_TRANSCRIPT_PERMANENT';
}

function buildSourcePagePath(platform: string, externalId: string) {
  return `/s/${encodeURIComponent(platform)}/${encodeURIComponent(externalId)}`;
}

export interface MyFeedItemView {
  id: string;
  state: string;
  lastDecisionCode: string | null;
  createdAt: string;
  source: {
    id: string;
    sourceChannelId: string | null;
    sourcePageId: string | null;
    sourcePagePath: string | null;
    sourceUrl: string;
    title: string;
    sourceChannelTitle: string | null;
    sourceChannelAvatarUrl: string | null;
    thumbnailUrl: string | null;
    channelBannerUrl: string | null;
    viewCount: number | null;
    unlockStatus: 'available' | 'reserved' | 'processing' | 'ready' | null;
    unlockCost: number | null;
    unlockInProgress: boolean;
    readyBlueprintId: string | null;
  } | null;
  blueprint: {
    id: string;
    creatorUserId: string | null;
    title: string;
    bannerUrl: string | null;
    previewSummary: string;
    llmReview: string | null;
    isPublic: boolean;
    tags: string[];
  } | null;
  candidate: {
    id: string;
    channelSlug: string;
    status: string;
  } | null;
}

export async function listMyFeedItemsFromDb(input: {
  db: DbClient;
  userId: string;
}): Promise<MyFeedItemView[]> {
  const { db, userId } = input;

  const { data: feedRows, error: feedError } = await db
    .from('user_feed_items')
    .select('id, source_item_id, blueprint_id, state, last_decision_code, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (feedError) throw feedError;
  if (!feedRows || feedRows.length === 0) return [];

  const filteredFeedRows = feedRows.filter((row: any) => {
    const isLegacyPendingWithoutBlueprint =
      !row.blueprint_id && (row.state === 'my_feed_pending_accept' || row.state === 'my_feed_skipped');
    return !isLegacyPendingWithoutBlueprint;
  });
  if (filteredFeedRows.length === 0) return [];

  const sourceIds = [...new Set(filteredFeedRows.map((row: any) => row.source_item_id).filter(Boolean))] as string[];
  const blueprintIds = [...new Set(filteredFeedRows.map((row: any) => row.blueprint_id).filter(Boolean))] as string[];
  const feedItemIds = filteredFeedRows.map((row: any) => row.id);

  const [{ data: sources }, { data: blueprints }, { data: candidates }, { data: unlocks }] = await Promise.all([
    db
      .from('source_items')
      .select('id, source_channel_id, source_page_id, source_url, title, source_channel_title, thumbnail_url, metadata')
      .in('id', sourceIds),
    blueprintIds.length
      ? db
        .from('blueprints')
        .select('id, creator_user_id, title, banner_url, llm_review, preview_summary, is_public')
        .in('id', blueprintIds)
      : Promise.resolve({ data: [], error: null }),
    db
      .from('channel_candidates')
      .select('id, user_feed_item_id, channel_slug, status, created_at')
      .in('user_feed_item_id', feedItemIds)
      .order('created_at', { ascending: false }),
    sourceIds.length
      ? db
        .from('source_item_unlocks')
        .select('source_item_id, status, estimated_cost, blueprint_id, last_error_code, transcript_status')
        .in('source_item_id', sourceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const { data: tagRows } = blueprintIds.length
    ? await db
      .from('blueprint_tags')
      .select('blueprint_id, tag_id')
      .in('blueprint_id', blueprintIds)
    : { data: [] as Array<{ blueprint_id: string; tag_id: string }> };

  const tagIds = [...new Set((tagRows || []).map((row) => String(row.tag_id || '').trim()).filter(Boolean))];
  const { data: tagsData } = tagIds.length > 0
    ? await db
      .from('tags')
      .select('id, slug')
      .in('id', tagIds)
    : { data: [] as Array<{ id: string; slug: string }> };

  const tagsMap = new Map((tagsData || []).map((tag: any) => [tag.id, String(tag.slug || '').trim()]));
  const tagsByBlueprint = new Map<string, string[]>();
  (tagRows || []).forEach((row: any) => {
    const blueprintId = String(row.blueprint_id || '').trim();
    const slug = tagsMap.get(String(row.tag_id || '').trim()) || '';
    if (!blueprintId || !slug) return;
    const list = tagsByBlueprint.get(blueprintId) || [];
    list.push(slug);
    tagsByBlueprint.set(blueprintId, list);
  });

  const sourceMap = new Map((sources || []).map((row: any) => [row.id, row]));
  const sourcePageIds = [...new Set((sources || []).map((row: any) => String(row.source_page_id || '').trim()).filter(Boolean))];
  const sourceChannelIds = [...new Set((sources || []).map((row: any) => String(row.source_channel_id || '').trim()).filter(Boolean))];
  const { data: sourcePagesData } = sourcePageIds.length
    ? await db
      .from('source_pages')
      .select('id, avatar_url, platform, external_id')
      .in('id', sourcePageIds)
    : { data: [] as Array<{ id: string; avatar_url: string | null; platform: string | null; external_id: string | null }> };
  const { data: sourcePagesByExternalData } = sourceChannelIds.length
    ? await db
      .from('source_pages')
      .select('external_id, avatar_url, platform')
      .eq('platform', 'youtube')
      .in('external_id', sourceChannelIds)
    : { data: [] as Array<{ external_id: string; avatar_url: string | null; platform: string | null }> };
  const sourcePageAvatarById = new Map((sourcePagesData || []).map((row: any) => [row.id, row.avatar_url || null]));
  const sourcePageAvatarByExternalId = new Map((sourcePagesByExternalData || []).map((row: any) => [row.external_id, row.avatar_url || null]));
  const sourcePagePathById = new Map(
    (sourcePagesData || []).map((row: any) => {
      const platform = String(row.platform || '').trim();
      const externalId = String(row.external_id || '').trim();
      return [row.id, platform && externalId ? buildSourcePagePath(platform, externalId) : null] as const;
    }),
  );
  const sourcePagePathByExternalId = new Map(
    (sourcePagesByExternalData || []).map((row: any) => {
      const platform = String(row.platform || '').trim();
      const externalId = String(row.external_id || '').trim();
      return [row.external_id, platform && externalId ? buildSourcePagePath(platform, externalId) : null] as const;
    }),
  );
  const unlockMap = new Map((unlocks || []).map((row: any) => [row.source_item_id, row]));
  const transcriptHiddenSourceIds = new Set(
    (unlocks || [])
      .filter((row: any) => {
        const transcriptStatus = String((row as { transcript_status?: unknown }).transcript_status || '').trim().toLowerCase();
        if (transcriptStatus === 'confirmed_no_speech' || transcriptStatus === 'retrying') return true;
        const lastErrorCode = String(row.last_error_code || '').trim().toUpperCase();
        return isPermanentNoTranscriptErrorCode(lastErrorCode) || lastErrorCode === 'TRANSCRIPT_UNAVAILABLE';
      })
      .map((row: any) => String(row.source_item_id || '').trim())
      .filter(Boolean),
  );
  const blueprintMap = new Map((blueprints || []).map((row: any) => [row.id, row]));
  const candidateMap = new Map<string, { id: string; channelSlug: string; status: string }>();
  (candidates || []).forEach((row: any) => {
    if (candidateMap.has(row.user_feed_item_id)) return;
    candidateMap.set(row.user_feed_item_id, {
      id: row.id,
      channelSlug: row.channel_slug,
      status: row.status,
    });
  });

  const visibleFeedRows = filteredFeedRows.filter((row: any) => {
    if (row.blueprint_id) return true;
    const sourceItemId = String(row.source_item_id || '').trim();
    return !sourceItemId || !transcriptHiddenSourceIds.has(sourceItemId);
  });

  return visibleFeedRows.map((row: any) => {
    const source = sourceMap.get(row.source_item_id);
    const sourceUnlock = source ? unlockMap.get(source.id) : null;
    const blueprint = blueprintMap.get(row.blueprint_id);
    const sourceMetadata =
      source?.metadata
      && typeof source.metadata === 'object'
      && source.metadata !== null
        ? (source.metadata as Record<string, unknown>)
        : null;
    const metadataSourceChannelTitle =
      sourceMetadata && typeof sourceMetadata.source_channel_title === 'string'
        ? String(sourceMetadata.source_channel_title || '').trim() || null
        : (
          sourceMetadata && typeof sourceMetadata.channel_title === 'string'
            ? String(sourceMetadata.channel_title || '').trim() || null
            : null
        );
    const metadataSourceChannelAvatarUrl =
      sourceMetadata && typeof sourceMetadata.source_channel_avatar_url === 'string'
        ? String(sourceMetadata.source_channel_avatar_url || '').trim() || null
        : (
          sourceMetadata && typeof sourceMetadata.channel_avatar_url === 'string'
            ? String(sourceMetadata.channel_avatar_url || '').trim() || null
            : null
        );

    return {
      id: row.id,
      state: row.state,
      lastDecisionCode: row.last_decision_code,
      createdAt: row.created_at,
      source: source
        ? {
            id: source.id,
            sourceChannelId: source.source_channel_id || null,
            sourcePageId: source.source_page_id || null,
            sourcePagePath:
              sourcePagePathById.get(String(source.source_page_id || '').trim())
              || sourcePagePathByExternalId.get(String(source.source_channel_id || '').trim())
              || null,
            sourceUrl: source.source_url,
            title: source.title,
            sourceChannelTitle: source.source_channel_title || metadataSourceChannelTitle || null,
            sourceChannelAvatarUrl:
              metadataSourceChannelAvatarUrl
              || sourcePageAvatarById.get(String(source.source_page_id || '').trim())
              || sourcePageAvatarByExternalId.get(String(source.source_channel_id || '').trim())
              || null,
            thumbnailUrl: source.thumbnail_url || null,
            channelBannerUrl:
              source.metadata
              && typeof source.metadata === 'object'
              && source.metadata !== null
              && 'channel_banner_url' in source.metadata
                ? String((source.metadata as Record<string, unknown>).channel_banner_url || '') || null
                : null,
            viewCount: parseSourceViewCount(sourceMetadata),
            unlockStatus:
              sourceUnlock?.status === 'available'
              || sourceUnlock?.status === 'reserved'
              || sourceUnlock?.status === 'processing'
              || sourceUnlock?.status === 'ready'
                ? sourceUnlock.status
                : null,
            unlockCost: sourceUnlock ? Number(sourceUnlock.estimated_cost || 0) : null,
            unlockInProgress: sourceUnlock?.status === 'reserved' || sourceUnlock?.status === 'processing',
            readyBlueprintId: sourceUnlock?.status === 'ready'
              ? (sourceUnlock.blueprint_id || null)
              : null,
          }
        : null,
      blueprint: blueprint
        ? {
            id: blueprint.id,
            creatorUserId: blueprint.creator_user_id || null,
            title: blueprint.title,
            bannerUrl: blueprint.banner_url,
            previewSummary: buildFeedSummary({
              primary: blueprint.preview_summary,
              secondary: blueprint.llm_review,
              fallback: source?.title || 'Open blueprint to view full details.',
              maxChars: 220,
            }),
            llmReview: blueprint.llm_review,
            isPublic: blueprint.is_public,
            tags: tagsByBlueprint.get(blueprint.id) || [],
          }
        : null,
      candidate: candidateMap.get(row.id) || null,
    } satisfies MyFeedItemView;
  });
}

import { CHANNELS_CATALOG } from '../../src/lib/channelsCatalog';
import { buildFeedSummary } from '../../src/lib/feedPreview';

type DbClient = {
  from: (table: string) => any;
};

type FeedSort = 'latest' | 'trending';

export type WallFeedScope = 'all' | 'joined' | string;

export type WallBlueprintFeedItem = {
  id: string;
  creator_user_id: string;
  title: string;
  preview_summary: string;
  banner_url: string | null;
  likes_count: number;
  created_at: string;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  };
  tags: { id: string; slug: string }[];
  user_liked: boolean;
  published_channel_slug: string | null;
  source_channel_title: string | null;
  source_channel_avatar_url: string | null;
  source_thumbnail_url: string | null;
  source_view_count: number | null;
  comments_count: number;
};

export type WallForYouItem =
  | {
      kind: 'locked';
      feedItemId: string;
      sourceItemId: string;
      createdAt: string;
      title: string;
      sourceChannelTitle: string | null;
      sourceChannelAvatarUrl: string | null;
      sourceUrl: string;
      unlockCost: number;
      sourcePageId: string | null;
      sourceChannelId: string | null;
      unlockInProgress: boolean;
    }
  | {
      kind: 'blueprint';
      feedItemId: string;
      sourceItemId: string;
      createdAt: string;
      blueprintId: string;
      title: string;
      sourceChannelTitle: string | null;
      sourceChannelAvatarUrl: string | null;
      sourceThumbnailUrl: string | null;
      sourceViewCount: number | null;
      previewSummary: string;
      bannerUrl: string | null;
      tags: string[];
      publishedChannelSlug: string | null;
      likesCount: number;
      userLiked: boolean;
      commentsCount: number;
    };

const JOINED_SCOPE_ALIAS = 'your-channels';
const CANONICAL_JOINED_SCOPE = 'joined';
const CHANNEL_TAG_SLUG_TO_CHANNEL_SLUG = new Map(
  CHANNELS_CATALOG
    .filter((channel) => channel.isJoinEnabled && channel.status === 'active')
    .map((channel) => [channel.tagSlug, channel.slug] as const),
);
const TAG_LOOKUP_BATCH_SIZE = 80;

function normalizeWallFeedScope(scope: WallFeedScope) {
  const normalized = String(scope || '').trim().toLowerCase();
  if (!normalized) return 'all';
  if (normalized === JOINED_SCOPE_ALIAS) return CANONICAL_JOINED_SCOPE;
  return normalized;
}

function chunkValues<T>(values: T[], size: number) {
  if (!Array.isArray(values) || values.length === 0) return [] as T[][];
  const normalizedSize = Math.max(1, Math.floor(Number(size) || 1));
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += normalizedSize) {
    chunks.push(values.slice(index, index + normalizedSize));
  }
  return chunks;
}

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

function toMetadataObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getMetadataSourceChannelTitle(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  if (typeof metadata.source_channel_title === 'string') {
    return String(metadata.source_channel_title || '').trim() || null;
  }
  if (typeof metadata.channel_title === 'string') {
    return String(metadata.channel_title || '').trim() || null;
  }
  return null;
}

function getMetadataSourceChannelAvatarUrl(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  if (typeof metadata.source_channel_avatar_url === 'string') {
    return String(metadata.source_channel_avatar_url || '').trim() || null;
  }
  if (typeof metadata.channel_avatar_url === 'string') {
    return String(metadata.channel_avatar_url || '').trim() || null;
  }
  return null;
}

type BuildFeedItemMapsResult = {
  sourceChannelTitleByBlueprint: Map<string, { title: string | null; createdAtMs: number }>;
  sourceChannelAvatarByBlueprint: Map<string, { avatarUrl: string | null; createdAtMs: number }>;
  sourceThumbnailByBlueprint: Map<string, { thumbnailUrl: string | null; createdAtMs: number }>;
  sourceViewCountByBlueprint: Map<string, { viewCount: number | null; createdAtMs: number }>;
  publishedChannelByBlueprint: Map<string, { slug: string; createdAtMs: number }>;
};

async function buildFeedItemMaps(db: DbClient, feedItems: Array<{ id: string; blueprint_id: string; source_item_id: string; created_at: string }>) {
  const blueprintIdByFeedItemId = new Map(feedItems.map((row) => [row.id, row.blueprint_id]));
  const sourceItemIds = [...new Set(feedItems.map((row) => String(row.source_item_id || '').trim()).filter(Boolean))];
  const sourceChannelTitleByBlueprint = new Map<string, { title: string | null; createdAtMs: number }>();
  const sourceChannelAvatarByBlueprint = new Map<string, { avatarUrl: string | null; createdAtMs: number }>();
  const sourceThumbnailByBlueprint = new Map<string, { thumbnailUrl: string | null; createdAtMs: number }>();
  const sourceViewCountByBlueprint = new Map<string, { viewCount: number | null; createdAtMs: number }>();
  const publishedChannelByBlueprint = new Map<string, { slug: string; createdAtMs: number }>();

  if (feedItems.length === 0 || sourceItemIds.length === 0) {
    return {
      sourceChannelTitleByBlueprint,
      sourceChannelAvatarByBlueprint,
      sourceThumbnailByBlueprint,
      sourceViewCountByBlueprint,
      publishedChannelByBlueprint,
    } satisfies BuildFeedItemMapsResult;
  }

  const { data: sourceItemsData, error: sourceItemsError } = await db
    .from('source_items')
    .select('id, source_page_id, source_channel_id, source_channel_title, thumbnail_url, metadata')
    .in('id', sourceItemIds);
  if (sourceItemsError) throw sourceItemsError;

  const sourcePageIds = [...new Set((sourceItemsData || []).map((row: any) => String(row.source_page_id || '').trim()).filter(Boolean))];
  const sourceChannelIds = [...new Set((sourceItemsData || []).map((row: any) => String(row.source_channel_id || '').trim()).filter(Boolean))];
  const { data: sourcePagesData, error: sourcePagesError } = sourcePageIds.length > 0
    ? await db.from('source_pages').select('id, avatar_url').in('id', sourcePageIds)
    : { data: [], error: null };
  if (sourcePagesError) throw sourcePagesError;
  const { data: sourcePagesByExternalData, error: sourcePagesByExternalError } = sourceChannelIds.length > 0
    ? await db.from('source_pages').select('external_id, avatar_url').eq('platform', 'youtube').in('external_id', sourceChannelIds)
    : { data: [], error: null };
  if (sourcePagesByExternalError) throw sourcePagesByExternalError;

  const sourcePageAvatarById = new Map((sourcePagesData || []).map((row: any) => [row.id, row.avatar_url || null]));
  const sourcePageAvatarByExternalId = new Map((sourcePagesByExternalData || []).map((row: any) => [row.external_id, row.avatar_url || null]));
  const sourceItemsMap = new Map(
    (sourceItemsData || []).map((row: any) => {
      const metadata = toMetadataObject(row.metadata);
      return [row.id, {
        title: row.source_channel_title || getMetadataSourceChannelTitle(metadata) || null,
        avatarUrl:
          getMetadataSourceChannelAvatarUrl(metadata)
          || sourcePageAvatarById.get(String(row.source_page_id || '').trim())
          || sourcePageAvatarByExternalId.get(String(row.source_channel_id || '').trim())
          || null,
        thumbnailUrl: String(row.thumbnail_url || '').trim() || null,
        viewCount: parseSourceViewCount(metadata),
      }] as const;
    }),
  );

  const feedItemIds = feedItems.map((row) => row.id);
  if (feedItemIds.length > 0) {
    const { data: candidatesData, error: candidatesError } = await db
      .from('channel_candidates')
      .select('channel_slug, created_at, user_feed_item_id')
      .eq('status', 'published')
      .in('user_feed_item_id', feedItemIds);
    if (candidatesError) throw candidatesError;

    for (const row of candidatesData || []) {
      const blueprintId = blueprintIdByFeedItemId.get(row.user_feed_item_id);
      const channelSlug = String(row.channel_slug || '').trim().toLowerCase();
      if (!blueprintId || !channelSlug) continue;
      const createdAtMs = Number.isFinite(Date.parse(row.created_at)) ? Date.parse(row.created_at) : 0;
      const existing = publishedChannelByBlueprint.get(blueprintId);
      if (!existing || createdAtMs > existing.createdAtMs || (createdAtMs === existing.createdAtMs && channelSlug < existing.slug)) {
        publishedChannelByBlueprint.set(blueprintId, { slug: channelSlug, createdAtMs });
      }
    }
  }

  for (const row of feedItems) {
    const blueprintId = row.blueprint_id;
    const sourceInfo = sourceItemsMap.get(row.source_item_id) || { title: null, avatarUrl: null, thumbnailUrl: null, viewCount: null };
    const createdAtMs = Number.isFinite(Date.parse(row.created_at)) ? Date.parse(row.created_at) : 0;
    const existingTitle = sourceChannelTitleByBlueprint.get(blueprintId);
    if (!existingTitle || createdAtMs > existingTitle.createdAtMs) {
      sourceChannelTitleByBlueprint.set(blueprintId, { title: sourceInfo.title, createdAtMs });
    }
    const existingAvatar = sourceChannelAvatarByBlueprint.get(blueprintId);
    if (!existingAvatar || createdAtMs > existingAvatar.createdAtMs) {
      sourceChannelAvatarByBlueprint.set(blueprintId, { avatarUrl: sourceInfo.avatarUrl, createdAtMs });
    }
    const existingThumbnail = sourceThumbnailByBlueprint.get(blueprintId);
    if (!existingThumbnail || createdAtMs > existingThumbnail.createdAtMs) {
      sourceThumbnailByBlueprint.set(blueprintId, { thumbnailUrl: sourceInfo.thumbnailUrl, createdAtMs });
    }
    const existingViewCount = sourceViewCountByBlueprint.get(blueprintId);
    if (!existingViewCount || createdAtMs > existingViewCount.createdAtMs) {
      sourceViewCountByBlueprint.set(blueprintId, { viewCount: sourceInfo.viewCount, createdAtMs });
    }
  }

  return {
    sourceChannelTitleByBlueprint,
    sourceChannelAvatarByBlueprint,
    sourceThumbnailByBlueprint,
    sourceViewCountByBlueprint,
    publishedChannelByBlueprint,
  } satisfies BuildFeedItemMapsResult;
}

export async function listWallBlueprintFeed(input: {
  db: DbClient;
  scope: WallFeedScope;
  sort: FeedSort;
  viewerUserId?: string | null;
}) {
  const { db, sort, viewerUserId } = input;
  const scope = normalizeWallFeedScope(input.scope);
  const scopedChannel =
    scope !== 'all' && scope !== CANONICAL_JOINED_SCOPE
      ? CHANNELS_CATALOG.find((channel) => channel.slug === scope)
      : null;
  const isSpecificChannelScope = !!scopedChannel;
  const isJoinedScope = scope === CANONICAL_JOINED_SCOPE && !!viewerUserId;

  const limit = isJoinedScope || isSpecificChannelScope ? 140 : 90;
  let query = db
    .from('blueprints')
    .select('id, creator_user_id, title, llm_review, mix_notes, banner_url, likes_count, created_at')
    .eq('is_public', true)
    .limit(limit);

  if (sort === 'trending') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);
    query = query
      .gte('created_at', cutoff.toISOString())
      .order('likes_count', { ascending: false })
      .order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data: blueprints, error } = await query;
  if (error) throw error;
  if (!blueprints || blueprints.length === 0) return [] as WallBlueprintFeedItem[];

  const blueprintIds = blueprints.map((row: any) => row.id);
  const userIds = [...new Set(blueprints.map((row: any) => row.creator_user_id).filter(Boolean))];

  const [tagsRes, likesRes, profilesRes, feedItemsRes, commentRowsRes] = await Promise.all([
    db.from('blueprint_tags').select('blueprint_id, tag_id').in('blueprint_id', blueprintIds),
    viewerUserId
      ? db.from('blueprint_likes').select('blueprint_id').eq('user_id', viewerUserId).in('blueprint_id', blueprintIds)
      : Promise.resolve({ data: [] as { blueprint_id: string }[], error: null }),
    userIds.length > 0
      ? db.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds)
      : Promise.resolve({ data: [] as { user_id: string; display_name: string | null; avatar_url: string | null }[], error: null }),
    db.from('user_feed_items').select('id, blueprint_id, source_item_id, created_at').in('blueprint_id', blueprintIds),
    db.from('blueprint_comments').select('blueprint_id').in('blueprint_id', blueprintIds),
  ]);

  if (tagsRes.error || likesRes.error || profilesRes.error || feedItemsRes.error || commentRowsRes.error) {
    throw tagsRes.error || likesRes.error || profilesRes.error || feedItemsRes.error || commentRowsRes.error;
  }

  const tagRows = tagsRes.data || [];
  const tagIds = [...new Set(tagRows.map((row: any) => row.tag_id).filter(Boolean))];
  const tagsData: Array<{ id: string; slug: string }> = [];
  for (const batch of chunkValues(tagIds, TAG_LOOKUP_BATCH_SIZE)) {
    const { data, error: tagsError } = await db.from('tags').select('id, slug').in('id', batch);
    if (tagsError) throw tagsError;
    tagsData.push(...((data || []) as Array<{ id: string; slug: string }>));
  }

  const tagsMap = new Map((tagsData || []).map((tag: any) => [tag.id, tag]));
  const blueprintTags = new Map<string, { id: string; slug: string }[]>();
  tagRows.forEach((row: any) => {
    const tag = tagsMap.get(row.tag_id);
    if (!tag) return;
    const list = blueprintTags.get(row.blueprint_id) || [];
    list.push(tag);
    blueprintTags.set(row.blueprint_id, list);
  });

  const likedIds = new Set((likesRes.data || []).map((row: any) => row.blueprint_id));
  const profilesMap = new Map((profilesRes.data || []).map((profile: any) => [profile.user_id, profile]));
  const commentsCountByBlueprint = (commentRowsRes.data || []).reduce<Record<string, number>>((acc, row: any) => {
    acc[row.blueprint_id] = (acc[row.blueprint_id] || 0) + 1;
    return acc;
  }, {});

  const feedItemMaps = await buildFeedItemMaps(db, (feedItemsRes.data || []) as Array<{
    id: string;
    blueprint_id: string;
    source_item_id: string;
    created_at: string;
  }>);

  let joinedChannelSlugs = new Set<string>();
  if (isJoinedScope && viewerUserId) {
    const followsRes = await db.from('tag_follows').select('tag_id').eq('user_id', viewerUserId);
    if (followsRes.error) throw followsRes.error;
    const followedTagIds = [...new Set((followsRes.data || []).map((row: any) => String(row.tag_id || '').trim()).filter(Boolean))];
    if (followedTagIds.length > 0) {
      const followedTagsRes = await db.from('tags').select('id, slug').in('id', followedTagIds);
      if (followedTagsRes.error) throw followedTagsRes.error;
      joinedChannelSlugs = new Set(
        (followedTagsRes.data || [])
          .map((row: any) => CHANNEL_TAG_SLUG_TO_CHANNEL_SLUG.get(String(row.slug || '').trim()) || null)
          .filter(Boolean),
      );
    }
  }

  const hydrated = blueprints.map((blueprint: any) => ({
    ...blueprint,
    preview_summary: buildFeedSummary({
      primary: blueprint.llm_review,
      secondary: blueprint.mix_notes,
      fallback: 'Open blueprint to view full details.',
      maxChars: 220,
    }),
    profile: profilesMap.get(blueprint.creator_user_id) || { display_name: null, avatar_url: null },
    tags: blueprintTags.get(blueprint.id) || [],
    user_liked: likedIds.has(blueprint.id),
    published_channel_slug: feedItemMaps.publishedChannelByBlueprint.get(blueprint.id)?.slug || null,
    source_channel_title: feedItemMaps.sourceChannelTitleByBlueprint.get(blueprint.id)?.title || null,
    source_channel_avatar_url: feedItemMaps.sourceChannelAvatarByBlueprint.get(blueprint.id)?.avatarUrl || null,
    source_thumbnail_url: feedItemMaps.sourceThumbnailByBlueprint.get(blueprint.id)?.thumbnailUrl || null,
    source_view_count: feedItemMaps.sourceViewCountByBlueprint.get(blueprint.id)?.viewCount ?? null,
    comments_count: commentsCountByBlueprint[blueprint.id] || 0,
  })) as WallBlueprintFeedItem[];
  const publishedOnly = hydrated.filter((post) => Boolean(String(post.published_channel_slug || '').trim()));

  if (isSpecificChannelScope && scopedChannel) {
    return publishedOnly.filter((post) => post.published_channel_slug === scopedChannel.slug);
  }

  if (isJoinedScope) {
    if (joinedChannelSlugs.size === 0) return [] as WallBlueprintFeedItem[];
    return publishedOnly.filter((post) => joinedChannelSlugs.has(String(post.published_channel_slug || '').trim()));
  }

  return publishedOnly;
}

export async function listWallForYouFeed(input: {
  db: DbClient;
  userId: string;
  normalizeTranscriptTruthStatus: (value: unknown) => string;
  limit?: number;
}) {
  const { db, userId, normalizeTranscriptTruthStatus, limit = 100 } = input;
  const { data: feedRows, error: feedError } = await db
    .from('user_feed_items')
    .select('id, source_item_id, blueprint_id, state, last_decision_code, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (feedError) throw feedError;
  if (!feedRows || feedRows.length === 0) return [] as WallForYouItem[];

  const filteredFeedRows = feedRows.filter((row: any) => {
    const isLegacyPendingWithoutBlueprint =
      !row.blueprint_id && (row.state === 'my_feed_pending_accept' || row.state === 'my_feed_skipped');
    return !isLegacyPendingWithoutBlueprint;
  });
  if (filteredFeedRows.length === 0) return [] as WallForYouItem[];

  const sourceIds = [...new Set(filteredFeedRows.map((row: any) => row.source_item_id).filter(Boolean))] as string[];
  const blueprintIds = [...new Set(filteredFeedRows.map((row: any) => row.blueprint_id).filter(Boolean))] as string[];
  const feedItemIds = filteredFeedRows.map((row: any) => row.id);

  const [{ data: sources, error: sourcesError }, { data: blueprints, error: blueprintsError }, { data: candidates, error: candidatesError }, { data: unlocks, error: unlocksError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    db.from('source_items').select('id, source_channel_id, source_page_id, source_url, title, source_channel_title, thumbnail_url, metadata').in('id', sourceIds),
    blueprintIds.length
      ? db.from('blueprints').select('id, creator_user_id, title, banner_url, llm_review, mix_notes, is_public, likes_count').in('id', blueprintIds)
      : Promise.resolve({ data: [], error: null }),
    db.from('channel_candidates').select('id, user_feed_item_id, channel_slug, status, created_at').in('user_feed_item_id', feedItemIds).order('created_at', { ascending: false }),
    sourceIds.length
      ? db.from('source_item_unlocks').select('source_item_id, status, estimated_cost, blueprint_id, last_error_code, transcript_status').in('source_item_id', sourceIds)
      : Promise.resolve({ data: [], error: null }),
    db.from('user_source_subscriptions').select('source_page_id, source_channel_id').eq('user_id', userId).eq('is_active', true),
  ]);
  if (sourcesError || blueprintsError || candidatesError || unlocksError || subscriptionsError) {
    throw sourcesError || blueprintsError || candidatesError || unlocksError || subscriptionsError;
  }

  const { data: tagRows, error: tagRowsError } = blueprintIds.length
    ? await db.from('blueprint_tags').select('blueprint_id, tag_id').in('blueprint_id', blueprintIds)
    : { data: [], error: null };
  if (tagRowsError) throw tagRowsError;
  const tagIds = [...new Set((tagRows || []).map((row: any) => String(row.tag_id || '').trim()).filter(Boolean))];
  const { data: tagsData, error: tagsError } = tagIds.length > 0
    ? await db.from('tags').select('id, slug').in('id', tagIds)
    : { data: [], error: null };
  if (tagsError) throw tagsError;

  const { data: likedRows, error: likedError } = blueprintIds.length > 0
    ? await db.from('blueprint_likes').select('blueprint_id').eq('user_id', userId).in('blueprint_id', blueprintIds)
    : { data: [], error: null };
  if (likedError) throw likedError;
  const { data: commentRows, error: commentError } = blueprintIds.length > 0
    ? await db.from('blueprint_comments').select('blueprint_id').in('blueprint_id', blueprintIds)
    : { data: [], error: null };
  if (commentError) throw commentError;

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
  const { data: sourcePagesData, error: sourcePagesError } = sourcePageIds.length
    ? await db.from('source_pages').select('id, avatar_url').in('id', sourcePageIds)
    : { data: [], error: null };
  if (sourcePagesError) throw sourcePagesError;
  const { data: sourcePagesByExternalData, error: sourcePagesByExternalError } = sourceChannelIds.length
    ? await db.from('source_pages').select('external_id, avatar_url').eq('platform', 'youtube').in('external_id', sourceChannelIds)
    : { data: [], error: null };
  if (sourcePagesByExternalError) throw sourcePagesByExternalError;

  const sourcePageAvatarById = new Map((sourcePagesData || []).map((row: any) => [row.id, row.avatar_url || null]));
  const sourcePageAvatarByExternalId = new Map((sourcePagesByExternalData || []).map((row: any) => [row.external_id, row.avatar_url || null]));
  const unlockMap = new Map((unlocks || []).map((row: any) => [row.source_item_id, row]));
  const transcriptHiddenSourceIds = new Set(
    (unlocks || [])
      .filter((row: any) => {
        const status = normalizeTranscriptTruthStatus((row as { transcript_status?: unknown }).transcript_status);
        if (status === 'confirmed_no_speech' || status === 'retrying') return true;
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
  const activeSourcePageIds = new Set((subscriptions || []).map((row: any) => String(row.source_page_id || '').trim()).filter(Boolean));
  const activeSourceChannelIds = new Set((subscriptions || []).map((row: any) => String(row.source_channel_id || '').trim()).filter(Boolean));
  const likedIds = new Set((likedRows || []).map((row: any) => row.blueprint_id));
  const commentsCountByBlueprint = (commentRows || []).reduce<Record<string, number>>((acc, row: any) => {
    acc[row.blueprint_id] = (acc[row.blueprint_id] || 0) + 1;
    return acc;
  }, {});

  const visibleFeedRows = filteredFeedRows.filter((row: any) => {
    if (row.blueprint_id) return true;
    const sourceItemId = String(row.source_item_id || '').trim();
    return !sourceItemId || !transcriptHiddenSourceIds.has(sourceItemId);
  });

  const items: WallForYouItem[] = [];
  for (const row of visibleFeedRows) {
    const source = sourceMap.get(row.source_item_id);
    if (!source) continue;
    if (row.state === 'subscription_notice') continue;
    const sourceMetadata = toMetadataObject(source.metadata);
    const sourceUnlock = unlockMap.get(source.id);
    const blueprint = row.blueprint_id ? blueprintMap.get(row.blueprint_id) : null;
    const sourceChannelTitle = source.source_channel_title || getMetadataSourceChannelTitle(sourceMetadata) || null;
    const sourceChannelAvatarUrl =
      getMetadataSourceChannelAvatarUrl(sourceMetadata)
      || sourcePageAvatarById.get(String(source.source_page_id || '').trim())
      || sourcePageAvatarByExternalId.get(String(source.source_channel_id || '').trim())
      || null;
    const sourcePageId = String(source.source_page_id || '').trim() || null;
    const sourceChannelId = String(source.source_channel_id || '').trim() || null;
    const isSubscribedSource =
      (sourcePageId && activeSourcePageIds.has(sourcePageId))
      || (sourceChannelId && activeSourceChannelIds.has(sourceChannelId));
    const hasBlueprintForUserRow = Boolean(blueprint);
    if (!isSubscribedSource && !hasBlueprintForUserRow) continue;

    if (blueprint) {
      items.push({
        kind: 'blueprint',
        feedItemId: row.id,
        sourceItemId: source.id,
        createdAt: row.created_at,
        blueprintId: blueprint.id,
        title: blueprint.title,
        sourceChannelTitle,
        sourceChannelAvatarUrl,
        sourceThumbnailUrl: source.thumbnail_url || null,
        sourceViewCount: parseSourceViewCount(sourceMetadata),
        previewSummary: buildFeedSummary({
          primary: blueprint.llm_review,
          secondary: blueprint.mix_notes,
          fallback: source.title || 'Open blueprint to view full details.',
          maxChars: 220,
        }),
        bannerUrl: blueprint.banner_url,
        tags: tagsByBlueprint.get(blueprint.id) || [],
        publishedChannelSlug: candidateMap.get(row.id)?.status === 'published' ? candidateMap.get(row.id)?.channelSlug || null : null,
        likesCount: Number(blueprint.likes_count || 0),
        userLiked: likedIds.has(blueprint.id),
        commentsCount: commentsCountByBlueprint[blueprint.id] || 0,
      });
      continue;
    }

    items.push({
      kind: 'locked',
      feedItemId: row.id,
      sourceItemId: source.id,
      createdAt: row.created_at,
      title: source.title,
      sourceChannelTitle,
      sourceChannelAvatarUrl,
      sourceUrl: source.source_url,
      unlockCost: sourceUnlock ? Number(sourceUnlock.estimated_cost || 0) : 0,
      sourcePageId,
      sourceChannelId,
      unlockInProgress: sourceUnlock?.status === 'reserved' || sourceUnlock?.status === 'processing',
    });
  }

  return items;
}

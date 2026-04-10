import { CHANNELS_CATALOG } from '../../src/lib/channelsCatalog';
import { buildFeedSummary } from '../../src/lib/feedPreview';
import { resolveFeedItemWallDisplayAt } from './feedItemWallPolicy';
import { isEffectiveUnlockDisplayInProgress } from './unlockDisplayState';

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

function normalizeWallFeedScope(scope: WallFeedScope) {
  const normalized = String(scope || '').trim().toLowerCase();
  if (!normalized) return 'all';
  if (normalized === JOINED_SCOPE_ALIAS) return CANONICAL_JOINED_SCOPE;
  return normalized;
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

function isTranscriptUnavailableForDisplayErrorCode(code: string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized === 'NO_TRANSCRIPT_PERMANENT'
    || normalized === 'TRANSCRIPT_INSUFFICIENT_CONTEXT';
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

function collectJoinedTagRefs(
  rows: Array<{ blueprint_id: string; tags?: { id?: string; slug?: string } | Array<{ id?: string; slug?: string }> | null }>,
) {
  const tagsByBlueprint = new Map<string, { id: string; slug: string }[]>();
  for (const row of rows) {
    const blueprintId = String(row.blueprint_id || '').trim();
    if (!blueprintId) continue;
    const existing = tagsByBlueprint.get(blueprintId) || [];
    const joined = row.tags;
    const tagCandidates = Array.isArray(joined) ? joined : joined ? [joined] : [];
    for (const candidate of tagCandidates) {
      const id = String(candidate?.id || '').trim();
      const slug = String(candidate?.slug || '').trim();
      if (!id || !slug || existing.some((tag) => tag.id === id)) continue;
      existing.push({ id, slug });
    }
    tagsByBlueprint.set(blueprintId, existing);
  }
  return tagsByBlueprint;
}

function collectJoinedTagSlugs(
  rows: Array<{ blueprint_id: string; tags?: { slug?: string } | Array<{ slug?: string }> | null }>,
) {
  const tagsByBlueprint = new Map<string, string[]>();
  for (const row of rows) {
    const blueprintId = String(row.blueprint_id || '').trim();
    if (!blueprintId) continue;
    const existing = tagsByBlueprint.get(blueprintId) || [];
    const joined = row.tags;
    const tagCandidates = Array.isArray(joined) ? joined : joined ? [joined] : [];
    for (const candidate of tagCandidates) {
      const slug = String(candidate?.slug || '').trim();
      if (!slug || existing.includes(slug)) continue;
      existing.push(slug);
    }
    tagsByBlueprint.set(blueprintId, existing);
  }
  return tagsByBlueprint;
}

type BuildFeedItemMapsResult = {
  sourceChannelTitleByBlueprint: Map<string, { title: string | null; createdAtMs: number }>;
  sourceChannelAvatarByBlueprint: Map<string, { avatarUrl: string | null; createdAtMs: number }>;
  sourceThumbnailByBlueprint: Map<string, { thumbnailUrl: string | null; createdAtMs: number }>;
  sourceViewCountByBlueprint: Map<string, { viewCount: number | null; createdAtMs: number }>;
  publishedChannelByBlueprint: Map<string, { slug: string; createdAtMs: number }>;
};

async function buildFeedItemMaps(
  db: DbClient,
  feedItems: Array<{ id: string; blueprint_id: string; source_item_id: string; created_at: string }>,
  readSourceRows?: (args: { db: DbClient; sourceIds: string[] }) => Promise<any[]>,
) {
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

  const sourceItemsResult = readSourceRows
    ? { data: await readSourceRows({ db, sourceIds: sourceItemIds }), error: null }
    : await db
      .from('source_items')
      .select('id, source_channel_id, source_channel_title, thumbnail_url, metadata')
      .in('id', sourceItemIds);
  const sourceItemsData = Array.isArray((sourceItemsResult as any)?.data)
    ? (sourceItemsResult as any).data
    : sourceItemsResult;
  const sourceItemsError = (sourceItemsResult as any)?.error || null;
  if (sourceItemsError) throw sourceItemsError;
  const sourceItemsMap = new Map(
    (sourceItemsData || []).map((row: any) => {
      const metadata = toMetadataObject(row.metadata);
      return [row.id, {
        title: row.source_channel_title || getMetadataSourceChannelTitle(metadata) || null,
        avatarUrl: getMetadataSourceChannelAvatarUrl(metadata) || null,
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
  listBlueprintTagRows?: (input: {
    blueprintIds: string[];
  }) => Promise<Array<{
    blueprint_id: string;
    tag_id: string;
    tag_slug: string;
  }>>;
  readPublicFeedRows?: (args: {
    db: DbClient;
    blueprintIds?: string[];
    state?: string | null;
    limit?: number;
    cursor?: { createdAt?: string | null; feedItemId?: string | null } | null;
    requireBlueprint?: boolean;
  }) => Promise<any[]>;
  readSourceRows?: (args: {
    db: DbClient;
    sourceIds: string[];
  }) => Promise<any[]>;
}) {
  const { db, sort, viewerUserId } = input;
  const scope = normalizeWallFeedScope(input.scope);
  const scopedChannel =
    scope !== 'all' && scope !== CANONICAL_JOINED_SCOPE
      ? CHANNELS_CATALOG.find((channel) => channel.slug === scope)
      : null;
  const isSpecificChannelScope = !!scopedChannel;
  const isJoinedScope = scope === CANONICAL_JOINED_SCOPE && !!viewerUserId;

  const limit = isJoinedScope || isSpecificChannelScope ? 96 : 60;
  let query = db
    .from('blueprints')
    .select('id, creator_user_id, title, preview_summary, banner_url, likes_count, created_at')
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
  const [tagsRes, likesRes, feedItemsRes] = await Promise.all([
    input.listBlueprintTagRows
      ? Promise.resolve({
        data: await input.listBlueprintTagRows({ blueprintIds }),
        error: null,
      })
      : db.from('blueprint_tags').select('blueprint_id, tags(id, slug)').in('blueprint_id', blueprintIds),
    viewerUserId
      ? db.from('blueprint_likes').select('blueprint_id').eq('user_id', viewerUserId).in('blueprint_id', blueprintIds)
      : Promise.resolve({ data: [] as { blueprint_id: string }[], error: null }),
    input.readPublicFeedRows
      ? Promise.resolve({
        data: await input.readPublicFeedRows({
          db,
          blueprintIds,
          limit: 5000,
        }),
        error: null,
      })
      : db.from('user_feed_items').select('id, blueprint_id, source_item_id, created_at').in('blueprint_id', blueprintIds),
  ]);

  if (tagsRes.error || likesRes.error || feedItemsRes.error) {
    throw tagsRes.error || likesRes.error || feedItemsRes.error;
  }

  const blueprintTags = input.listBlueprintTagRows
    ? collectJoinedTagRefs((tagsRes.data || []).map((row: any) => ({
      blueprint_id: row.blueprint_id,
      tags: [{ id: row.tag_id, slug: row.tag_slug }],
    })) as Array<{
      blueprint_id: string;
      tags?: { id?: string; slug?: string } | Array<{ id?: string; slug?: string }> | null;
    }>)
    : collectJoinedTagRefs((tagsRes.data || []) as Array<{
      blueprint_id: string;
      tags?: { id?: string; slug?: string } | Array<{ id?: string; slug?: string }> | null;
    }>);
  const likedIds = new Set((likesRes.data || []).map((row: any) => row.blueprint_id));

  const feedItemMaps = await buildFeedItemMaps(db, (feedItemsRes.data || []) as Array<{
    id: string;
    blueprint_id: string;
    source_item_id: string;
    created_at: string;
  }>, input.readSourceRows);

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
      primary: blueprint.preview_summary,
      fallback: 'Open blueprint to view full details.',
      maxChars: 220,
    }),
    profile: { display_name: null, avatar_url: null },
    tags: blueprintTags.get(blueprint.id) || [],
    user_liked: likedIds.has(blueprint.id),
    published_channel_slug: feedItemMaps.publishedChannelByBlueprint.get(blueprint.id)?.slug || null,
    source_channel_title: feedItemMaps.sourceChannelTitleByBlueprint.get(blueprint.id)?.title || null,
    source_channel_avatar_url: feedItemMaps.sourceChannelAvatarByBlueprint.get(blueprint.id)?.avatarUrl || null,
    source_thumbnail_url: feedItemMaps.sourceThumbnailByBlueprint.get(blueprint.id)?.thumbnailUrl || null,
    source_view_count: feedItemMaps.sourceViewCountByBlueprint.get(blueprint.id)?.viewCount ?? null,
    comments_count: 0,
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
  listBlueprintTagRows?: (input: {
    blueprintIds: string[];
  }) => Promise<Array<{
    blueprint_id: string;
    tag_id: string;
    tag_slug: string;
  }>>;
  readFeedRows?: (args: {
    db: DbClient;
    userId: string;
    limit: number;
  }) => Promise<any[]>;
  readSourceRows?: (args: {
    db: DbClient;
    sourceIds: string[];
  }) => Promise<any[]>;
  readUnlockRows?: (args: {
    db: DbClient;
    sourceIds: string[];
  }) => Promise<any[]>;
  readActiveSubscriptions?: (args: {
    db: DbClient;
    userId: string;
  }) => Promise<any[]>;
}) {
  const { db, userId, normalizeTranscriptTruthStatus, limit = 100 } = input;
  const fetchLimit = Math.min(Math.max(limit * 3, limit), 500);
  const feedRows = input.readFeedRows
    ? { data: await input.readFeedRows({ db, userId, limit: fetchLimit }), error: null }
    : await db
      .from('user_feed_items')
      .select('id, source_item_id, blueprint_id, state, last_decision_code, generated_at_on_wall, created_at')
      .eq('user_id', userId)
      .order('generated_at_on_wall', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(fetchLimit);
  const resolvedFeedRows = Array.isArray((feedRows as any)?.data)
    ? (feedRows as any).data
    : feedRows;
  const feedError = (feedRows as any)?.error || null;
  if (feedError) throw feedError;
  if (!resolvedFeedRows || resolvedFeedRows.length === 0) return [] as WallForYouItem[];

  const filteredFeedRows = resolvedFeedRows.filter((row: any) => {
    const isLegacyPendingWithoutBlueprint =
      !row.blueprint_id && (row.state === 'my_feed_pending_accept' || row.state === 'my_feed_skipped');
    return !isLegacyPendingWithoutBlueprint;
  });
  if (filteredFeedRows.length === 0) return [] as WallForYouItem[];

  const sourceIds = [...new Set(filteredFeedRows.map((row: any) => row.source_item_id).filter(Boolean))] as string[];
  const blueprintIds = [...new Set(filteredFeedRows.map((row: any) => row.blueprint_id).filter(Boolean))] as string[];
  const feedItemIds = filteredFeedRows.map((row: any) => row.id);

  const [{ data: sources, error: sourcesError }, { data: blueprints, error: blueprintsError }, { data: candidates, error: candidatesError }, { data: unlocks, error: unlocksError }, { data: subscriptions, error: subscriptionsError }] = await Promise.all([
    input.readSourceRows
      ? Promise.resolve({ data: await input.readSourceRows({ db, sourceIds }), error: null })
      : db.from('source_items').select('id, source_channel_id, source_page_id, source_url, title, source_channel_title, thumbnail_url, metadata').in('id', sourceIds),
    blueprintIds.length
      ? db.from('blueprints').select('id, creator_user_id, title, banner_url, preview_summary, is_public, likes_count').in('id', blueprintIds)
      : Promise.resolve({ data: [], error: null }),
    db.from('channel_candidates').select('id, user_feed_item_id, channel_slug, status, created_at').in('user_feed_item_id', feedItemIds).order('created_at', { ascending: false }),
    sourceIds.length
      ? (input.readUnlockRows
        ? Promise.resolve({ data: await input.readUnlockRows({ db, sourceIds }), error: null })
        : db.from('source_item_unlocks').select('source_item_id, status, estimated_cost, reservation_expires_at, blueprint_id, last_error_code, transcript_status').in('source_item_id', sourceIds))
      : Promise.resolve({ data: [], error: null }),
    input.readActiveSubscriptions
      ? Promise.resolve({ data: await input.readActiveSubscriptions({ db, userId }), error: null })
      : db.from('user_source_subscriptions').select('source_page_id, source_channel_id').eq('user_id', userId).eq('is_active', true),
  ]);
  if (sourcesError || blueprintsError || candidatesError || unlocksError || subscriptionsError) {
    throw sourcesError || blueprintsError || candidatesError || unlocksError || subscriptionsError;
  }

  const { data: tagRows, error: tagRowsError } = blueprintIds.length
    ? (
      input.listBlueprintTagRows
        ? { data: await input.listBlueprintTagRows({ blueprintIds }), error: null }
        : await db.from('blueprint_tags').select('blueprint_id, tags(slug)').in('blueprint_id', blueprintIds)
    )
    : { data: [], error: null };
  if (tagRowsError) throw tagRowsError;

  const { data: likedRows, error: likedError } = blueprintIds.length > 0
    ? await db.from('blueprint_likes').select('blueprint_id').eq('user_id', userId).in('blueprint_id', blueprintIds)
    : { data: [], error: null };
  if (likedError) throw likedError;
  const tagsByBlueprint = input.listBlueprintTagRows
    ? collectJoinedTagSlugs((tagRows || []).map((row: any) => ({
      blueprint_id: row.blueprint_id,
      tags: [{ slug: row.tag_slug }],
    })) as Array<{
      blueprint_id: string;
      tags?: { slug?: string } | Array<{ slug?: string }> | null;
    }>)
    : collectJoinedTagSlugs((tagRows || []) as Array<{
      blueprint_id: string;
      tags?: { slug?: string } | Array<{ slug?: string }> | null;
    }>);

  const sourceMap = new Map((sources || []).map((row: any) => [row.id, row]));
  const unlockMap = new Map((unlocks || []).map((row: any) => [row.source_item_id, row]));
  const transcriptHiddenSourceIds = new Set(
    (unlocks || [])
      .filter((row: any) => {
        const status = normalizeTranscriptTruthStatus((row as { transcript_status?: unknown }).transcript_status);
        if (status === 'confirmed_no_speech' || status === 'retrying') return true;
        const lastErrorCode = String(row.last_error_code || '').trim().toUpperCase();
        return isTranscriptUnavailableForDisplayErrorCode(lastErrorCode) || lastErrorCode === 'TRANSCRIPT_UNAVAILABLE';
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
    const sourceChannelAvatarUrl = getMetadataSourceChannelAvatarUrl(sourceMetadata) || null;
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
        createdAt: resolveFeedItemWallDisplayAt({
          blueprintId: row.blueprint_id,
          createdAt: row.created_at,
          generatedAtOnWall: row.generated_at_on_wall,
        }),
        blueprintId: blueprint.id,
        title: blueprint.title,
        sourceChannelTitle,
        sourceChannelAvatarUrl,
        sourceThumbnailUrl: source.thumbnail_url || null,
        sourceViewCount: parseSourceViewCount(sourceMetadata),
        previewSummary: buildFeedSummary({
          primary: blueprint.preview_summary,
          fallback: source.title || 'Open blueprint to view full details.',
          maxChars: 220,
        }),
        bannerUrl: blueprint.banner_url,
        tags: tagsByBlueprint.get(blueprint.id) || [],
        publishedChannelSlug: candidateMap.get(row.id)?.status === 'published' ? candidateMap.get(row.id)?.channelSlug || null : null,
        likesCount: Number(blueprint.likes_count || 0),
        userLiked: likedIds.has(blueprint.id),
        commentsCount: 0,
      });
      continue;
    }

    items.push({
      kind: 'locked',
      feedItemId: row.id,
      sourceItemId: source.id,
      createdAt: resolveFeedItemWallDisplayAt({
        blueprintId: row.blueprint_id,
        createdAt: row.created_at,
        generatedAtOnWall: row.generated_at_on_wall,
      }),
      title: source.title,
      sourceChannelTitle,
      sourceChannelAvatarUrl,
      sourceUrl: source.source_url,
      unlockCost: sourceUnlock ? Number(sourceUnlock.estimated_cost || 0) : 0,
      sourcePageId,
      sourceChannelId,
      unlockInProgress: isEffectiveUnlockDisplayInProgress({
        status: sourceUnlock?.status,
        reservation_expires_at: sourceUnlock?.reservation_expires_at,
      }),
    });
  }

  items.sort((left, right) => {
    const rightMs = Number.isFinite(Date.parse(right.createdAt)) ? Date.parse(right.createdAt) : 0;
    const leftMs = Number.isFinite(Date.parse(left.createdAt)) ? Date.parse(left.createdAt) : 0;
    if (rightMs !== leftMs) return rightMs - leftMs;
    return String(right.feedItemId).localeCompare(String(left.feedItemId));
  });

  return items.slice(0, limit);
}

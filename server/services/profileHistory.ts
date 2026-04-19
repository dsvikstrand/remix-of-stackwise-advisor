import type { createClient } from '@supabase/supabase-js';
import type { ProfileHistoryBlueprintItem, ProfileHistoryCreatorItem, ProfileHistoryItem } from '../contracts/api/profile';
import { buildSourcePagePath } from './sourcePages';

type DbClient = ReturnType<typeof createClient>;

type FeedRow = {
  id: string;
  user_id?: string;
  source_item_id: string | null;
  blueprint_id: string | null;
  state: string;
  last_decision_code: string | null;
  created_at: string;
};

type SourceRow = {
  id: string;
  source_channel_id: string | null;
  source_page_id: string | null;
  source_url: string;
  title: string;
  source_channel_title: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown> | null;
};

type SourcePageRow = {
  id?: string;
  platform: string | null;
  external_id: string | null;
  title?: string | null;
  avatar_url: string | null;
};

type CandidateRow = {
  id: string;
  user_feed_item_id: string;
  channel_slug: string;
  status: string;
  created_at: string;
};

type UnlockRow = {
  source_item_id: string;
  status: string;
  blueprint_id: string | null;
  last_error_code: string | null;
  transcript_status: string | null;
  updated_at?: string | null;
};

type VariantRow = {
  source_item_id: string;
  status: string;
  blueprint_id: string | null;
  updated_at: string;
};

type BlueprintRow = {
  id: string;
  title: string;
  banner_url: string | null;
};

type BlueprintResolutionOrigin = 'direct' | 'variant' | 'unlock' | 'feed-fallback' | 'missing';

type BlueprintResolution = {
  blueprintId: string | null;
  origin: BlueprintResolutionOrigin;
};

type CreatorIdentity = {
  name: string | null;
  href: string | null;
  avatarUrl: string | null;
};

type CandidateSummary = {
  channelSlug: string | null;
  status: string | null;
};

export const PROFILE_HISTORY_BLUEPRINT_STATES = [
  'my_feed_published',
  'candidate_submitted',
  'candidate_pending_manual_review',
  'channel_published',
  'channel_rejected',
] as const;

const PROFILE_HISTORY_BLUEPRINT_STATE_SET = new Set<string>(PROFILE_HISTORY_BLUEPRINT_STATES);

function toDateMs(raw: unknown) {
  const parsed = Date.parse(String(raw || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMetadata(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function getMetadataString(metadata: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return null;
}

function looksLikeSubscriptionNoticeTitle(value: string | null) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('you are now subscribing to ');
}

function buildCandidateSummaryMap(rows: CandidateRow[]) {
  const firstAnyByFeedItemId = new Map<string, CandidateSummary>();
  const firstPublishedByFeedItemId = new Map<string, CandidateSummary>();

  for (const row of rows) {
    const feedItemId = String(row.user_feed_item_id || '').trim();
    if (!feedItemId) continue;
    if (!firstAnyByFeedItemId.has(feedItemId)) {
      firstAnyByFeedItemId.set(feedItemId, {
        channelSlug: String(row.channel_slug || '').trim() || null,
        status: String(row.status || '').trim() || null,
      });
    }
    if (String(row.status || '').trim().toLowerCase() === 'published' && !firstPublishedByFeedItemId.has(feedItemId)) {
      firstPublishedByFeedItemId.set(feedItemId, {
        channelSlug: String(row.channel_slug || '').trim() || null,
        status: String(row.status || '').trim() || null,
      });
    }
  }

  const result = new Map<string, CandidateSummary>();
  for (const [feedItemId, summary] of firstAnyByFeedItemId.entries()) {
    result.set(feedItemId, firstPublishedByFeedItemId.get(feedItemId) || summary);
  }
  return result;
}

function buildLatestBlueprintBySourceItemId(rows: FeedRow[]) {
  const result = new Map<string, string>();
  for (const row of rows) {
    const sourceItemId = String(row.source_item_id || '').trim();
    const blueprintId = String(row.blueprint_id || '').trim();
    if (!sourceItemId || !blueprintId || result.has(sourceItemId)) continue;
    result.set(sourceItemId, blueprintId);
  }
  return result;
}

function buildLatestReadyVariantBySourceItemId(rows: VariantRow[]) {
  const result = new Map<string, VariantRow>();
  for (const row of rows) {
    const sourceItemId = String(row.source_item_id || '').trim();
    const blueprintId = String(row.blueprint_id || '').trim();
    if (!sourceItemId || !blueprintId) continue;

    const existing = result.get(sourceItemId);
    if (!existing || toDateMs(row.updated_at) > toDateMs(existing.updated_at)) {
      result.set(sourceItemId, row);
    }
  }
  return result;
}

function buildTranscriptHiddenSourceIdSet(
  rows: UnlockRow[],
  normalizeTranscriptTruthStatus: (value: unknown) => string,
) {
  const hidden = new Set<string>();
  for (const row of rows) {
    const sourceItemId = String(row.source_item_id || '').trim();
    if (!sourceItemId) continue;

    const normalizedTranscriptStatus = normalizeTranscriptTruthStatus(row.transcript_status);
    if (normalizedTranscriptStatus === 'confirmed_no_speech' || normalizedTranscriptStatus === 'retrying') {
      hidden.add(sourceItemId);
      continue;
    }

    const normalizedErrorCode = String(row.last_error_code || '').trim().toUpperCase();
    if (
      normalizedErrorCode === 'NO_TRANSCRIPT_PERMANENT'
      || normalizedErrorCode === 'TRANSCRIPT_UNAVAILABLE'
      || normalizedErrorCode === 'TRANSCRIPT_INSUFFICIENT_CONTEXT'
    ) {
      hidden.add(sourceItemId);
    }
  }
  return hidden;
}

function resolveBlueprintForFeedRow(input: {
  row: FeedRow;
  readyVariantBySourceItemId: Map<string, VariantRow>;
  unlockBySourceItemId: Map<string, UnlockRow>;
  latestBlueprintBySourceItemId: Map<string, string>;
}) {
  const directBlueprintId = String(input.row.blueprint_id || '').trim();
  if (directBlueprintId) {
    return { blueprintId: directBlueprintId, origin: 'direct' } satisfies BlueprintResolution;
  }

  const sourceItemId = String(input.row.source_item_id || '').trim();
  if (!sourceItemId) {
    return { blueprintId: null, origin: 'missing' } satisfies BlueprintResolution;
  }

  const readyVariant = input.readyVariantBySourceItemId.get(sourceItemId);
  const variantBlueprintId = String(readyVariant?.blueprint_id || '').trim();
  if (variantBlueprintId) {
    return { blueprintId: variantBlueprintId, origin: 'variant' } satisfies BlueprintResolution;
  }

  const unlockBlueprintId = String(input.unlockBySourceItemId.get(sourceItemId)?.blueprint_id || '').trim();
  if (unlockBlueprintId) {
    return { blueprintId: unlockBlueprintId, origin: 'unlock' } satisfies BlueprintResolution;
  }

  const fallbackBlueprintId = String(input.latestBlueprintBySourceItemId.get(sourceItemId) || '').trim();
  if (fallbackBlueprintId) {
    return { blueprintId: fallbackBlueprintId, origin: 'feed-fallback' } satisfies BlueprintResolution;
  }

  return { blueprintId: null, origin: 'missing' } satisfies BlueprintResolution;
}

function resolveCreatorIdentity(input: {
  source: SourceRow | null;
  sourcePageById: Map<string, SourcePageRow>;
  sourcePageByExternalId: Map<string, SourcePageRow>;
}) {
  const source = input.source;
  if (!source) {
    return {
      name: null,
      href: null,
      avatarUrl: null,
    } satisfies CreatorIdentity;
  }

  const metadata = normalizeMetadata(source.metadata);
  const sourcePageId = String(source.source_page_id || '').trim();
  const sourceChannelId = String(source.source_channel_id || '').trim();
  const sourcePage = sourcePageId
    ? input.sourcePageById.get(sourcePageId) || null
    : (sourceChannelId ? input.sourcePageByExternalId.get(sourceChannelId) || null : null);

  const sourcePagePath = sourcePage
    ? buildSourcePagePath(String(sourcePage.platform || ''), String(sourcePage.external_id || ''))
    : null;

  const fallbackSourceTitle = looksLikeSubscriptionNoticeTitle(source.title) ? null : String(source.title || '').trim() || null;

  return {
    name:
      String(sourcePage?.title || '').trim()
      || String(source.source_channel_title || '').trim()
      || getMetadataString(metadata, 'source_channel_title', 'channel_title')
      || fallbackSourceTitle,
    href: sourcePagePath,
    avatarUrl:
      getMetadataString(metadata, 'source_channel_avatar_url', 'channel_avatar_url')
      || String(sourcePage?.avatar_url || '').trim()
      || String(source.thumbnail_url || '').trim()
      || null,
  } satisfies CreatorIdentity;
}

function buildBlueprintStatusText(state: string, candidate: CandidateSummary | undefined) {
  const normalizedState = String(state || '').trim();
  if (normalizedState === 'channel_published') {
    return candidate?.channelSlug ? `Published to ${candidate.channelSlug}` : 'Published';
  }
  if (normalizedState === 'candidate_pending_manual_review') return 'Needs review';
  if (normalizedState === 'candidate_submitted') return 'Publishing...';
  if (normalizedState === 'channel_rejected') return 'In My Feed';
  if (normalizedState === 'my_feed_published') return 'In My Feed';
  return null;
}

export type ResolvedProfileHistory = {
  items: ProfileHistoryItem[];
  repairCandidates: Array<{ feedItemId: string; blueprintId: string; origin: Exclude<BlueprintResolutionOrigin, 'direct' | 'missing'> }>;
  unresolvedItemIds: string[];
  inspectedCount: number;
};

export type ProfileHistoryRepairReport = {
  userId: string;
  inspectedCount: number;
  repairedCount: number;
  unresolvedCount: number;
  repairedFeedItemIds: string[];
  unresolvedFeedItemIds: string[];
  dryRun: boolean;
};

export async function resolveProfileHistory(input: {
  db: DbClient;
  userId: string;
  normalizeTranscriptTruthStatus: (value: unknown) => string;
  limit?: number;
  readFeedRows?: (args: {
    db: DbClient;
    userId: string;
    limit: number;
    sourceItemIds?: string[];
    requireBlueprint?: boolean;
  }) => Promise<any[]>;
  readSourceRows?: (args: {
    db: DbClient;
    sourceIds: string[];
  }) => Promise<any[]>;
  readUnlockRows?: (args: {
    db: DbClient;
    sourceIds: string[];
  }) => Promise<any[]>;
  readVariantRows?: (args: {
    db: DbClient;
    sourceIds: string[];
  }) => Promise<any[]>;
  readChannelCandidateRows?: (args: {
    db: DbClient;
    feedItemIds: string[];
    statuses?: string[];
  }) => Promise<any[]>;
  readBlueprintRows?: (args: {
    db: DbClient;
    blueprintIds: string[];
    limit?: number;
  }) => Promise<any[]>;
}): Promise<ResolvedProfileHistory> {
  const limit = Math.max(1, Math.min(500, Number(input.limit || 120)));
  const feedRowsResult = input.readFeedRows
    ? { data: await input.readFeedRows({ db: input.db, userId: input.userId, limit }), error: null }
    : await input.db
      .from('user_feed_items')
      .select('id, user_id, source_item_id, blueprint_id, state, last_decision_code, created_at')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(limit);
  const feedRowsData = feedRowsResult.data;
  const feedError = feedRowsResult.error;

  if (feedError) throw feedError;

  const feedRows = ((feedRowsData || []) as FeedRow[]).filter((row) => {
    const hasBlueprint = Boolean(String(row.blueprint_id || '').trim());
    const normalizedState = String(row.state || '').trim();
    const isLegacyPendingWithoutBlueprint =
      !hasBlueprint && (normalizedState === 'my_feed_pending_accept' || normalizedState === 'my_feed_skipped');
    return !isLegacyPendingWithoutBlueprint;
  });

  if (!feedRows.length) {
    return {
      items: [],
      repairCandidates: [],
      unresolvedItemIds: [],
      inspectedCount: 0,
    };
  }

  const sourceIds = Array.from(new Set(feedRows.map((row) => String(row.source_item_id || '').trim()).filter(Boolean)));
  const feedItemIds = feedRows.map((row) => row.id);

  const [
    { data: sourceRowsData, error: sourceError },
    { data: candidateRowsData, error: candidateError },
    { data: unlockRowsData, error: unlockError },
    { data: variantRowsData, error: variantError },
    { data: latestBlueprintRowsData, error: latestBlueprintError },
  ] = await Promise.all([
    sourceIds.length
      ? (input.readSourceRows
        ? Promise.resolve({
          data: input.readSourceRows({ db: input.db, sourceIds }),
          error: null,
        }).then(async (result) => ({ data: await result.data, error: result.error }))
        : input.db
          .from('source_items')
          .select('id, source_channel_id, source_page_id, source_url, title, source_channel_title, thumbnail_url, metadata')
          .in('id', sourceIds))
      : Promise.resolve({ data: [], error: null }),
    feedItemIds.length
      ? (input.readChannelCandidateRows
        ? Promise.resolve({
          data: input.readChannelCandidateRows({ db: input.db, feedItemIds }),
          error: null,
        }).then(async (result) => ({ data: await result.data, error: result.error }))
        : input.db
          .from('channel_candidates')
          .select('id, user_feed_item_id, channel_slug, status, created_at')
          .in('user_feed_item_id', feedItemIds)
          .order('created_at', { ascending: false }))
      : Promise.resolve({ data: [], error: null }),
    sourceIds.length
      ? (input.readUnlockRows
        ? Promise.resolve({
          data: input.readUnlockRows({ db: input.db, sourceIds }),
          error: null,
        }).then(async (result) => ({ data: await result.data, error: result.error }))
        : input.db
          .from('source_item_unlocks')
          .select('source_item_id, status, blueprint_id, last_error_code, transcript_status, updated_at')
          .in('source_item_id', sourceIds))
      : Promise.resolve({ data: [], error: null }),
    sourceIds.length
      ? (input.readVariantRows
        ? Promise.resolve({
          data: input.readVariantRows({ db: input.db, sourceIds }),
          error: null,
        }).then(async (result) => ({ data: await result.data, error: result.error }))
        : input.db
          .from('source_item_blueprint_variants')
          .select('source_item_id, status, blueprint_id, updated_at')
          .eq('status', 'ready')
          .in('source_item_id', sourceIds)
          .order('updated_at', { ascending: false }))
      : Promise.resolve({ data: [], error: null }),
    sourceIds.length
      ? (input.readFeedRows
        ? Promise.resolve({
          data: input.readFeedRows({
            db: input.db,
            userId: input.userId,
            limit,
            sourceItemIds: sourceIds,
            requireBlueprint: true,
          }),
          error: null,
        }).then(async (result) => ({ data: await result.data, error: result.error }))
        : input.db
          .from('user_feed_items')
          .select('id, user_id, source_item_id, blueprint_id, state, last_decision_code, created_at')
          .eq('user_id', input.userId)
          .in('source_item_id', sourceIds)
          .not('blueprint_id', 'is', null)
          .order('created_at', { ascending: false }))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (sourceError || candidateError || unlockError || variantError || latestBlueprintError) {
    throw sourceError || candidateError || unlockError || variantError || latestBlueprintError;
  }

  const sourceRows = (sourceRowsData || []) as SourceRow[];
  const unlockRows = (unlockRowsData || []) as UnlockRow[];
  const variantRows = (variantRowsData || []) as VariantRow[];
  const latestBlueprintRows = (latestBlueprintRowsData || []) as FeedRow[];
  const sourceMap = new Map(sourceRows.map((row) => [String(row.id || '').trim(), row]));
  const unlockBySourceItemId = new Map(
    unlockRows
      .map((row) => [String(row.source_item_id || '').trim(), row] as const)
      .filter(([sourceItemId]) => Boolean(sourceItemId)),
  );
  const readyVariantBySourceItemId = buildLatestReadyVariantBySourceItemId(variantRows);
  const latestBlueprintBySourceItemId = buildLatestBlueprintBySourceItemId(latestBlueprintRows);
  const transcriptHiddenSourceIds = buildTranscriptHiddenSourceIdSet(unlockRows, input.normalizeTranscriptTruthStatus);
  const candidateByFeedItemId = buildCandidateSummaryMap((candidateRowsData || []) as CandidateRow[]);

  const sourcePageIds = Array.from(new Set(
    sourceRows.map((row) => String(row.source_page_id || '').trim()).filter(Boolean),
  ));
  const sourceChannelIds = Array.from(new Set(
    sourceRows.map((row) => String(row.source_channel_id || '').trim()).filter(Boolean),
  ));
  const [
    { data: sourcePagesByIdData, error: sourcePagesByIdError },
    { data: sourcePagesByExternalData, error: sourcePagesByExternalError },
  ] = await Promise.all([
    sourcePageIds.length
      ? input.db
        .from('source_pages')
        .select('id, platform, external_id, title, avatar_url')
        .in('id', sourcePageIds)
      : Promise.resolve({ data: [], error: null }),
    sourceChannelIds.length
      ? input.db
        .from('source_pages')
        .select('id, platform, external_id, title, avatar_url')
        .eq('platform', 'youtube')
        .in('external_id', sourceChannelIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (sourcePagesByIdError || sourcePagesByExternalError) {
    throw sourcePagesByIdError || sourcePagesByExternalError;
  }

  const sourcePageById = new Map(
    ((sourcePagesByIdData || []) as SourcePageRow[])
      .map((row) => [String(row.id || '').trim(), row] as const)
      .filter(([id]) => Boolean(id)),
  );
  const sourcePageByExternalId = new Map(
    ((sourcePagesByExternalData || []) as SourcePageRow[])
      .map((row) => [String(row.external_id || '').trim(), row] as const)
      .filter(([externalId]) => Boolean(externalId)),
  );

  const visibleFeedRows = feedRows.filter((row) => {
    if (String(row.state || '').trim() === 'subscription_notice') return true;
    const sourceItemId = String(row.source_item_id || '').trim();
    if (sourceItemId && transcriptHiddenSourceIds.has(sourceItemId)) return false;
    return true;
  });

  const blueprintResolutionByFeedItemId = new Map<string, BlueprintResolution>();
  const repairCandidates: ResolvedProfileHistory['repairCandidates'] = [];
  const unresolvedItemIds: string[] = [];

  for (const row of visibleFeedRows) {
    if (String(row.state || '').trim() === 'subscription_notice') continue;

    const resolution = resolveBlueprintForFeedRow({
      row,
      readyVariantBySourceItemId,
      unlockBySourceItemId,
      latestBlueprintBySourceItemId,
    });
    blueprintResolutionByFeedItemId.set(row.id, resolution);

    if (resolution.blueprintId && !String(row.blueprint_id || '').trim() && resolution.origin !== 'direct' && resolution.origin !== 'missing') {
      repairCandidates.push({
        feedItemId: row.id,
        blueprintId: resolution.blueprintId,
        origin: resolution.origin,
      });
      continue;
    }

    if (!resolution.blueprintId && PROFILE_HISTORY_BLUEPRINT_STATE_SET.has(String(row.state || '').trim())) {
      unresolvedItemIds.push(row.id);
    }
  }

  const blueprintIds = Array.from(new Set(
    Array.from(blueprintResolutionByFeedItemId.values())
      .map((resolution) => resolution.blueprintId)
      .filter((value): value is string => Boolean(value)),
  ));

  const { data: blueprintRowsData, error: blueprintError } = blueprintIds.length
    ? (
      input.readBlueprintRows
        ? { data: await input.readBlueprintRows({ db: input.db, blueprintIds, limit: blueprintIds.length }), error: null }
        : await input.db
          .from('blueprints')
          .select('id, title, banner_url')
          .in('id', blueprintIds)
    )
    : { data: [], error: null };
  if (blueprintError) throw blueprintError;

  const blueprintMap = new Map(
    ((blueprintRowsData || []) as BlueprintRow[])
      .map((row) => [String(row.id || '').trim(), row] as const)
      .filter(([id]) => Boolean(id)),
  );

  const items: ProfileHistoryItem[] = [];

  for (const row of visibleFeedRows) {
    const source = sourceMap.get(String(row.source_item_id || '').trim()) || null;
    const creator = resolveCreatorIdentity({
      source,
      sourcePageById,
      sourcePageByExternalId,
    });
    const normalizedState = String(row.state || '').trim();

    if (normalizedState === 'subscription_notice') {
      if (!creator.name || !creator.href) {
        unresolvedItemIds.push(row.id);
        continue;
      }

      const item: ProfileHistoryCreatorItem = {
        id: row.id,
        kind: 'creator',
        title: creator.name,
        subtitle: 'Subscribed creator',
        href: creator.href,
        createdAt: row.created_at,
        avatarUrl: creator.avatarUrl,
        badge: 'Creator',
        statusText: null,
        bannerUrl: null,
      };
      items.push(item);
      continue;
    }

    const resolution = blueprintResolutionByFeedItemId.get(row.id);
    if (!resolution?.blueprintId) continue;

    const blueprint = blueprintMap.get(resolution.blueprintId);
    if (!blueprint) {
      unresolvedItemIds.push(row.id);
      continue;
    }

    const item: ProfileHistoryBlueprintItem = {
      id: row.id,
      kind: 'blueprint',
      title: String(blueprint.title || '').trim() || 'Untitled blueprint',
      subtitle: creator.name || 'Creator',
      href: `/blueprint/${blueprint.id}`,
      createdAt: row.created_at,
      avatarUrl: creator.avatarUrl,
      badge: 'Blueprint',
      statusText: buildBlueprintStatusText(normalizedState, candidateByFeedItemId.get(row.id)),
      bannerUrl: String(blueprint.banner_url || '').trim() || null,
    };
    items.push(item);
  }

  return {
    items,
    repairCandidates,
    unresolvedItemIds: Array.from(new Set(unresolvedItemIds)),
    inspectedCount: visibleFeedRows.length,
  };
}

export async function repairProfileHistoryBlueprintIdsForUser(input: {
  db: DbClient;
  userId: string;
  normalizeTranscriptTruthStatus: (value: unknown) => string;
  limit?: number;
  dryRun?: boolean;
}): Promise<ProfileHistoryRepairReport> {
  const resolved = await resolveProfileHistory({
    db: input.db,
    userId: input.userId,
    normalizeTranscriptTruthStatus: input.normalizeTranscriptTruthStatus,
    limit: input.limit,
  });

  const dryRun = Boolean(input.dryRun);
  const repairedFeedItemIds: string[] = [];
  for (const candidate of resolved.repairCandidates) {
    repairedFeedItemIds.push(candidate.feedItemId);
    if (dryRun) continue;
    const { error } = await input.db
      .from('user_feed_items')
      .update({ blueprint_id: candidate.blueprintId })
      .eq('id', candidate.feedItemId)
      .eq('user_id', input.userId);
    if (error) throw error;
  }

  return {
    userId: input.userId,
    inspectedCount: resolved.inspectedCount,
    repairedCount: repairedFeedItemIds.length,
    unresolvedCount: resolved.unresolvedItemIds.length,
    repairedFeedItemIds,
    unresolvedFeedItemIds: resolved.unresolvedItemIds,
    dryRun,
  };
}

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MyFeedItemView {
  id: string;
  state: string;
  lastDecisionCode: string | null;
  createdAt: string;
  source: {
    id: string;
    sourceChannelId: string | null;
    sourcePageId: string | null;
    sourceUrl: string;
    title: string;
    sourceChannelTitle: string | null;
    sourceChannelAvatarUrl: string | null;
    thumbnailUrl: string | null;
    channelBannerUrl: string | null;
    unlockStatus: 'available' | 'reserved' | 'processing' | 'ready' | null;
    unlockCost: number | null;
    unlockInProgress: boolean;
    readyBlueprintId: string | null;
  } | null;
  blueprint: {
    id: string;
    title: string;
    bannerUrl: string | null;
    llmReview: string | null;
    isPublic: boolean;
    steps: unknown;
    tags: string[];
  } | null;
  candidate: {
    id: string;
    channelSlug: string;
    status: string;
  } | null;
}

export function useMyFeed(options?: { enabled?: boolean }) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['my-feed-items', user?.id],
    enabled: !!user && (options?.enabled ?? true),
    queryFn: async () => {
      if (!user) return [] as MyFeedItemView[];

      const { data: feedRows, error: feedError } = await supabase
        .from('user_feed_items')
        .select('id, source_item_id, blueprint_id, state, last_decision_code, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (feedError) throw feedError;
      if (!feedRows || feedRows.length === 0) return [] as MyFeedItemView[];

      const filteredFeedRows = feedRows.filter((row) => {
        const isLegacyPendingWithoutBlueprint =
          !row.blueprint_id && (row.state === 'my_feed_pending_accept' || row.state === 'my_feed_skipped');
        return !isLegacyPendingWithoutBlueprint;
      });
      if (filteredFeedRows.length === 0) return [] as MyFeedItemView[];

      const sourceIds = [...new Set(filteredFeedRows.map((row) => row.source_item_id).filter(Boolean))] as string[];
      const blueprintIds = [...new Set(filteredFeedRows.map((row) => row.blueprint_id).filter(Boolean))] as string[];
      const feedItemIds = filteredFeedRows.map((row) => row.id);

      const [{ data: sources }, { data: blueprints }, { data: candidates }, { data: unlocks }] = await Promise.all([
        supabase
          .from('source_items')
          .select('id, source_channel_id, source_page_id, source_url, title, source_channel_title, thumbnail_url, metadata')
          .in('id', sourceIds),
        blueprintIds.length
          ? supabase.from('blueprints').select('id, title, banner_url, llm_review, is_public, steps').in('id', blueprintIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('channel_candidates')
          .select('id, user_feed_item_id, channel_slug, status, created_at')
            .in('user_feed_item_id', feedItemIds)
            .order('created_at', { ascending: false }),
        sourceIds.length
          ? supabase
            .from('source_item_unlocks')
            .select('source_item_id, status, estimated_cost, blueprint_id')
            .in('source_item_id', sourceIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const { data: tagRows } = blueprintIds.length
        ? await supabase
          .from('blueprint_tags')
          .select('blueprint_id, tags(slug)')
          .in('blueprint_id', blueprintIds)
        : { data: [] as Array<{ blueprint_id: string; tags: { slug: string } | { slug: string }[] | null }> };

      const tagsByBlueprint = new Map<string, string[]>();
      (tagRows || []).forEach((row) => {
        const list = tagsByBlueprint.get(row.blueprint_id) || [];
        if (Array.isArray(row.tags)) {
          row.tags.forEach((tag) => {
            if (tag && typeof tag === 'object' && 'slug' in tag) {
              list.push(String((tag as { slug: string }).slug));
            }
          });
        } else if (row.tags && typeof row.tags === 'object' && 'slug' in row.tags) {
          list.push(String((row.tags as { slug: string }).slug));
        }
        tagsByBlueprint.set(row.blueprint_id, list);
      });

      const sourceMap = new Map((sources || []).map((row) => [row.id, row]));
      const sourcePageIds = [...new Set((sources || []).map((row) => String(row.source_page_id || '').trim()).filter(Boolean))];
      const { data: sourcePagesData } = sourcePageIds.length
        ? await supabase
          .from('source_pages')
          .select('id, avatar_url')
          .in('id', sourcePageIds)
        : { data: [] as Array<{ id: string; avatar_url: string | null }> };
      const sourcePageAvatarById = new Map((sourcePagesData || []).map((row) => [row.id, row.avatar_url || null]));
      const unlockMap = new Map((unlocks || []).map((row) => [row.source_item_id, row]));
      const blueprintMap = new Map((blueprints || []).map((row) => [row.id, row]));
      const candidateMap = new Map<string, { id: string; channelSlug: string; status: string }>();
      (candidates || []).forEach((row) => {
        if (candidateMap.has(row.user_feed_item_id)) return;
        candidateMap.set(row.user_feed_item_id, {
          id: row.id,
          channelSlug: row.channel_slug,
          status: row.status,
        });
      });

      return filteredFeedRows.map((row) => {
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
                sourceUrl: source.source_url,
                title: source.title,
                sourceChannelTitle: source.source_channel_title || metadataSourceChannelTitle || null,
                sourceChannelAvatarUrl:
                  metadataSourceChannelAvatarUrl
                  || sourcePageAvatarById.get(String(source.source_page_id || '').trim())
                  || null,
                thumbnailUrl: source.thumbnail_url || null,
                channelBannerUrl:
                  source.metadata
                  && typeof source.metadata === 'object'
                  && source.metadata !== null
                  && 'channel_banner_url' in source.metadata
                    ? String((source.metadata as Record<string, unknown>).channel_banner_url || '') || null
                    : null,
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
                title: blueprint.title,
                bannerUrl: blueprint.banner_url,
                llmReview: blueprint.llm_review,
                isPublic: blueprint.is_public,
                steps: blueprint.steps,
                tags: tagsByBlueprint.get(blueprint.id) || [],
              }
            : null,
          candidate: candidateMap.get(row.id) || null,
        } as MyFeedItemView;
      });
    },
  });

  const grouped = useMemo(() => {
    const items = query.data || [];
    return {
      needsAction: items.filter((item) => !item.candidate),
      pendingReview: items.filter((item) => item.state === 'candidate_pending_manual_review'),
      published: items.filter((item) => item.state === 'channel_published'),
      rejected: items.filter((item) => item.state === 'channel_rejected'),
      all: items,
    };
  }, [query.data]);

  return {
    ...query,
    grouped,
  };
}

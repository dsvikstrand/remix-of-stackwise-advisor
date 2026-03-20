import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildFeedSummary } from '@/lib/feedPreview';
import { normalizeTag } from '@/lib/tagging';
import { searchSourcePages } from '@/lib/sourcePagesApi';

export type ExploreFilter = 'all' | 'blueprints' | 'users' | 'sources';

export interface BlueprintResult {
  type: 'blueprint';
  id: string;
  title: string;
  previewSummary: string;
  bannerUrl: string | null;
  sourceThumbnailUrl?: string | null;
  likesCount: number;
  creatorUserId: string;
  createdAt: string;
  tags: string[];
}

export interface UserResult {
  type: 'user';
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  followerCount: number;
}

export interface SourceResult {
  type: 'source';
  id: string;
  platform: string;
  externalId: string;
  title: string;
  avatarUrl: string | null;
  externalUrl: string;
  path: string;
}

export type ExploreResult = BlueprintResult | UserResult | SourceResult;

interface UseExploreSearchOptions {
  query: string;
  filter: ExploreFilter;
  enabled?: boolean;
}

async function searchBlueprints(query: string, isTagSearch: boolean): Promise<BlueprintResult[]> {
  const normalizedQuery = normalizeTag(query.replace(/^#/, ''));
  
  if (isTagSearch && normalizedQuery) {
    // Search by tag slug
    const { data: tagMatches } = await supabase
      .from('tags')
      .select('id')
      .ilike('slug', `%${normalizedQuery}%`);

    if (!tagMatches || tagMatches.length === 0) return [];

    const tagIds = tagMatches.map(t => t.id);

    const { data: blueprintTags } = await supabase
      .from('blueprint_tags')
      .select('blueprint_id')
      .in('tag_id', tagIds);

    if (!blueprintTags || blueprintTags.length === 0) return [];

    const blueprintIds = [...new Set(blueprintTags.map(bt => bt.blueprint_id))];

    const { data: blueprints, error } = await supabase
      .from('blueprints')
      .select('id, title, preview_summary, banner_url, likes_count, creator_user_id, created_at')
      .eq('is_public', true)
      .in('id', blueprintIds)
      .order('likes_count', { ascending: false })
      .limit(20);

    if (error || !blueprints) return [];

    // Fetch tags for each blueprint
    const { data: allTags } = await supabase
      .from('blueprint_tags')
      .select('blueprint_id, tags(slug)')
      .in('blueprint_id', blueprintIds);

    const tagsByBlueprint = new Map<string, string[]>();
    allTags?.forEach(bt => {
      const existing = tagsByBlueprint.get(bt.blueprint_id) || [];
      if (bt.tags && typeof bt.tags === 'object' && 'slug' in bt.tags) {
        existing.push((bt.tags as { slug: string }).slug);
      }
      tagsByBlueprint.set(bt.blueprint_id, existing);
    });

    return blueprints.map(b => ({
      type: 'blueprint' as const,
      id: b.id,
      title: b.title,
      previewSummary: buildFeedSummary({
        primary: b.preview_summary,
        fallback: 'Open blueprint to view full details.',
        maxChars: 190,
      }),
      bannerUrl: b.banner_url,
      likesCount: b.likes_count,
      creatorUserId: b.creator_user_id,
      createdAt: b.created_at,
      tags: tagsByBlueprint.get(b.id) || [],
    }));
  }

  // Search by title
  const { data: blueprints, error } = await supabase
    .from('blueprints')
    .select('id, title, preview_summary, banner_url, likes_count, creator_user_id, created_at')
    .eq('is_public', true)
    .ilike('title', `%${query}%`)
    .order('likes_count', { ascending: false })
    .limit(20);

  if (error || !blueprints) return [];

  // Fetch tags
  const blueprintIds = blueprints.map(b => b.id);
  const { data: allTags } = await supabase
    .from('blueprint_tags')
    .select('blueprint_id, tags(slug)')
    .in('blueprint_id', blueprintIds);

  const tagsByBlueprint = new Map<string, string[]>();
  allTags?.forEach(bt => {
    const existing = tagsByBlueprint.get(bt.blueprint_id) || [];
    if (bt.tags && typeof bt.tags === 'object' && 'slug' in bt.tags) {
      existing.push((bt.tags as { slug: string }).slug);
    }
    tagsByBlueprint.set(bt.blueprint_id, existing);
  });

  const titleResults = blueprints.map(b => ({
    type: 'blueprint' as const,
    id: b.id,
    title: b.title,
    previewSummary: buildFeedSummary({
      primary: b.preview_summary,
      fallback: 'Open blueprint to view full details.',
      maxChars: 190,
    }),
    bannerUrl: b.banner_url,
    likesCount: b.likes_count,
    creatorUserId: b.creator_user_id,
    createdAt: b.created_at,
    tags: tagsByBlueprint.get(b.id) || [],
  }));

  if (!normalizedQuery) return titleResults;

  const tagResults = await searchBlueprints(`#${normalizedQuery}`, true);
  if (tagResults.length === 0) return titleResults;

  const seenIds = new Set(titleResults.map((row) => row.id));
  const tagOnlyResults = tagResults.filter((row) => !seenIds.has(row.id));
  return [...titleResults, ...tagOnlyResults];
}

async function searchUsers(query: string): Promise<UserResult[]> {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url, bio, follower_count')
    .eq('is_public', true)
    .ilike('display_name', `%${query}%`)
    .order('follower_count', { ascending: false })
    .limit(15);

  if (error || !users) return [];

  return users.map(u => ({
    type: 'user' as const,
    userId: u.user_id,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    bio: u.bio,
    followerCount: u.follower_count,
  }));
}

async function searchSources(query: string): Promise<SourceResult[]> {
  const trimmedQuery = String(query || '').trim();
  if (trimmedQuery.length < 2) return [];

  try {
    const payload = await searchSourcePages({ q: trimmedQuery, limit: 20 });
    return (payload.items || []).map((item) => ({
      type: 'source' as const,
      id: item.id,
      platform: item.platform,
      externalId: item.external_id,
      title: item.title,
      avatarUrl: item.avatar_url,
      externalUrl: item.external_url,
      path: item.path,
    }));
  } catch {
    // Keep Explore resilient when backend source search is unavailable.
    return [];
  }
}

export function useExploreSearch({ query, filter, enabled = true }: UseExploreSearchOptions) {
  const trimmedQuery = query.trim();
  const isTagSearch = trimmedQuery.startsWith('#');

  return useQuery({
    queryKey: ['explore-search', trimmedQuery, filter],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async (): Promise<ExploreResult[]> => {
      if (!trimmedQuery) return [];

      const results: ExploreResult[] = [];

      if (filter === 'all' || filter === 'blueprints') {
        const blueprints = await searchBlueprints(trimmedQuery, isTagSearch);
        results.push(...blueprints);
      }

      if ((filter === 'all' || filter === 'users') && !isTagSearch) {
        const users = await searchUsers(trimmedQuery);
        results.push(...users);
      }

      if ((filter === 'all' || filter === 'sources') && !isTagSearch) {
        const sources = await searchSources(trimmedQuery);
        results.push(...sources);
      }

      return results;
    },
    enabled: enabled && trimmedQuery.length > 0,
  });
}

export function useTrendingTags() {
  return useQuery({
    queryKey: ['trending-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('id, slug, follower_count')
        .order('follower_count', { ascending: false })
        .limit(6);

      if (error) throw error;
      return data || [];
    },
    staleTime: 120_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}

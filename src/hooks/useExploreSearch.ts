import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeTag } from '@/lib/tagging';

export type ExploreFilter = 'all' | 'blueprints' | 'inventories' | 'users';

export interface BlueprintResult {
  type: 'blueprint';
  id: string;
  title: string;
  selectedItems: unknown;
  likesCount: number;
  creatorUserId: string;
  createdAt: string;
  tags: string[];
}

export interface InventoryResult {
  type: 'inventory';
  id: string;
  title: string;
  promptCategories: string;
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

export type ExploreResult = BlueprintResult | InventoryResult | UserResult;

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
      .select('id, title, selected_items, likes_count, creator_user_id, created_at')
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
      selectedItems: b.selected_items,
      likesCount: b.likes_count,
      creatorUserId: b.creator_user_id,
      createdAt: b.created_at,
      tags: tagsByBlueprint.get(b.id) || [],
    }));
  }

  // Search by title
  const { data: blueprints, error } = await supabase
    .from('blueprints')
    .select('id, title, selected_items, likes_count, creator_user_id, created_at')
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

  return blueprints.map(b => ({
    type: 'blueprint' as const,
    id: b.id,
    title: b.title,
    selectedItems: b.selected_items,
    likesCount: b.likes_count,
    creatorUserId: b.creator_user_id,
    createdAt: b.created_at,
    tags: tagsByBlueprint.get(b.id) || [],
  }));
}

async function searchInventories(query: string, isTagSearch: boolean): Promise<InventoryResult[]> {
  const normalizedQuery = normalizeTag(query.replace(/^#/, ''));

  if (isTagSearch && normalizedQuery) {
    const { data: tagMatches } = await supabase
      .from('tags')
      .select('id')
      .ilike('slug', `%${normalizedQuery}%`);

    if (!tagMatches || tagMatches.length === 0) return [];

    const tagIds = tagMatches.map(t => t.id);

    const { data: inventoryTags } = await supabase
      .from('inventory_tags')
      .select('inventory_id')
      .in('tag_id', tagIds);

    if (!inventoryTags || inventoryTags.length === 0) return [];

    const inventoryIds = [...new Set(inventoryTags.map(it => it.inventory_id))];

    const { data: inventories, error } = await supabase
      .from('inventories')
      .select('id, title, prompt_categories, likes_count, creator_user_id, created_at')
      .eq('is_public', true)
      .in('id', inventoryIds)
      .order('likes_count', { ascending: false })
      .limit(20);

    if (error || !inventories) return [];

    const { data: allTags } = await supabase
      .from('inventory_tags')
      .select('inventory_id, tags(slug)')
      .in('inventory_id', inventoryIds);

    const tagsByInventory = new Map<string, string[]>();
    allTags?.forEach(it => {
      const existing = tagsByInventory.get(it.inventory_id) || [];
      if (it.tags && typeof it.tags === 'object' && 'slug' in it.tags) {
        existing.push((it.tags as { slug: string }).slug);
      }
      tagsByInventory.set(it.inventory_id, existing);
    });

    return inventories.map(i => ({
      type: 'inventory' as const,
      id: i.id,
      title: i.title,
      promptCategories: i.prompt_categories,
      likesCount: i.likes_count,
      creatorUserId: i.creator_user_id,
      createdAt: i.created_at,
      tags: tagsByInventory.get(i.id) || [],
    }));
  }

  const { data: inventories, error } = await supabase
    .from('inventories')
    .select('id, title, prompt_categories, likes_count, creator_user_id, created_at')
    .eq('is_public', true)
    .ilike('title', `%${query}%`)
    .order('likes_count', { ascending: false })
    .limit(20);

  if (error || !inventories) return [];

  const inventoryIds = inventories.map(i => i.id);
  const { data: allTags } = await supabase
    .from('inventory_tags')
    .select('inventory_id, tags(slug)')
    .in('inventory_id', inventoryIds);

  const tagsByInventory = new Map<string, string[]>();
  allTags?.forEach(it => {
    const existing = tagsByInventory.get(it.inventory_id) || [];
    if (it.tags && typeof it.tags === 'object' && 'slug' in it.tags) {
      existing.push((it.tags as { slug: string }).slug);
    }
    tagsByInventory.set(it.inventory_id, existing);
  });

  return inventories.map(i => ({
    type: 'inventory' as const,
    id: i.id,
    title: i.title,
    promptCategories: i.prompt_categories,
    likesCount: i.likes_count,
    creatorUserId: i.creator_user_id,
    createdAt: i.created_at,
    tags: tagsByInventory.get(i.id) || [],
  }));
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

export function useExploreSearch({ query, filter, enabled = true }: UseExploreSearchOptions) {
  const trimmedQuery = query.trim();
  const isTagSearch = trimmedQuery.startsWith('#');

  return useQuery({
    queryKey: ['explore-search', trimmedQuery, filter],
    queryFn: async (): Promise<ExploreResult[]> => {
      if (!trimmedQuery) return [];

      const results: ExploreResult[] = [];

      if (filter === 'all' || filter === 'blueprints') {
        const blueprints = await searchBlueprints(trimmedQuery, isTagSearch);
        results.push(...blueprints);
      }

      if (filter === 'all' || filter === 'inventories') {
        const inventories = await searchInventories(trimmedQuery, isTagSearch);
        results.push(...inventories);
      }

      if ((filter === 'all' || filter === 'users') && !isTagSearch) {
        const users = await searchUsers(trimmedQuery);
        results.push(...users);
      }

      return results;
    },
    enabled: enabled && trimmedQuery.length > 0,
    staleTime: 30_000,
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
    staleTime: 60_000,
  });
}

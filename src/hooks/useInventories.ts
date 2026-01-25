import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeTag, normalizeTags } from '@/lib/tagging';
import { DEFAULT_INVENTORY_SEEDS } from '@/lib/inventoryDefaults';
import type { Json } from '@/integrations/supabase/types';

export interface InventoryRow {
  id: string;
  title: string;
  prompt_inventory: string;
  prompt_categories: string;
  generated_schema: Json;
  creator_user_id: string;
  is_public: boolean;
  likes_count: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryTag {
  id: string;
  slug: string;
}

export interface InventoryListItem extends InventoryRow {
  tags: InventoryTag[];
  user_liked: boolean;
  is_owner: boolean;
}

interface CreateInventoryInput {
  title: string;
  promptInventory: string;
  promptCategories: string;
  generatedSchema: Json;
  tags: string[];
  isPublic: boolean;
  sourceInventoryId?: string | null;
}

const INVENTORY_FIELDS = 'id, title, prompt_inventory, prompt_categories, generated_schema, creator_user_id, is_public, likes_count, created_at, updated_at';

const seededUsers = new Set<string>();

async function ensureDefaultInventories(userId: string) {
  if (seededUsers.has(userId)) return;
  const titles = DEFAULT_INVENTORY_SEEDS.map((seed) => seed.title);
  const { data: existing, error } = await supabase
    .from('inventories')
    .select('id, title')
    .in('title', titles);

  if (error) throw error;
  const existingTitles = new Set((existing || []).map((row) => row.title));
  const missing = DEFAULT_INVENTORY_SEEDS.filter((seed) => !existingTitles.has(seed.title));
  if (missing.length === 0) {
    seededUsers.add(userId);
    return;
  }

  for (const seed of missing) {
    const { data: inventory, error: createError } = await supabase
      .from('inventories')
      .insert({
        title: seed.title,
        prompt_inventory: seed.promptInventory,
        prompt_categories: seed.promptCategories,
        generated_schema: seed.generatedSchema,
        creator_user_id: userId,
        is_public: true,
      })
      .select('id')
      .single();

    if (createError) throw createError;
    const tags = await ensureTags(seed.tags, userId);
    if (tags.length > 0) {
      const { error: tagError } = await supabase.from('inventory_tags').insert(
        tags.map((tag) => ({
          inventory_id: inventory.id,
          tag_id: tag.id,
        }))
      );
      if (tagError) throw tagError;
    }
  }

  seededUsers.add(userId);
}

async function ensureTags(slugs: string[], userId: string): Promise<InventoryTag[]> {
  const normalized = normalizeTags(slugs);
  if (normalized.length === 0) return [];

  const { data: existing, error: existingError } = await supabase
    .from('tags')
    .select('id, slug')
    .in('slug', normalized);

  if (existingError) throw existingError;

  const existingTags = existing || [];
  const existingSlugs = new Set(existingTags.map((tag) => tag.slug));
  const missing = normalized.filter((slug) => !existingSlugs.has(slug));

  let created: InventoryTag[] = [];
  if (missing.length > 0) {
    const { data: createdData, error: createError } = await supabase
      .from('tags')
      .insert(missing.map((slug) => ({ slug, created_by: userId })))
      .select('id, slug');

    if (createError) throw createError;
    created = createdData || [];
  }

  return [...existingTags, ...created];
}

async function hydrateInventories(rows: InventoryRow[], userId?: string | null) {
  if (rows.length === 0) return [] as InventoryListItem[];

  const inventoryIds = rows.map((row) => row.id);
  const [tagsRes, likesRes] = await Promise.all([
    supabase.from('inventory_tags').select('inventory_id, tag_id').in('inventory_id', inventoryIds),
    userId
      ? supabase.from('inventory_likes').select('inventory_id').eq('user_id', userId).in('inventory_id', inventoryIds)
      : Promise.resolve({ data: [] as { inventory_id: string }[] }),
  ]);

  const tagRows = tagsRes.data || [];
  const tagIds = [...new Set(tagRows.map((row) => row.tag_id))];
  const { data: tagsData } = tagIds.length > 0
    ? await supabase.from('tags').select('id, slug').in('id', tagIds)
    : { data: [] as InventoryTag[] };

  const tagsMap = new Map((tagsData || []).map((tag) => [tag.id, tag]));
  const inventoryTags = new Map<string, InventoryTag[]>();

  tagRows.forEach((row) => {
    const tag = tagsMap.get(row.tag_id);
    if (!tag) return;
    const list = inventoryTags.get(row.inventory_id) || [];
    list.push(tag);
    inventoryTags.set(row.inventory_id, list);
  });

  const likedIds = new Set((likesRes.data || []).map((row) => row.inventory_id));

  return rows.map((row) => ({
    ...row,
    tags: inventoryTags.get(row.id) || [],
    user_liked: likedIds.has(row.id),
    is_owner: userId === row.creator_user_id,
  }));
}

export function useInventorySearch(search: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['inventory-search', search, user?.id],
    queryFn: async () => {
      if (user?.id) {
        await ensureDefaultInventories(user.id);
      }
      const trimmed = search.trim();
      let inventories: InventoryRow[] = [];

      if (!trimmed) {
        let query = supabase
          .from('inventories')
          .select(INVENTORY_FIELDS)
          .order('likes_count', { ascending: false })
          .limit(60);

        if (user?.id) {
          query = query.or(`is_public.eq.true,creator_user_id.eq.${user.id}`);
        } else {
          query = query.eq('is_public', true);
        }

        const { data, error } = await query;

        if (error) throw error;
        inventories = data || [];
        return hydrateInventories(inventories, user?.id);
      }

      const tagSlug = normalizeTag(trimmed);
      const matchedInventories: InventoryRow[] = [];

      if (tagSlug) {
        const { data: tagData } = await supabase.from('tags').select('id').eq('slug', tagSlug).maybeSingle();
        if (tagData?.id) {
          const { data: inventoryTagRows } = await supabase
            .from('inventory_tags')
            .select('inventory_id')
            .eq('tag_id', tagData.id);

          const inventoryIds = (inventoryTagRows || []).map((row) => row.inventory_id);
          if (inventoryIds.length > 0) {
            const { data } = await supabase
              .from('inventories')
              .select(INVENTORY_FIELDS)
              .in('id', inventoryIds)
              .order('likes_count', { ascending: false });

            matchedInventories.push(...(data || []));
          }
        }
      }

      const { data: titleMatches } = await supabase
        .from('inventories')
        .select(INVENTORY_FIELDS)
        .ilike('title', `%${trimmed}%`)
        .order('likes_count', { ascending: false });

      if (titleMatches) matchedInventories.push(...titleMatches);

      const deduped = Array.from(new Map(matchedInventories.map((row) => [row.id, row])).values());
      inventories = deduped;

      return hydrateInventories(inventories, user?.id);
    },
  });
}

export function useInventory(inventoryId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['inventory', inventoryId, user?.id],
    enabled: !!inventoryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventories')
        .select(INVENTORY_FIELDS)
        .eq('id', inventoryId!)
        .single();

      if (error) throw error;
      if (!data) return null;

      const hydrated = await hydrateInventories([data], user?.id);
      return hydrated[0] ?? null;
    },
  });
}

export function useToggleInventoryLike() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ inventoryId, liked }: { inventoryId: string; liked: boolean }) => {
      if (!user?.id) throw new Error('Must be logged in');

      if (liked) {
        const { error } = await supabase
          .from('inventory_likes')
          .delete()
          .eq('inventory_id', inventoryId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('inventory_likes')
          .insert({ inventory_id: inventoryId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-search'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useCreateInventory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateInventoryInput) => {
      if (!user?.id) throw new Error('Must be logged in');

      const { data: inventory, error } = await supabase
        .from('inventories')
        .insert({
          title: input.title,
          prompt_inventory: input.promptInventory,
          prompt_categories: input.promptCategories,
          generated_schema: input.generatedSchema,
          creator_user_id: user.id,
          is_public: input.isPublic,
        })
        .select('id')
        .single();

      if (error) throw error;

      const tags = await ensureTags(input.tags, user.id);
      if (tags.length > 0) {
        const { error: tagError } = await supabase.from('inventory_tags').insert(
          tags.map((tag) => ({
            inventory_id: inventory.id,
            tag_id: tag.id,
          }))
        );
        if (tagError) throw tagError;
      }

      if (input.sourceInventoryId) {
        await supabase.from('inventory_remixes').insert({
          inventory_id: inventory.id,
          source_inventory_id: input.sourceInventoryId,
          user_id: user.id,
        });
      }

      return inventory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-search'] });
    },
  });
}

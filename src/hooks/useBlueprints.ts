import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeTags } from '@/lib/tagging';
import type { Json } from '@/integrations/supabase/types';

export interface BlueprintRow {
  id: string;
  inventory_id: string | null;
  creator_user_id: string;
  title: string;
  selected_items: Json;
  steps: Json | null;
  mix_notes: string | null;
  review_prompt: string | null;
  banner_url: string | null;
  llm_review: string | null;
  is_public: boolean;
  likes_count: number;
  source_blueprint_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlueprintTag {
  id: string;
  slug: string;
}

export interface BlueprintDetail extends BlueprintRow {
  tags: BlueprintTag[];
  user_liked: boolean;
  creator_profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface CreateBlueprintInput {
  inventoryId: string | null;
  title: string;
  selectedItems: Json;
  steps: Json | null;
  mixNotes: string | null;
  reviewPrompt: string | null;
  bannerUrl: string | null;
  llmReview: string | null;
  generationControls?: Json | null;
  tags: string[];
  isPublic: boolean;
  sourceBlueprintId?: string | null;
}

interface UpdateBlueprintInput {
  blueprintId: string;
  title: string;
  selectedItems: Json;
  steps: Json | null;
  mixNotes: string | null;
  reviewPrompt: string | null;
  bannerUrl: string | null;
  llmReview: string | null;
  generationControls?: Json | null;
  tags: string[];
  isPublic: boolean;
}

const BLUEPRINT_FIELDS = 'id, inventory_id, creator_user_id, title, selected_items, steps, mix_notes, review_prompt, banner_url, llm_review, is_public, likes_count, source_blueprint_id, created_at, updated_at';

function isMissingColumnError(error: unknown, column: string) {
  const e = error as any;
  const hay = `${e?.message || ''} ${e?.details || ''} ${e?.hint || ''}`.toLowerCase();
  return hay.includes('does not exist') && hay.includes(column.toLowerCase());
}

async function ensureTags(slugs: string[], userId: string): Promise<BlueprintTag[]> {
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

  let created: BlueprintTag[] = [];
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

export function useBlueprint(blueprintId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['blueprint', blueprintId, user?.id],
    enabled: !!blueprintId,
    queryFn: async () => {
      if (!blueprintId) return null;

      const { data: blueprint, error } = await supabase
        .from('blueprints')
        .select(BLUEPRINT_FIELDS)
        .eq('id', blueprintId)
        .maybeSingle();

      if (error) throw error;
      if (!blueprint) return null;

      const [tagRowsRes, likeRes, profileRes] = await Promise.all([
        supabase.from('blueprint_tags').select('tag_id').eq('blueprint_id', blueprintId),
        user
          ? supabase.from('blueprint_likes').select('id').eq('blueprint_id', blueprintId).eq('user_id', user.id)
          : Promise.resolve({ data: [] as { id: string }[] }),
        supabase.from('profiles').select('display_name, avatar_url').eq('user_id', blueprint.creator_user_id).maybeSingle(),
      ]);

      const tagIds = (tagRowsRes.data || []).map((row) => row.tag_id);
      const { data: tagsData } = tagIds.length > 0
        ? await supabase.from('tags').select('id, slug').in('id', tagIds)
        : { data: [] as BlueprintTag[] };

      const userLiked = !!(likeRes.data && likeRes.data.length > 0);

      return {
        ...(blueprint as BlueprintRow),
        tags: tagsData || [],
        user_liked: userLiked,
        creator_profile: profileRes.data || null,
      } as BlueprintDetail;
    },
  });
}

export function useCreateBlueprint() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBlueprintInput) => {
      if (!user) throw new Error('Must be logged in');

      const basePayload = {
        inventory_id: input.inventoryId,
        creator_user_id: user.id,
        title: input.title,
        selected_items: input.selectedItems,
        steps: input.steps,
        mix_notes: input.mixNotes,
        review_prompt: input.reviewPrompt,
        banner_url: input.bannerUrl,
        llm_review: input.llmReview,
        is_public: input.isPublic,
        source_blueprint_id: input.sourceBlueprintId || null,
      };

      const tryInsert = (payload: any) =>
        supabase.from('blueprints').insert(payload).select(BLUEPRINT_FIELDS).single();

      let insertRes = await tryInsert({
        ...basePayload,
        ...(input.generationControls ? { generation_controls: input.generationControls } : {}),
      });

      if (insertRes.error && input.generationControls && isMissingColumnError(insertRes.error, 'generation_controls')) {
        insertRes = await tryInsert(basePayload);
      }

      const { data: blueprint, error } = insertRes;

      if (error) throw error;

      const tags = await ensureTags(input.tags, user.id);
      if (tags.length > 0) {
        const { error: tagError } = await supabase.from('blueprint_tags').insert(
          tags.map((tag) => ({
            blueprint_id: blueprint.id,
            tag_id: tag.id,
          }))
        );
        if (tagError) throw tagError;
      }

      return blueprint as BlueprintRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blueprint'] });
      queryClient.invalidateQueries({ queryKey: ['blueprint-comments'] });
    },
  });
}

export function useToggleBlueprintLike() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ blueprintId, liked }: { blueprintId: string; liked: boolean }) => {
      if (!user) throw new Error('Must be logged in');
      if (liked) {
        const { error } = await supabase
          .from('blueprint_likes')
          .delete()
          .eq('blueprint_id', blueprintId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('blueprint_likes')
          .insert({ blueprint_id: blueprintId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blueprint'] });
      queryClient.invalidateQueries({ queryKey: ['blueprint-search'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-blueprints'] });
    },
  });
}

export function useUpdateBlueprint() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateBlueprintInput) => {
      if (!user) throw new Error('Must be logged in');

      const basePatch = {
        title: input.title,
        selected_items: input.selectedItems,
        steps: input.steps,
        mix_notes: input.mixNotes,
        review_prompt: input.reviewPrompt,
        banner_url: input.bannerUrl,
        llm_review: input.llmReview,
        is_public: input.isPublic,
      };

      const tryUpdate = (patch: any) =>
        supabase
          .from('blueprints')
          .update(patch)
          .eq('id', input.blueprintId)
          .eq('creator_user_id', user.id)
          .select(BLUEPRINT_FIELDS)
          .single();

      let updateRes = await tryUpdate({
        ...basePatch,
        ...(input.generationControls ? { generation_controls: input.generationControls } : {}),
      });

      if (updateRes.error && input.generationControls && isMissingColumnError(updateRes.error, 'generation_controls')) {
        updateRes = await tryUpdate(basePatch);
      }

      const { data: blueprint, error } = updateRes;

      if (error) throw error;

      const tags = await ensureTags(input.tags, user.id);
      const { error: clearError } = await supabase
        .from('blueprint_tags')
        .delete()
        .eq('blueprint_id', input.blueprintId);
      if (clearError) throw clearError;

      if (tags.length > 0) {
        const { error: tagError } = await supabase.from('blueprint_tags').insert(
          tags.map((tag) => ({
            blueprint_id: input.blueprintId,
            tag_id: tag.id,
          }))
        );
        if (tagError) throw tagError;
      }

      return blueprint as BlueprintRow;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['blueprint', variables.blueprintId] });
      queryClient.invalidateQueries({ queryKey: ['blueprint-search'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-blueprints'] });
      queryClient.invalidateQueries({ queryKey: ['blueprint-comments', variables.blueprintId] });
    },
  });
}

export function useBlueprintComments(blueprintId?: string) {
  return useQuery({
    queryKey: ['blueprint-comments', blueprintId],
    enabled: !!blueprintId,
    queryFn: async () => {
      if (!blueprintId) return [] as Array<{
        id: string;
        content: string;
        created_at: string;
        user_id: string;
        profile: { display_name: string | null; avatar_url: string | null } | null;
      }>;

      const { data: comments, error } = await supabase
        .from('blueprint_comments')
        .select('id, content, created_at, user_id')
        .eq('blueprint_id', blueprintId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const userIds = [...new Set((comments || []).map((row) => row.user_id))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds)
        : { data: [] as { user_id: string; display_name: string | null; avatar_url: string | null }[] };

      const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));

      return (comments || []).map((row) => ({
        ...row,
        profile: profileMap.get(row.user_id) || null,
      }));
    },
  });
}

export function useCreateBlueprintComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ blueprintId, content }: { blueprintId: string; content: string }) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase
        .from('blueprint_comments')
        .insert({ blueprint_id: blueprintId, user_id: user.id, content });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['blueprint-comments', variables.blueprintId] });
    },
  });
}

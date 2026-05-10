import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { createBlueprintViaApi, getBlueprintDetailById, updateBlueprintViaApi } from '@/lib/blueprintReadApi';
import { getBlueprintLikeState, setBlueprintLiked } from '@/lib/blueprintLikesApi';
import { buildStoredPreviewSummary } from '@/lib/feedPreview';
import { getPublishedBlueprintChannelSlug } from '@/lib/blueprintChannelsApi';
import { createBlueprintComment, getBlueprintComments } from '@/lib/blueprintCommentsApi';
import { collectBlueprintTagMap, listBlueprintTagRows } from '@/lib/blueprintTagsApi';
import type { Json } from '@/integrations/supabase/types';

export interface BlueprintRow {
  id: string;
  inventory_id: string | null;
  creator_user_id: string;
  title: string;
  selected_items?: Json | null;
  steps?: Json | null;
  sections_json?: Json | null;
  mix_notes: string | null;
  review_prompt: string | null;
  banner_url: string | null;
  llm_review: string | null;
  preview_summary?: string | null;
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
  published_channel_slug: string | null;
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

export function useBlueprint(blueprintId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['blueprint', blueprintId, user?.id],
    enabled: !!blueprintId,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!blueprintId) return null;

      const blueprint = await getBlueprintDetailById(blueprintId);
      if (!blueprint) return null;

      const [tagRows, publishedChannelSlug, likeState] = await Promise.all([
        listBlueprintTagRows({ blueprintIds: [blueprintId] }),
        getPublishedBlueprintChannelSlug(blueprintId).catch(() => null),
        getBlueprintLikeState(blueprintId),
      ]);

      const tagsData = collectBlueprintTagMap(tagRows).get(blueprintId) || [];

      return {
        ...(blueprint as BlueprintRow),
        tags: tagsData,
        published_channel_slug: publishedChannelSlug,
        likes_count: likeState?.likes_count ?? Number(blueprint.likes_count || 0),
        user_liked: Boolean(likeState?.user_liked),
        creator_profile: blueprint.creator_profile || null,
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

      const previewSummary = buildStoredPreviewSummary({
          primary: input.llmReview,
          secondary: input.mixNotes,
          fallback: input.title,
          maxChars: 220,
        });

      const blueprint = await createBlueprintViaApi({
        inventoryId: input.inventoryId,
        title: input.title,
        selectedItems: input.selectedItems,
        steps: input.steps,
        mixNotes: input.mixNotes,
        reviewPrompt: input.reviewPrompt,
        bannerUrl: input.bannerUrl,
        llmReview: input.llmReview,
        previewSummary,
        generationControls: input.generationControls,
        tags: input.tags,
        isPublic: input.isPublic,
        sourceBlueprintId: input.sourceBlueprintId || null,
      });

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
      return setBlueprintLiked(blueprintId, !liked);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blueprint'] });
      queryClient.invalidateQueries({ queryKey: ['blueprint-search'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-blueprints'] });
      queryClient.invalidateQueries({ queryKey: ['wall-feed'] });
      queryClient.invalidateQueries({ queryKey: ['wall-for-you'] });
      queryClient.invalidateQueries({ queryKey: ['user-liked-blueprints'] });
      queryClient.invalidateQueries({ queryKey: ['user-activity'] });
    },
  });
}

export function useUpdateBlueprint() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateBlueprintInput) => {
      if (!user) throw new Error('Must be logged in');

      const previewSummary = buildStoredPreviewSummary({
          primary: input.llmReview,
          secondary: input.mixNotes,
          fallback: input.title,
          maxChars: 220,
        });

      const blueprint = await updateBlueprintViaApi(input.blueprintId, {
        inventoryId: null,
        title: input.title,
        selectedItems: input.selectedItems,
        steps: input.steps,
        mixNotes: input.mixNotes,
        reviewPrompt: input.reviewPrompt,
        bannerUrl: input.bannerUrl,
        llmReview: input.llmReview,
        previewSummary,
        generationControls: input.generationControls,
        tags: input.tags,
        isPublic: input.isPublic,
      });

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

export function useBlueprintComments(blueprintId?: string, sortMode: 'top' | 'new' = 'new') {
  return useQuery({
    queryKey: ['blueprint-comments', blueprintId, sortMode],
    enabled: !!blueprintId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!blueprintId) return [] as Array<{
        id: string;
        content: string;
        created_at: string;
        user_id: string;
        likes_count: number;
        updated_at: string;
        profile: { display_name: string | null; avatar_url: string | null } | null;
      }>;

      return getBlueprintComments({
        blueprintId,
        sortMode,
      });
    },
  });
}

export function useCreateBlueprintComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ blueprintId, content }: { blueprintId: string; content: string }) => {
      if (!user) throw new Error('Must be logged in');
      return createBlueprintComment({
        blueprintId,
        content,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['blueprint-comments', variables.blueprintId] });
      queryClient.invalidateQueries({ queryKey: ['user-comments'] });
      queryClient.invalidateQueries({ queryKey: ['user-activity'] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import { normalizeTags } from '@/lib/tagging';

export type RecipeType = 'blend' | 'protein' | 'stack';
export type RecipeVisibility = 'private' | 'unlisted' | 'public';

export interface UserRecipe {
  id: string;
  user_id: string;
  recipe_type: RecipeType;
  name: string;
  items: Json;
  analysis: Json | null;
  is_public: boolean;
  visibility: RecipeVisibility;
  created_at: string;
  updated_at: string;
}

export function useRecipes(recipeType?: RecipeType) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's recipes
  const { data: recipes, isLoading } = useQuery({
    queryKey: ['user-recipes', user?.id, recipeType],
    queryFn: async () => {
      if (!user) return [];

      let query = supabase
        .from('user_recipes')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (recipeType) {
        query = query.eq('recipe_type', recipeType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as UserRecipe[];
    },
    enabled: !!user,
  });

  // Save recipe mutation
  const saveMutation = useMutation({
    mutationFn: async (recipe: { 
      recipe_type: RecipeType; 
      name: string; 
      items: Json; 
      analysis?: Json | null;
      visibility?: RecipeVisibility;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const { data, error } = await supabase
        .from('user_recipes')
        .insert({
          recipe_type: recipe.recipe_type,
          name: recipe.name,
          items: recipe.items,
          analysis: recipe.analysis ?? null,
          visibility: recipe.visibility ?? 'private',
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as UserRecipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-recipes'] });
      toast({
        title: 'Recipe saved',
        description: 'Your recipe has been saved to your account.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to save',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update recipe mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { 
      id: string; 
      name?: string; 
      items?: Json; 
      analysis?: Json | null;
      visibility?: RecipeVisibility;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const { data, error } = await supabase
        .from('user_recipes')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data as UserRecipe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-recipes'] });
    },
    onError: (error) => {
      toast({
        title: 'Failed to update',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete recipe mutation
  const deleteMutation = useMutation({
    mutationFn: async (recipeId: string) => {
      if (!user) throw new Error('Must be logged in');

      const { error } = await supabase
        .from('user_recipes')
        .delete()
        .eq('id', recipeId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-recipes'] });
      toast({
        title: 'Recipe deleted',
        description: 'Your recipe has been removed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to delete',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Share to wall mutation
  const shareMutation = useMutation({
    mutationFn: async ({ recipeId, caption, tags }: { recipeId: string; caption?: string; tags?: string[] }) => {
      if (!user) throw new Error('Must be logged in');

      const { data: existingPost } = await supabase
        .from('wall_posts')
        .select('id')
        .eq('recipe_id', recipeId)
        .maybeSingle();

      if (existingPost) {
        throw new Error('This recipe is already shared on the Wall.');
      }

      // Ensure recipe is public before tagging
      const { error: visibilityError } = await supabase
        .from('user_recipes')
        .update({ visibility: 'public' })
        .eq('id', recipeId)
        .eq('user_id', user.id);
      if (visibilityError) throw visibilityError;

      // Update tags if provided
      const normalizedTags = normalizeTags(tags || []);
      if (normalizedTags.length > 0) {
        const { data: existingTags, error: existingTagsError } = await supabase
          .from('tags')
          .select('id, slug')
          .in('slug', normalizedTags);
        if (existingTagsError) throw existingTagsError;

        const existingMap = new Map((existingTags || []).map((tag) => [tag.slug, tag.id]));
        const missingSlugs = normalizedTags.filter((slug) => !existingMap.has(slug));

        let createdTags: { id: string; slug: string }[] = [];
        if (missingSlugs.length > 0) {
          const { data: created, error: createError } = await supabase
            .from('tags')
            .insert(missingSlugs.map((slug) => ({ slug, created_by: user.id })))
            .select('id, slug');

          if (createError) throw createError;
          createdTags = created || [];

          if (createdTags.length > 0) {
            await supabase.from('tag_follows').upsert(
              createdTags.map((tag) => ({ tag_id: tag.id, user_id: user.id })),
              { onConflict: 'user_id,tag_id' }
            );
          }
        }

        const allTagIds = [
          ...existingMap.values(),
          ...createdTags.map((tag) => tag.id),
        ];

        const { error: deleteTagsError } = await supabase
          .from('recipe_tags')
          .delete()
          .eq('recipe_id', recipeId);
        if (deleteTagsError) throw deleteTagsError;

        if (allTagIds.length > 0) {
          const { error: insertTagsError } = await supabase.from('recipe_tags').insert(
            allTagIds.map((tagId) => ({ recipe_id: recipeId, tag_id: tagId }))
          );
          if (insertTagsError) throw insertTagsError;
        }
      }

      // Create wall post
      const { data, error } = await supabase
        .from('wall_posts')
        .insert({
          user_id: user.id,
          recipe_id: recipeId,
          caption,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wall-posts'] });
      toast({
        title: 'Shared to Wall',
        description: 'Your recipe is now visible to the community!',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to share',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    recipes: recipes || [],
    isLoading,
    saveRecipe: saveMutation.mutateAsync,
    updateRecipe: updateMutation.mutateAsync,
    deleteRecipe: deleteMutation.mutateAsync,
    shareToWall: shareMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isSharing: shareMutation.isPending,
  };
}

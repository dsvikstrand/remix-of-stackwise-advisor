import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export type RecipeType = 'blend' | 'protein' | 'stack';

export interface UserRecipe {
  id: string;
  user_id: string;
  recipe_type: RecipeType;
  name: string;
  items: Json;
  analysis: Json | null;
  is_public: boolean;
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
      is_public?: boolean;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const { data, error } = await supabase
        .from('user_recipes')
        .insert({
          recipe_type: recipe.recipe_type,
          name: recipe.name,
          items: recipe.items,
          analysis: recipe.analysis ?? null,
          is_public: recipe.is_public ?? false,
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
      is_public?: boolean;
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
    mutationFn: async ({ recipeId, caption }: { recipeId: string; caption?: string }) => {
      if (!user) throw new Error('Must be logged in');

      // First ensure recipe is public
      await supabase
        .from('user_recipes')
        .update({ is_public: true })
        .eq('id', recipeId)
        .eq('user_id', user.id);

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

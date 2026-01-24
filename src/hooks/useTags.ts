import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeTag } from '@/lib/tagging';

export interface TagRow {
  id: string;
  slug: string;
  follower_count: number;
  created_at: string;
  is_following?: boolean;
  is_muted?: boolean;
}

export function useTagsDirectory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const tagsQuery = useQuery({
    queryKey: ['tags-directory', user?.id],
    queryFn: async () => {
      const { data: tagsData, error: tagsError } = await supabase
        .from('tags')
        .select('id, slug, follower_count, created_at')
        .order('follower_count', { ascending: false })
        .limit(200);

      if (tagsError) throw tagsError;

      if (!user) {
        return (tagsData || []) as TagRow[];
      }

      const [followsRes, mutesRes] = await Promise.all([
        supabase.from('tag_follows').select('tag_id').eq('user_id', user.id),
        supabase.from('tag_mutes').select('tag_id').eq('user_id', user.id),
      ]);

      const followed = new Set((followsRes.data || []).map((row) => row.tag_id));
      const muted = new Set((mutesRes.data || []).map((row) => row.tag_id));

      return (tagsData || []).map((tag) => ({
        ...tag,
        is_following: followed.has(tag.id),
        is_muted: muted.has(tag.id),
      })) as TagRow[];
    },
  });

  const followMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase.from('tag_follows').insert({
        tag_id: tagId,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags-directory'] }),
  });

  const unfollowMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase
        .from('tag_follows')
        .delete()
        .eq('tag_id', tagId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags-directory'] }),
  });

  const muteMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase.from('tag_mutes').insert({
        tag_id: tagId,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags-directory'] }),
  });

  const unmuteMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase
        .from('tag_mutes')
        .delete()
        .eq('tag_id', tagId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags-directory'] }),
  });

  const createTagMutation = useMutation({
    mutationFn: async (rawSlug: string) => {
      if (!user) throw new Error('Must be logged in');
      const slug = normalizeTag(rawSlug);
      if (!slug) throw new Error('Invalid tag');

      const { data: existing, error: existingError } = await supabase
        .from('tags')
        .select('id, slug, follower_count, created_at')
        .eq('slug', slug)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) return existing as TagRow;

      const { data, error } = await supabase
        .from('tags')
        .insert({ slug, created_by: user.id })
        .select('id, slug, follower_count, created_at')
        .single();

      if (error) throw error;

      await supabase.from('tag_follows').insert({ tag_id: data.id, user_id: user.id });

      return data as TagRow;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags-directory'] }),
  });

  return {
    tags: tagsQuery.data || [],
    isLoading: tagsQuery.isLoading,
    error: tagsQuery.error,
    followTag: followMutation.mutateAsync,
    unfollowTag: unfollowMutation.mutateAsync,
    muteTag: muteMutation.mutateAsync,
    unmuteTag: unmuteMutation.mutateAsync,
    createTag: createTagMutation.mutateAsync,
    isUpdating: followMutation.isPending || unfollowMutation.isPending || muteMutation.isPending || unmuteMutation.isPending,
  };
}

export function useTagSuggestions() {
  return useQuery({
    queryKey: ['tag-suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('slug')
        .order('follower_count', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []).map((row) => row.slug);
    },
  });
}
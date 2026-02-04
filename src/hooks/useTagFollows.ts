import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeTag } from '@/lib/tagging';

interface FollowedTag {
  id: string;
  slug: string;
}

interface ToggleTagInput {
  id?: string;
  slug?: string;
}

export function useTagFollows() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const followedQuery = useQuery({
    queryKey: ['followed-tags', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as FollowedTag[];
      const { data, error } = await supabase
        .from('tag_follows')
        .select('tag_id, tags(slug)')
        .eq('user_id', user.id);

      if (error) throw error;

      return (data || [])
        .map((row) => ({
          id: row.tag_id,
          slug: ((row.tags as { slug?: string } | null) || {}).slug || '',
        }))
        .filter((row) => row.slug);
    },
  });

  const followedTags = followedQuery.data || [];

  const followedIds = useMemo(
    () => new Set(followedTags.map((tag) => tag.id)),
    [followedTags]
  );

  const followedSlugs = useMemo(
    () => new Set(followedTags.map((tag) => tag.slug)),
    [followedTags]
  );

  const followMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase.from('tag_follows').insert({
        tag_id: tagId,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followed-tags'] });
      queryClient.invalidateQueries({ queryKey: ['tags-directory'] });
    },
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followed-tags'] });
      queryClient.invalidateQueries({ queryKey: ['tags-directory'] });
    },
  });

  const resolveTagId = async (rawSlug: string) => {
    const normalized = normalizeTag(rawSlug.replace(/^#/, ''));
    if (!normalized) return null;
    const { data, error } = await supabase
      .from('tags')
      .select('id')
      .eq('slug', normalized)
      .maybeSingle();

    if (error) throw error;
    return data?.id ?? null;
  };

  const toggleFollow = async (tag: ToggleTagInput) => {
    if (!user) throw new Error('Must be logged in');

    const tagId = tag.id ?? (tag.slug ? await resolveTagId(tag.slug) : null);
    if (!tagId) throw new Error('Tag not found');

    const isFollowing = followedIds.has(tagId);
    if (isFollowing) {
      await unfollowMutation.mutateAsync(tagId);
    } else {
      await followMutation.mutateAsync(tagId);
    }
  };

  return {
    followedTags,
    followedIds,
    followedSlugs,
    toggleFollow,
    isLoading: followedQuery.isLoading,
    isUpdating: followMutation.isPending || unfollowMutation.isPending,
    hasUser: !!user,
  };
}

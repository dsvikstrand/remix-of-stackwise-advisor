import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeTag } from '@/lib/tagging';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';

interface FollowedTag {
  id: string;
  slug: string;
}

interface ToggleTagInput {
  id?: string;
  slug?: string;
}

type FollowState = 'not_joined' | 'joining' | 'joined' | 'leaving' | 'error';
type PendingAction = 'joining' | 'leaving';

export function useTagFollows() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pendingByTagId, setPendingByTagId] = useState<Record<string, PendingAction | undefined>>({});
  const [errorByTagId, setErrorByTagId] = useState<Record<string, boolean | undefined>>({});

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
  const curatedFollowableTagSlugs = useMemo(
    () =>
      new Set(
        CHANNELS_CATALOG
          .filter((channel) => channel.isJoinEnabled && channel.status === 'active')
          .map((channel) => channel.tagSlug),
      ),
    [],
  );

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

  const resolveInputTagId = async (tag: ToggleTagInput) => {
    const tagId = tag.id ?? (tag.slug ? await resolveTagId(tag.slug) : null);
    return tagId;
  };

  const isCuratedFollowableTagSlug = (slug: string) => {
    const normalized = normalizeTag(slug.replace(/^#/, ''));
    return curatedFollowableTagSlugs.has(normalized);
  };

  const joinChannel = async (tag: ToggleTagInput) => {
    if (!user) throw new Error('Must be logged in');
    if (tag.slug && !isCuratedFollowableTagSlug(tag.slug)) {
      throw new Error('Only curated channels can be joined in MVP');
    }
    const tagId = await resolveInputTagId(tag);
    if (!tagId) throw new Error('Tag not found');
    if (followedIds.has(tagId) || pendingByTagId[tagId]) return;

    setPendingByTagId((prev) => ({ ...prev, [tagId]: 'joining' }));
    setErrorByTagId((prev) => ({ ...prev, [tagId]: undefined }));

    try {
      await followMutation.mutateAsync(tagId);
    } catch (error) {
      setErrorByTagId((prev) => ({ ...prev, [tagId]: true }));
      throw error;
    } finally {
      setPendingByTagId((prev) => ({ ...prev, [tagId]: undefined }));
    }
  };

  const leaveChannel = async (tag: ToggleTagInput) => {
    if (!user) throw new Error('Must be logged in');
    if (tag.slug && !isCuratedFollowableTagSlug(tag.slug)) {
      throw new Error('Only curated channels can be followed in MVP');
    }
    const tagId = await resolveInputTagId(tag);
    if (!tagId) throw new Error('Tag not found');
    if (!followedIds.has(tagId) || pendingByTagId[tagId]) return;

    setPendingByTagId((prev) => ({ ...prev, [tagId]: 'leaving' }));
    setErrorByTagId((prev) => ({ ...prev, [tagId]: undefined }));

    try {
      await unfollowMutation.mutateAsync(tagId);
    } catch (error) {
      setErrorByTagId((prev) => ({ ...prev, [tagId]: true }));
      throw error;
    } finally {
      setPendingByTagId((prev) => ({ ...prev, [tagId]: undefined }));
    }
  };

  const toggleFollow = async (tag: ToggleTagInput) => {
    if (!user) throw new Error('Must be logged in');

    if (tag.slug && !isCuratedFollowableTagSlug(tag.slug)) {
      throw new Error('Only curated channels can be joined in MVP');
    }

    const tagId = await resolveInputTagId(tag);
    if (!tagId) throw new Error('Tag not found');

    const isFollowing = followedIds.has(tagId);
    if (isFollowing) {
      await leaveChannel({ id: tagId });
    } else {
      await joinChannel({ id: tagId });
    }
  };

  const getFollowState = (tag: ToggleTagInput): FollowState => {
    const tagId = tag.id;
    if (!tagId) return 'not_joined';
    if (pendingByTagId[tagId] === 'joining') return 'joining';
    if (pendingByTagId[tagId] === 'leaving') return 'leaving';
    if (errorByTagId[tagId]) return 'error';
    return followedIds.has(tagId) ? 'joined' : 'not_joined';
  };

  const removeNonCuratedFollows = async () => {
    if (!user) return 0;
    const nonCuratedTagIds = followedTags
      .filter((tag) => !isCuratedFollowableTagSlug(tag.slug))
      .map((tag) => tag.id);

    if (nonCuratedTagIds.length === 0) return 0;

    const { error } = await supabase
      .from('tag_follows')
      .delete()
      .eq('user_id', user.id)
      .in('tag_id', nonCuratedTagIds);

    if (error) throw error;

    await queryClient.invalidateQueries({ queryKey: ['followed-tags'] });
    await queryClient.invalidateQueries({ queryKey: ['tags-directory'] });
    return nonCuratedTagIds.length;
  };

  return {
    followedTags,
    followedIds,
    followedSlugs,
    joinChannel,
    leaveChannel,
    toggleFollow,
    getFollowState,
    isCuratedFollowableTagSlug,
    removeNonCuratedFollows,
    isLoading: followedQuery.isLoading,
    isUpdating: followMutation.isPending || unfollowMutation.isPending,
    hasUser: !!user,
  };
}

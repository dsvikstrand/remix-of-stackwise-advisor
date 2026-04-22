import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeTag } from '@/lib/tagging';
import {
  createTag,
  getTagsBySlugs,
  listTags,
  setTagFollowed,
} from '@/lib/tagsApi';

export interface TagRow {
  id: string;
  slug: string;
  follower_count: number;
  created_at: string;
  is_following?: boolean;
}

export function useTagsBySlugs(slugs: string[]) {
  const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean)));

  return useQuery({
    queryKey: ['tags-by-slugs', uniqueSlugs],
    enabled: uniqueSlugs.length > 0,
    queryFn: async () => {
      return await getTagsBySlugs(uniqueSlugs) as TagRow[];
    },
    staleTime: 30_000,
  });
}

export function useTagsDirectory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const tagsQuery = useQuery({
    queryKey: ['tags-directory', user?.id],
    queryFn: async () => {
      return await listTags(200) as TagRow[];
    },
  });

  const followMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!user) throw new Error('Must be logged in');
      return setTagFollowed(tagId, true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags-directory'] });
      queryClient.invalidateQueries({ queryKey: ['followed-tags'] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!user) throw new Error('Must be logged in');
      return setTagFollowed(tagId, false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags-directory'] });
      queryClient.invalidateQueries({ queryKey: ['followed-tags'] });
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (rawSlug: string) => {
      if (!user) throw new Error('Must be logged in');
      const slug = normalizeTag(rawSlug);
      if (!slug) throw new Error('Invalid tag');
      return await createTag({
        slug,
        follow: true,
      }) as TagRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags-directory'] });
      queryClient.invalidateQueries({ queryKey: ['followed-tags'] });
    },
  });

  return {
    tags: tagsQuery.data || [],
    isLoading: tagsQuery.isLoading,
    error: tagsQuery.error,
    followTag: followMutation.mutateAsync,
    unfollowTag: unfollowMutation.mutateAsync,
    createTag: createTagMutation.mutateAsync,
    isUpdating: followMutation.isPending || unfollowMutation.isPending,
  };
}

export function useTagSuggestions() {
  return useQuery({
    queryKey: ['tag-suggestions'],
    queryFn: async () => {
      const data = await listTags(200);
      return data.map((row) => row.slug);
    },
  });
}

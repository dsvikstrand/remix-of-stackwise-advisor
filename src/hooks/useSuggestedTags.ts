import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { listBlueprintTagRows } from '@/lib/blueprintTagsApi';

export interface SuggestedTag {
  id: string;
  slug: string;
  follower_count: number;
  reason: 'popular' | 'related';
}

/**
 * Returns personalized tag suggestions based on:
 * 1. Tags that appear alongside the user's followed tags (related)
 * 2. Popular tags the user doesn't follow yet
 */
export function useSuggestedTags(limit = 12) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['suggested-tags', user?.id, limit],
    queryFn: async (): Promise<SuggestedTag[]> => {
      // Get all tags sorted by popularity
      const { data: allTags, error: tagsError } = await supabase
        .from('tags')
        .select('id, slug, follower_count')
        .order('follower_count', { ascending: false })
        .limit(100);

      if (tagsError) throw tagsError;
      if (!allTags || allTags.length === 0) return [];

      if (!user) {
        // For anonymous users, just return popular tags
        return allTags.slice(0, limit).map((tag) => ({
          ...tag,
          reason: 'popular' as const,
        }));
      }

      // Get user's followed tags
      const { data: follows } = await supabase
        .from('tag_follows')
        .select('tag_id')
        .eq('user_id', user.id);

      const followedIds = new Set((follows || []).map((f) => f.tag_id));

      // If user follows no tags, return popular ones they don't follow
      if (followedIds.size === 0) {
        return allTags.slice(0, limit).map((tag) => ({
          ...tag,
          reason: 'popular' as const,
        }));
      }

      // Find related tags: tags that appear on recipes/blueprints that also have user's followed tags
      const followedTagIds = Array.from(followedIds);

      // Get blueprints that have the user's followed tags
      const blueprintLinks = await listBlueprintTagRows({ tagIds: followedTagIds });
      const blueprintIds = [...new Set(blueprintLinks.map((l) => l.blueprint_id))];

      // Get other tags on those blueprints
      const relatedTagCounts = new Map<string, number>();
      if (blueprintIds.length > 0) {
        const relatedLinks = await listBlueprintTagRows({ blueprintIds: blueprintIds.slice(0, 50) });

        relatedLinks.forEach((link) => {
          if (!followedIds.has(link.tag_id)) {
            relatedTagCounts.set(link.tag_id, (relatedTagCounts.get(link.tag_id) || 0) + 1);
          }
        });
      }

      // Build suggestions: prioritize related, then popular
      const suggestions: SuggestedTag[] = [];
      const usedIds = new Set<string>();

      // Add related tags first (sorted by co-occurrence count)
      const sortedRelated = Array.from(relatedTagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, Math.floor(limit / 2));

      for (const [tagId] of sortedRelated) {
        const tag = allTags.find((t) => t.id === tagId);
        if (tag && !followedIds.has(tag.id)) {
          suggestions.push({ ...tag, reason: 'related' });
          usedIds.add(tag.id);
        }
      }

      // Fill rest with popular tags user doesn't follow
      for (const tag of allTags) {
        if (suggestions.length >= limit) break;
        if (!followedIds.has(tag.id) && !usedIds.has(tag.id)) {
          suggestions.push({ ...tag, reason: 'popular' });
        }
      }

      return suggestions.slice(0, limit);
    },
    staleTime: 60_000,
  });
}

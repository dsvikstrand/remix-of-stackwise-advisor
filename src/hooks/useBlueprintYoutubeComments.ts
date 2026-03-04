import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type BlueprintYoutubeComment = {
  id: string;
  blueprint_id: string;
  sort_mode: 'top' | 'new';
  author_name: string | null;
  author_avatar_url: string | null;
  content: string;
  published_at: string | null;
  like_count: number | null;
  display_order: number;
};

function isMissingRelationError(error: unknown, relation: string) {
  const e = error as { message?: unknown; details?: unknown; hint?: unknown } | null;
  const hay = `${String(e?.message || '')} ${String(e?.details || '')} ${String(e?.hint || '')}`.toLowerCase();
  return hay.includes('does not exist') && hay.includes(relation.toLowerCase());
}

export function useBlueprintYoutubeComments(
  blueprintId?: string,
  sortMode: 'top' | 'new' = 'top',
) {
  return useQuery({
    queryKey: ['blueprint-youtube-comments', blueprintId, sortMode],
    enabled: !!blueprintId,
    queryFn: async () => {
      if (!blueprintId) return [] as BlueprintYoutubeComment[];

      const { data, error } = await supabase
        .from('blueprint_youtube_comments')
        .select('id, blueprint_id, sort_mode, author_name, author_avatar_url, content, published_at, like_count, display_order')
        .eq('blueprint_id', blueprintId)
        .eq('sort_mode', sortMode)
        .order('display_order', { ascending: true });

      if (error) {
        if (isMissingRelationError(error, 'blueprint_youtube_comments')) {
          return [] as BlueprintYoutubeComment[];
        }
        throw error;
      }

      return (data || []) as BlueprintYoutubeComment[];
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { config, getFunctionUrl } from '@/config/runtime';

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

export class BlueprintYoutubeCommentsRefreshError extends Error {
  code: string | null;
  retryAt: string | null;

  constructor(input: { message: string; code?: string | null; retryAt?: string | null }) {
    super(input.message);
    this.code = input.code || null;
    this.retryAt = input.retryAt || null;
  }
}

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

export async function requestBlueprintYoutubeCommentsRefresh(blueprintId: string) {
  const normalizedBlueprintId = String(blueprintId || '').trim();
  if (!normalizedBlueprintId) {
    throw new BlueprintYoutubeCommentsRefreshError({
      code: 'INVALID_INPUT',
      message: 'Blueprint id is required.',
    });
  }
  if (!config.agenticBackendUrl) {
    throw new BlueprintYoutubeCommentsRefreshError({
      code: 'BACKEND_UNAVAILABLE',
      message: 'Backend API is not configured.',
    });
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new BlueprintYoutubeCommentsRefreshError({
      code: 'AUTH_REQUIRED',
      message: 'Sign in required.',
    });
  }

  const response = await fetch(getFunctionUrl(`blueprints/${normalizedBlueprintId}/youtube-comments/refresh`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error_code?: string | null;
    message?: string;
    retry_at?: string | null;
    data?: {
      status?: 'queued' | 'already_pending';
      cooldown_until?: string | null;
      queue_depth?: number | null;
    } | null;
  } | null;

  if (!response.ok || !payload?.ok) {
    throw new BlueprintYoutubeCommentsRefreshError({
      code: payload?.error_code || null,
      message: payload?.message || `Request failed (${response.status})`,
      retryAt: payload?.retry_at || null,
    });
  }

  return {
    status: payload.data?.status || 'queued',
    cooldownUntil: payload.data?.cooldown_until || null,
    queueDepth: payload.data?.queue_depth ?? null,
  };
}

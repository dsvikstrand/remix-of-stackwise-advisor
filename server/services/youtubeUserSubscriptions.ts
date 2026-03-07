export type YouTubeUserSubscriptionItem = {
  channelId: string;
  channelTitle: string | null;
  channelUrl: string;
  thumbnailUrl: string | null;
};

export class YouTubeUserSubscriptionsError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function normalizeProviderErrorStatus(status: number) {
  if (status === 401 || status === 403) return { code: 'YT_REAUTH_REQUIRED', status: 401 };
  if (status === 429) return { code: 'YT_PROVIDER_RATE_LIMITED', status: 429 };
  return { code: 'YT_PROVIDER_FAIL', status: status >= 500 ? 502 : 400 };
}

export async function fetchYouTubeUserSubscriptions(input: {
  accessToken: string;
  maxTotal?: number;
}): Promise<{
  items: YouTubeUserSubscriptionItem[];
  truncated: boolean;
}> {
  const accessToken = String(input.accessToken || '').trim();
  if (!accessToken) {
    throw new YouTubeUserSubscriptionsError('YT_REAUTH_REQUIRED', 'Missing access token.', 401);
  }

  const maxTotal = Math.max(1, Number(input.maxTotal || 2000));
  const deduped = new Map<string, YouTubeUserSubscriptionItem>();
  let pageToken = '';
  let pageGuard = 0;
  let truncated = false;

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/subscriptions');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('mine', 'true');
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'bleuv1-youtube-subscriptions/1.0 (+https://api.bleup.app)',
      },
    });

    const json = await response.json().catch(() => null) as {
      items?: Array<{
        snippet?: {
          title?: string;
          resourceId?: {
            channelId?: string;
          };
          thumbnails?: {
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
      }>;
      nextPageToken?: string;
      error?: { message?: string };
    } | null;

    if (!response.ok) {
      const normalized = normalizeProviderErrorStatus(response.status);
      throw new YouTubeUserSubscriptionsError(
        normalized.code,
        json?.error?.message || 'Could not fetch YouTube subscriptions.',
        normalized.status,
      );
    }

    const items = Array.isArray(json?.items) ? json.items : [];
    for (const item of items) {
      const channelId = String(item?.snippet?.resourceId?.channelId || '').trim();
      if (!channelId || deduped.has(channelId)) continue;
      const channelTitle = String(item?.snippet?.title || '').trim() || null;
      const thumbnailUrl =
        String(item?.snippet?.thumbnails?.high?.url || '').trim()
        || String(item?.snippet?.thumbnails?.medium?.url || '').trim()
        || String(item?.snippet?.thumbnails?.default?.url || '').trim()
        || null;

      deduped.set(channelId, {
        channelId,
        channelTitle,
        channelUrl: `https://www.youtube.com/channel/${channelId}`,
        thumbnailUrl,
      });
      if (deduped.size >= maxTotal) {
        truncated = true;
        break;
      }
    }

    if (truncated) break;
    pageToken = String(json?.nextPageToken || '').trim();
    pageGuard += 1;
    if (pageGuard > 200) break;
  } while (pageToken);

  return {
    items: Array.from(deduped.values()),
    truncated,
  };
}

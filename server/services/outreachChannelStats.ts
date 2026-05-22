import type { OracleControlPlaneDb } from './oracleControlPlaneDb';

export type OutreachChannelStatsResult = {
  sourceChannelId: string;
  channelTitle: string | null;
  subscriberCount: number | null;
  hiddenSubscriberCount: boolean;
  fetchedAt: string;
  cacheHit: boolean;
};

export class OutreachChannelStatsError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'OutreachChannelStatsError';
    this.code = code;
    this.status = status;
  }
}

function normalizeString(value: unknown) {
  return String(value || '').trim();
}

function normalizeIntegerOrNull(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function toIso(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function isFresh(fetchedAt: string | null, ttlMs: number, now: Date) {
  if (!fetchedAt) return false;
  const timestamp = Date.parse(fetchedAt);
  if (!Number.isFinite(timestamp)) return false;
  return now.getTime() - timestamp <= ttlMs;
}

function mapCachedRow(row: Record<string, unknown>, cacheHit: boolean): OutreachChannelStatsResult {
  return {
    sourceChannelId: normalizeString(row.source_channel_id),
    channelTitle: normalizeString(row.channel_title) || null,
    subscriberCount: normalizeIntegerOrNull(row.subscriber_count),
    hiddenSubscriberCount: Number(row.hidden_subscriber_count || 0) === 1,
    fetchedAt: toIso(row.fetched_at) || new Date(0).toISOString(),
    cacheHit,
  };
}

export async function fetchYouTubeChannelStats(input: {
  apiKey: string;
  sourceChannelId: string;
  fetchImpl?: typeof fetch;
}): Promise<Omit<OutreachChannelStatsResult, 'fetchedAt' | 'cacheHit'>> {
  const apiKey = normalizeString(input.apiKey);
  const sourceChannelId = normalizeString(input.sourceChannelId);
  if (!sourceChannelId) {
    throw new OutreachChannelStatsError('CHANNEL_ID_MISSING', 'Missing YouTube channel id.', 400);
  }
  if (!apiKey) {
    throw new OutreachChannelStatsError('YOUTUBE_API_KEY_MISSING', 'YouTube Data API key is not configured.', 503);
  }

  const fetchImpl = input.fetchImpl || fetch;
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('id', sourceChannelId);
  url.searchParams.set('key', apiKey);

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'bleuv1-outreach-channel-stats/1.0 (+https://api.bleup.app)',
    },
  });
  const payload = await response.json().catch(() => null) as {
    error?: { message?: unknown; errors?: Array<{ reason?: unknown }> };
    items?: Array<{
      snippet?: { title?: unknown };
      statistics?: {
        subscriberCount?: unknown;
        hiddenSubscriberCount?: unknown;
      };
    }>;
  } | null;

  if (!response.ok) {
    const reason = normalizeString(payload?.error?.errors?.[0]?.reason);
    const message = normalizeString(payload?.error?.message) || `YouTube channel stats lookup failed (${response.status}).`;
    const code = response.status === 403 || response.status === 429
      ? 'YOUTUBE_STATS_RATE_LIMITED'
      : response.status >= 500
        ? 'YOUTUBE_STATS_PROVIDER_FAIL'
        : 'YOUTUBE_STATS_LOOKUP_FAILED';
    throw new OutreachChannelStatsError(reason || code, message, response.status === 429 ? 429 : 502);
  }

  const item = Array.isArray(payload?.items) ? payload.items[0] : null;
  if (!item) {
    throw new OutreachChannelStatsError('YOUTUBE_CHANNEL_NOT_FOUND', 'YouTube channel was not found.', 404);
  }

  const hiddenSubscriberCount = Boolean(item.statistics?.hiddenSubscriberCount);
  const subscriberCount = hiddenSubscriberCount ? null : normalizeIntegerOrNull(item.statistics?.subscriberCount);
  return {
    sourceChannelId,
    channelTitle: normalizeString(item.snippet?.title) || null,
    subscriberCount,
    hiddenSubscriberCount,
  };
}

export async function getCachedOutreachChannelStats(input: {
  controlDb: OracleControlPlaneDb;
  apiKey: string;
  sourceChannelId: string;
  ttlMs: number;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<OutreachChannelStatsResult> {
  const sourceChannelId = normalizeString(input.sourceChannelId);
  const now = input.now || new Date();
  if (!sourceChannelId) {
    throw new OutreachChannelStatsError('CHANNEL_ID_MISSING', 'Missing YouTube channel id.', 400);
  }

  const cached = input.controlDb.sqlite
    .prepare('SELECT * FROM outreach_channel_stats_cache WHERE source_channel_id = ?')
    .get(sourceChannelId) as Record<string, unknown> | undefined;
  if (cached && !normalizeString(cached.error_code) && isFresh(toIso(cached.fetched_at), input.ttlMs, now)) {
    return mapCachedRow(cached, true);
  }

  const fetchedAt = now.toISOString();
  try {
    const fresh = await fetchYouTubeChannelStats({
      apiKey: input.apiKey,
      sourceChannelId,
      fetchImpl: input.fetchImpl,
    });
    input.controlDb.sqlite
      .prepare(`
        INSERT INTO outreach_channel_stats_cache (
          source_channel_id,
          channel_title,
          subscriber_count,
          hidden_subscriber_count,
          fetched_at,
          error_code,
          error_message,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
        ON CONFLICT(source_channel_id) DO UPDATE SET
          channel_title = excluded.channel_title,
          subscriber_count = excluded.subscriber_count,
          hidden_subscriber_count = excluded.hidden_subscriber_count,
          fetched_at = excluded.fetched_at,
          error_code = NULL,
          error_message = NULL,
          updated_at = excluded.updated_at
      `)
      .run(
        fresh.sourceChannelId,
        fresh.channelTitle,
        fresh.subscriberCount,
        fresh.hiddenSubscriberCount ? 1 : 0,
        fetchedAt,
        fetchedAt,
      );
    return {
      ...fresh,
      fetchedAt,
      cacheHit: false,
    };
  } catch (error) {
    const code = error instanceof OutreachChannelStatsError ? error.code : 'YOUTUBE_STATS_LOOKUP_FAILED';
    const message = error instanceof Error ? error.message : 'YouTube channel stats lookup failed.';
    input.controlDb.sqlite
      .prepare(`
        INSERT INTO outreach_channel_stats_cache (
          source_channel_id,
          channel_title,
          subscriber_count,
          hidden_subscriber_count,
          fetched_at,
          error_code,
          error_message,
          updated_at
        )
        VALUES (?, NULL, NULL, 0, ?, ?, ?, ?)
        ON CONFLICT(source_channel_id) DO UPDATE SET
          fetched_at = excluded.fetched_at,
          error_code = excluded.error_code,
          error_message = excluded.error_message,
          updated_at = excluded.updated_at
      `)
      .run(sourceChannelId, fetchedAt, code.slice(0, 80), message.slice(0, 500), fetchedAt);

    if (cached && isFresh(toIso(cached.fetched_at), input.ttlMs * 7, now)) {
      return mapCachedRow(cached, true);
    }
    throw error;
  }
}

type DbClient = any;

export type YouTubeSearchCacheKind = 'video_search' | 'channel_search';

type RawCacheRow = {
  cache_key: string;
  kind: YouTubeSearchCacheKind;
  query: string;
  page_token: string | null;
  response_json: unknown;
  fetched_at: string;
  expires_at: string;
};

export type YouTubeSearchCacheHit = {
  source: 'fresh' | 'stale';
  response: unknown;
  cacheKey: string;
  ageSeconds: number | null;
  fetchedAt: string | null;
  expiresAt: string | null;
};

function isMissingRelationError(error: unknown, relation: string) {
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  const hay = `${String(e?.message || '')} ${String(e?.details || '')} ${String(e?.hint || '')}`.toLowerCase();
  const code = String(e?.code || '').trim().toUpperCase();
  if (code === '42P01' || code === 'PGRST205') {
    return hay.includes(relation.toLowerCase()) || hay.includes(relation.replace(/^public\./i, '').toLowerCase());
  }
  return (
    (hay.includes('does not exist') || hay.includes('could not find the table'))
    && (hay.includes(relation.toLowerCase()) || hay.includes(relation.replace(/^public\./i, '').toLowerCase()))
  );
}

export function normalizeYouTubeSearchQuery(raw: string) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildYouTubeSearchCacheKey(input: {
  kind: YouTubeSearchCacheKind;
  query: string;
  limit: number;
  pageToken?: string | null;
}) {
  const normalizedQuery = normalizeYouTubeSearchQuery(input.query);
  const normalizedLimit = Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit)) : 10;
  const normalizedPageToken = String(input.pageToken || '').trim();
  return [
    'youtube_search',
    input.kind,
    normalizedQuery,
    `limit:${normalizedLimit}`,
    `page:${normalizedPageToken || '-'}`,
  ].join('|');
}

export function classifySearchCacheFreshness(input: {
  nowMs: number;
  expiresAtRaw?: string | null;
  fetchedAtRaw?: string | null;
  staleMaxSeconds: number;
}) {
  const expiresAtMs = Date.parse(String(input.expiresAtRaw || ''));
  const fetchedAtMs = Date.parse(String(input.fetchedAtRaw || ''));
  const ageSeconds = Number.isFinite(fetchedAtMs)
    ? Math.max(0, Math.floor((input.nowMs - fetchedAtMs) / 1000))
    : null;

  const isFresh = Number.isFinite(expiresAtMs) && expiresAtMs > input.nowMs;
  if (isFresh) {
    return {
      source: 'fresh' as const,
      ageSeconds,
    };
  }

  const maxStaleSeconds = Math.max(0, Math.floor(Number(input.staleMaxSeconds) || 0));
  if (ageSeconds != null && ageSeconds <= maxStaleSeconds) {
    return {
      source: 'stale' as const,
      ageSeconds,
    };
  }

  return {
    source: 'miss' as const,
    ageSeconds,
  };
}

export function createYouTubeSearchCacheService() {
  const TABLE_NAME = 'blueprint_youtube_search_cache';

  async function readCache(args: {
    db: DbClient | null;
    enabled: boolean;
    kind: YouTubeSearchCacheKind;
    query: string;
    limit: number;
    pageToken?: string | null;
    staleMaxSeconds: number;
  }): Promise<YouTubeSearchCacheHit | null> {
    if (!args.enabled || !args.db) return null;
    const cacheKey = buildYouTubeSearchCacheKey({
      kind: args.kind,
      query: args.query,
      limit: args.limit,
      pageToken: args.pageToken,
    });

    const { data, error } = await args.db
      .from(TABLE_NAME)
      .select('cache_key, kind, query, page_token, response_json, fetched_at, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error, TABLE_NAME)) return null;
      throw error;
    }
    if (!data) return null;

    const row = data as RawCacheRow;
    const freshness = classifySearchCacheFreshness({
      nowMs: Date.now(),
      expiresAtRaw: row.expires_at,
      fetchedAtRaw: row.fetched_at,
      staleMaxSeconds: args.staleMaxSeconds,
    });
    if (freshness.source === 'miss') return null;

    void args.db
      .from(TABLE_NAME)
      .update({ last_served_at: new Date().toISOString() })
      .eq('cache_key', cacheKey);

    return {
      source: freshness.source,
      response: row.response_json,
      cacheKey,
      ageSeconds: freshness.ageSeconds,
      fetchedAt: row.fetched_at || null,
      expiresAt: row.expires_at || null,
    };
  }

  async function writeCache(args: {
    db: DbClient | null;
    enabled: boolean;
    kind: YouTubeSearchCacheKind;
    query: string;
    limit: number;
    pageToken?: string | null;
    response: unknown;
    ttlSeconds: number;
  }) {
    if (!args.enabled || !args.db) return;
    const cacheKey = buildYouTubeSearchCacheKey({
      kind: args.kind,
      query: args.query,
      limit: args.limit,
      pageToken: args.pageToken,
    });
    const now = new Date();
    const ttl = Math.max(1, Math.floor(Number(args.ttlSeconds) || 1));
    const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();

    const { error } = await args.db
      .from(TABLE_NAME)
      .upsert({
        cache_key: cacheKey,
        kind: args.kind,
        query: normalizeYouTubeSearchQuery(args.query),
        page_token: String(args.pageToken || '').trim() || null,
        response_json: args.response as any,
        fetched_at: now.toISOString(),
        expires_at: expiresAt,
        updated_at: now.toISOString(),
      }, {
        onConflict: 'cache_key',
      });
    if (error && !isMissingRelationError(error, TABLE_NAME)) {
      throw error;
    }
  }

  return {
    readCache,
    writeCache,
  };
}

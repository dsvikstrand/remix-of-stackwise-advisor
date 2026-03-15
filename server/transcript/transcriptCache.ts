import type {
  TranscriptProvider,
  TranscriptProviderAttempt,
  TranscriptProviderDebug,
  TranscriptProviderSessionMode,
  TranscriptProviderTrace,
  TranscriptResult,
  TranscriptSegment,
  TranscriptTransportMetadata,
} from './types';

type DbClient = any;

type CachedTranscriptRow = {
  video_id: string;
  transcript_text: string;
  transcript_source: string;
  confidence: number | null;
  segments_json: unknown;
  provider_id: string | null;
  transport_json: unknown;
  provider_trace_json: unknown;
  created_at: string;
  updated_at: string;
};

function normalizeTranscriptProvider(value: unknown): TranscriptProvider | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'youtube_timedtext') return 'youtube_timedtext';
  if (normalized === 'videotranscriber_temp') return 'videotranscriber_temp';
  return null;
}

function normalizeTranscriptSegments(value: unknown): TranscriptSegment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const segments = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const text = String(row.text || '').trim();
      if (!text) return null;
      const startSec = Number(row.startSec);
      const endSec = Number(row.endSec);
      return {
        text,
        ...(Number.isFinite(startSec) ? { startSec } : {}),
        ...(Number.isFinite(endSec) ? { endSec } : {}),
      } satisfies TranscriptSegment;
    })
    .filter((entry): entry is TranscriptSegment => entry != null);
  return segments.length > 0 ? segments : undefined;
}

function normalizeSessionValue(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalized.length > 64 ? normalized.slice(0, 64) : normalized;
}

function normalizeSessionMode(value: unknown): TranscriptProviderSessionMode | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'shared') return 'shared';
  if (normalized === 'force_new') return 'force_new';
  return null;
}

function normalizeOptionalBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function normalizeTranscriptProviderDebug(value: unknown): TranscriptProviderDebug | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const provider = normalizeTranscriptProvider(row.provider);
  if (!provider) return null;
  const httpStatus = Number(row.http_status);
  const retryAfterSeconds = Number(row.retry_after_seconds);
  const sessionValue = normalizeSessionValue(row.session_value);
  const sessionInitialValue = normalizeSessionValue(row.session_initial_value);
  const sessionMode = normalizeSessionMode(row.session_mode);
  const sessionRotated = normalizeOptionalBoolean(row.session_rotated);
  return {
    provider,
    stage: String(row.stage || '').trim() || null,
    http_status: Number.isFinite(httpStatus) ? httpStatus : null,
    retry_after_seconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.max(1, Math.ceil(retryAfterSeconds))
      : null,
    provider_error_code: String(row.provider_error_code || '').trim() || null,
    response_excerpt: String(row.response_excerpt || '').trim() || null,
    ...(sessionValue ? { session_value: sessionValue } : {}),
    ...(sessionInitialValue ? { session_initial_value: sessionInitialValue } : {}),
    ...(sessionMode ? { session_mode: sessionMode } : {}),
    ...(sessionRotated != null ? { session_rotated: sessionRotated } : {}),
  } satisfies TranscriptProviderDebug;
}

function normalizeTranscriptProviderAttempts(value: unknown): TranscriptProviderAttempt[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const provider = normalizeTranscriptProvider(row.provider);
      if (!provider) return null;
      const errorCode = String(row.error_code || '').trim() || null;
      return {
        provider,
        ok: Boolean(row.ok),
        error_code: errorCode,
        provider_debug: normalizeTranscriptProviderDebug(row.provider_debug),
      } satisfies TranscriptProviderAttempt;
    })
    .filter((entry): entry is TranscriptProviderAttempt => entry != null);
}

function normalizeTranscriptTransport(value: unknown): TranscriptTransportMetadata | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const provider = normalizeTranscriptProvider(row.provider);
  if (!provider) return null;
  const proxyMode = String(row.proxy_mode || '').trim();
  const proxySelectedIndex = Number(row.proxy_selected_index);
  if (proxyMode !== 'direct' && proxyMode !== 'webshare_explicit' && proxyMode !== 'webshare_index') {
    return null;
  }
  return {
    provider,
    proxy_enabled: Boolean(row.proxy_enabled),
    proxy_mode: proxyMode,
    proxy_selector: String(row.proxy_selector || '').trim() || null,
    proxy_selected_index: Number.isFinite(proxySelectedIndex) ? proxySelectedIndex : null,
    proxy_host: String(row.proxy_host || '').trim() || null,
  } satisfies TranscriptTransportMetadata;
}

function normalizeTranscriptProviderTrace(
  value: unknown,
  fallbackProvider: TranscriptProvider | null,
): TranscriptProviderTrace | null {
  if (!value || typeof value !== 'object') {
    if (!fallbackProvider) return null;
    return {
      attempted_providers: [],
      winning_provider: fallbackProvider,
      used_fallback: false,
    };
  }
  const row = value as Record<string, unknown>;
  const winningProvider = normalizeTranscriptProvider(row.winning_provider) || fallbackProvider;
  if (!winningProvider) return null;
  const sessionValue = normalizeSessionValue(row.session_value);
  const sessionInitialValue = normalizeSessionValue(row.session_initial_value);
  const sessionMode = normalizeSessionMode(row.session_mode);
  const sessionRotated = normalizeOptionalBoolean(row.session_rotated);
  return {
    attempted_providers: normalizeTranscriptProviderAttempts(row.attempted_providers),
    winning_provider: winningProvider,
    used_fallback: Boolean(row.used_fallback),
    cache_hit: Boolean(row.cache_hit),
    cache_provider: normalizeTranscriptProvider(row.cache_provider),
    ...(sessionValue ? { session_value: sessionValue } : {}),
    ...(sessionInitialValue ? { session_initial_value: sessionInitialValue } : {}),
    ...(sessionMode ? { session_mode: sessionMode } : {}),
    ...(sessionRotated != null ? { session_rotated: sessionRotated } : {}),
  } satisfies TranscriptProviderTrace;
}

function resolveCachedProviderId(input: TranscriptResult): TranscriptProvider | null {
  return input.provider_trace?.winning_provider
    || input.transport?.provider
    || normalizeTranscriptProvider(input.source);
}

export function hydrateCachedTranscriptResult(row: CachedTranscriptRow): TranscriptResult | null {
  const providerId = normalizeTranscriptProvider(row.provider_id);
  const providerTrace = normalizeTranscriptProviderTrace(row.provider_trace_json, providerId);
  const cacheProvider = providerTrace?.winning_provider || providerId || normalizeTranscriptProvider(row.transcript_source);
  if (!cacheProvider) return null;
  return {
    text: String(row.transcript_text || ''),
    source: String(row.transcript_source || '').trim(),
    confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
    segments: normalizeTranscriptSegments(row.segments_json),
    transport: normalizeTranscriptTransport(row.transport_json),
    provider_trace: providerTrace
      ? {
        ...providerTrace,
        cache_hit: true,
        cache_provider: cacheProvider,
      }
      : {
        attempted_providers: [],
        winning_provider: cacheProvider,
        used_fallback: false,
        cache_hit: true,
        cache_provider: cacheProvider,
      },
  };
}

function buildCachedTranscriptRow(videoId: string, transcript: TranscriptResult) {
  return {
    video_id: videoId,
    transcript_text: String(transcript.text || ''),
    transcript_source: String(transcript.source || '').trim(),
    confidence: Number.isFinite(Number(transcript.confidence)) ? Number(transcript.confidence) : null,
    segments_json: Array.isArray(transcript.segments) && transcript.segments.length > 0 ? transcript.segments : null,
    provider_id: resolveCachedProviderId(transcript),
    transport_json: transcript.transport || null,
    provider_trace_json: transcript.provider_trace || null,
  };
}

export async function readCachedTranscript(db: DbClient | null | undefined, videoId: string) {
  if (!db) return null;
  const { data, error } = await db
    .from('youtube_transcript_cache')
    .select([
      'video_id',
      'transcript_text',
      'transcript_source',
      'confidence',
      'segments_json',
      'provider_id',
      'transport_json',
      'provider_trace_json',
      'created_at',
      'updated_at',
    ].join(', '))
    .eq('video_id', videoId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return hydrateCachedTranscriptResult(data as CachedTranscriptRow);
}

export async function writeCachedTranscript(
  db: DbClient | null | undefined,
  videoId: string,
  transcript: TranscriptResult,
) {
  if (!db) return;
  const text = String(transcript.text || '').trim();
  if (!text) return;
  const { error } = await db
    .from('youtube_transcript_cache')
    .upsert(buildCachedTranscriptRow(videoId, transcript), { onConflict: 'video_id' });
  if (error) throw error;
}

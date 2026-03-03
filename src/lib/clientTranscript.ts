import { config } from '@/config/runtime';

const CLIENT_TRANSCRIPT_ENDPOINT = 'https://yt-to-text.com/api/v1/Subtitles';

export type ClientTranscriptSource = 'direct' | 'relay';

type ClientTranscriptResponse = {
  transcript_text?: string;
  video_title?: string;
  title?: string;
  duration_seconds?: number;
  durationSeconds?: number;
  data?: {
    transcripts?: Array<{ t?: string }>;
  };
};

export type ClientTranscriptPayload = {
  transcript_text: string;
  video_title: string | null;
  duration_seconds: number | null;
  transcript_source: ClientTranscriptSource;
};

export type ClientTranscriptHydrationFailure = {
  video_id: string;
  title: string;
  reason: string;
};

function resolveTranscriptEndpoint(input: { source: ClientTranscriptSource }): {
  requestedSource: ClientTranscriptSource;
  endpoint: string;
  resolvedSource: ClientTranscriptSource;
} {
  if (input.source === 'relay') {
    const relayUrl = String(config.clientTranscriptRelayUrl || '').trim();
    if (relayUrl) {
      return {
        requestedSource: 'relay',
        endpoint: relayUrl,
        resolvedSource: 'relay',
      };
    }
    console.warn('[client_transcript_relay_missing_url_fallback]', {
      requested_source: 'relay',
    });
  }
  return {
    requestedSource: input.source,
    endpoint: CLIENT_TRANSCRIPT_ENDPOINT,
    resolvedSource: 'direct',
  };
}

function normalizeClientTranscriptReason(raw: unknown) {
  return String(raw || '').trim();
}

export function toClientTranscriptErrorMessage(raw: unknown, fallback = 'Could not fetch transcript in your browser right now.') {
  const reason = normalizeClientTranscriptReason(raw);
  if (!reason) return fallback;
  if (reason === 'CLIENT_TRANSCRIPT_EMPTY') {
    return 'Transcript came back empty for this video. Please try another video.';
  }
  if (reason === 'CLIENT_TRANSCRIPT_HTTP_404') {
    return 'Transcript is unavailable for this video right now. Please try another video.';
  }
  if (reason === 'CLIENT_TRANSCRIPT_HTTP_403' || reason === 'CLIENT_TRANSCRIPT_HTTP_429') {
    return 'Transcript service is busy right now. Please wait a bit and try again.';
  }
  if (reason.startsWith('CLIENT_TRANSCRIPT_HTTP_')) {
    return 'Transcript service is unavailable right now. Please try again shortly.';
  }
  if (reason === 'Failed to fetch' || reason.includes('NetworkError') || reason.includes('Load failed')) {
    return 'Could not reach the transcript service from your browser. Please check your connection and try again.';
  }
  return fallback;
}

export function toClientTranscriptBatchErrorMessage(
  failures: ClientTranscriptHydrationFailure[],
  fallback = 'Could not fetch transcript in your browser for the selected videos.',
) {
  if (!failures.length) return fallback;
  return toClientTranscriptErrorMessage(failures[0]?.reason, fallback);
}

function extractTranscriptPayload(payload: ClientTranscriptResponse | null): {
  transcriptText: string;
  videoTitle: string | null;
  durationSeconds: number | null;
} {
  const normalizedTranscriptText = String(payload?.transcript_text || '').trim();
  const transcriptRows = Array.isArray(payload?.data?.transcripts) ? payload?.data?.transcripts : [];
  const providerTranscriptText = transcriptRows
    .map((row) => String(row?.t || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const transcriptText = normalizedTranscriptText || providerTranscriptText;
  if (!transcriptText) {
    throw new Error('CLIENT_TRANSCRIPT_EMPTY');
  }

  const videoTitle = String(payload?.video_title || payload?.title || '').trim() || null;
  const durationRaw = Number(payload?.duration_seconds ?? payload?.durationSeconds);
  const durationSeconds = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.floor(durationRaw)
    : null;

  return {
    transcriptText,
    videoTitle,
    durationSeconds,
  };
}

async function fetchClientTranscriptFromEndpoint(
  endpoint: string,
  videoId: string,
): Promise<{ payload: ClientTranscriptResponse | null; response: Response }> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-version': '1.0',
      'x-source': 'tubetranscript',
    },
    body: JSON.stringify({ video_id: videoId }),
  });
  if (!response.ok) throw new Error(`CLIENT_TRANSCRIPT_HTTP_${response.status}`);
  const payload = (await response.json().catch(() => null)) as ClientTranscriptResponse | null;
  return { payload, response };
}

export async function fetchClientTranscriptForVideo(videoId: string): Promise<ClientTranscriptPayload> {
  const preferredSource = config.clientTranscriptSource;
  const preferredTarget = resolveTranscriptEndpoint({ source: preferredSource });
  let activeSource: ClientTranscriptSource = preferredTarget.resolvedSource;
  let payload: ClientTranscriptResponse | null = null;

  try {
    const preferredResponse = await fetchClientTranscriptFromEndpoint(preferredTarget.endpoint, videoId);
    payload = preferredResponse.payload;
  } catch (error) {
    if (preferredTarget.resolvedSource === 'relay') {
      console.warn('[client_transcript_relay_fallback]', {
        video_id: videoId,
        reason: error instanceof Error ? error.message : String(error),
      });
      const fallbackResponse = await fetchClientTranscriptFromEndpoint(CLIENT_TRANSCRIPT_ENDPOINT, videoId);
      payload = fallbackResponse.payload;
      activeSource = 'direct';
    } else {
      throw error;
    }
  }

  const extracted = extractTranscriptPayload(payload);
  return {
    transcript_text: extracted.transcriptText,
    video_title: extracted.videoTitle,
    duration_seconds: extracted.durationSeconds,
    transcript_source: activeSource,
  };
}

export async function hydrateQueueItemsWithClientTranscripts<
  T extends {
    video_id: string;
    title: string;
    duration_seconds?: number | null;
  },
>(
  items: T[],
): Promise<{
  ready: Array<T & {
    transcript_text: string;
    duration_seconds?: number | null;
    transcript_source?: ClientTranscriptSource;
  }>;
  failed: ClientTranscriptHydrationFailure[];
}> {
  const settled = await Promise.allSettled(
    items.map(async (item) => {
      const transcript = await fetchClientTranscriptForVideo(item.video_id);
      return {
        ...item,
        title: transcript.video_title || item.title,
        duration_seconds: transcript.duration_seconds ?? item.duration_seconds ?? null,
        transcript_text: transcript.transcript_text,
        transcript_source: transcript.transcript_source,
      };
    }),
  );

  const ready: Array<T & { transcript_text: string; duration_seconds?: number | null; transcript_source?: ClientTranscriptSource }> = [];
  const failed: ClientTranscriptHydrationFailure[] = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      ready.push(result.value);
      return;
    }
    const item = items[index];
    failed.push({
      video_id: String(item?.video_id || '').trim(),
      title: String(item?.title || '').trim() || 'Video',
      reason: result.reason instanceof Error ? result.reason.message : String(result.reason || 'CLIENT_TRANSCRIPT_FAILED'),
    });
  });

  if (items.length > 0) {
    const sourceCounts = ready.reduce<Record<string, number>>((acc, item) => {
      const source = String(item.transcript_source || 'unknown');
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});
    console.info('[client_transcript_hydration]', {
      requested: items.length,
      ready: ready.length,
      failed: failed.length,
      preferred_source: config.clientTranscriptSource,
      source_counts: sourceCounts,
    });
  }

  return { ready, failed };
}

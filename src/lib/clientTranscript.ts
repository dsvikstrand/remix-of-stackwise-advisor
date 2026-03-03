const CLIENT_TRANSCRIPT_ENDPOINT = 'https://yt-to-text.com/api/v1/Subtitles';

type ClientTranscriptResponse = {
  title?: string;
  durationSeconds?: number;
  data?: {
    transcripts?: Array<{ t?: string }>;
  };
};

export type ClientTranscriptPayload = {
  transcript_text: string;
  video_title: string | null;
  duration_seconds: number | null;
};

export type ClientTranscriptHydrationFailure = {
  video_id: string;
  title: string;
  reason: string;
};

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

export async function fetchClientTranscriptForVideo(videoId: string): Promise<ClientTranscriptPayload> {
  const response = await fetch(CLIENT_TRANSCRIPT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-version': '1.0',
      'x-source': 'tubetranscript',
    },
    body: JSON.stringify({ video_id: videoId }),
  });
  if (!response.ok) {
    throw new Error(`CLIENT_TRANSCRIPT_HTTP_${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as ClientTranscriptResponse | null;
  const transcriptRows = Array.isArray(payload?.data?.transcripts) ? payload?.data?.transcripts : [];
  const transcriptText = transcriptRows
    .map((row) => String(row?.t || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!transcriptText) {
    throw new Error('CLIENT_TRANSCRIPT_EMPTY');
  }

  const videoTitle = String(payload?.title || '').trim() || null;
  const durationRaw = Number(payload?.durationSeconds);
  const durationSeconds = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.floor(durationRaw)
    : null;

  return {
    transcript_text: transcriptText,
    video_title: videoTitle,
    duration_seconds: durationSeconds,
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
  ready: Array<T & { transcript_text: string; duration_seconds?: number | null }>;
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
      };
    }),
  );

  const ready: Array<T & { transcript_text: string; duration_seconds?: number | null }> = [];
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
    console.info('[client_transcript_hydration]', {
      requested: items.length,
      ready: ready.length,
      failed: failed.length,
    });
  }

  return { ready, failed };
}

import { getTranscriptFromYtToText } from './providers/ytToTextProvider';
import { getTranscriptFromYouTubeTimedtext } from './providers/youtubeTimedtextProvider';
import { TranscriptProviderError, type TranscriptProvider, type TranscriptResult } from './types';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new TranscriptProviderError('TIMEOUT', 'Transcript request timed out.')), ms);
    }),
  ]);
}

export function resolveTranscriptProvider(): TranscriptProvider {
  const raw = (process.env.TRANSCRIPT_PROVIDER || 'yt_to_text').toLowerCase();
  if (raw === 'youtube_timedtext') return 'youtube_timedtext';
  return 'yt_to_text';
}

const ALL_TRANSCRIPT_PROVIDERS: TranscriptProvider[] = ['yt_to_text', 'youtube_timedtext'];

function normalizeTranscriptProviderErrorCode(error: unknown) {
  if (error instanceof TranscriptProviderError) return error.code;
  return 'TRANSCRIPT_FETCH_FAIL' as const;
}

async function getTranscriptForVideoWithProvider(videoId: string, provider: TranscriptProvider): Promise<TranscriptResult> {
  if (provider === 'youtube_timedtext') {
    return withTimeout(getTranscriptFromYouTubeTimedtext(videoId), 25_000);
  }
  return withTimeout(getTranscriptFromYtToText(videoId), 25_000);
}

export async function getTranscriptForVideo(videoId: string): Promise<TranscriptResult> {
  const provider = resolveTranscriptProvider();
  return getTranscriptForVideoWithProvider(videoId, provider);
}

export type TranscriptProbeProviderResult = {
  provider: TranscriptProvider;
  ok: boolean;
  error_code: 'NO_CAPTIONS' | 'TRANSCRIPT_FETCH_FAIL' | 'TRANSCRIPT_EMPTY' | 'TIMEOUT' | null;
};

export type TranscriptProbeResult = {
  all_no_captions: boolean;
  any_success: boolean;
  providers: TranscriptProbeProviderResult[];
};

export async function probeTranscriptProviders(videoId: string): Promise<TranscriptProbeResult> {
  const providers: TranscriptProbeProviderResult[] = [];

  for (const provider of ALL_TRANSCRIPT_PROVIDERS) {
    try {
      await getTranscriptForVideoWithProvider(videoId, provider);
      providers.push({
        provider,
        ok: true,
        error_code: null,
      });
    } catch (error) {
      providers.push({
        provider,
        ok: false,
        error_code: normalizeTranscriptProviderErrorCode(error),
      });
    }
  }

  const allNoCaptions = providers.length > 0
    && providers.every((row) => row.ok === false && row.error_code === 'NO_CAPTIONS');
  const anySuccess = providers.some((row) => row.ok);

  return {
    all_no_captions: allNoCaptions,
    any_success: anySuccess,
    providers,
  };
}

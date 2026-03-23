import { readCachedTranscript } from '../transcript/transcriptCache';
import type { TranscriptResult } from '../transcript/types';
import type { TranscriptRequestClass } from './transcriptThrottle';

type DbClient = any;

type TranscriptFetchOptions = {
  requestClass?: TranscriptRequestClass;
  reason?: string;
};

export function createTranscriptFetchWithCacheBypass(deps: {
  getDb: () => DbClient | null | undefined;
  fetchWithThrottle: (videoId: string, options?: TranscriptFetchOptions) => Promise<TranscriptResult>;
  readCachedTranscript?: typeof readCachedTranscript;
  onCacheHit?: (input: { videoId: string; requestClass: TranscriptRequestClass; reason: string }) => void;
}) {
  const readCached = deps.readCachedTranscript ?? readCachedTranscript;

  return async function getTranscriptForVideo(videoId: string, options?: TranscriptFetchOptions): Promise<TranscriptResult> {
    const requestClass = options?.requestClass === 'interactive' ? 'interactive' : 'background';
    const reason = String(options?.reason || 'pipeline_transcript_fetch').trim() || 'pipeline_transcript_fetch';
    const db = deps.getDb();

    if (db) {
      try {
        const cachedTranscript = await readCached(db, videoId);
        if (cachedTranscript) {
          deps.onCacheHit?.({
            videoId,
            requestClass,
            reason,
          });
          return cachedTranscript;
        }
      } catch {
        // Fail open: cache-read issues should not block transcript fetch.
      }
    }

    return deps.fetchWithThrottle(videoId, {
      requestClass,
      reason,
    });
  };
}

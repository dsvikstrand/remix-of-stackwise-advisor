import { getTranscriptProvider, listTranscriptProvidersForProbe } from './providerRegistry';
import {
  getTranscriptProviderDebug,
  TranscriptProviderError,
  type TranscriptProvider,
  type TranscriptProviderAdapter,
  type TranscriptProviderErrorCode,
  type TranscriptProviderDebug,
  type TranscriptResult,
} from './types';

export type TranscriptProbeProviderResult = {
  provider: TranscriptProvider;
  ok: boolean;
  error_code: TranscriptProviderErrorCode | null;
  provider_debug?: TranscriptProviderDebug | null;
};

export type TranscriptProbeResult = {
  all_no_captions: boolean;
  any_success: boolean;
  providers: TranscriptProbeProviderResult[];
};

export type TranscriptServiceDeps = {
  timeoutMs: number;
  resolveProvider: () => TranscriptProvider;
  getProviderById: (providerId: TranscriptProvider) => TranscriptProviderAdapter | null;
  listProvidersForProbe: () => TranscriptProviderAdapter[];
};

const DEFAULT_TRANSCRIPT_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new TranscriptProviderError('TIMEOUT', 'Transcript request timed out.')),
        ms,
      );
    }),
  ]);
}

export function resolveTranscriptProvider(): TranscriptProvider {
  const raw = String(process.env.TRANSCRIPT_PROVIDER || 'yt_to_text').toLowerCase();
  if (raw === 'youtube_timedtext') return 'youtube_timedtext';
  return 'yt_to_text';
}

export function normalizeTranscriptProviderErrorCode(error: unknown): TranscriptProviderErrorCode {
  if (error instanceof TranscriptProviderError) return error.code;
  return 'TRANSCRIPT_FETCH_FAIL';
}

export function createTranscriptService(partialDeps: Partial<TranscriptServiceDeps> = {}) {
  const deps: TranscriptServiceDeps = {
    timeoutMs: partialDeps.timeoutMs ?? DEFAULT_TRANSCRIPT_TIMEOUT_MS,
    resolveProvider: partialDeps.resolveProvider ?? resolveTranscriptProvider,
    getProviderById: partialDeps.getProviderById ?? getTranscriptProvider,
    listProvidersForProbe: partialDeps.listProvidersForProbe ?? listTranscriptProvidersForProbe,
  };

  async function getTranscriptForVideoWithProvider(
    videoId: string,
    provider: TranscriptProvider,
  ): Promise<TranscriptResult> {
    const providerAdapter = deps.getProviderById(provider);
    if (!providerAdapter) {
      throw new TranscriptProviderError(
        'TRANSCRIPT_FETCH_FAIL',
        `Transcript provider "${provider}" is not registered.`,
      );
    }
    return withTimeout(providerAdapter.getTranscript(videoId), deps.timeoutMs);
  }

  async function getTranscriptForVideo(videoId: string): Promise<TranscriptResult> {
    const provider = deps.resolveProvider();
    return getTranscriptForVideoWithProvider(videoId, provider);
  }

  async function probeTranscriptProviders(videoId: string): Promise<TranscriptProbeResult> {
    const providers: TranscriptProbeProviderResult[] = [];
    for (const provider of deps.listProvidersForProbe()) {
      try {
        await getTranscriptForVideoWithProvider(videoId, provider.id);
        providers.push({
          provider: provider.id,
          ok: true,
          error_code: null,
          provider_debug: null,
        });
      } catch (error) {
        providers.push({
          provider: provider.id,
          ok: false,
          error_code: normalizeTranscriptProviderErrorCode(error),
          provider_debug: getTranscriptProviderDebug(error),
        });
      }
    }

    const allNoCaptions =
      providers.length > 0
      && providers.every((row) => row.ok === false && row.error_code === 'NO_CAPTIONS');
    const anySuccess = providers.some((row) => row.ok);

    return {
      all_no_captions: allNoCaptions,
      any_success: anySuccess,
      providers,
    };
  }

  return {
    getTranscriptForVideoWithProvider,
    getTranscriptForVideo,
    probeTranscriptProviders,
  };
}

const transcriptService = createTranscriptService();

export const {
  getTranscriptForVideoWithProvider,
  getTranscriptForVideo,
  probeTranscriptProviders,
} = transcriptService;

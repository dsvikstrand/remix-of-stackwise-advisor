import { ytToTextTranscriptProviderAdapter } from './providers/ytToTextProvider';
import { youtubeTimedtextTranscriptProviderAdapter } from './providers/youtubeTimedtextProvider';
import type { TranscriptProvider, TranscriptProviderAdapter } from './types';

const DEFAULT_PROVIDER_ORDER: TranscriptProvider[] = ['yt_to_text', 'youtube_timedtext'];

const transcriptProviderRegistry = new Map<TranscriptProvider, TranscriptProviderAdapter>();
let probeProviderOrder: TranscriptProvider[] = [...DEFAULT_PROVIDER_ORDER];

export function registerTranscriptProviders(
  providers: TranscriptProviderAdapter[] = [
    ytToTextTranscriptProviderAdapter,
    youtubeTimedtextTranscriptProviderAdapter,
  ],
) {
  transcriptProviderRegistry.clear();
  probeProviderOrder = [];

  for (const provider of providers) {
    transcriptProviderRegistry.set(provider.id, provider);
    probeProviderOrder.push(provider.id);
  }

  return transcriptProviderRegistry;
}

function ensureTranscriptProvidersRegistered() {
  if (transcriptProviderRegistry.size > 0) return;
  registerTranscriptProviders();
}

export function getTranscriptProvider(providerId: TranscriptProvider) {
  ensureTranscriptProvidersRegistered();
  return transcriptProviderRegistry.get(providerId) || null;
}

export function listTranscriptProvidersForProbe() {
  ensureTranscriptProvidersRegistered();
  return probeProviderOrder
    .map((providerId) => transcriptProviderRegistry.get(providerId) || null)
    .filter((provider): provider is TranscriptProviderAdapter => provider != null);
}


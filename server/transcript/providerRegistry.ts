import { transcriptApiTranscriptProviderAdapter } from './providers/transcriptApiProvider';
import { videoTranscriberTempTranscriptProviderAdapter } from './providers/videoTranscriberTempProvider';
import { youtubeTimedtextTranscriptProviderAdapter } from './providers/youtubeTimedtextProvider';
import type { TranscriptProvider, TranscriptProviderAdapter } from './types';

const DEFAULT_PROVIDER_ORDER: TranscriptProvider[] = ['youtube_timedtext', 'videotranscriber_temp', 'transcriptapi'];

const transcriptProviderRegistry = new Map<TranscriptProvider, TranscriptProviderAdapter>();
let probeProviderOrder: TranscriptProvider[] = [...DEFAULT_PROVIDER_ORDER];

export function registerTranscriptProviders(
  providers: TranscriptProviderAdapter[] = [
    videoTranscriberTempTranscriptProviderAdapter,
    youtubeTimedtextTranscriptProviderAdapter,
    transcriptApiTranscriptProviderAdapter,
  ],
) {
  transcriptProviderRegistry.clear();

  for (const provider of providers) {
    transcriptProviderRegistry.set(provider.id, provider);
  }

  const configuredProvider = resolveConfiguredProbeProvider();
  const orderedProbeProviders = [
    ...(configuredProvider && !DEFAULT_PROVIDER_ORDER.includes(configuredProvider) ? [configuredProvider] : []),
    ...DEFAULT_PROVIDER_ORDER,
  ];
  probeProviderOrder = orderedProbeProviders
    .filter((providerId, index) => orderedProbeProviders.indexOf(providerId) === index)
    .filter((providerId) => transcriptProviderRegistry.has(providerId));
  if (probeProviderOrder.length === 0) {
    probeProviderOrder = providers.map((provider) => provider.id);
  }

  return transcriptProviderRegistry;
}

function resolveConfiguredProbeProvider(): TranscriptProvider | null {
  const raw = String(process.env.TRANSCRIPT_PROVIDER || '').toLowerCase();
  if (raw === 'youtube_timedtext' || raw === 'videotranscriber_temp' || raw === 'transcriptapi') {
    return raw;
  }
  return null;
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

export function listTranscriptProvidersForFallback(primaryProvider?: TranscriptProvider | null) {
  ensureTranscriptProvidersRegistered();
  const orderedProviders = [
    ...(primaryProvider ? [primaryProvider] : []),
    ...DEFAULT_PROVIDER_ORDER,
    ...Array.from(transcriptProviderRegistry.keys()),
  ];
  return orderedProviders
    .filter((providerId, index) => orderedProviders.indexOf(providerId) === index)
    .map((providerId) => transcriptProviderRegistry.get(providerId) || null)
    .filter((provider): provider is TranscriptProviderAdapter => provider != null);
}

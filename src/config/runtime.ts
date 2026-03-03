/**
 * Centralized runtime configuration.
 *
 * Every env-var read in the frontend should flow through this module.
 */

export const config = {
  /** Supabase project URL (always available, even in "self" mode for auth). */
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,

  /** Supabase anon / publishable key. */
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,

  /** External agentic backend URL (may be undefined). */
  agenticBackendUrl: import.meta.env.VITE_AGENTIC_BACKEND_URL as string | undefined,

  /** Vite base path (for SPA routing on GitHub Pages etc.). */
  basePath: import.meta.env.BASE_URL as string,

  /** Developer-facing UI elements (toasts/debug hints). */
  developerMode: toBool(import.meta.env.VITE_DEVELOPER_MODE, true),

  /** Preferred transcript fetch path for manual browser hydration. */
  clientTranscriptSource: toClientTranscriptSource(import.meta.env.VITE_CLIENT_TRANSCRIPT_SOURCE, 'direct'),

  /** Optional temporary relay endpoint for developer transcript testing. */
  clientTranscriptRelayUrl: toOptionalString(import.meta.env.VITE_CLIENT_TRANSCRIPT_RELAY_URL),

  /** Feature flags for phased bleuV1 rollout. */
  features: {
    myFeedV1: toBool(import.meta.env.VITE_FEATURE_MY_FEED_V1, true),
    sourceAdapterV1: toBool(import.meta.env.VITE_FEATURE_SOURCE_ADAPTER_V1, true),
    channelSubmitV1: toBool(import.meta.env.VITE_FEATURE_CHANNEL_SUBMIT_V1, true),
    gatePipelineV1: toBool(import.meta.env.VITE_FEATURE_GATE_PIPELINE_V1, true),
    autoChannelPipelineV1: toBool(import.meta.env.VITE_FEATURE_AUTO_CHANNEL_PIPELINE_V1, true),
  },
} as const;

const REQUIRED_FRONTEND_ENV_KEYS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const;

export function getMissingFrontendEnvKeys(): string[] {
  const checks: Record<string, unknown> = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };

  return REQUIRED_FRONTEND_ENV_KEYS.filter((key) => {
    const raw = checks[key];
    return raw === undefined || raw === null || String(raw).trim() === '';
  });
}

export function hasRequiredFrontendEnv(): boolean {
  return getMissingFrontendEnvKeys().length === 0;
}

function toBool(raw: unknown, fallback: boolean) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toOptionalString(raw: unknown): string | null {
  const normalized = String(raw || '').trim();
  return normalized || null;
}

function toClientTranscriptSource(raw: unknown, fallback: 'direct' | 'relay'): 'direct' | 'relay' {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'relay') return 'relay';
  if (normalized === 'direct') return 'direct';
  return fallback;
}

/**
 * Return the Supabase Edge Function URL for a given function name.
 *
 * This always points at the Supabase project, regardless of whether the
 * agentic backend toggle is enabled.
 */
export function getEdgeFunctionUrl(fnName: string): string {
  return `${config.supabaseUrl.replace(/\/$/, "")}/functions/v1/${fnName}`;
}

/**
 * Resolve the full URL for a backend function by name.
 *
 * When the agentic backend URL is configured it routes to
 * `<agenticBackendUrl>/api/<fnName>`, otherwise it falls back to the
 * Supabase Edge Function URL.
 */
export function getFunctionUrl(fnName: string): string {
  if (config.agenticBackendUrl) {
    return `${config.agenticBackendUrl.replace(/\/$/, "")}/api/${fnName}`;
  }
  return getEdgeFunctionUrl(fnName);
}

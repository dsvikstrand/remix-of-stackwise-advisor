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
} as const;

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

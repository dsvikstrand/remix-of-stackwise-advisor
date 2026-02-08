/**
 * Centralized runtime configuration.
 *
 * Every env-var read in the frontend should flow through this module
 * so that switching from Lovable Cloud to a self-hosted backend is a
 * one-line change (`VITE_BACKEND_TARGET=self`).
 */

export type BackendTarget = "lovable" | "self";

export const config = {
  /** Which backend stack is active. Defaults to "lovable". */
  backendTarget: (import.meta.env.VITE_BACKEND_TARGET ?? "lovable") as BackendTarget,

  /** Supabase project URL (always available, even in "self" mode for auth). */
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,

  /** Supabase anon / publishable key. */
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,

  /** External agentic backend URL (may be undefined). */
  agenticBackendUrl: import.meta.env.VITE_AGENTIC_BACKEND_URL as string | undefined,

  /** Whether the agentic backend is enabled. */
  useAgenticBackend: import.meta.env.VITE_USE_AGENTIC_BACKEND === "true",

  /** Vite base path (for SPA routing on GitHub Pages etc.). */
  basePath: import.meta.env.BASE_URL as string,
} as const;

/**
 * Resolve the full URL for a backend function by name.
 *
 * When the agentic backend is enabled it routes to
 * `<agenticBackendUrl>/api/<fnName>`, otherwise it falls back to the
 * Supabase Edge Function URL.
 */
export function getFunctionUrl(fnName: string): string {
  if (config.useAgenticBackend && config.agenticBackendUrl) {
    return `${config.agenticBackendUrl.replace(/\/$/, "")}/api/${fnName}`;
  }
  return `${config.supabaseUrl}/functions/v1/${fnName}`;
}

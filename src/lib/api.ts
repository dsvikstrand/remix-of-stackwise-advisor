/**
 * Thin fetch wrapper for backend calls.
 *
 * Centralizes:
 *  - URL resolution (via getFunctionUrl)
 *  - Auth header logic (Supabase session token or anon key)
 *  - JSON serialization + error handling
 *  - Optional SSE streaming (returns raw Response)
 */

import { supabase } from "@/integrations/supabase/client";
import { config, getEdgeFunctionUrl, getFunctionUrl } from "@/config/runtime";

export type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  /** If true, returns the raw Response (for SSE / streaming). */
  stream?: boolean;
  /** If true, uses keepalive (fire-and-forget requests like logging). */
  keepalive?: boolean;
  /** If true, always routes to Supabase Edge Function, ignoring agentic backend toggle. */
  pinnedToEdge?: boolean;
};

/**
 * Build the Authorization header value.
 *
 * If there is an active Supabase session we use the access token;
 * otherwise we fall back to the publishable anon key.
 */
export async function getAuthHeader(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) return `Bearer ${token}`;
  } catch {
    // Ignore – fall through to anon key.
  }
  return `Bearer ${config.supabaseAnonKey}`;
}

/**
 * Call a backend function by name.
 *
 * @example
 *   // JSON request
 *   const data = await apiFetch("generate-inventory", { body: { keywords: "skincare" } });
 *
 *   // SSE streaming
 *   const res = await apiFetch("analyze-blueprint", { body: payload, stream: true });
 *   const reader = res.body.getReader();
 */
export async function apiFetch<T = unknown>(
  fnName: string,
  opts: ApiOptions = {},
): Promise<T> {
  const url = opts.pinnedToEdge
    ? getEdgeFunctionUrl(fnName)
    : getFunctionUrl(fnName);
  const authHeader = await getAuthHeader();

  const res = await fetch(url, {
    method: opts.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      ...opts.headers,
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    keepalive: opts.keepalive,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${fnName} ${res.status}: ${text}`);
  }

  if (opts.stream) return res as unknown as T;

  if (res.status === 204) return undefined as T;

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return res.json() as Promise<T>;
  }

  return undefined as T;
}

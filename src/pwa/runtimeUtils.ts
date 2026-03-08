export const PWA_CALLBACK_QUERY_PARAMS = [
  "code",
  "state",
  "error",
  "error_code",
  "error_description",
  "provider_token",
  "refresh_token",
] as const;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function normalizeBasePath(basePath: string): string {
  const trimmed = String(basePath || "").trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function joinBasePath(basePath: string, path: string): string {
  const normalizedBasePath = normalizeBasePath(basePath);
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  if (!normalizedPath) return normalizedBasePath;
  if (normalizedBasePath === "/") return `/${normalizedPath}`;
  return `${trimTrailingSlash(normalizedBasePath)}/${normalizedPath}`;
}

export function buildReleaseMetadataUrl(basePath: string, origin: string): string {
  return new URL(joinBasePath(basePath, "release.json"), origin).toString();
}

export function sanitizeReleaseSha(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function getPwaAvailableReleaseKey(options: {
  currentReleaseSha: string | null;
  latestReleaseSha: string | null;
  hasWaitingWorker: boolean;
}): string | null {
  const { currentReleaseSha, latestReleaseSha, hasWaitingWorker } = options;
  if (latestReleaseSha && latestReleaseSha !== currentReleaseSha) {
    return `release:${latestReleaseSha}`;
  }
  if (hasWaitingWorker) {
    return `waiting:${latestReleaseSha || currentReleaseSha || "unknown"}`;
  }
  return null;
}

export function shouldBypassPwaNavigation(url: URL, basePath: string): boolean {
  const normalizedBasePath = normalizeBasePath(basePath);
  const pathname = trimTrailingSlash(url.pathname) || "/";
  const authPath = trimTrailingSlash(joinBasePath(normalizedBasePath, "auth")) || "/";
  const offlinePath = trimTrailingSlash(joinBasePath(normalizedBasePath, "offline.html")) || "/";
  const redirectFallbackPath = trimTrailingSlash(joinBasePath(normalizedBasePath, "404.html")) || "/";

  if (
    pathname === authPath ||
    pathname.startsWith(`${authPath}/`) ||
    pathname === offlinePath ||
    pathname === redirectFallbackPath
  ) {
    return true;
  }

  if (
    normalizedBasePath !== "/" &&
    pathname !== trimTrailingSlash(normalizedBasePath) &&
    !pathname.startsWith(trimTrailingSlash(normalizedBasePath) + "/")
  ) {
    return true;
  }

  return PWA_CALLBACK_QUERY_PARAMS.some((key) => url.searchParams.has(key));
}

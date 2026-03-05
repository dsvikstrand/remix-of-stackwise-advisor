const REDIRECT_STORAGE_KEY = 'redirect';

export type RestoreSpaRedirectResult = {
  restored: boolean;
  reason:
    | 'restored'
    | 'missing'
    | 'storage_unavailable'
    | 'invalid_value'
    | 'invalid_base_path'
    | 'outside_base_path';
};

function normalizeBasePath(basePath: string): string {
  const trimmed = String(basePath || '').trim();
  if (!trimmed || trimmed === '/') return '/';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

function isPathWithinBase(pathname: string, normalizedBasePath: string): boolean {
  if (normalizedBasePath === '/') return pathname.startsWith('/');
  return pathname === normalizedBasePath || pathname.startsWith(`${normalizedBasePath}/`);
}

function safeClearRedirectValue() {
  try {
    sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
  } catch {
    // Ignore storage failures; this is a best-effort cleanup.
  }
}

export function restoreSpaRedirect(basePath: string): RestoreSpaRedirectResult {
  const normalizedBasePath = normalizeBasePath(basePath);
  if (!normalizedBasePath) {
    return { restored: false, reason: 'invalid_base_path' };
  }

  let rawRedirect: string | null = null;
  try {
    rawRedirect = sessionStorage.getItem(REDIRECT_STORAGE_KEY);
  } catch {
    return { restored: false, reason: 'storage_unavailable' };
  }
  if (!rawRedirect) {
    return { restored: false, reason: 'missing' };
  }

  const trimmed = rawRedirect.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    safeClearRedirectValue();
    return { restored: false, reason: 'invalid_value' };
  }

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(trimmed, window.location.origin);
  } catch {
    safeClearRedirectValue();
    return { restored: false, reason: 'invalid_value' };
  }

  if (redirectUrl.origin !== window.location.origin) {
    safeClearRedirectValue();
    return { restored: false, reason: 'invalid_value' };
  }
  if (!isPathWithinBase(redirectUrl.pathname, normalizedBasePath)) {
    safeClearRedirectValue();
    return { restored: false, reason: 'outside_base_path' };
  }

  const targetPath = `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  window.history.replaceState(null, '', targetPath);
  safeClearRedirectValue();
  return { restored: true, reason: 'restored' };
}

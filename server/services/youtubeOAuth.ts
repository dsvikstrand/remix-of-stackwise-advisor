import { Buffer } from 'node:buffer';

type YouTubeOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type YouTubeOAuthTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
  googleSub: string | null;
};

export type YouTubeOAuthAccountProfile = {
  googleSub: string | null;
  youtubeChannelId: string | null;
  youtubeChannelTitle: string | null;
  youtubeChannelUrl: string | null;
  youtubeChannelAvatarUrl: string | null;
};

export class YouTubeOAuthError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function parseIdTokenSubject(idToken: string | null | undefined) {
  const value = String(idToken || '').trim();
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson) as { sub?: string };
    return String(payload.sub || '').trim() || null;
  } catch {
    return null;
  }
}

function normalizeProviderErrorStatus(status: number) {
  if (status === 429) return { code: 'YT_PROVIDER_RATE_LIMITED', status: 429 };
  if (status >= 500) return { code: 'YT_PROVIDER_FAIL', status: 502 };
  return { code: 'YT_TOKEN_EXCHANGE_FAILED', status: 502 };
}

export function isYouTubeOAuthConfigured(config: YouTubeOAuthConfig) {
  return Boolean(
    String(config.clientId || '').trim()
    && String(config.clientSecret || '').trim()
    && String(config.redirectUri || '').trim(),
  );
}

export function buildYouTubeOAuthUrl(config: YouTubeOAuthConfig, state: string) {
  const scopes = config.scopes.filter(Boolean).join(' ');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

async function tokenRequest(
  config: YouTubeOAuthConfig,
  body: URLSearchParams,
): Promise<YouTubeOAuthTokenSet> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await response.json().catch(() => null) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !json?.access_token) {
    const normalized = normalizeProviderErrorStatus(response.status);
    throw new YouTubeOAuthError(
      normalized.code,
      json?.error_description || json?.error || 'Could not complete OAuth token exchange.',
      normalized.status,
    );
  }

  return {
    accessToken: String(json.access_token || '').trim(),
    refreshToken: String(json.refresh_token || '').trim() || null,
    expiresIn: Number.isFinite(Number(json.expires_in)) ? Number(json.expires_in) : null,
    scope: String(json.scope || '').trim() || null,
    googleSub: parseIdTokenSubject(json.id_token),
  };
}

export async function exchangeYouTubeOAuthCode(config: YouTubeOAuthConfig, code: string) {
  const body = new URLSearchParams();
  body.set('code', code);
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('redirect_uri', config.redirectUri);
  body.set('grant_type', 'authorization_code');
  return tokenRequest(config, body);
}

export async function refreshYouTubeAccessToken(config: YouTubeOAuthConfig, refreshToken: string) {
  const token = String(refreshToken || '').trim();
  if (!token) {
    throw new YouTubeOAuthError('YT_REAUTH_REQUIRED', 'Missing refresh token.', 401);
  }

  const body = new URLSearchParams();
  body.set('refresh_token', token);
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('grant_type', 'refresh_token');
  return tokenRequest(config, body);
}

export async function revokeYouTubeToken(token: string) {
  const value = String(token || '').trim();
  if (!value) return;
  const body = new URLSearchParams();
  body.set('token', value);

  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).catch(() => undefined);
}

export async function fetchYouTubeOAuthAccountProfile(accessToken: string): Promise<YouTubeOAuthAccountProfile> {
  const token = String(accessToken || '').trim();
  if (!token) {
    throw new YouTubeOAuthError('YT_REAUTH_REQUIRED', 'Missing access token.', 401);
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('mine', 'true');
  url.searchParams.set('maxResults', '1');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'bleuv1-youtube-oauth/1.0 (+https://api.bleup.app)',
    },
  });
  const json = await response.json().catch(() => null) as {
    items?: Array<{
      id?: string;
      snippet?: {
        title?: string;
        thumbnails?: {
          high?: { url?: string };
          medium?: { url?: string };
          default?: { url?: string };
        };
      };
    }>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new YouTubeOAuthError('YT_REAUTH_REQUIRED', 'YouTube authorization expired. Reconnect required.', 401);
    }
    const normalized = normalizeProviderErrorStatus(response.status);
    throw new YouTubeOAuthError(
      normalized.code,
      json?.error?.message || 'Could not fetch connected YouTube account.',
      normalized.status,
    );
  }

  const channel = Array.isArray(json?.items) ? json.items[0] : null;
  const channelId = String(channel?.id || '').trim() || null;
  const channelTitle = String(channel?.snippet?.title || '').trim() || null;
  const channelAvatarUrl =
    String(channel?.snippet?.thumbnails?.high?.url || '').trim()
    || String(channel?.snippet?.thumbnails?.medium?.url || '').trim()
    || String(channel?.snippet?.thumbnails?.default?.url || '').trim()
    || null;

  return {
    googleSub: null,
    youtubeChannelId: channelId,
    youtubeChannelTitle: channelTitle,
    youtubeChannelUrl: channelId ? `https://www.youtube.com/channel/${channelId}` : null,
    youtubeChannelAvatarUrl: channelAvatarUrl,
  };
}

export type { YouTubeOAuthConfig };

export const YOUTUBE_COMMENT_POST_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';

export class YouTubeCommentPostError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'YouTubeCommentPostError';
    this.code = code;
    this.status = status;
  }
}

function normalizeString(value: unknown) {
  return String(value || '').trim();
}

function extractApiErrorReason(payload: unknown) {
  const error = payload && typeof payload === 'object'
    ? (payload as { error?: { errors?: Array<{ reason?: unknown }>; message?: unknown } }).error
    : null;
  const reason = Array.isArray(error?.errors)
    ? normalizeString(error.errors[0]?.reason)
    : '';
  return reason || normalizeString(error?.message);
}

function mapYouTubeCommentPostFailure(status: number, payload: unknown) {
  const reason = extractApiErrorReason(payload);
  if (status === 401) {
    return new YouTubeCommentPostError('YT_REAUTH_REQUIRED', 'YouTube authorization expired. Reconnect required.', 401);
  }
  if (status === 403) {
    const scopeRelated = /insufficient|permission|forbidden|scope/i.test(reason);
    return new YouTubeCommentPostError(
      scopeRelated ? 'YT_COMMENT_SCOPE_REQUIRED' : 'YT_COMMENT_POST_FORBIDDEN',
      scopeRelated
        ? 'Reconnect YouTube with comment permission before posting.'
        : (reason || 'YouTube rejected the comment post.'),
      403,
    );
  }
  if (status === 429) {
    return new YouTubeCommentPostError('YT_PROVIDER_RATE_LIMITED', 'YouTube comment API is rate limited. Try again later.', 429);
  }
  if (status >= 500) {
    return new YouTubeCommentPostError('YT_PROVIDER_FAIL', 'YouTube comment API failed. Try again later.', 502);
  }
  return new YouTubeCommentPostError(
    'YT_COMMENT_POST_FAILED',
    reason || `YouTube comment post failed (${status}).`,
    502,
  );
}

export function hasYouTubeCommentPostScope(scope: unknown) {
  const scopes = normalizeString(scope)
    .split(/[,\s]+/)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  return scopes.includes(YOUTUBE_COMMENT_POST_SCOPE)
    || scopes.includes('https://www.googleapis.com/auth/youtube');
}

export async function postYouTubeTopLevelComment(input: {
  accessToken: string;
  videoId: string;
  text: string;
  fetchImpl?: typeof fetch;
}) {
  const accessToken = normalizeString(input.accessToken);
  const videoId = normalizeString(input.videoId);
  const text = normalizeString(input.text);
  if (!accessToken) {
    throw new YouTubeCommentPostError('YT_REAUTH_REQUIRED', 'Missing YouTube access token.', 401);
  }
  if (!videoId) {
    throw new YouTubeCommentPostError('INVALID_VIDEO_ID', 'Missing YouTube video id.', 400);
  }
  if (!text) {
    throw new YouTubeCommentPostError('INVALID_COMMENT_TEXT', 'Missing comment text.', 400);
  }

  const fetchImpl = input.fetchImpl || fetch;
  const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
  url.searchParams.set('part', 'snippet');

  const response = await fetchImpl(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'bleuv1-youtube-outreach/1.0 (+https://api.bleup.app)',
    },
    body: JSON.stringify({
      snippet: {
        videoId,
        topLevelComment: {
          snippet: {
            textOriginal: text,
          },
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null) as { id?: unknown } | null;
  if (!response.ok) {
    throw mapYouTubeCommentPostFailure(response.status, payload);
  }

  const youtubeCommentId = normalizeString(payload?.id);
  if (!youtubeCommentId) {
    throw new YouTubeCommentPostError('YT_COMMENT_ID_MISSING', 'YouTube did not return a comment id.', 502);
  }

  return {
    youtubeCommentId,
  };
}

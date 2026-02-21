export type SourceIdentity = {
  sourceType: 'youtube';
  sourceNativeId: string;
  canonicalKey: string;
};

export function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.replace(/^www\./, '');
    const pathParts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean);

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      let videoId = '';
      if (url.pathname === '/watch') {
        videoId = url.searchParams.get('v')?.trim() || '';
      } else if (pathParts[0] === 'shorts' || pathParts[0] === 'live' || pathParts[0] === 'embed') {
        videoId = pathParts[1]?.trim() || '';
      } else {
        return null;
      }
      return /^[a-zA-Z0-9_-]{8,15}$/.test(videoId) ? videoId : null;
    }

    if (host === 'youtu.be') {
      const videoId = pathParts[0]?.trim() || '';
      return /^[a-zA-Z0-9_-]{8,15}$/.test(videoId) ? videoId : null;
    }

    return null;
  } catch {
    return null;
  }
}

export function toYouTubeIdentity(videoId: string): SourceIdentity {
  return {
    sourceType: 'youtube',
    sourceNativeId: videoId,
    canonicalKey: `youtube:${videoId}`,
  };
}

export function buildYouTubeThumbnailUrl(videoId: string) {
  const normalized = String(videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,15}$/.test(normalized)) return null;
  return `https://i.ytimg.com/vi/${normalized}/hqdefault.jpg`;
}

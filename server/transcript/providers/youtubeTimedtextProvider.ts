import {
  TranscriptProviderError,
  normalizeTranscriptWhitespace,
  type TranscriptProviderAdapter,
  type TranscriptResult,
} from '../types';

function decodeHtml(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function parseCaptionTracks(xml: string) {
  const tracks: Array<{ lang: string; name: string | null }> = [];
  const regex = /<track\b([^>]*)\/>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    const attrs = match[1];
    const langMatch = attrs.match(/\blang_code="([^"]+)"/);
    if (!langMatch) continue;
    const nameMatch = attrs.match(/\bname="([^"]*)"/);
    tracks.push({ lang: langMatch[1], name: nameMatch ? decodeHtml(nameMatch[1]) : null });
  }
  return tracks;
}

function extractTranscriptFromJson3(payload: any) {
  if (!payload || !Array.isArray(payload.events)) return '';
  const parts: string[] = [];
  for (const event of payload.events) {
    if (!Array.isArray(event?.segs)) continue;
    for (const seg of event.segs) {
      const text = typeof seg?.utf8 === 'string' ? normalizeTranscriptWhitespace(decodeHtml(seg.utf8)) : '';
      if (text) parts.push(text);
    }
  }
  return normalizeTranscriptWhitespace(parts.join(' '));
}

async function fetchOnce(videoId: string): Promise<TranscriptResult> {
  const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`;
  const listResponse = await fetch(listUrl);
  if (!listResponse.ok) {
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', 'Could not fetch transcript metadata.');
  }

  const listXml = await listResponse.text();
  const tracks = parseCaptionTracks(listXml);
  if (tracks.length === 0) {
    throw new TranscriptProviderError('NO_CAPTIONS', 'Transcript unavailable for this video. Please try another video.');
  }

  const preferred = tracks.find((track) => track.lang.startsWith('en')) || tracks[0];
  const trackUrl = new URL('https://www.youtube.com/api/timedtext');
  trackUrl.searchParams.set('v', videoId);
  trackUrl.searchParams.set('lang', preferred.lang);
  trackUrl.searchParams.set('fmt', 'json3');
  if (preferred.name) trackUrl.searchParams.set('name', preferred.name);

  const trackResponse = await fetch(trackUrl.toString());
  if (!trackResponse.ok) {
    throw new TranscriptProviderError('TRANSCRIPT_FETCH_FAIL', 'Could not fetch transcript content.');
  }

  const payload = await trackResponse.json().catch(() => null);
  const text = extractTranscriptFromJson3(payload);
  if (!text) {
    throw new TranscriptProviderError('TRANSCRIPT_EMPTY', 'Transcript unavailable for this video. Please try another video.');
  }

  return {
    text,
    source: 'youtube_timedtext',
    confidence: null,
  };
}

export async function getTranscriptFromYouTubeTimedtext(videoId: string): Promise<TranscriptResult> {
  try {
    return await fetchOnce(videoId);
  } catch (error) {
    if (error instanceof TranscriptProviderError && error.code !== 'TRANSCRIPT_FETCH_FAIL') {
      throw error;
    }
    return fetchOnce(videoId);
  }
}

export const youtubeTimedtextTranscriptProviderAdapter: TranscriptProviderAdapter = {
  id: 'youtube_timedtext',
  getTranscript: getTranscriptFromYouTubeTimedtext,
};

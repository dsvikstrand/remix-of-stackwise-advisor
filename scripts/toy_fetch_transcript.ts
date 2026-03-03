/*
  Isolated toy spike: YouTube URL -> transcript text
  Usage:
    TRANSCRIPT_PROVIDER=yt_to_text node --import tsx scripts/toy_fetch_transcript.ts --url "https://www.youtube.com/watch?v=..."
    TRANSCRIPT_PROVIDER=youtube_timedtext node --import tsx scripts/toy_fetch_transcript.ts --url "..." --with-timestamps
*/

import '../server/loadEnv';
import { getTranscriptForVideo, resolveTranscriptProvider } from '../server/transcript/getTranscript';
import { TranscriptProviderError } from '../server/transcript/types';

class CliError extends Error {
  code: 'INVALID_URL';
  constructor(message: string) {
    super(message);
    this.code = 'INVALID_URL';
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    url: get('--url') || get('-u'),
    withTimestamps: args.includes('--with-timestamps'),
  };
}

function extractYouTubeVideoId(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new CliError('Invalid URL.');
  }

  const host = url.hostname.replace(/^www\./, '');
  if (url.searchParams.has('list')) {
    throw new CliError('Playlist URLs are not supported.');
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname !== '/watch') throw new CliError('Only youtube.com/watch single video URLs are supported.');
    const videoId = url.searchParams.get('v') || '';
    if (!/^[a-zA-Z0-9_-]{8,15}$/.test(videoId)) throw new CliError('Missing/invalid YouTube video id.');
    return videoId;
  }

  if (host === 'youtu.be') {
    const videoId = url.pathname.replace(/^\/+/, '').split('/')[0] || '';
    if (!/^[a-zA-Z0-9_-]{8,15}$/.test(videoId)) throw new CliError('Missing/invalid YouTube short video id.');
    return videoId;
  }

  throw new CliError('Only YouTube URLs are supported.');
}

function formatTime(s: number) {
  const total = Math.max(0, Math.floor(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

async function main() {
  const { url, withTimestamps } = parseArgs();
  if (!url) {
    console.error('Usage: node --import tsx scripts/toy_fetch_transcript.ts --url "https://www.youtube.com/watch?v=..." [--with-timestamps]');
    process.exit(1);
  }

  const startedAt = Date.now();
  try {
    const videoId = extractYouTubeVideoId(url);
    const result = await getTranscriptForVideo(videoId);
    const durationMs = Date.now() - startedAt;

    const transcript = withTimestamps && result.segments?.length
      ? result.segments.map((segment) => {
          if (typeof segment.startSec === 'number') {
            return `${formatTime(segment.startSec)}\n${segment.text}`;
          }
          return segment.text;
        }).join('\n')
      : result.text;

    console.log(JSON.stringify({
      ok: true,
      provider: resolveTranscriptProvider(),
      source: result.source,
      duration_ms: durationMs,
      chars: transcript.length,
      segments: result.segments?.length ?? null,
    }, null, 2));
    console.log('--- transcript ---');
    console.log(transcript);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (error instanceof CliError) {
      console.error(JSON.stringify({ ok: false, error_code: error.code, message: error.message, duration_ms: durationMs }, null, 2));
      process.exit(2);
    }
    if (error instanceof TranscriptProviderError) {
      console.error(JSON.stringify({ ok: false, error_code: error.code, message: error.message, duration_ms: durationMs }, null, 2));
      process.exit(3);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({ ok: false, error_code: 'TRANSCRIPT_FETCH_FAIL', message, duration_ms: durationMs }, null, 2));
    process.exit(4);
  }
}

main();

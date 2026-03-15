import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listYouTubeSourceVideos,
  YouTubeSourceVideosError,
} from '../../server/services/youtubeSourceVideos';

function createJsonResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('youtubeSourceVideos service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists channel uploads through uploads playlist instead of search.list', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/youtube/v3/channels') {
        return createJsonResponse(200, {
          items: [{
            snippet: { title: 'Channel One' },
            contentDetails: {
              relatedPlaylists: {
                uploads: 'UU_channel_1',
              },
            },
          }],
        });
      }
      if (url.pathname === '/youtube/v3/playlistItems') {
        return createJsonResponse(200, {
          items: [
            {
              snippet: {
                title: 'First &amp; Best Video',
                description: 'Fresh upload',
                thumbnails: { high: { url: 'https://img.example.com/1.jpg' } },
              },
              contentDetails: {
                videoId: 'vid_1',
                videoPublishedAt: '2026-03-01T10:00:00Z',
              },
              status: { privacyStatus: 'public' },
            },
            {
              snippet: {
                title: 'Private video',
              },
              contentDetails: {
                videoId: 'vid_private',
                videoPublishedAt: '2026-03-01T09:00:00Z',
              },
              status: { privacyStatus: 'private' },
            },
          ],
          nextPageToken: 'NEXT_TOKEN',
        });
      }
      if (url.pathname === '/youtube/v3/videos') {
        return createJsonResponse(200, {
          items: [{
            id: 'vid_1',
            contentDetails: { duration: 'PT4M10S' },
          }],
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    const page = await listYouTubeSourceVideos({
      apiKey: 'test-key',
      channelId: 'channel_1',
      limit: 12,
    });

    expect(fetchSpy.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/youtube/v3/channels',
      '/youtube/v3/playlistItems',
      '/youtube/v3/videos',
    ]);
    expect(page).toEqual({
      results: [{
        video_id: 'vid_1',
        video_url: 'https://www.youtube.com/watch?v=vid_1',
        title: 'First & Best Video',
        description: 'Fresh upload',
        channel_id: 'channel_1',
        channel_title: 'Channel One',
        thumbnail_url: 'https://img.example.com/1.jpg',
        published_at: '2026-03-01T10:00:00Z',
        duration_seconds: 250,
      }],
      nextPageToken: 'NEXT_TOKEN',
    });
  });

  it('returns an empty page when the channel has no uploads playlist', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(createJsonResponse(200, {
      items: [{
        snippet: { title: 'Channel One' },
        contentDetails: { relatedPlaylists: {} },
      }],
    }));

    const page = await listYouTubeSourceVideos({
      apiKey: 'test-key',
      channelId: 'channel_1',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(page).toEqual({
      results: [],
      nextPageToken: null,
    });
  });

  it('filters shorts using enriched durations from the uploads playlist path', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/youtube/v3/channels') {
        return createJsonResponse(200, {
          items: [{
            snippet: { title: 'Channel One' },
            contentDetails: {
              relatedPlaylists: {
                uploads: 'UU_channel_1',
              },
            },
          }],
        });
      }
      if (url.pathname === '/youtube/v3/playlistItems') {
        return createJsonResponse(200, {
          items: [
            {
              snippet: { title: 'Short video' },
              contentDetails: { videoId: 'short_1', videoPublishedAt: '2026-03-01T10:00:00Z' },
              status: { privacyStatus: 'public' },
            },
            {
              snippet: { title: 'Full video' },
              contentDetails: { videoId: 'full_1', videoPublishedAt: '2026-03-01T09:00:00Z' },
              status: { privacyStatus: 'public' },
            },
          ],
        });
      }
      if (url.pathname === '/youtube/v3/videos') {
        return createJsonResponse(200, {
          items: [
            { id: 'short_1', contentDetails: { duration: 'PT30S' } },
            { id: 'full_1', contentDetails: { duration: 'PT8M' } },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    const page = await listYouTubeSourceVideos({
      apiKey: 'test-key',
      channelId: 'channel_1',
      kind: 'shorts',
      shortsMaxSeconds: 60,
    });

    expect(page.results.map((row) => row.video_id)).toEqual(['short_1']);
  });

  it('maps playlist-item quota errors to RATE_LIMITED', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/youtube/v3/channels') {
        return createJsonResponse(200, {
          items: [{
            snippet: { title: 'Channel One' },
            contentDetails: {
              relatedPlaylists: {
                uploads: 'UU_channel_1',
              },
            },
          }],
        });
      }
      if (url.pathname === '/youtube/v3/playlistItems') {
        return createJsonResponse(429, {
          error: { code: 429, message: 'quota exhausted' },
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    await expect(listYouTubeSourceVideos({
      apiKey: 'test-key',
      channelId: 'channel_1',
    })).rejects.toMatchObject<Partial<YouTubeSourceVideosError>>({
      code: 'RATE_LIMITED',
    });
  });
});

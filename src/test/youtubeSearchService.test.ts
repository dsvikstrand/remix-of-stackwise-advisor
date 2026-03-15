import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractYouTubeVideoIdFromLookupInput,
  searchYouTubeVideos,
  YouTubeSearchError,
} from '../../server/services/youtubeSearch';

function createJsonResponse(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('youtubeSearch service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts direct YouTube video ids from ids and watch urls', () => {
    expect(extractYouTubeVideoIdFromLookupInput('abc123xyz89')).toBe('abc123xyz89');
    expect(extractYouTubeVideoIdFromLookupInput('https://www.youtube.com/watch?v=abc123xyz89')).toBe('abc123xyz89');
    expect(extractYouTubeVideoIdFromLookupInput('youtu.be/abc123xyz89')).toBe('abc123xyz89');
  });

  it('uses videos.list directly for video id lookup', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/youtube/v3/videos') {
        return createJsonResponse(200, {
          items: [{
            id: 'abc123xyz89',
            snippet: {
              title: 'Exact video',
              description: 'Direct lookup',
              channelId: 'channel_1',
              channelTitle: 'Channel One',
              publishedAt: '2026-03-15T11:00:00Z',
              thumbnails: {
                high: { url: 'https://img.example.com/exact.jpg' },
              },
            },
            contentDetails: {
              duration: 'PT4M5S',
            },
          }],
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    const page = await searchYouTubeVideos({
      apiKey: 'test-key',
      query: 'abc123xyz89',
    });

    expect(fetchSpy.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/youtube/v3/videos',
    ]);
    expect(page).toEqual({
      results: [{
        video_id: 'abc123xyz89',
        video_url: 'https://www.youtube.com/watch?v=abc123xyz89',
        title: 'Exact video',
        description: 'Direct lookup',
        channel_id: 'channel_1',
        channel_title: 'Channel One',
        channel_url: 'https://www.youtube.com/channel/channel_1',
        thumbnail_url: 'https://img.example.com/exact.jpg',
        published_at: '2026-03-15T11:00:00Z',
        duration_seconds: 245,
      }],
      nextPageToken: null,
    });
  });

  it('falls back to one search result plus duration enrichment for title lookup', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/youtube/v3/search') {
        return createJsonResponse(200, {
          items: [{
            id: { videoId: 'title_match_1' },
            snippet: {
              title: 'Found title',
              description: 'Best match',
              channelId: 'channel_2',
              channelTitle: 'Channel Two',
              publishedAt: '2026-03-15T12:00:00Z',
              thumbnails: {
                medium: { url: 'https://img.example.com/title.jpg' },
              },
            },
          }],
        });
      }
      if (url.pathname === '/youtube/v3/videos') {
        return createJsonResponse(200, {
          items: [{
            id: 'title_match_1',
            contentDetails: {
              duration: 'PT9M',
            },
          }],
        });
      }
      throw new Error(`Unexpected fetch: ${url.toString()}`);
    });

    const page = await searchYouTubeVideos({
      apiKey: 'test-key',
      query: 'Found title',
    });

    expect(fetchSpy.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/youtube/v3/search',
      '/youtube/v3/videos',
    ]);
    expect(page).toEqual({
      results: [{
        video_id: 'title_match_1',
        video_url: 'https://www.youtube.com/watch?v=title_match_1',
        title: 'Found title',
        description: 'Best match',
        channel_id: 'channel_2',
        channel_title: 'Channel Two',
        channel_url: 'https://www.youtube.com/channel/channel_2',
        thumbnail_url: 'https://img.example.com/title.jpg',
        published_at: '2026-03-15T12:00:00Z',
        duration_seconds: 540,
      }],
      nextPageToken: null,
    });
  });

  it('rejects playlist links as invalid lookup input', async () => {
    await expect(searchYouTubeVideos({
      apiKey: 'test-key',
      query: 'https://www.youtube.com/playlist?list=PL123',
    })).rejects.toMatchObject<Partial<YouTubeSearchError>>({
      code: 'INVALID_QUERY',
    });
  });
});

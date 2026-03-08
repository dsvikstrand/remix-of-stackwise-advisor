import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPublicYouTubeSubscriptions,
  resolvePublicYouTubeChannel,
} from '../../server/services/youtubeSubscriptions';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('youtube public subscription helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('resolves @handle input through channels.list forHandle', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/youtube/v3/channels');
      expect(url.searchParams.get('forHandle')).toBe('MadameGlome');
      expect(url.searchParams.get('part')).toBe('snippet');
      return jsonResponse({
        items: [{
          id: 'UC12345678901234567890AB',
          snippet: {
            title: 'Madame Glome',
          },
        }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await resolvePublicYouTubeChannel({
      channelInput: '@MadameGlome',
      apiKey: 'yt-key',
    });

    expect(resolved).toEqual({
      channelId: 'UC12345678901234567890AB',
      channelTitle: 'Madame Glome',
      channelUrl: 'https://www.youtube.com/channel/UC12345678901234567890AB',
    });
  });

  it('resolves bare handle input through channels.list forHandle', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/youtube/v3/channels');
      expect(url.searchParams.get('forHandle')).toBe('MadameGlome');
      expect(url.searchParams.get('part')).toBe('snippet');
      return jsonResponse({
        items: [{
          id: 'UC12345678901234567890AB',
          snippet: {
            title: 'Madame Glome',
          },
        }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await resolvePublicYouTubeChannel({
      channelInput: 'MadameGlome',
      apiKey: 'yt-key',
    });

    expect(resolved).toEqual({
      channelId: 'UC12345678901234567890AB',
      channelTitle: 'Madame Glome',
      channelUrl: 'https://www.youtube.com/channel/UC12345678901234567890AB',
    });
  });

  it('returns truncated previews when maxItems is reached with more pages available', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      items: [
        {
          snippet: {
            title: 'Creator One',
            resourceId: { channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa' },
            thumbnails: { high: { url: 'https://img.example.com/one.jpg' } },
          },
        },
        {
          snippet: {
            title: 'Creator Two',
            resourceId: { channelId: 'UCbbbbbbbbbbbbbbbbbbbbbb' },
            thumbnails: { default: { url: 'https://img.example.com/two.jpg' } },
          },
        },
      ],
      nextPageToken: 'next-page',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const preview = await fetchPublicYouTubeSubscriptions({
      apiKey: 'yt-key',
      channelId: 'UCsourcechannel1234567890',
      maxItems: 2,
    });

    expect(preview).toMatchObject({
      truncated: true,
      items: [
        {
          channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
          channelTitle: 'Creator One',
          channelUrl: 'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa',
          thumbnailUrl: 'https://img.example.com/one.jpg',
        },
        {
          channelId: 'UCbbbbbbbbbbbbbbbbbbbbbb',
          channelTitle: 'Creator Two',
          channelUrl: 'https://www.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbb',
          thumbnailUrl: 'https://img.example.com/two.jpg',
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps subscriptionForbidden to a private subscriptions error', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      error: {
        message: 'The subscriptions of the specified subscriber are private.',
        errors: [{ reason: 'subscriptionForbidden' }],
      },
    }, 403));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicYouTubeSubscriptions({
      apiKey: 'yt-key',
      channelId: 'UCsourcechannel1234567890',
      maxItems: 5,
    })).rejects.toMatchObject({
      code: 'PUBLIC_SUBSCRIPTIONS_PRIVATE',
    });
  });
});

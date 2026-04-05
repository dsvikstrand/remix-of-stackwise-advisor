import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { youtubeiCreateMock, resolvePublicYouTubeChannelMock, resolveYouTubeChannelMock } = vi.hoisted(() => ({
  youtubeiCreateMock: vi.fn(),
  resolvePublicYouTubeChannelMock: vi.fn(),
  resolveYouTubeChannelMock: vi.fn(),
}));

vi.mock('youtubei.js', () => ({
  default: {
    create: youtubeiCreateMock,
  },
}));

vi.mock('../../server/services/youtubeSubscriptions', () => ({
  resolvePublicYouTubeChannel: resolvePublicYouTubeChannelMock,
  resolveYouTubeChannel: resolveYouTubeChannelMock,
}));

import {
  resetYouTubeChannelLookupHelpersForTest,
  scoreYouTubeChannelMatch,
  searchYouTubeChannels,
  YouTubeChannelSearchError,
} from '../../server/services/youtubeChannelSearch';
import {
  resetTranscriptProxyDispatcher,
  setTranscriptProxyAgentFactoryForTests,
} from '../../server/services/webshareProxy';

const LOOKUP_PROXY_ENV_KEYS = [
  'YOUTUBE_LOOKUP_USE_WEBSHARE_PROXY',
  'TRANSCRIPT_USE_WEBSHARE_PROXY',
  'WEBSHARE_PROXY_URL',
  'WEBSHARE_PROXY_HOST',
  'WEBSHARE_PROXY_PORT',
  'WEBSHARE_PROXY_USERNAME',
  'WEBSHARE_PROXY_PASSWORD',
] as const;

const ORIGINAL_LOOKUP_PROXY_ENV = Object.fromEntries(
  LOOKUP_PROXY_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof LOOKUP_PROXY_ENV_KEYS)[number], string | undefined>;

describe('youtubeChannelSearch service', () => {
  beforeEach(() => {
    resetYouTubeChannelLookupHelpersForTest();
    youtubeiCreateMock.mockReset();
    resolvePublicYouTubeChannelMock.mockReset();
    resolveYouTubeChannelMock.mockReset();
    void resetTranscriptProxyDispatcher();
    for (const key of LOOKUP_PROXY_ENV_KEYS) {
      const value = ORIGINAL_LOOKUP_PROXY_ENV[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  afterEach(() => {
    void resetTranscriptProxyDispatcher();
    vi.clearAllMocks();
  });

  it('resolves direct channel inputs first and returns one creator', async () => {
    resolveYouTubeChannelMock.mockResolvedValue({
      channelId: 'UC12345678901234567890',
      channelUrl: 'https://www.youtube.com/channel/UC12345678901234567890',
      channelTitle: 'Doctor Mike',
    });
    youtubeiCreateMock.mockResolvedValue({
      getChannel: vi.fn(async () => ({
        header: {
          author: {
            name: 'Doctor Mike',
            thumbnails: [{ url: 'https://img.example.com/doctor-mike.jpg' }],
          },
          channel_handle: { toString: () => '@DoctorMike' },
          subscribers: { toString: () => '13.2M subscribers' },
        },
        metadata: {
          description: 'Health and medicine',
        },
      })),
    });

    const page = await searchYouTubeChannels({
      query: '@DoctorMike',
      limit: 3,
    });

    expect(resolveYouTubeChannelMock).toHaveBeenCalledWith('@DoctorMike');
    expect(page).toEqual({
      results: [{
        channel_id: 'UC12345678901234567890',
        channel_title: 'Doctor Mike',
        channel_url: 'https://www.youtube.com/@DoctorMike',
        description: 'Health and medicine',
        thumbnail_url: 'https://img.example.com/doctor-mike.jpg',
        published_at: null,
        subscriber_count: 13200000,
      }],
      nextPageToken: null,
    });
  });

  it('keeps direct creator lookup working when youtubei detail enrichment fails', async () => {
    resolveYouTubeChannelMock.mockResolvedValue({
      channelId: 'UC12345678901234567890',
      channelUrl: 'https://www.youtube.com/channel/UC12345678901234567890',
      channelTitle: 'Doctor Mike',
    });
    youtubeiCreateMock.mockResolvedValue({
      getChannel: vi.fn(async () => {
        throw new Error('channel unavailable');
      }),
    });

    const page = await searchYouTubeChannels({
      query: 'https://www.youtube.com/@DoctorMike',
    });

    expect(page).toEqual({
      results: [{
        channel_id: 'UC12345678901234567890',
        channel_title: 'Doctor Mike',
        channel_url: 'https://www.youtube.com/channel/UC12345678901234567890',
        description: '',
        thumbnail_url: null,
        published_at: null,
        subscriber_count: null,
      }],
      nextPageToken: null,
    });
  });

  it('uses official forHandle lookup first in explicit handle mode', async () => {
    resolvePublicYouTubeChannelMock.mockResolvedValue({
      channelId: 'UC12345678901234567890',
      channelUrl: 'https://www.youtube.com/channel/UC12345678901234567890',
      channelTitle: 'Dave Asprey',
    });
    youtubeiCreateMock.mockResolvedValue({
      getChannel: vi.fn(async () => ({
        header: {
          author: {
            name: 'Dave Asprey',
            thumbnails: [{ url: 'https://img.example.com/dave.jpg' }],
          },
          channel_handle: { toString: () => '@DaveAspreyBPR' },
          subscribers: { toString: () => '1.2M subscribers' },
        },
        metadata: {
          description: 'Biohacking and performance',
        },
      })),
    });

    const page = await searchYouTubeChannels({
      apiKey: 'yt-key',
      query: '@DaveAspreyBPR',
      mode: 'handle',
      limit: 3,
    });

    expect(resolvePublicYouTubeChannelMock).toHaveBeenCalledWith({
      channelInput: '@DaveAspreyBPR',
      apiKey: 'yt-key',
    });
    expect(resolveYouTubeChannelMock).not.toHaveBeenCalled();
    expect(page.results[0]).toMatchObject({
      channel_id: 'UC12345678901234567890',
      channel_url: 'https://www.youtube.com/@DaveAspreyBPR',
      channel_title: 'Dave Asprey',
    });
  });

  it('uses bounded search only in explicit creator-name mode', async () => {
    youtubeiCreateMock.mockResolvedValue({
      search: vi.fn(async () => ({
        results: [{
          type: 'Channel',
          id: 'UC12345678901234567890',
          author: {
            id: 'UC12345678901234567890',
            name: 'Dave Asprey',
            url: 'https://www.youtube.com/@DaveAspreyBPR',
          },
          description_snippet: { toString: () => 'Biohacking and performance' },
        }],
      })),
    });

    const page = await searchYouTubeChannels({
      query: 'Dave Asprey',
      mode: 'creator_name',
      limit: 3,
    });

    expect(resolvePublicYouTubeChannelMock).not.toHaveBeenCalled();
    expect(resolveYouTubeChannelMock).not.toHaveBeenCalled();
    expect(page.results).toHaveLength(1);
    expect(page.results[0]).toMatchObject({
      channel_id: 'UC12345678901234567890',
    });
  });

  it('supports bare handles without requiring the @ prefix', async () => {
    resolveYouTubeChannelMock.mockResolvedValue({
      channelId: 'UC12345678901234567890',
      channelUrl: 'https://www.youtube.com/channel/UC12345678901234567890',
      channelTitle: 'Doctor Mike',
    });
    youtubeiCreateMock.mockResolvedValue({
      getChannel: vi.fn(async () => ({
        header: {
          author: {
            name: 'Doctor Mike',
            thumbnails: [{ url: 'https://img.example.com/doctor-mike.jpg' }],
          },
          channel_handle: { toString: () => '@DoctorMike' },
          subscribers: { toString: () => '13.2M subscribers' },
        },
        metadata: {
          description: 'Health and medicine',
        },
      })),
      search: vi.fn(async () => ({
        results: [{
          type: 'Channel',
          id: 'UC12345678901234567890',
          author: {
            id: 'UC12345678901234567890',
            name: 'Doctor Mike',
            url: 'https://www.youtube.com/@DoctorMike',
          },
          description_snippet: { toString: () => 'Health and medicine' },
        }],
      })),
    });

    const page = await searchYouTubeChannels({
      query: 'DoctorMike',
      limit: 3,
    });

    expect(resolveYouTubeChannelMock).toHaveBeenCalledWith('@DoctorMike');
    expect(page.results).toHaveLength(1);
    expect(page.results[0]).toMatchObject({
      channel_id: 'UC12345678901234567890',
      channel_url: 'https://www.youtube.com/@DoctorMike',
    });
  });

  it('returns a tiny bounded creator candidate list for strong name matches', async () => {
    youtubeiCreateMock.mockResolvedValue({
      search: vi.fn(async () => ({
        results: [
          {
            type: 'Channel',
            id: 'UC11111111111111111111',
            author: {
              id: 'UC11111111111111111111',
              name: 'Doctor Mike',
              url: 'https://www.youtube.com/@DoctorMike',
              best_thumbnail: [{ url: 'https://img.example.com/1.jpg' }],
            },
            description_snippet: { toString: () => 'Health and medicine' },
            subscriber_count: { toString: () => '13.2M subscribers' },
          },
          {
            type: 'CompactChannel',
            channel_id: 'UC22222222222222222222',
            title: { toString: () => 'Doctor Mike Clips' },
            display_name: { toString: () => 'Doctor Mike Clips' },
            thumbnail: [{ url: 'https://img.example.com/2.jpg' }],
            subscriber_count: { toString: () => '120K subscribers' },
          },
          {
            type: 'Channel',
            id: 'UC33333333333333333333',
            author: {
              id: 'UC33333333333333333333',
              name: 'Doctor Mike Español',
              url: 'https://www.youtube.com/@DoctorMikeEspanol',
              best_thumbnail: [{ url: 'https://img.example.com/3.jpg' }],
            },
            description_snippet: { toString: () => 'Spanish clips' },
            subscriber_count: { toString: () => '80K subscribers' },
          },
          {
            type: 'Channel',
            id: 'UC44444444444444444444',
            author: {
              id: 'UC44444444444444444444',
              name: 'Completely Different Creator',
              url: 'https://www.youtube.com/@DifferentCreator',
            },
            description_snippet: { toString: () => 'Not relevant' },
          },
        ],
      })),
    });

    const page = await searchYouTubeChannels({
      query: 'Doctor Mike',
      limit: 3,
    });

    expect(page.nextPageToken).toBeNull();
    expect(page.results).toHaveLength(3);
    expect(page.results.map((row) => row.channel_title)).toEqual([
      'Doctor Mike',
      'Doctor Mike Clips',
      'Doctor Mike Español',
    ]);
  });

  it('returns no hit for weak creator-name matches instead of broad discovery', async () => {
    youtubeiCreateMock.mockResolvedValue({
      search: vi.fn(async () => ({
        results: [{
          type: 'Channel',
          id: 'UC55555555555555555555',
          author: {
            id: 'UC55555555555555555555',
            name: 'Skin Care Reviews',
            url: 'https://www.youtube.com/@SkinCareReviews',
          },
          description_snippet: { toString: () => 'Beauty channel' },
        }],
      })),
    });

    const page = await searchYouTubeChannels({
      query: 'Doctor Mike',
    });

    expect(page).toEqual({
      results: [],
      nextPageToken: null,
    });
  });

  it('creates the creator youtubei client with a proxy-aware fetch when lookup proxying is enabled', async () => {
    process.env.YOUTUBE_LOOKUP_USE_WEBSHARE_PROXY = 'true';
    process.env.WEBSHARE_PROXY_HOST = '127.0.0.1';
    process.env.WEBSHARE_PROXY_PORT = '8080';
    process.env.WEBSHARE_PROXY_USERNAME = 'user_name';
    process.env.WEBSHARE_PROXY_PASSWORD = 'pass_word';
    setTranscriptProxyAgentFactoryForTests(class {
      constructor(_options: unknown) {}
    });
    youtubeiCreateMock.mockResolvedValue({
      search: vi.fn(async () => ({
        results: [{
          type: 'Channel',
          id: 'UC12345678901234567890',
          author: {
            id: 'UC12345678901234567890',
            name: 'Doctor Mike',
            url: 'https://www.youtube.com/@DoctorMike',
          },
          description_snippet: { toString: () => 'Health and medicine' },
        }],
      })),
    });

    await searchYouTubeChannels({
      query: 'Doctor Mike',
      limit: 3,
    });

    expect(youtubeiCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      fetch: expect.any(Function),
    }));
  });

  it('falls back to the direct resolver when youtubei bootstrap hangs for direct lookups', async () => {
    vi.useFakeTimers();
    try {
      resolveYouTubeChannelMock.mockResolvedValue({
        channelId: 'UC12345678901234567890',
        channelUrl: 'https://www.youtube.com/channel/UC12345678901234567890',
        channelTitle: 'Doctor Mike',
      });
      youtubeiCreateMock.mockImplementation(() => new Promise(() => {}));

      const pending = searchYouTubeChannels({
        query: '@DoctorMike',
        limit: 3,
      });

      await vi.advanceTimersByTimeAsync(5_000);
      const page = await pending;

      expect(page).toEqual({
        results: [{
          channel_id: 'UC12345678901234567890',
          channel_title: 'Doctor Mike',
          channel_url: 'https://www.youtube.com/channel/UC12345678901234567890',
          description: '',
          thumbnail_url: null,
          published_at: null,
          subscriber_count: null,
        }],
        nextPageToken: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses one strong bare-name candidate when exact @handle lookup misses', async () => {
    resolveYouTubeChannelMock.mockRejectedValue(new Error('INVALID_CHANNEL'));
    youtubeiCreateMock.mockResolvedValue({
      search: vi.fn(async () => ({
        results: [{
          type: 'Channel',
          id: 'UC77777777777777777777',
          author: {
            id: 'UC77777777777777777777',
            name: 'BorderlinerNotes',
            url: 'https://www.youtube.com/@BorderlinerNotesOfficial',
          },
          description_snippet: { toString: () => 'Mental health notes' },
        }],
      })),
    });

    const page = await searchYouTubeChannels({
      query: '@BorderlinerNotes',
      limit: 3,
    });

    expect(resolveYouTubeChannelMock).toHaveBeenCalledWith('@BorderlinerNotes');
    expect(page).toEqual({
      results: [{
        channel_id: 'UC77777777777777777777',
        channel_title: 'BorderlinerNotes',
        channel_url: 'https://www.youtube.com/@BorderlinerNotesOfficial',
        description: 'Mental health notes',
        thumbnail_url: null,
        published_at: null,
        subscriber_count: null,
      }],
      nextPageToken: null,
    });
  });

  it('keeps exact @handle misses as not-found when bare-name fallback is weak or ambiguous', async () => {
    resolveYouTubeChannelMock.mockRejectedValue(new Error('INVALID_CHANNEL'));
    youtubeiCreateMock.mockResolvedValue({
      search: vi.fn(async () => ({
        results: [
          {
            type: 'Channel',
            id: 'UC88888888888888888888',
            author: {
              id: 'UC88888888888888888888',
              name: 'Borderline Clips',
              url: 'https://www.youtube.com/@BorderlineClips',
            },
            description_snippet: { toString: () => 'Different creator' },
          },
          {
            type: 'Channel',
            id: 'UC99999999999999999999',
            author: {
              id: 'UC99999999999999999999',
              name: 'Borderline Notes Archive',
              url: 'https://www.youtube.com/@BorderlineNotesArchive',
            },
            description_snippet: { toString: () => 'Archive channel' },
          },
        ],
      })),
    });

    const page = await searchYouTubeChannels({
      query: '@BorderlinerNotes',
      limit: 3,
    });

    expect(page).toEqual({
      results: [],
      nextPageToken: null,
    });
  });

  it('fails fast with SEARCH_DISABLED when direct resolver bootstrap hangs', async () => {
    vi.useFakeTimers();
    try {
      resolveYouTubeChannelMock.mockImplementation(() => new Promise(() => {}));

      const pending = searchYouTubeChannels({
        query: '@DoctorMike',
      });
      const settled = pending.then(
        () => ({ ok: true as const, error: null }),
        (error) => ({ ok: false as const, error }),
      );

      await vi.advanceTimersByTimeAsync(5_000);
      const outcome = await settled;

      expect(outcome.ok).toBe(false);
      expect(outcome.error).toMatchObject<Partial<YouTubeChannelSearchError>>({
        code: 'SEARCH_DISABLED',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns a tiny candidate list instead of a wrong auto-hit when bare handle and name paths disagree', async () => {
    resolveYouTubeChannelMock.mockResolvedValue({
      channelId: 'UC12345678901234567890',
      channelUrl: 'https://www.youtube.com/channel/UC12345678901234567890',
      channelTitle: 'DoctorMike',
    });
    youtubeiCreateMock.mockResolvedValue({
      getChannel: vi.fn(async () => ({
        header: {
          author: {
            name: 'DoctorMike',
          },
          channel_handle: { toString: () => '@DoctorMike' },
        },
        metadata: {
          description: '',
        },
      })),
      search: vi.fn(async () => ({
        results: [{
          type: 'Channel',
          id: 'UC22222222222222222222',
          author: {
            id: 'UC22222222222222222222',
            name: 'Doctor Mike',
            url: 'https://www.youtube.com/@DoctorMikeOfficial',
          },
          description_snippet: { toString: () => 'Official channel' },
        }],
      })),
    });

    const page = await searchYouTubeChannels({
      query: 'DoctorMike',
      limit: 3,
    });

    expect(page.results).toHaveLength(2);
    expect(page.results.map((row) => row.channel_id)).toEqual([
      'UC12345678901234567890',
      'UC22222222222222222222',
    ]);
  });

  it('surfaces SEARCH_DISABLED when helper lookup is unavailable for name queries', async () => {
    youtubeiCreateMock.mockRejectedValue(new Error('unavailable'));

    await expect(searchYouTubeChannels({
      query: 'Doctor Mike',
    })).rejects.toMatchObject<Partial<YouTubeChannelSearchError>>({
      code: 'SEARCH_DISABLED',
    });
  });

  it('fails fast with SEARCH_DISABLED when youtubei bootstrap hangs for name queries', async () => {
    vi.useFakeTimers();
    try {
      youtubeiCreateMock.mockImplementation(() => new Promise(() => {}));

      const pending = searchYouTubeChannels({
        query: 'Doctor Mike',
      });
      const settled = pending.then(
        () => ({ ok: true as const, error: null }),
        (error) => ({ ok: false as const, error }),
      );

      await vi.advanceTimersByTimeAsync(5_000);
      const outcome = await settled;

      expect(outcome.ok).toBe(false);
      expect(outcome.error).toMatchObject<Partial<YouTubeChannelSearchError>>({
        code: 'SEARCH_DISABLED',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('scores exact creator matches above weak ones', () => {
    const strong = scoreYouTubeChannelMatch('Doctor Mike', {
      channel_title: 'Doctor Mike',
      channel_url: 'https://www.youtube.com/@DoctorMike',
      description: 'Health and medicine',
    });
    const weak = scoreYouTubeChannelMatch('Doctor Mike', {
      channel_title: 'Skin Care Reviews',
      channel_url: 'https://www.youtube.com/@SkinCareReviews',
      description: 'Beauty channel',
    });

    expect(strong).toBeGreaterThan(0.9);
    expect(weak).toBeLessThan(0.62);
  });
});

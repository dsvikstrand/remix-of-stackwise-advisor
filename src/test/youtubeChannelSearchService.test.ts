import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { youtubeiCreateMock, resolveYouTubeChannelMock } = vi.hoisted(() => ({
  youtubeiCreateMock: vi.fn(),
  resolveYouTubeChannelMock: vi.fn(),
}));

vi.mock('youtubei.js', () => ({
  default: {
    create: youtubeiCreateMock,
  },
}));

vi.mock('../../server/services/youtubeSubscriptions', () => ({
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

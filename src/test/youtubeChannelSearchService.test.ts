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

describe('youtubeChannelSearch service', () => {
  beforeEach(() => {
    resetYouTubeChannelLookupHelpersForTest();
    youtubeiCreateMock.mockReset();
    resolveYouTubeChannelMock.mockReset();
  });

  afterEach(() => {
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

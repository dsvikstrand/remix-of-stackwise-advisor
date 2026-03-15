import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execFileMock, youtubeiCreateMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  youtubeiCreateMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  default: {
    execFile: execFileMock,
  },
  execFile: execFileMock,
}));

vi.mock('youtubei.js', () => ({
  default: {
    create: youtubeiCreateMock,
  },
}));

import {
  extractYouTubeVideoIdFromLookupInput,
  isStrongYouTubeTitleMatch,
  resetYouTubeLookupHelpersForTest,
  scoreYouTubeTitleMatch,
  searchYouTubeVideos,
  YouTubeSearchError,
} from '../../server/services/youtubeSearch';

function mockExecFileSuccess(payload: unknown) {
  execFileMock.mockImplementation((_file, _args, _options, callback) => {
    callback(null, JSON.stringify(payload), '');
  });
}

function mockExecFileFailure(error: Record<string, unknown>) {
  execFileMock.mockImplementation((_file, _args, _options, callback) => {
    callback(error, '', '');
  });
}

describe('youtubeSearch service', () => {
  beforeEach(() => {
    resetYouTubeLookupHelpersForTest();
    youtubeiCreateMock.mockReset();
    execFileMock.mockReset();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('extracts direct YouTube video ids from ids and watch urls', () => {
    expect(extractYouTubeVideoIdFromLookupInput('abc123xyz89')).toBe('abc123xyz89');
    expect(extractYouTubeVideoIdFromLookupInput('https://www.youtube.com/watch?v=abc123xyz89')).toBe('abc123xyz89');
    expect(extractYouTubeVideoIdFromLookupInput('youtu.be/abc123xyz89')).toBe('abc123xyz89');
  });

  it('uses yt-dlp direct lookup first for video ids', async () => {
    youtubeiCreateMock.mockResolvedValue({
      getBasicInfo: vi.fn(async () => {
        throw new Error('youtubei should not be needed');
      }),
    });
    mockExecFileSuccess({
      id: 'abc123xyz89',
      title: 'Exact video',
      description: 'Direct helper lookup',
      channel_id: 'channel_1',
      channel: 'Channel One',
      channel_url: 'https://www.youtube.com/channel/channel_1',
      thumbnail: 'https://img.example.com/exact.jpg',
      duration: 245,
      webpage_url: 'https://www.youtube.com/watch?v=abc123xyz89',
    });

    const page = await searchYouTubeVideos({
      query: 'abc123xyz89',
    });

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(page).toEqual({
      results: [{
        video_id: 'abc123xyz89',
        video_url: 'https://www.youtube.com/watch?v=abc123xyz89',
        title: 'Exact video',
        description: 'Direct helper lookup',
        channel_id: 'channel_1',
        channel_title: 'Channel One',
        channel_url: 'https://www.youtube.com/channel/channel_1',
        thumbnail_url: 'https://img.example.com/exact.jpg',
        published_at: null,
        duration_seconds: 245,
      }],
      nextPageToken: null,
    });
  });

  it('falls back to watch-page metadata when yt-dlp direct lookup times out', async () => {
    mockExecFileFailure({
      killed: true,
      signal: 'SIGTERM',
    });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `
        <meta property="og:title" content="Watch Page Video">
        <meta property="og:description" content="Watch page description">
        <meta property="og:image" content="https://img.example.com/watch.jpg">
        <meta itemprop="datePublished" content="2026-03-15">
        <meta itemprop="duration" content="PT9M">
        <link itemprop="name" content="Channel Watch">
        "channelId":"channel_watch"
        "ownerProfileUrl":"\\/channel\\/channel_watch"
      `,
    } as Response);
    youtubeiCreateMock.mockResolvedValue({
      getBasicInfo: vi.fn(async () => {
        throw new Error('youtubei should not be needed');
      }),
    });

    const page = await searchYouTubeVideos({
      query: 'abc123xyz89',
    });

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(page.results[0]).toMatchObject({
      video_id: 'abc123xyz89',
      title: 'Watch Page Video',
      channel_id: 'channel_watch',
      channel_title: 'Channel Watch',
      duration_seconds: 540,
      published_at: '2026-03-15T00:00:00.000Z',
    });
  });

  it('falls back to youtubei direct lookup for video ids when direct metadata helpers fail', async () => {
    mockExecFileFailure({ code: 1 });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
    } as Response);
    youtubeiCreateMock.mockResolvedValue({
      getBasicInfo: vi.fn(async () => ({
        basic_info: {
          id: 'abc123xyz89',
          title: 'Fallback video',
          short_description: 'Resolved by youtubei',
          duration: 540,
          channel: {
            id: 'channel_2',
            name: 'Channel Two',
            url: 'https://www.youtube.com/channel/channel_2',
          },
          thumbnail: [{ url: 'https://img.example.com/fallback.jpg' }],
          url_canonical: 'https://www.youtube.com/watch?v=abc123xyz89',
        },
      })),
    });

    const page = await searchYouTubeVideos({
      query: 'abc123xyz89',
    });

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(page.results[0]).toMatchObject({
      video_id: 'abc123xyz89',
      title: 'Fallback video',
      channel_id: 'channel_2',
      duration_seconds: 540,
    });
  });

  it('accepts a strong youtubei title match', async () => {
    youtubeiCreateMock.mockResolvedValue({
      search: vi.fn(async () => ({
        results: [{
          type: 'Video',
          video_id: 'title_match_1',
          title: { toString: () => 'Found Title' },
          description: 'Strong helper match',
          author: {
            id: 'channel_3',
            name: 'Channel Three',
            url: 'https://www.youtube.com/channel/channel_3',
          },
          best_thumbnail: {
            url: 'https://img.example.com/title.jpg',
          },
          duration: {
            seconds: 540,
          },
        }],
      })),
    });

    const page = await searchYouTubeVideos({
      query: 'Found Title',
    });

    expect(execFileMock).not.toHaveBeenCalled();
    expect(page.results[0]).toMatchObject({
      video_id: 'title_match_1',
      title: 'Found Title',
      channel_id: 'channel_3',
      duration_seconds: 540,
    });
  });

  it('falls back to yt-dlp when youtubei search returns no candidate', async () => {
    youtubeiCreateMock.mockResolvedValue({
      search: vi.fn(async () => ({
        results: [],
      })),
    });
    mockExecFileSuccess({
      entries: [{
        id: 'title_match_2',
        title: 'Creatine After 50',
        description: 'Fallback title match',
        channel_id: 'channel_4',
        channel: 'Channel Four',
        channel_url: 'https://www.youtube.com/channel/channel_4',
        thumbnail: 'https://img.example.com/title-fallback.jpg',
        duration: 301,
        webpage_url: 'https://www.youtube.com/watch?v=title_match_2',
      }],
    });

    const page = await searchYouTubeVideos({
      query: 'Creatine After 50',
    });

    expect(execFileMock).toHaveBeenCalledTimes(1);
    expect(page.results[0]).toMatchObject({
      video_id: 'title_match_2',
      title: 'Creatine After 50',
      channel_id: 'channel_4',
    });
  });

  it('returns no hit for weak title matches instead of auto-accepting them', async () => {
    youtubeiCreateMock.mockResolvedValue({
      search: vi.fn(async () => ({
        results: [{
          type: 'Video',
          video_id: 'weak_match_1',
          title: { toString: () => 'Creatine for College Athletes' },
          description: '',
          author: {
            id: 'channel_5',
            name: 'Channel Five',
            url: 'https://www.youtube.com/channel/channel_5',
          },
          duration: { seconds: 120 },
        }],
      })),
    });

    const page = await searchYouTubeVideos({
      query: 'Creatine After 50',
    });

    expect(page).toEqual({
      results: [],
      nextPageToken: null,
    });
  });

  it('rejects playlist links as invalid lookup input', async () => {
    await expect(searchYouTubeVideos({
      query: 'https://www.youtube.com/playlist?list=PL123',
    })).rejects.toMatchObject<Partial<YouTubeSearchError>>({
      code: 'INVALID_QUERY',
    });
  });

  it('scores strong title matches conservatively', () => {
    expect(scoreYouTubeTitleMatch('Found Title', 'Found Title')).toBe(1);
    expect(isStrongYouTubeTitleMatch('Found Title', 'Found Title')).toBe(true);
    expect(isStrongYouTubeTitleMatch('Creatine After 50', 'Creatine for College Athletes')).toBe(false);
  });
});

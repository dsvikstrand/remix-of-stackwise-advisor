import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchYouTubeDurationMap,
  parseYouTubeIsoDurationToSeconds,
  YouTubeDurationLookupError,
} from '../../server/services/youtubeDuration';

describe('youtubeDuration service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses YouTube ISO durations to seconds', () => {
    expect(parseYouTubeIsoDurationToSeconds('PT1H2M3S')).toBe(3723);
    expect(parseYouTubeIsoDurationToSeconds('PT45M')).toBe(2700);
    expect(parseYouTubeIsoDurationToSeconds('PT59S')).toBe(59);
    expect(parseYouTubeIsoDurationToSeconds('')).toBeNull();
  });

  it('fetches duration map for provided ids', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { id: 'vid_1', contentDetails: { duration: 'PT4M10S' } },
          { id: 'vid_2', contentDetails: { duration: 'PT1H' } },
        ],
      }),
    } as Response);

    const map = await fetchYouTubeDurationMap({
      apiKey: 'test-key',
      videoIds: ['vid_1', 'vid_2'],
      timeoutMs: 3000,
      userAgent: 'test-agent',
    });

    expect(map.get('vid_1')).toBe(250);
    expect(map.get('vid_2')).toBe(3600);
  });

  it('maps 429 to RATE_LIMITED', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as Response);

    await expect(fetchYouTubeDurationMap({
      apiKey: 'test-key',
      videoIds: ['vid_1'],
    })).rejects.toBeInstanceOf(YouTubeDurationLookupError);
  });
});

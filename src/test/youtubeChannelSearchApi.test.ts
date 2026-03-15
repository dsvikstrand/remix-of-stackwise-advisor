import {
  clampChannelSearchLimit,
  normalizeYouTubeChannelSearchResult,
  validateChannelSearchQuery,
} from '@/lib/youtubeChannelSearchApi';

describe('youtubeChannelSearchApi utils', () => {
  it('clamps limit in 1..3 range with default 3', () => {
    expect(clampChannelSearchLimit()).toBe(3);
    expect(clampChannelSearchLimit(0)).toBe(1);
    expect(clampChannelSearchLimit(1)).toBe(1);
    expect(clampChannelSearchLimit(2)).toBe(2);
    expect(clampChannelSearchLimit(99)).toBe(3);
  });

  it('validates creator lookup query shape', () => {
    const invalid = validateChannelSearchQuery(' ');
    expect(invalid.ok).toBe(false);

    const direct = validateChannelSearchQuery('  @DoctorMike ');
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expect(direct.query).toBe('@DoctorMike');
    }

    const valid = validateChannelSearchQuery('  Doctor Mike ');
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.query).toBe('Doctor Mike');
    }
  });

  it('normalizes channel results with fallback url', () => {
    const normalized = normalizeYouTubeChannelSearchResult({
      channel_id: 'UC12345678901234567890',
      channel_title: 'Skincare Lab',
      description: 'Tips and routines',
      thumbnail_url: null,
      published_at: '2026-02-17T10:00:00Z',
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.channel_url).toBe('https://www.youtube.com/channel/UC12345678901234567890');
  });
});

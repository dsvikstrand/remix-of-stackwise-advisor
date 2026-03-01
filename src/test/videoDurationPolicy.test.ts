import { describe, expect, it } from 'vitest';
import {
  classifyVideoDuration,
  readVideoDurationPolicyFromEnv,
  splitByDurationPolicy,
} from '../../server/services/videoDurationPolicy';

describe('videoDurationPolicy', () => {
  it('classifies durations with max cap and unknown handling', () => {
    expect(classifyVideoDuration({
      durationSeconds: 1200,
      maxSeconds: 2700,
      blockUnknown: true,
    })).toBe('allow');

    expect(classifyVideoDuration({
      durationSeconds: 3601,
      maxSeconds: 2700,
      blockUnknown: true,
    })).toBe('too_long');

    expect(classifyVideoDuration({
      durationSeconds: null,
      maxSeconds: 2700,
      blockUnknown: true,
    })).toBe('unknown');

    expect(classifyVideoDuration({
      durationSeconds: null,
      maxSeconds: 2700,
      blockUnknown: false,
    })).toBe('allow');
  });

  it('splits mixed items into allowed and blocked groups', () => {
    const split = splitByDurationPolicy({
      items: [
        { video_id: 'a', title: 'A', duration_seconds: 1200 },
        { video_id: 'b', title: 'B', duration_seconds: 3200 },
        { video_id: 'c', title: 'C', duration_seconds: null },
      ],
      config: {
        enabled: true,
        maxSeconds: 2700,
        blockUnknown: true,
      },
      getVideoId: (row) => row.video_id,
      getTitle: (row) => row.title,
      getDurationSeconds: (row) => row.duration_seconds,
    });

    expect(split.allowed.map((row) => row.video_id)).toEqual(['a']);
    expect(split.blocked.map((row) => row.video_id)).toEqual(['b', 'c']);
    expect(split.blocked[0]?.error_code).toBe('VIDEO_TOO_LONG');
    expect(split.blocked[1]?.error_code).toBe('VIDEO_DURATION_UNAVAILABLE');
  });

  it('reads env defaults and explicit values', () => {
    const defaults = readVideoDurationPolicyFromEnv({});
    expect(defaults.enabled).toBe(false);
    expect(defaults.maxSeconds).toBe(2700);
    expect(defaults.blockUnknown).toBe(true);
    expect(defaults.lookupTimeoutMs).toBe(8000);

    const explicit = readVideoDurationPolicyFromEnv({
      GENERATION_DURATION_CAP_ENABLED: 'true',
      GENERATION_MAX_VIDEO_SECONDS: '1800',
      GENERATION_BLOCK_UNKNOWN_DURATION: 'false',
      GENERATION_DURATION_LOOKUP_TIMEOUT_MS: '12000',
    });
    expect(explicit.enabled).toBe(true);
    expect(explicit.maxSeconds).toBe(1800);
    expect(explicit.blockUnknown).toBe(false);
    expect(explicit.lookupTimeoutMs).toBe(12000);
  });
});

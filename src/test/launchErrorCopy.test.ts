import { describe, expect, it } from 'vitest';
import { getLaunchErrorCopy } from '../lib/launchErrorCopy';

describe('launchErrorCopy', () => {
  it('maps required critical error codes to stable user-facing copy', () => {
    expect(getLaunchErrorCopy({
      errorCode: 'INSUFFICIENT_CREDITS',
      fallback: 'fallback',
    })).toBe('Insufficient credits right now. Please wait for the next daily reset and try again.');

    expect(getLaunchErrorCopy({
      errorCode: 'DAILY_GENERATION_CAP_REACHED',
      fallback: 'fallback',
    })).toBe('No daily credits remain right now. Please try again after reset.');

    expect(getLaunchErrorCopy({
      errorCode: 'SOURCE_PAGE_SUBSCRIPTION_REQUIRED',
      fallback: 'fallback',
    })).toBe('Subscribe to this source before using its Video Library.');

    expect(getLaunchErrorCopy({
      errorCode: 'VIDEO_BLUEPRINT_UNAVAILABLE',
      fallback: 'fallback',
    })).toBe('This video isn’t currently available for blueprint generation.');

    expect(getLaunchErrorCopy({
      errorCode: 'TRANSCRIPT_UNAVAILABLE',
      fallback: 'fallback',
    })).toBe('Transcript unavailable right now. Please try again in a few minutes.');

    expect(getLaunchErrorCopy({
      errorCode: 'RATE_LIMITED',
      fallback: 'fallback',
    })).toBe('Too many requests right now. Please retry shortly.');

    expect(getLaunchErrorCopy({
      errorCode: 'QUEUE_BACKPRESSURE',
      fallback: 'fallback',
    })).toBe('Generation queue is busy. Please retry shortly.');

    expect(getLaunchErrorCopy({
      errorCode: 'QUEUE_INTAKE_DISABLED',
      fallback: 'fallback',
    })).toBe('Generation is temporarily paused. Please try again shortly.');
  });

  it('returns fallback for unknown error codes', () => {
    expect(getLaunchErrorCopy({
      errorCode: 'UNKNOWN_CODE',
      fallback: 'Could not process request.',
    })).toBe('Could not process request.');
  });
});

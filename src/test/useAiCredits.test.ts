import { describe, expect, it } from 'vitest';
import { getAiCreditsRefetchIntervalMs } from '../hooks/useAiCredits';

describe('useAiCredits helpers', () => {
  it('disables polling by default', () => {
    expect(getAiCreditsRefetchIntervalMs()).toBe(false);
    expect(getAiCreditsRefetchIntervalMs(false)).toBe(false);
  });

  it('normalizes positive refetch intervals', () => {
    expect(getAiCreditsRefetchIntervalMs(300000)).toBe(300000);
    expect(getAiCreditsRefetchIntervalMs(0)).toBe(false);
  });
});

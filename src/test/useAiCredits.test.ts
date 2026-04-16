import { describe, expect, it, vi } from 'vitest';
import { getAiCreditsBackendUrl, getAiCreditsRefetchIntervalMs } from '../hooks/useAiCredits';
import { config } from '../config/runtime';

describe('useAiCredits helpers', () => {
  it('disables polling by default', () => {
    expect(getAiCreditsRefetchIntervalMs()).toBe(false);
    expect(getAiCreditsRefetchIntervalMs(false)).toBe(false);
  });

  it('normalizes positive refetch intervals', () => {
    expect(getAiCreditsRefetchIntervalMs(300000)).toBe(300000);
    expect(getAiCreditsRefetchIntervalMs(0)).toBe(false);
  });

  it('normalizes the backend url for credits requests', () => {
    const originalUrl = config.agenticBackendUrl;
    vi.stubEnv('VITE_AGENTIC_BACKEND_URL', 'https://api.bleup.app/');
    config.agenticBackendUrl = 'https://api.bleup.app/';

    expect(getAiCreditsBackendUrl()).toBe('https://api.bleup.app');

    config.agenticBackendUrl = originalUrl;
    vi.unstubAllEnvs();
  });

  it('fails explicitly when the credits backend url is unavailable', () => {
    const originalUrl = config.agenticBackendUrl;
    vi.stubEnv('VITE_AGENTIC_BACKEND_URL', '');
    config.agenticBackendUrl = '';

    expect(() => getAiCreditsBackendUrl()).toThrow('CREDITS_UNAVAILABLE');

    config.agenticBackendUrl = originalUrl;
    vi.unstubAllEnvs();
  });
});

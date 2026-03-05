import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { restoreSpaRedirect } from '@/lib/restoreSpaRedirect';

const BASE_PATH = '/remix-of-stackwise-advisor/';

describe('restoreSpaRedirect', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/remix-of-stackwise-advisor/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores a valid base-path redirect and clears storage key', () => {
    sessionStorage.setItem('redirect', '/remix-of-stackwise-advisor/terms?from=404#top');

    const result = restoreSpaRedirect(BASE_PATH);

    expect(result).toEqual({ restored: true, reason: 'restored' });
    expect(window.location.pathname).toBe('/remix-of-stackwise-advisor/terms');
    expect(window.location.search).toBe('?from=404');
    expect(window.location.hash).toBe('#top');
    expect(sessionStorage.getItem('redirect')).toBeNull();
  });

  it('ignores external-style redirect and clears storage key', () => {
    sessionStorage.setItem('redirect', '//evil.example/phish');

    const result = restoreSpaRedirect(BASE_PATH);

    expect(result).toEqual({ restored: false, reason: 'invalid_value' });
    expect(window.location.pathname).toBe('/remix-of-stackwise-advisor/');
    expect(sessionStorage.getItem('redirect')).toBeNull();
  });

  it('ignores redirect outside base path and clears storage key', () => {
    sessionStorage.setItem('redirect', '/other-app/privacy');

    const result = restoreSpaRedirect(BASE_PATH);

    expect(result).toEqual({ restored: false, reason: 'outside_base_path' });
    expect(window.location.pathname).toBe('/remix-of-stackwise-advisor/');
    expect(sessionStorage.getItem('redirect')).toBeNull();
  });

  it('returns missing when no redirect key exists', () => {
    const result = restoreSpaRedirect(BASE_PATH);
    expect(result).toEqual({ restored: false, reason: 'missing' });
  });

  it('returns storage_unavailable when session storage read throws', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    const result = restoreSpaRedirect(BASE_PATH);

    expect(result).toEqual({ restored: false, reason: 'storage_unavailable' });
    expect(getItemSpy).toHaveBeenCalledWith('redirect');
  });
});

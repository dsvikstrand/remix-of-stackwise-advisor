import { describe, expect, it } from 'vitest';
import { getWalletDefaults } from '../../server/services/creditWallet';

describe('credit wallet defaults', () => {
  it('returns sane positive defaults', () => {
    const defaults = getWalletDefaults();
    expect(defaults.capacity).toBeGreaterThan(0);
    expect(defaults.daily_grant_free).toBeGreaterThan(0);
    expect(defaults.daily_grant_plus).toBeGreaterThan(defaults.daily_grant_free);
    expect(defaults.refill_rate_per_sec).toBeGreaterThanOrEqual(0);
    expect(defaults.initial_balance).toBeGreaterThanOrEqual(0);
    expect(defaults.initial_balance).toBeLessThanOrEqual(defaults.capacity);
  });
});

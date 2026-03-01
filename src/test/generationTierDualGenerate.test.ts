import { describe, expect, it } from 'vitest';
import {
  createGenerationTierDualGenerateResolver,
  readGenerationTierDualGenerateConfigFromEnv,
} from '../../server/services/generationTierAccess';

describe('generation tier dual-generate config', () => {
  it('parses enabled allowlist config from env', () => {
    const config = readGenerationTierDualGenerateConfigFromEnv({
      GENERATION_TIER_DUAL_GENERATE_ENABLED: 'true',
      GENERATION_TIER_DUAL_GENERATE_USER_IDS: ' user_a ,USER_B ',
      GENERATION_TIER_DUAL_GENERATE_SCOPE: 'queue_only',
      GENERATION_TIER_DUAL_GENERATE_CREDIT_MODE: 'none',
    } as unknown as NodeJS.ProcessEnv);

    expect(config.enabled).toBe(true);
    expect(config.scope).toBe('queue_only');
    expect(config.creditMode).toBe('none');
    expect(config.userIds.has('user_a')).toBe(true);
    expect(config.userIds.has('user_b')).toBe(true);
  });

  it('falls back to disabled-safe defaults for malformed env', () => {
    const config = readGenerationTierDualGenerateConfigFromEnv({
      GENERATION_TIER_DUAL_GENERATE_ENABLED: 'not-a-bool',
      GENERATION_TIER_DUAL_GENERATE_USER_IDS: '',
      GENERATION_TIER_DUAL_GENERATE_SCOPE: 'invalid_scope',
      GENERATION_TIER_DUAL_GENERATE_CREDIT_MODE: 'invalid_mode',
    } as unknown as NodeJS.ProcessEnv);

    expect(config.enabled).toBe(false);
    expect(config.scope).toBe('queue_only');
    expect(config.creditMode).toBe('none');
    expect(config.userIds.size).toBe(0);
  });
});

describe('generation tier dual-generate resolver', () => {
  const resolver = createGenerationTierDualGenerateResolver({
    enabled: true,
    userIds: new Set(['allowed_user']),
    scope: 'queue_only',
    creditMode: 'none',
  });

  it('allows only allowlisted users for queue scope', () => {
    expect(resolver({ userId: 'allowed_user', scope: 'queue' })).toBe(true);
    expect(resolver({ userId: 'denied_user', scope: 'queue' })).toBe(false);
  });

  it('blocks direct scope when queue_only is configured', () => {
    expect(resolver({ userId: 'allowed_user', scope: 'direct' })).toBe(false);
  });
});

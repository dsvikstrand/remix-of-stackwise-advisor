import { afterEach, describe, expect, it, vi } from 'vitest';

describe('credits service', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws CREDITS_UNAVAILABLE when service client config is missing', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const { getCredits, CreditsUnavailableError } = await import('../../server/credits');

    await expect(
      getCredits('00000000-0000-0000-0000-000000000001'),
    ).rejects.toBeInstanceOf(CreditsUnavailableError);
  }, 15_000);

  it('returns deterministic service denial when consuming credit without backend', async () => {
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const { consumeCredit } = await import('../../server/credits');

    const result = await consumeCredit('00000000-0000-0000-0000-000000000001');
    expect(result).toMatchObject({
      ok: false,
      reason: 'service',
      errorCode: 'CREDITS_UNAVAILABLE',
    });
  });
});

export type GenerationTier = 'free' | 'tier';

export type GenerationTierAccess = {
  allowedTiers: GenerationTier[];
  defaultTier: GenerationTier;
  testModeEnabled: boolean;
};

export type GenerationTierConfig = {
  testModeEnabled: boolean;
  tierUserIds: Set<string>;
  freeUserIds: Set<string>;
};

function parseBoolean(raw: unknown, fallback: boolean) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeUserId(raw: unknown) {
  return String(raw || '').trim().toLowerCase();
}

function parseUserIdCsv(raw: unknown) {
  const values = String(raw || '')
    .split(',')
    .map((value) => normalizeUserId(value))
    .filter(Boolean);
  return new Set(values);
}

export function readGenerationTierConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GenerationTierConfig {
  return {
    testModeEnabled: parseBoolean(env.GENERATION_TIER_TEST_MODE_ENABLED, false),
    tierUserIds: parseUserIdCsv(env.GENERATION_TIER_TIER_USER_IDS),
    freeUserIds: parseUserIdCsv(env.GENERATION_TIER_FREE_USER_IDS),
  };
}

export function createGenerationTierAccessResolver(config: GenerationTierConfig) {
  return function resolveGenerationTierAccess(userId?: string | null): GenerationTierAccess {
    const normalizedUserId = normalizeUserId(userId || '');

    if (!config.testModeEnabled) {
      return {
        allowedTiers: ['free'],
        defaultTier: 'free',
        testModeEnabled: false,
      };
    }

    if (normalizedUserId && config.tierUserIds.has(normalizedUserId)) {
      return {
        allowedTiers: ['free', 'tier'],
        defaultTier: 'tier',
        testModeEnabled: true,
      };
    }

    if (config.freeUserIds.size > 0 && normalizedUserId && !config.freeUserIds.has(normalizedUserId)) {
      return {
        allowedTiers: ['free'],
        defaultTier: 'free',
        testModeEnabled: true,
      };
    }

    return {
      allowedTiers: ['free'],
      defaultTier: 'free',
      testModeEnabled: true,
    };
  };
}

export function normalizeRequestedGenerationTier(raw: unknown): GenerationTier | null {
  const normalized = String(raw || '').trim().toLowerCase();
  if (normalized === 'tier') return 'tier';
  if (normalized === 'free') return 'free';
  return null;
}

export function resolveRequestedGenerationTier(input: {
  requestedTier?: GenerationTier | null;
  access: GenerationTierAccess;
}): GenerationTier | null {
  const requestedTier = input.requestedTier || null;
  if (!requestedTier) return input.access.defaultTier;
  return input.access.allowedTiers.includes(requestedTier) ? requestedTier : null;
}

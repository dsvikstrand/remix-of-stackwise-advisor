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

export type GenerationTierDualGenerateScope = 'queue_only';
export type GenerationTierDualGenerateCreditMode = 'none';

export type GenerationTierDualGenerateConfig = {
  enabled: boolean;
  userIds: Set<string>;
  scope: GenerationTierDualGenerateScope;
  creditMode: GenerationTierDualGenerateCreditMode;
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

function parseDualGenerateScope(raw: unknown): GenerationTierDualGenerateScope {
  const normalized = String(raw || '').trim().toLowerCase();
  return normalized === 'queue_only' ? 'queue_only' : 'queue_only';
}

function parseDualGenerateCreditMode(raw: unknown): GenerationTierDualGenerateCreditMode {
  const normalized = String(raw || '').trim().toLowerCase();
  return normalized === 'none' ? 'none' : 'none';
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

export function readGenerationTierDualGenerateConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GenerationTierDualGenerateConfig {
  return {
    enabled: parseBoolean(env.GENERATION_TIER_DUAL_GENERATE_ENABLED, false),
    userIds: parseUserIdCsv(env.GENERATION_TIER_DUAL_GENERATE_USER_IDS),
    scope: parseDualGenerateScope(env.GENERATION_TIER_DUAL_GENERATE_SCOPE),
    creditMode: parseDualGenerateCreditMode(env.GENERATION_TIER_DUAL_GENERATE_CREDIT_MODE),
  };
}

export function createGenerationTierDualGenerateResolver(config: GenerationTierDualGenerateConfig) {
  return function isDualGenerateEnabledForUser(input: {
    userId?: string | null;
    scope?: 'queue' | 'direct' | null;
  }) {
    const scope = input.scope || 'queue';
    if (!config.enabled) return false;
    if (config.scope === 'queue_only' && scope !== 'queue') return false;
    const normalizedUserId = normalizeUserId(input.userId || '');
    if (!normalizedUserId) return false;
    if (config.userIds.size === 0) return false;
    return config.userIds.has(normalizedUserId);
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

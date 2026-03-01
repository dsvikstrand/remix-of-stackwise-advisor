import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getGenerationTierAccess, type GenerationTier } from '@/lib/subscriptionsApi';

export type GenerationTierAccessData = {
  allowedTiers: GenerationTier[];
  defaultTier: GenerationTier;
  testModeEnabled: boolean;
};

export function useGenerationTierAccess(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['generation-tier-access', user?.id || 'anon'],
    enabled: Boolean(enabled && user),
    staleTime: 60_000,
    queryFn: async (): Promise<GenerationTierAccessData> => {
      const data = await getGenerationTierAccess();
      return {
        allowedTiers: data.allowed_tiers,
        defaultTier: data.default_tier,
        testModeEnabled: data.test_mode_enabled,
      };
    },
  });
}

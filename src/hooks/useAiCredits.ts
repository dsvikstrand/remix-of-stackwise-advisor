import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';

type CreditsResponse = {
  remaining: number;
  limit: number;
  resetAt: string;
  bypass?: boolean;
};

async function fetchCredits(): Promise<CreditsResponse> {
  if (!config.agenticBackendUrl) {
    throw new Error('Agentic backend not configured');
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated');
  }

  const url = `${config.agenticBackendUrl!.replace(/\/$/, '')}/api/credits`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Unable to load credits');
  }

  return response.json();
}

export function useAiCredits(enabled: boolean) {
  return useQuery({
    queryKey: ['ai-credits'],
    queryFn: fetchCredits,
    enabled: enabled && !!config.agenticBackendUrl,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

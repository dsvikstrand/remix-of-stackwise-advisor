import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getProfileHistory } from '@/lib/profileHistoryApi';

export function useProfileHistory(profileUserId: string | undefined, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile-history', profileUserId, user?.id || 'anon'],
    enabled: !!profileUserId && enabled,
    queryFn: async () => {
      if (!profileUserId) return { profile_user_id: '', is_owner_view: false, items: [] };
      return getProfileHistory(profileUserId);
    },
  });
}

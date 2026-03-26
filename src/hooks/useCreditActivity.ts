import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type CreditLedgerEntryType = 'grant' | 'hold' | 'settle' | 'refund' | 'adjust';

export type CreditActivityItem = {
  id: string;
  delta: number;
  entryType: CreditLedgerEntryType;
  reasonCode: string;
  createdAt: string;
  summary: string;
};

function toSummary(delta: number, entryType: CreditLedgerEntryType) {
  const abs = Math.abs(delta).toFixed(3);
  switch (entryType) {
    case 'hold':
      return `-${abs} hold`;
    case 'settle':
      return 'settled';
    case 'refund':
      return `+${abs} refund`;
    case 'grant':
      return `+${abs} grant`;
    case 'adjust':
      return `${delta >= 0 ? '+' : '-'}${abs} adjust`;
    default:
      return `${delta >= 0 ? '+' : '-'}${abs}`;
  }
}

export function useCreditActivity(enabled: boolean, userId?: string | null) {
  return useQuery({
    queryKey: ['credit-activity', userId],
    enabled: enabled && Boolean(userId),
    staleTime: 300_000,
    refetchInterval: 300_000,
    queryFn: async (): Promise<CreditActivityItem[]> => {
      try {
        const { data, error } = await supabase
          .from('credit_ledger')
          .select('id, delta, entry_type, reason_code, created_at')
          .eq('user_id', userId as string)
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) {
          return [];
        }

        return (data || []).map((row) => {
          const delta = Number(row.delta || 0);
          const entryType = row.entry_type as CreditLedgerEntryType;
          return {
            id: row.id,
            delta,
            entryType,
            reasonCode: String(row.reason_code || ''),
            createdAt: String(row.created_at || ''),
            summary: toSummary(delta, entryType),
          };
        });
      } catch {
        return [];
      }
    },
  });
}

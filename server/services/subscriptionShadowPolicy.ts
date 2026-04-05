type SubscriptionShadowComparable = {
  source_channel_id?: string | null;
  source_channel_url?: string | null;
  source_channel_title?: string | null;
  source_page_id?: string | null;
  mode?: string | null;
  auto_unlock_enabled?: boolean;
  is_active?: boolean;
  last_polled_at?: string | null;
  last_seen_published_at?: string | null;
  last_seen_video_id?: string | null;
  last_sync_error?: string | null;
};

export const SUBSCRIPTION_SHADOW_HOT_SYNC_FIELDS = [
  'last_polled_at',
  'last_seen_published_at',
  'last_seen_video_id',
  'last_sync_error',
] as const;

const SUBSCRIPTION_SHADOW_COMPARABLE_FIELDS = [
  'source_channel_id',
  'source_channel_url',
  'source_channel_title',
  'source_page_id',
  'mode',
  'auto_unlock_enabled',
  'is_active',
  ...SUBSCRIPTION_SHADOW_HOT_SYNC_FIELDS,
] as const;

type SubscriptionShadowComparableField = typeof SUBSCRIPTION_SHADOW_COMPARABLE_FIELDS[number];

const SUBSCRIPTION_HOT_SYNC_ACTIONS = new Set([
  'subscription_sync_success',
  'subscription_sync_error',
  'subscription_feed_soft_failure',
  'subscription_manual_refresh_checkpoint',
]);

export function getSubscriptionShadowChangedFields(
  current: SubscriptionShadowComparable | null | undefined,
  next: SubscriptionShadowComparable,
) {
  const changedFields: SubscriptionShadowComparableField[] = [];
  for (const field of SUBSCRIPTION_SHADOW_COMPARABLE_FIELDS) {
    if ((current?.[field] ?? null) !== (next[field] ?? null)) {
      changedFields.push(field);
    }
  }
  return changedFields;
}

export function shouldSkipSupabaseSubscriptionShadowWrite(input: {
  action: string;
  primaryEnabled: boolean;
  changedFields: string[];
}) {
  if (!input.primaryEnabled) return false;
  if (!SUBSCRIPTION_HOT_SYNC_ACTIONS.has(String(input.action || '').trim())) return false;
  if (!Array.isArray(input.changedFields) || input.changedFields.length === 0) return false;
  return input.changedFields.every((field) => (
    SUBSCRIPTION_SHADOW_HOT_SYNC_FIELDS.includes(field as typeof SUBSCRIPTION_SHADOW_HOT_SYNC_FIELDS[number])
  ));
}

export type QueuePriorityTier = 'high' | 'medium' | 'low';

const DEFAULT_SCOPE_PRIORITY: Record<string, QueuePriorityTier> = {
  source_item_unlock_generation: 'high',
  manual_refresh_selection: 'high',
  search_video_generate: 'high',
  source_auto_unlock_retry: 'medium',
  source_transcript_revalidate: 'medium',
  blueprint_youtube_enrichment: 'low',
  blueprint_youtube_refresh: 'low',
  all_active_subscriptions: 'low',
};

export function getQueuePriorityTierForScope(scope: string): QueuePriorityTier {
  const normalizedScope = String(scope || '').trim();
  return DEFAULT_SCOPE_PRIORITY[normalizedScope] || 'medium';
}

export function listQueuePriorityTiersInOrder(): QueuePriorityTier[] {
  return ['high', 'medium', 'low'];
}

export function filterScopesByQueuePriorityTier(
  scopes: readonly string[],
  tier: QueuePriorityTier,
): string[] {
  return scopes.filter((scope) => getQueuePriorityTierForScope(scope) === tier);
}

export function isLowPriorityQueueScope(scope: string) {
  return getQueuePriorityTierForScope(scope) === 'low';
}

export function shouldSuppressLowPriorityQueueScope(input: {
  scope: string;
  queueDepth: number;
  suppressionDepth: number;
  enabled: boolean;
}) {
  if (!input.enabled) return false;
  if (!isLowPriorityQueueScope(input.scope)) return false;
  const threshold = Math.max(0, Math.floor(Number(input.suppressionDepth) || 0));
  if (threshold <= 0) return false;
  return Math.floor(Number(input.queueDepth) || 0) >= threshold;
}


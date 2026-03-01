export type GenerationQueueFilter = 'all' | 'source_unlock' | 'search_generate' | 'refresh_generate';

export function normalizeQueueScope(scope: string | null | undefined) {
  return String(scope || '').trim();
}

export function getGenerationQueueScopeLabel(scope: string | null | undefined) {
  const normalized = normalizeQueueScope(scope);
  switch (normalized) {
    case 'source_item_unlock_generation':
      return 'Source unlock';
    case 'search_video_generate':
      return 'Search generate';
    case 'manual_refresh_selection':
      return 'Refresh generate';
    case 'source_auto_unlock_retry':
      return 'Auto retry';
    case 'source_transcript_revalidate':
      return 'Transcript retry';
    default:
      return normalized || 'Generation';
  }
}

export function getQueueFilterForScope(scope: string | null | undefined): GenerationQueueFilter | null {
  const normalized = normalizeQueueScope(scope);
  if (normalized === 'source_item_unlock_generation') return 'source_unlock';
  if (normalized === 'search_video_generate') return 'search_generate';
  if (normalized === 'manual_refresh_selection') return 'refresh_generate';
  return null;
}

export function matchesGenerationQueueFilter(
  filter: GenerationQueueFilter,
  scope: string | null | undefined,
) {
  if (filter === 'all') return true;
  return getQueueFilterForScope(scope) === filter;
}

export function getRetryPathForScope(scope: string | null | undefined) {
  const normalized = normalizeQueueScope(scope);
  if (normalized === 'source_item_unlock_generation') return '/subscriptions';
  if (normalized === 'search_video_generate') return '/search';
  if (normalized === 'manual_refresh_selection') return '/subscriptions';
  return '/search';
}


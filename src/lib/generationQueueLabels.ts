export type GenerationQueueFilter = 'all' | 'source_unlock' | 'search_generate' | 'refresh_generate';

export function normalizeQueueScope(scope: string | null | undefined) {
  return String(scope || '').trim();
}

function isWallGenerationScope(scope: string | null | undefined) {
  const normalized = normalizeQueueScope(scope);
  return normalized === 'source_item_unlock_generation'
    || normalized === 'source_page_video_library_selection';
}

export function getGenerationQueueScopeLabel(scope: string | null | undefined) {
  const normalized = normalizeQueueScope(scope);
  switch (normalized) {
    case 'source_item_unlock_generation':
      return 'Source unlock';
    case 'source_page_video_library_selection':
      return 'Source library';
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
  if (isWallGenerationScope(normalized)) return '/wall';
  if (normalized === 'search_video_generate') return '/search';
  if (normalized === 'manual_refresh_selection') return '/subscriptions';
  return '/search';
}

export function resolveGenerationResultLinkPath(
  scope: string | null | undefined,
  linkPath: string | null | undefined,
) {
  const normalizedScope = normalizeQueueScope(scope);
  const normalizedPath = String(linkPath || '').trim();
  if (isWallGenerationScope(normalizedScope) && (!normalizedPath || normalizedPath === '/my-feed')) {
    return '/wall';
  }
  if (normalizedPath) return normalizedPath;
  return getRetryPathForScope(normalizedScope);
}

export function getGenerationResultActionLabel(
  type: 'generation_succeeded' | 'generation_failed',
  scope: string | null | undefined,
  linkPath: string | null | undefined,
) {
  if (type === 'generation_succeeded') return 'Open blueprint';

  const normalizedScope = normalizeQueueScope(scope);
  const resolvedPath = resolveGenerationResultLinkPath(normalizedScope, linkPath);
  if (isWallGenerationScope(normalizedScope)) {
    return resolvedPath.startsWith('/s/') ? 'Open creator' : 'Open in Wall';
  }
  if (normalizedScope === 'search_video_generate') return 'Open search';
  if (normalizedScope === 'manual_refresh_selection') return 'Open subscriptions';
  return 'View details';
}

import { CHANNELS_CATALOG, getChannelBySlug } from '@/lib/channelsCatalog';

export function isPostableChannelSlug(slug: string): boolean {
  const channel = getChannelBySlug(slug);
  if (!channel) return false;
  if (channel.slug === 'general') return false;
  return channel.status === 'active' && channel.isJoinEnabled;
}

export function getPostableChannel(slug: string) {
  if (!isPostableChannelSlug(slug)) return null;
  return getChannelBySlug(slug);
}

export function resolveChannelSlugFromSearchParams(search: string): string | null {
  const params = new URLSearchParams(search);
  const slug = params.get('channel');
  if (!slug) return null;
  return slug.trim() || null;
}

export function buildUrlWithChannel(path: string, channelSlug: string, extra?: Record<string, string>) {
  const params = new URLSearchParams(extra || undefined);
  params.set('channel', channelSlug);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function getCatalogChannelTagSlugs(): string[] {
  return Array.from(new Set(CHANNELS_CATALOG.map((c) => c.tagSlug)));
}


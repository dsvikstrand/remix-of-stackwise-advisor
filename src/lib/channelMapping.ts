import { CHANNELS_CATALOG, type ChannelCatalogEntry } from '@/lib/channelsCatalog';
import { normalizeTag } from '@/lib/tagging';

function getFallbackSlug(catalog: ChannelCatalogEntry[]): string {
  return catalog.find((channel) => channel.slug === 'general')?.slug || 'general';
}

export function normalizeTagSlug(input: string): string {
  return normalizeTag(input.replace(/^#/, ''));
}

export function resolvePrimaryChannelFromTags(
  tagSlugs: string[],
  catalog: ChannelCatalogEntry[] = CHANNELS_CATALOG,
): string {
  const fallback = getFallbackSlug(catalog);
  if (!tagSlugs || tagSlugs.length === 0) return fallback;

  const normalized = [...new Set(tagSlugs.map((tag) => normalizeTagSlug(tag)).filter(Boolean))];
  if (normalized.length === 0) return fallback;

  type Match = {
    slug: string;
    priority: number;
    matchKind: 'tag' | 'alias';
  };

  const matches: Match[] = [];

  catalog.forEach((channel) => {
    if (channel.slug === 'general') return;

    normalized.forEach((tag) => {
      if (tag === channel.tagSlug) {
        matches.push({ slug: channel.slug, priority: channel.priority, matchKind: 'tag' });
      } else if (channel.aliases.includes(tag)) {
        matches.push({ slug: channel.slug, priority: channel.priority, matchKind: 'alias' });
      }
    });
  });

  if (matches.length === 0) return fallback;

  matches.sort((a, b) => {
    if (a.matchKind !== b.matchKind) return a.matchKind === 'tag' ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.slug.localeCompare(b.slug);
  });

  return matches[0].slug;
}

export function resolveChannelLabelForBlueprint(
  tagSlugs: string[],
  catalog: ChannelCatalogEntry[] = CHANNELS_CATALOG,
): string {
  return `b/${resolvePrimaryChannelFromTags(tagSlugs, catalog)}`;
}

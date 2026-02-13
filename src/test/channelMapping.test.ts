import { describe, expect, it } from 'vitest';
import { resolveChannelLabelForBlueprint, resolvePrimaryChannelFromTags } from '@/lib/channelMapping';
import type { ChannelCatalogEntry } from '@/lib/channelsCatalog';

describe('channelMapping', () => {
  it('resolves exact tagSlug match', () => {
    const result = resolvePrimaryChannelFromTags(['nutrition-meal-planning']);
    expect(result).toBe('nutrition-meal-planning');
  });

  it('resolves alias match', () => {
    const result = resolvePrimaryChannelFromTags(['shake']);
    expect(result).toBe('nutrition-meal-planning');
  });

  it('prefers exact tag match over alias match', () => {
    const result = resolvePrimaryChannelFromTags(['shake', 'sleep-recovery']);
    expect(result).toBe('sleep-recovery');
  });

  it('falls back to general on unknown tags', () => {
    const result = resolvePrimaryChannelFromTags(['unknown-tag']);
    expect(result).toBe('general');
  });

  it('uses deterministic tie-break by priority then lexical slug', () => {
    const customCatalog: ChannelCatalogEntry[] = [
      {
        slug: 'general',
        name: 'General',
        description: 'Fallback',
        status: 'active',
        tagSlug: 'general',
        isJoinEnabled: false,
        aliases: [],
        icon: 'globe',
        priority: 999,
      },
      {
        slug: 'a-channel',
        name: 'A Channel',
        description: 'A',
        status: 'active',
        tagSlug: 'a-channel',
        isJoinEnabled: true,
        aliases: ['shared-alias'],
        icon: 'hash',
        priority: 10,
      },
      {
        slug: 'b-channel',
        name: 'B Channel',
        description: 'B',
        status: 'active',
        tagSlug: 'b-channel',
        isJoinEnabled: true,
        aliases: ['shared-alias'],
        icon: 'hash',
        priority: 10,
      },
    ];

    const result = resolvePrimaryChannelFromTags(['shared-alias'], customCatalog);
    expect(result).toBe('a-channel');
  });

  it('returns b/<slug> label helper', () => {
    const result = resolveChannelLabelForBlueprint(['shake']);
    expect(result).toBe('b/nutrition-meal-planning');
  });
});

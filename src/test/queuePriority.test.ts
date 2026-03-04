import { describe, expect, it } from 'vitest';
import {
  filterScopesByQueuePriorityTier,
  getQueuePriorityTierForScope,
  listQueuePriorityTiersInOrder,
  shouldSuppressLowPriorityQueueScope,
} from '../../server/services/queuePriority';

describe('queue priority mapping', () => {
  it('maps known scopes to expected tiers', () => {
    expect(getQueuePriorityTierForScope('source_item_unlock_generation')).toBe('high');
    expect(getQueuePriorityTierForScope('manual_refresh_selection')).toBe('high');
    expect(getQueuePriorityTierForScope('source_auto_unlock_retry')).toBe('medium');
    expect(getQueuePriorityTierForScope('blueprint_youtube_refresh')).toBe('low');
    expect(getQueuePriorityTierForScope('all_active_subscriptions')).toBe('low');
  });

  it('defaults unknown scopes to medium tier', () => {
    expect(getQueuePriorityTierForScope('some_unknown_scope')).toBe('medium');
  });

  it('filters scopes by tier and keeps tier order stable', () => {
    const scopes = [
      'all_active_subscriptions',
      'source_item_unlock_generation',
      'source_auto_unlock_retry',
      'manual_refresh_selection',
      'blueprint_youtube_enrichment',
    ];

    expect(listQueuePriorityTiersInOrder()).toEqual(['high', 'medium', 'low']);
    expect(filterScopesByQueuePriorityTier(scopes, 'high')).toEqual([
      'source_item_unlock_generation',
      'manual_refresh_selection',
    ]);
    expect(filterScopesByQueuePriorityTier(scopes, 'medium')).toEqual([
      'source_auto_unlock_retry',
    ]);
    expect(filterScopesByQueuePriorityTier(scopes, 'low')).toEqual([
      'all_active_subscriptions',
      'blueprint_youtube_enrichment',
    ]);
  });
});

describe('low-priority suppression', () => {
  it('suppresses only low-priority scopes when enabled and threshold is met', () => {
    expect(shouldSuppressLowPriorityQueueScope({
      scope: 'all_active_subscriptions',
      queueDepth: 120,
      suppressionDepth: 100,
      enabled: true,
    })).toBe(true);

    expect(shouldSuppressLowPriorityQueueScope({
      scope: 'source_item_unlock_generation',
      queueDepth: 120,
      suppressionDepth: 100,
      enabled: true,
    })).toBe(false);
  });

  it('does not suppress when feature is disabled or threshold is zero', () => {
    expect(shouldSuppressLowPriorityQueueScope({
      scope: 'all_active_subscriptions',
      queueDepth: 120,
      suppressionDepth: 100,
      enabled: false,
    })).toBe(false);

    expect(shouldSuppressLowPriorityQueueScope({
      scope: 'all_active_subscriptions',
      queueDepth: 120,
      suppressionDepth: 0,
      enabled: true,
    })).toBe(false);
  });
});


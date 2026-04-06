import { describe, expect, it } from 'vitest';
import { resolveFeedItemWallCreatedAt } from '../../server/services/feedItemWallPolicy';

describe('feed item wall policy', () => {
  it('preserves the original wall created_at when upgrading an existing row', () => {
    expect(resolveFeedItemWallCreatedAt({
      existingCreatedAt: '2026-04-06T08:00:00.000Z',
      nowIso: '2026-04-06T12:00:00.000Z',
    })).toBe('2026-04-06T08:00:00.000Z');
  });

  it('uses now when the wall row is new', () => {
    expect(resolveFeedItemWallCreatedAt({
      existingCreatedAt: null,
      nowIso: '2026-04-06T12:00:00.000Z',
    })).toBe('2026-04-06T12:00:00.000Z');
  });
});

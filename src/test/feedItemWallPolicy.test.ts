import { describe, expect, it } from 'vitest';
import {
  resolveFeedItemGeneratedAtOnWall,
  resolveFeedItemWallCreatedAt,
  resolveFeedItemWallDisplayAt,
} from '../../server/services/feedItemWallPolicy';

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
      nextCreatedAt: null,
      nowIso: '2026-04-06T12:00:00.000Z',
    })).toBe('2026-04-06T12:00:00.000Z');
  });

  it('accepts an explicit locked wall arrival timestamp for new rows', () => {
    expect(resolveFeedItemWallCreatedAt({
      existingCreatedAt: null,
      nextCreatedAt: '2026-04-06T11:59:00.000Z',
      nowIso: '2026-04-06T12:00:00.000Z',
    })).toBe('2026-04-06T11:59:00.000Z');
  });

  it('stamps generated_at_on_wall on first locked to blueprint promotion', () => {
    expect(resolveFeedItemGeneratedAtOnWall({
      existingGeneratedAtOnWall: null,
      existingBlueprintId: null,
      nextBlueprintId: 'bp_1',
      nowIso: '2026-04-06T12:00:00.000Z',
    })).toBe('2026-04-06T12:00:00.000Z');
  });

  it('preserves generated_at_on_wall after the first promotion', () => {
    expect(resolveFeedItemGeneratedAtOnWall({
      existingGeneratedAtOnWall: '2026-04-06T12:00:00.000Z',
      existingBlueprintId: 'bp_1',
      nextBlueprintId: 'bp_1',
      nowIso: '2026-04-06T14:00:00.000Z',
    })).toBe('2026-04-06T12:00:00.000Z');
  });

  it('does not stamp generated_at_on_wall for locked rows', () => {
    expect(resolveFeedItemGeneratedAtOnWall({
      existingGeneratedAtOnWall: null,
      existingBlueprintId: null,
      nextBlueprintId: null,
      nowIso: '2026-04-06T12:00:00.000Z',
    })).toBe(null);
  });

  it('uses generated_at_on_wall as the blueprint display clock', () => {
    expect(resolveFeedItemWallDisplayAt({
      blueprintId: 'bp_1',
      createdAt: '2026-04-06T08:00:00.000Z',
      generatedAtOnWall: '2026-04-06T12:00:00.000Z',
    })).toBe('2026-04-06T12:00:00.000Z');
  });

  it('uses created_at as the locked display clock', () => {
    expect(resolveFeedItemWallDisplayAt({
      blueprintId: null,
      createdAt: '2026-04-06T08:00:00.000Z',
      generatedAtOnWall: '2026-04-06T12:00:00.000Z',
    })).toBe('2026-04-06T08:00:00.000Z');
  });
});

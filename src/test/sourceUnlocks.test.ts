import { describe, expect, it } from 'vitest';
import { computeUnlockCost, ensureSourceItemUnlock } from '../../server/services/sourceUnlocks';
import { createMockSupabase } from './helpers/mockSupabase';

describe('source unlock pricing', () => {
  it('charges 1.000 for single subscriber', () => {
    expect(computeUnlockCost(1)).toBe(1);
  });

  it('keeps manual unlocks at 1.000 for shared assets', () => {
    expect(computeUnlockCost(3)).toBe(1);
  });

  it('ignores subscriber count for manual display cost', () => {
    expect(computeUnlockCost(1000)).toBe(1);
  });
});

describe('ensureSourceItemUnlock', () => {
  it('creates fresh unlock rows with transcript_status=unknown', async () => {
    const db = createMockSupabase({
      source_item_unlocks: [],
    }) as any;

    const row = await ensureSourceItemUnlock(db, {
      sourceItemId: 'source_1',
      sourcePageId: 'page_1',
      estimatedCost: 1,
    });

    expect(row).toMatchObject({
      source_item_id: 'source_1',
      source_page_id: 'page_1',
      status: 'available',
      estimated_cost: 1,
      transcript_status: 'unknown',
      transcript_probe_meta: {},
    });
  });

  it('normalizes legacy null transcript_status when updating an existing unlock row', async () => {
    const db = createMockSupabase({
      source_item_unlocks: [{
        id: 'unlock_1',
        source_item_id: 'source_1',
        source_page_id: 'page_old',
        status: 'available',
        estimated_cost: 1,
        transcript_status: null,
        transcript_probe_meta: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      }],
    }) as any;

    const row = await ensureSourceItemUnlock(db, {
      sourceItemId: 'source_1',
      sourcePageId: 'page_new',
      estimatedCost: 2,
    });

    expect(row).toMatchObject({
      id: 'unlock_1',
      source_item_id: 'source_1',
      source_page_id: 'page_new',
      estimated_cost: 2,
      transcript_status: 'unknown',
      transcript_probe_meta: {},
    });
  });
});

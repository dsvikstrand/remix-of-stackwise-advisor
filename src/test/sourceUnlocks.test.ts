import { describe, expect, it } from 'vitest';
import {
  computeUnlockCost,
  ensureSourceItemUnlock,
  normalizeSupabaseUnlockShadowRow,
  type SourceItemUnlockRow,
} from '../../server/services/sourceUnlocks';
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

describe('normalizeSupabaseUnlockShadowRow', () => {
  const baseRow: SourceItemUnlockRow = {
    id: 'unlock_1',
    source_item_id: 'source_1',
    source_page_id: 'page_1',
    status: 'processing',
    estimated_cost: 1,
    reserved_by_user_id: 'user_1',
    reservation_expires_at: '2026-04-07T00:05:00.000Z',
    reserved_ledger_id: null,
    auto_unlock_intent_id: null,
    blueprint_id: null,
    job_id: 'job_1',
    last_error_code: null,
    last_error_message: null,
    transcript_status: 'unknown',
    transcript_attempt_count: 0,
    transcript_no_caption_hits: 0,
    transcript_last_probe_at: null,
    transcript_retry_after: null,
    transcript_probe_meta: {},
    created_at: '2026-04-07T00:00:00.000Z',
    updated_at: '2026-04-07T00:00:00.000Z',
  };

  it('clears Supabase shadow job_id in Oracle queue primary mode', () => {
    expect(normalizeSupabaseUnlockShadowRow({
      row: baseRow,
      oracleQueuePrimaryEnabled: true,
    }).job_id).toBeNull();
  });

  it('preserves job_id outside Oracle queue primary mode', () => {
    expect(normalizeSupabaseUnlockShadowRow({
      row: baseRow,
      oracleQueuePrimaryEnabled: false,
    }).job_id).toBe('job_1');
  });
});

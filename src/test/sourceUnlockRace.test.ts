import { describe, expect, it } from 'vitest';
import { reserveUnlock, type SourceItemUnlockRow } from '../../server/services/sourceUnlocks';
import { createMockSupabase } from './helpers/mockSupabase';

function createAvailableUnlockRow(): SourceItemUnlockRow {
  return {
    id: 'unlock_race_1',
    source_item_id: 'source_item_1',
    source_page_id: 'source_page_1',
    status: 'available',
    estimated_cost: 1,
    reserved_by_user_id: null,
    reservation_expires_at: null,
    reserved_ledger_id: null,
    blueprint_id: null,
    job_id: null,
    last_error_code: null,
    last_error_message: null,
    transcript_probe_meta: null,
    created_at: '2026-02-20T10:00:00.000Z',
    updated_at: '2026-02-20T10:00:00.000Z',
  };
}

describe('source unlock race semantics', () => {
  it('returns in_progress for second reserve attempt on stale snapshot', async () => {
    const initialUnlock = createAvailableUnlockRow();
    const db = createMockSupabase({
      source_item_unlocks: [initialUnlock],
    }) as any;

    const first = await reserveUnlock(db, {
      unlock: { ...initialUnlock },
      userId: 'user_a',
      estimatedCost: 1,
      reservationSeconds: 300,
    });
    expect(first.state).toBe('reserved');
    expect(first.reservedNow).toBe(true);

    const second = await reserveUnlock(db, {
      unlock: { ...initialUnlock },
      userId: 'user_b',
      estimatedCost: 1,
      reservationSeconds: 300,
    });
    expect(second.state).toBe('in_progress');
    expect(second.reservedNow).toBe(false);
  });

  it('returns ready without reserving when unlock is already ready', async () => {
    const readyRow: SourceItemUnlockRow = {
      ...createAvailableUnlockRow(),
      status: 'ready',
      blueprint_id: 'bp_1',
    };
    const db = createMockSupabase({
      source_item_unlocks: [readyRow],
    }) as any;

    const result = await reserveUnlock(db, {
      unlock: readyRow,
      userId: 'user_a',
      estimatedCost: 1,
      reservationSeconds: 300,
    });

    expect(result.state).toBe('ready');
    expect(result.reservedNow).toBe(false);
    expect(result.unlock.blueprint_id).toBe('bp_1');
  });

  it('normalizes legacy null transcript probe metadata during reserve', async () => {
    const initialUnlock = createAvailableUnlockRow();
    const db = createMockSupabase({
      source_item_unlocks: [initialUnlock],
    }) as any;

    const result = await reserveUnlock(db, {
      unlock: { ...initialUnlock, transcript_probe_meta: null },
      userId: 'user_a',
      estimatedCost: 1,
      reservationSeconds: 300,
    });

    expect(result.state).toBe('reserved');
    expect(result.unlock.transcript_probe_meta).toEqual({});
  });
});

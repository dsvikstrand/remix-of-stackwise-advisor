import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEED_SUPPRESSION_DEDUPE_WINDOW_MS,
  resetFeedSuppressionRuntimeStateForTests,
  suppressUnlockableFeedRowsForSourceItem,
  suppressUnlockableFeedRowsForSourceItems,
} from '../../server/services/feedSuppression';
import { createMockSupabase } from './helpers/mockSupabase';

function createTrackedMockDb(initialTables?: Record<string, any[]>) {
  const db = createMockSupabase(initialTables) as any;
  const originalFrom = db.from.bind(db);
  let userFeedUpdateCalls = 0;

  db.from = (tableName: string) => {
    const builder = originalFrom(tableName);
    if (tableName === 'user_feed_items') {
      const originalUpdate = builder.update.bind(builder);
      builder.update = (...args: any[]) => {
        userFeedUpdateCalls += 1;
        return originalUpdate(...args);
      };
    }
    return builder;
  };

  return {
    db,
    getUserFeedUpdateCalls: () => userFeedUpdateCalls,
  };
}

describe('feed suppression helpers', () => {
  beforeEach(() => {
    resetFeedSuppressionRuntimeStateForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts suppressed rows without returning updated row ids', async () => {
    const { db } = createTrackedMockDb({
      user_feed_items: [
        { id: 'ufi_1', source_item_id: 'source_1', blueprint_id: null, state: 'my_feed_unlockable', last_decision_code: null },
        { id: 'ufi_2', source_item_id: 'source_1', blueprint_id: null, state: 'my_feed_unlocking', last_decision_code: null },
        { id: 'ufi_3', source_item_id: 'source_1', blueprint_id: 'bp_1', state: 'my_feed_unlockable', last_decision_code: null },
        { id: 'ufi_4', source_item_id: 'source_1', blueprint_id: null, state: 'my_feed_generated', last_decision_code: null },
      ],
    });

    const hiddenCount = await suppressUnlockableFeedRowsForSourceItem(db, {
      sourceItemId: 'source_1',
      decisionCode: 'NO_TRANSCRIPT_PERMANENT_AUTO',
    });

    expect(hiddenCount).toBe(2);
    expect(db.state.user_feed_items).toEqual([
      expect.objectContaining({ id: 'ufi_1', state: 'my_feed_skipped', last_decision_code: 'NO_TRANSCRIPT_PERMANENT_AUTO' }),
      expect.objectContaining({ id: 'ufi_2', state: 'my_feed_skipped', last_decision_code: 'NO_TRANSCRIPT_PERMANENT_AUTO' }),
      expect.objectContaining({ id: 'ufi_3', state: 'my_feed_unlockable' }),
      expect.objectContaining({ id: 'ufi_4', state: 'my_feed_generated' }),
    ]);
  });

  it('dedupes source item ids and suppresses them in a single bulk update chunk', async () => {
    const { db, getUserFeedUpdateCalls } = createTrackedMockDb({
      user_feed_items: [
        { id: 'ufi_1', source_item_id: 'source_1', blueprint_id: null, state: 'my_feed_unlockable', last_decision_code: null },
        { id: 'ufi_2', source_item_id: 'source_1', blueprint_id: null, state: 'my_feed_unlocking', last_decision_code: null },
        { id: 'ufi_3', source_item_id: 'source_2', blueprint_id: null, state: 'my_feed_unlockable', last_decision_code: null },
        { id: 'ufi_4', source_item_id: 'source_3', blueprint_id: null, state: 'my_feed_generated', last_decision_code: null },
        { id: 'ufi_5', source_item_id: 'source_4', blueprint_id: 'bp_2', state: 'my_feed_unlockable', last_decision_code: null },
      ],
    });

    const hiddenCount = await suppressUnlockableFeedRowsForSourceItems(db, {
      sourceItemIds: ['source_1', 'source_1', ' ', '', 'source_2'],
      decisionCode: 'TRANSCRIPT_UNAVAILABLE_AUTO',
      chunkSize: 50,
    });

    expect(hiddenCount).toBe(3);
    expect(getUserFeedUpdateCalls()).toBe(1);
    expect(db.state.user_feed_items).toEqual([
      expect.objectContaining({ id: 'ufi_1', state: 'my_feed_skipped', last_decision_code: 'TRANSCRIPT_UNAVAILABLE_AUTO' }),
      expect.objectContaining({ id: 'ufi_2', state: 'my_feed_skipped', last_decision_code: 'TRANSCRIPT_UNAVAILABLE_AUTO' }),
      expect.objectContaining({ id: 'ufi_3', state: 'my_feed_skipped', last_decision_code: 'TRANSCRIPT_UNAVAILABLE_AUTO' }),
      expect.objectContaining({ id: 'ufi_4', state: 'my_feed_generated' }),
      expect.objectContaining({ id: 'ufi_5', state: 'my_feed_unlockable' }),
    ]);
  });

  it('dedupes repeated single-item suppressions within the cooldown window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T12:00:00.000Z'));

    const { db, getUserFeedUpdateCalls } = createTrackedMockDb({
      user_feed_items: [
        { id: 'ufi_1', source_item_id: 'source_1', blueprint_id: null, state: 'my_feed_unlockable', last_decision_code: null },
      ],
    });

    const firstHiddenCount = await suppressUnlockableFeedRowsForSourceItem(db, {
      sourceItemId: 'source_1',
      decisionCode: 'TRANSCRIPT_UNAVAILABLE_AUTO',
    });
    const secondHiddenCount = await suppressUnlockableFeedRowsForSourceItem(db, {
      sourceItemId: 'source_1',
      decisionCode: 'TRANSCRIPT_UNAVAILABLE_AUTO',
    });

    expect(firstHiddenCount).toBe(1);
    expect(secondHiddenCount).toBe(0);
    expect(getUserFeedUpdateCalls()).toBe(1);

    await vi.advanceTimersByTimeAsync(FEED_SUPPRESSION_DEDUPE_WINDOW_MS);

    const thirdHiddenCount = await suppressUnlockableFeedRowsForSourceItem(db, {
      sourceItemId: 'source_1',
      decisionCode: 'TRANSCRIPT_UNAVAILABLE_AUTO',
    });

    expect(thirdHiddenCount).toBe(0);
    expect(getUserFeedUpdateCalls()).toBe(2);
  });
});

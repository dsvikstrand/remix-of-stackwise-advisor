import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  countOracleSubscriptionLedgerActiveSubscriptions,
  getOracleSubscriptionLedgerById,
  getOracleSubscriptionLedgerByUserChannel,
  getOracleSubscriptionLedgerState,
  listOracleSubscriptionLedgerActiveSubscriptionsForUser,
  listOracleSubscriptionLedgerRowsForUser,
  syncOracleSubscriptionLedgerFromSupabase,
  upsertOracleSubscriptionLedgerRows,
} from '../../server/services/oracleSubscriptionLedgerState';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-subscription-ledger-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle subscription ledger state', () => {
  it('upserts and serves durable subscription rows locally', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await upsertOracleSubscriptionLedgerRows({
        controlDb,
        rows: [
          {
            id: 'sub_active',
            user_id: 'user_1',
            source_type: 'youtube',
            source_channel_id: 'channel_1',
            source_page_id: 'page_1',
            auto_unlock_enabled: true,
            is_active: true,
            created_at: '2026-04-02T08:00:00.000Z',
            updated_at: '2026-04-02T08:00:00.000Z',
          },
          {
            id: 'sub_inactive',
            user_id: 'user_1',
            source_type: 'youtube',
            source_channel_id: 'channel_2',
            source_page_id: 'page_2',
            auto_unlock_enabled: false,
            is_active: false,
            created_at: '2026-04-02T08:05:00.000Z',
            updated_at: '2026-04-02T08:05:00.000Z',
          },
        ],
      });

      const byId = await getOracleSubscriptionLedgerById({
        controlDb,
        subscriptionId: 'sub_active',
        userId: 'user_1',
      });
      const byChannel = await getOracleSubscriptionLedgerByUserChannel({
        controlDb,
        userId: 'user_1',
        sourceType: 'youtube',
        sourceChannelId: 'channel_1',
      });
      const state = await getOracleSubscriptionLedgerState({
        controlDb,
        userId: 'user_1',
        sourcePageId: 'page_1',
      });
      const rows = await listOracleSubscriptionLedgerRowsForUser({
        controlDb,
        userId: 'user_1',
      });
      const activeRows = await listOracleSubscriptionLedgerActiveSubscriptionsForUser({
        controlDb,
        userId: 'user_1',
      });
      const activeCount = await countOracleSubscriptionLedgerActiveSubscriptions({
        controlDb,
        sourcePageId: 'page_1',
      });

      expect(byId).toMatchObject({
        id: 'sub_active',
        is_active: true,
      });
      expect(byChannel?.id).toBe('sub_active');
      expect(state).toMatchObject({
        id: 'sub_active',
        is_active: true,
      });
      expect(rows).toHaveLength(2);
      expect(activeRows).toEqual([
        {
          source_page_id: 'page_1',
          source_channel_id: 'channel_1',
        },
      ]);
      expect(activeCount).toBe(1);
    } finally {
      await controlDb.close();
    }
  });

  it('bootstraps the durable subscription ledger from Supabase rows', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const db = createMockSupabase({
      user_source_subscriptions: [
        {
          id: 'sub_bootstrap_active',
          user_id: 'user_1',
          source_type: 'youtube',
          source_channel_id: 'channel_bootstrap_1',
          source_page_id: 'page_bootstrap_1',
          auto_unlock_enabled: true,
          is_active: true,
          updated_at: '2026-04-02T09:00:00.000Z',
          created_at: '2026-04-02T09:00:00.000Z',
        },
        {
          id: 'sub_bootstrap_inactive',
          user_id: 'user_2',
          source_type: 'youtube',
          source_channel_id: 'channel_bootstrap_2',
          source_page_id: 'page_bootstrap_2',
          auto_unlock_enabled: false,
          is_active: false,
          updated_at: '2026-04-02T09:05:00.000Z',
          created_at: '2026-04-02T09:05:00.000Z',
        },
      ],
    }) as any;

    try {
      const result = await syncOracleSubscriptionLedgerFromSupabase({
        controlDb,
        db,
        limit: 1000,
      });

      expect(result).toMatchObject({
        rowCount: 2,
        activeCount: 1,
      });

      const rows = await listOracleSubscriptionLedgerRowsForUser({
        controlDb,
        userId: 'user_1',
      });
      expect(rows[0]).toMatchObject({
        id: 'sub_bootstrap_active',
        source_channel_id: 'channel_bootstrap_1',
      });
    } finally {
      await controlDb.close();
    }
  });
});

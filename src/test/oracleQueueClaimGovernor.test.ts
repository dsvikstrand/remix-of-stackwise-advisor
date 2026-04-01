import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  recordOracleQueueClaimResult,
  shouldAttemptOracleQueueClaim,
} from '../../server/services/oracleQueueClaimGovernor';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-queue-claim-governor-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle queue claim governor', () => {
  it('backs off empty low-priority claims and resumes once the cooldown elapses', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      const initial = await shouldAttemptOracleQueueClaim({
        controlDb,
        tier: 'low',
        scopes: ['all_active_subscriptions'],
        maxJobs: 1,
        nowIso: '2026-04-01T10:00:00.000Z',
      });
      expect(initial.allowed).toBe(true);

      await recordOracleQueueClaimResult({
        controlDb,
        config: {
          emptyBackoffMinMs: 15_000,
          emptyBackoffMaxMs: 180_000,
          mediumPriorityMultiplier: 2,
          lowPriorityMultiplier: 4,
        },
        tier: 'low',
        scopes: ['all_active_subscriptions'],
        maxJobs: 1,
        claimedCount: 0,
        nowIso: '2026-04-01T10:00:00.000Z',
      });

      const blocked = await shouldAttemptOracleQueueClaim({
        controlDb,
        tier: 'low',
        scopes: ['all_active_subscriptions'],
        maxJobs: 1,
        nowIso: '2026-04-01T10:00:10.000Z',
      });
      expect(blocked).toMatchObject({
        allowed: false,
        consecutiveEmptyClaims: 1,
        nextAllowedAt: '2026-04-01T10:01:00.000Z',
      });

      const resumed = await shouldAttemptOracleQueueClaim({
        controlDb,
        tier: 'low',
        scopes: ['all_active_subscriptions'],
        maxJobs: 1,
        nowIso: '2026-04-01T10:01:00.000Z',
      });
      expect(resumed.allowed).toBe(true);
    } finally {
      await controlDb.close();
    }
  });

  it('resets the empty-claim streak after a successful claim', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await recordOracleQueueClaimResult({
        controlDb,
        config: {
          emptyBackoffMinMs: 15_000,
          emptyBackoffMaxMs: 180_000,
          mediumPriorityMultiplier: 2,
          lowPriorityMultiplier: 4,
        },
        tier: 'medium',
        scopes: ['source_auto_unlock_retry'],
        maxJobs: 2,
        claimedCount: 0,
        nowIso: '2026-04-01T10:00:00.000Z',
      });

      await recordOracleQueueClaimResult({
        controlDb,
        config: {
          emptyBackoffMinMs: 15_000,
          emptyBackoffMaxMs: 180_000,
          mediumPriorityMultiplier: 2,
          lowPriorityMultiplier: 4,
        },
        tier: 'medium',
        scopes: ['source_auto_unlock_retry'],
        maxJobs: 2,
        claimedCount: 2,
        nowIso: '2026-04-01T10:00:20.000Z',
      });

      const afterClaim = await shouldAttemptOracleQueueClaim({
        controlDb,
        tier: 'medium',
        scopes: ['source_auto_unlock_retry'],
        maxJobs: 2,
        nowIso: '2026-04-01T10:00:21.000Z',
      });
      expect(afterClaim).toMatchObject({
        allowed: true,
        consecutiveEmptyClaims: 0,
        nextAllowedAt: null,
      });
    } finally {
      await controlDb.close();
    }
  });
});

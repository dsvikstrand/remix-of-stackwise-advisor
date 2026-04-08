import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  appendOracleGenerationTraceEvent,
  clearOracleGenerationTraceSeqCursor,
  listOracleGenerationRunEvents,
} from '../../server/services/oracleGenerationTrace';
import {
  appendGenerationEvent,
  configureGenerationTraceOracleWriteAdapter,
} from '../../server/services/generationTrace';

const tempDirs: string[] = [];

afterEach(() => {
  configureGenerationTraceOracleWriteAdapter(null);
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-generation-trace-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle generation trace', () => {
  it('persists ordered events through the generationTrace service without Supabase writes', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      configureGenerationTraceOracleWriteAdapter({
        resetRun(runId: string) {
          clearOracleGenerationTraceSeqCursor(runId);
        },
        async appendEvent(input) {
          await appendOracleGenerationTraceEvent({
            controlDb,
            runId: input.runId,
            event: input.event,
            level: input.level,
            payload: input.payload,
          });
        },
      });

      await Promise.all([
        appendGenerationEvent({} as any, {
          runId: 'run_oracle_trace',
          event: 'pipeline_started',
          payload: { idx: 'a' },
        }),
        appendGenerationEvent({} as any, {
          runId: 'run_oracle_trace',
          event: 'transcript_loaded',
          payload: { idx: 'b' },
        }),
        appendGenerationEvent({} as any, {
          runId: 'run_oracle_trace',
          event: 'pipeline_failed',
          level: 'warn',
          payload: { idx: 'c' },
        }),
      ]);

      const page = await listOracleGenerationRunEvents({
        controlDb,
        runId: 'run_oracle_trace',
        limit: 10,
      });

      expect(page.items.map((item) => item.seq)).toEqual([3, 2, 1]);
      expect(page.items.map((item) => item.event).sort()).toEqual([
        'pipeline_failed',
        'pipeline_started',
        'transcript_loaded',
      ]);
    } finally {
      await controlDb.close();
    }
  });

  it('keeps quiet-event filtering when Oracle is the event sink', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      configureGenerationTraceOracleWriteAdapter({
        resetRun(runId: string) {
          clearOracleGenerationTraceSeqCursor(runId);
        },
        async appendEvent(input) {
          await appendOracleGenerationTraceEvent({
            controlDb,
            runId: input.runId,
            event: input.event,
            level: input.level,
            payload: input.payload,
          });
        },
      });

      await appendGenerationEvent({} as any, {
        runId: 'run_oracle_quiet',
        event: 'model_raw_output_captured',
        payload: { dropped: true },
      });
      await appendGenerationEvent({} as any, {
        runId: 'run_oracle_quiet',
        event: 'pipeline_failed',
        level: 'warn',
        payload: { kept: true },
      });

      const page = await listOracleGenerationRunEvents({
        controlDb,
        runId: 'run_oracle_quiet',
        limit: 10,
      });

      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.event).toBe('pipeline_failed');
    } finally {
      await controlDb.close();
    }
  });
});

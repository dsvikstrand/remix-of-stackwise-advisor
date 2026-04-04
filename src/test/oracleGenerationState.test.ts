import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openOracleControlPlaneDb } from '../../server/services/oracleControlPlaneDb';
import {
  claimOracleGenerationVariantForGeneration,
  finalizeOracleGenerationRunFailure,
  finalizeOracleGenerationRunSuccess,
  getOracleGenerationRunByRunId,
  getOracleGenerationVariant,
  startOracleGenerationRun,
  syncOracleGenerationStateFromSupabase,
  updateOracleGenerationRunModelInfo,
} from '../../server/services/oracleGenerationState';
import { createMockSupabase } from './helpers/mockSupabase';

const tempDirs: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  while (tempDirs.length > 0) {
    const next = tempDirs.pop();
    if (next) fs.rmSync(next, { recursive: true, force: true });
  }
});

function createTempSqlitePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-generation-state-'));
  tempDirs.push(dir);
  return path.join(dir, 'control-plane.sqlite');
}

describe('oracle generation state', () => {
  it('claims a stale in-progress variant and updates the Oracle row', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T10:00:00.000Z'));

    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await controlDb.db
        .insertInto('generation_variant_state')
        .values({
          id: 'variant_stale',
          source_item_id: 'source_1',
          generation_tier: 'tier',
          status: 'running',
          blueprint_id: null,
          active_job_id: null,
          last_error_code: null,
          last_error_message: null,
          created_by_user_id: 'user_old',
          created_at: '2026-04-03T07:00:00.000Z',
          updated_at: '2026-04-03T09:00:00.000Z',
        })
        .execute();

      const result = await claimOracleGenerationVariantForGeneration({
        controlDb,
        sourceItemId: 'source_1',
        generationTier: 'tier',
        userId: 'user_new',
        jobId: 'job_new',
        targetStatus: 'running',
      });

      expect(result).toMatchObject({
        outcome: 'claimed',
        variant: {
          source_item_id: 'source_1',
          status: 'running',
          active_job_id: 'job_new',
          created_by_user_id: 'user_new',
        },
      });
    } finally {
      await controlDb.close();
    }
  });

  it('persists generation runs end to end in Oracle state', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });

    try {
      await startOracleGenerationRun({
        controlDb,
        runId: 'run_1',
        userId: 'user_1',
        sourceScope: 'search_video_generate',
        sourceTag: 'youtube_search_direct',
        videoId: 'abc123',
        videoUrl: 'https://youtube.com/watch?v=abc123',
        modelPrimary: 'gpt-5.2',
        reasoningEffort: 'low',
        traceVersion: 'yt2bp_trace_v2',
      });

      await updateOracleGenerationRunModelInfo({
        controlDb,
        runId: 'run_1',
        modelUsed: 'gpt-5.2',
        fallbackUsed: false,
        fallbackModel: null,
        reasoningEffort: 'low',
      });

      await finalizeOracleGenerationRunSuccess({
        controlDb,
        runId: 'run_1',
        qualityOk: true,
        qualityIssues: [],
        qualityRetriesUsed: 0,
        qualityFinalMode: 'direct',
        traceVersion: 'yt2bp_trace_v2',
        summary: { total_duration_ms: 1234 },
      });

      const succeeded = await getOracleGenerationRunByRunId({
        controlDb,
        runId: 'run_1',
      });
      expect(succeeded).toMatchObject({
        run_id: 'run_1',
        status: 'succeeded',
        model_used: 'gpt-5.2',
        quality_ok: true,
        quality_issues: [],
        quality_final_mode: 'direct',
        summary: { total_duration_ms: 1234 },
      });

      await startOracleGenerationRun({
        controlDb,
        runId: 'run_2',
        userId: 'user_2',
        videoId: 'xyz987',
      });

      await finalizeOracleGenerationRunFailure({
        controlDb,
        runId: 'run_2',
        errorCode: 'TRANSCRIPT_EMPTY',
        errorMessage: 'Transcript was empty.',
        traceVersion: 'yt2bp_trace_v2',
        summary: { stage: 'transcript' },
      });

      const failed = await getOracleGenerationRunByRunId({
        controlDb,
        runId: 'run_2',
      });
      expect(failed).toMatchObject({
        run_id: 'run_2',
        status: 'failed',
        error_code: 'TRANSCRIPT_EMPTY',
        error_message: 'Transcript was empty.',
        quality_issues: [],
        summary: { stage: 'transcript' },
      });
    } finally {
      await controlDb.close();
    }
  });

  it('bootstraps Oracle generation state from Supabase rows across multiple pages', async () => {
    const controlDb = openOracleControlPlaneDb({
      sqlitePath: createTempSqlitePath(),
    });
    const variantRows = Array.from({ length: 1005 }, (_, index) => ({
      id: `variant_${index + 1}`,
      source_item_id: `source_${index + 1}`,
      generation_tier: 'tier',
      status: index === 1004 ? 'running' : 'ready',
      blueprint_id: index === 1004 ? null : `bp_${index + 1}`,
      active_job_id: index === 1004 ? 'job_live' : null,
      last_error_code: null,
      last_error_message: null,
      created_by_user_id: `user_${(index % 5) + 1}`,
      created_at: new Date(Date.UTC(2026, 3, 3, 9, 0, 0, index)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 3, 3, 9, 0, 0, index)).toISOString(),
    }));
    const runRows = Array.from({ length: 1005 }, (_, index) => ({
      id: `run_row_${index + 1}`,
      run_id: `run_${index + 1}`,
      user_id: `user_${(index % 7) + 1}`,
      blueprint_id: index % 2 === 0 ? `bp_${index + 1}` : null,
      source_scope: 'search_video_generate',
      source_tag: 'youtube_search_direct',
      video_id: `video_${index + 1}`,
      video_url: `https://youtube.com/watch?v=video_${index + 1}`,
      status: index === 1004 ? 'running' : 'succeeded',
      model_primary: 'gpt-5.2',
      model_used: 'gpt-5.2',
      fallback_used: false,
      fallback_model: null,
      reasoning_effort: 'low',
      quality_ok: index === 1004 ? null : true,
      quality_issues: [],
      quality_retries_used: 0,
      quality_final_mode: index === 1004 ? null : 'direct',
      trace_version: 'yt2bp_trace_v2',
      summary: { idx: index + 1 },
      error_code: null,
      error_message: null,
      started_at: new Date(Date.UTC(2026, 3, 3, 9, 10, 0, index)).toISOString(),
      finished_at: index === 1004 ? null : new Date(Date.UTC(2026, 3, 3, 9, 10, 5, index)).toISOString(),
      created_at: new Date(Date.UTC(2026, 3, 3, 9, 10, 0, index)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 3, 3, 9, 10, 5, index)).toISOString(),
    }));
    const db = createMockSupabase({
      source_item_blueprint_variants: variantRows,
      generation_runs: runRows,
    }) as any;

    try {
      const result = await syncOracleGenerationStateFromSupabase({
        controlDb,
        db,
        limit: 5000,
      });

      expect(result).toMatchObject({
        variantCount: 1005,
        variantActiveCount: 1,
        runCount: 1005,
        runActiveCount: 1,
      });

      const variantTail = await getOracleGenerationVariant({
        controlDb,
        sourceItemId: 'source_1005',
        generationTier: 'tier',
      });
      const runTail = await getOracleGenerationRunByRunId({
        controlDb,
        runId: 'run_1005',
      });

      expect(variantTail).toMatchObject({
        id: 'variant_1005',
        status: 'running',
        active_job_id: 'job_live',
      });
      expect(runTail).toMatchObject({
        run_id: 'run_1005',
        status: 'running',
        video_id: 'video_1005',
      });
    } finally {
      await controlDb.close();
    }
  }, 15_000);
});

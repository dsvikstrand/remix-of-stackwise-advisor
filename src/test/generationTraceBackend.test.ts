import { describe, expect, it } from 'vitest';
import {
  appendGenerationEvent,
  attachBlueprintToRun,
  finalizeGenerationRunFailure,
  finalizeGenerationRunSuccess,
  getGenerationRunByRunId,
  getLatestGenerationRunByBlueprintId,
  listGenerationRunEvents,
  startGenerationRun,
  updateGenerationModelInfo,
} from '../../server/services/generationTrace';
import { createMockSupabase } from './helpers/mockSupabase';

describe('generationTrace service', () => {
  it('creates and updates a generation run end-to-end', async () => {
    const db = createMockSupabase({
      generation_runs: [],
      generation_run_events: [],
    }) as any;

    await startGenerationRun(db, {
      runId: 'run_1',
      userId: 'user_1',
      sourceScope: 'search_video_generate',
      sourceTag: 'youtube_search_direct',
      videoId: 'abc123',
      videoUrl: 'https://youtube.com/watch?v=abc123',
      modelPrimary: 'gpt-5.2',
      reasoningEffort: 'medium',
      traceVersion: 'yt2bp_trace_v2',
    });

    await updateGenerationModelInfo(db, {
      runId: 'run_1',
      modelUsed: 'o4-mini',
      fallbackUsed: true,
      fallbackModel: 'o4-mini',
      reasoningEffort: 'medium',
    });
    await appendGenerationEvent(db, {
      runId: 'run_1',
      event: 'pipeline_started',
      payload: { phase: 'start' },
    });
    await attachBlueprintToRun(db, {
      runId: 'run_1',
      blueprintId: 'bp_1',
    });
    await finalizeGenerationRunSuccess(db, {
      runId: 'run_1',
      qualityOk: true,
      qualityIssues: [],
      qualityRetriesUsed: 1,
      qualityFinalMode: 'retry_pass',
      traceVersion: 'yt2bp_trace_v2',
      summary: { duration_ms: 1234 },
    });

    const run = await getGenerationRunByRunId(db, 'run_1');
    expect(run).toBeTruthy();
    expect(run?.status).toBe('succeeded');
    expect(run?.blueprint_id).toBe('bp_1');
    expect(run?.model_used).toBe('o4-mini');
    expect(run?.fallback_used).toBe(true);
    expect(run?.quality_final_mode).toBe('retry_pass');
  });

  it('stores sequenced events and paginates with cursor', async () => {
    const db = createMockSupabase({
      generation_runs: [],
      generation_run_events: [],
    }) as any;

    await startGenerationRun(db, { runId: 'run_2', userId: 'user_2' });
    for (let index = 0; index < 4; index += 1) {
      await appendGenerationEvent(db, {
        runId: 'run_2',
        event: `event_${index + 1}`,
        payload: { idx: index + 1 },
      });
    }

    const page1 = await listGenerationRunEvents(db, { runId: 'run_2', limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.items[0]?.event).toBe('event_4');
    expect(page1.items[1]?.event).toBe('event_3');
    expect(page1.next_cursor).toBeTruthy();

    const page2 = await listGenerationRunEvents(db, {
      runId: 'run_2',
      limit: 2,
      cursor: page1.next_cursor,
    });
    expect(page2.items.length).toBe(2);
    expect(page2.items[0]?.event).toBe('event_2');
    expect(page2.items[1]?.event).toBe('event_1');
  });

  it('keeps event sequencing stable for concurrent appends in the same run', async () => {
    const db = createMockSupabase({
      generation_runs: [],
      generation_run_events: [],
    }) as any;

    await startGenerationRun(db, { runId: 'run_concurrent', userId: 'user_concurrent' });
    await Promise.all([
      appendGenerationEvent(db, {
        runId: 'run_concurrent',
        event: 'event_a',
        payload: { idx: 'a' },
      }),
      appendGenerationEvent(db, {
        runId: 'run_concurrent',
        event: 'event_b',
        payload: { idx: 'b' },
      }),
      appendGenerationEvent(db, {
        runId: 'run_concurrent',
        event: 'event_c',
        payload: { idx: 'c' },
      }),
    ]);

    const page = await listGenerationRunEvents(db, { runId: 'run_concurrent', limit: 10 });
    expect(page.items.map((item) => item.seq)).toEqual([3, 2, 1]);
    expect(page.items.map((item) => item.event).sort()).toEqual(['event_a', 'event_b', 'event_c']);
  });

  it('finalizes failed run and exposes latest run by blueprint', async () => {
    const db = createMockSupabase({
      generation_runs: [],
      generation_run_events: [],
    }) as any;

    await startGenerationRun(db, { runId: 'run_3', userId: 'user_3' });
    await attachBlueprintToRun(db, { runId: 'run_3', blueprintId: 'bp_9' });
    await finalizeGenerationRunFailure(db, {
      runId: 'run_3',
      errorCode: 'GENERATION_FAIL',
      errorMessage: 'generation failed',
      summary: { stage: 'quality' },
      traceVersion: 'yt2bp_trace_v2',
    });

    const latest = await getLatestGenerationRunByBlueprintId(db, 'bp_9');
    expect(latest).toBeTruthy();
    expect(latest?.run_id).toBe('run_3');
    expect(latest?.status).toBe('failed');
    expect(latest?.error_code).toBe('GENERATION_FAIL');
  });
});

import { describe, expect, it } from 'vitest';
import {
  countQueueDepth,
  countQueueWorkItems,
  failIngestionJob,
  getQueuedJobWorkItemCount,
} from '../../server/services/ingestionQueue';
import { createMockSupabase } from './helpers/mockSupabase';

describe('ingestion queue work item counting', () => {
  it('filters queue depth by multiple scopes', async () => {
    const db = createMockSupabase({
      ingestion_jobs: [
        { id: 'job_1', scope: 'search_video_generate', status: 'queued', requested_by_user_id: 'user_1', payload: { items: [{}, {}] } },
        { id: 'job_2', scope: 'manual_refresh_selection', status: 'running', requested_by_user_id: 'user_1', payload: { items: [{}] } },
        { id: 'job_3', scope: 'blueprint_youtube_refresh', status: 'queued', requested_by_user_id: 'user_2', payload: null },
        { id: 'job_4', scope: 'all_active_subscriptions', status: 'queued', requested_by_user_id: null, payload: null },
      ],
    }) as any;

    await expect(countQueueDepth(db, {
      includeRunning: true,
      scopes: ['search_video_generate', 'manual_refresh_selection'],
    })).resolves.toBe(2);

    await expect(countQueueDepth(db, {
      statuses: ['queued'],
      scopes: ['blueprint_youtube_refresh', 'all_active_subscriptions'],
    })).resolves.toBe(2);

    await expect(countQueueDepth(db, {
      includeRunning: true,
      scopes: ['manual_refresh_selection', 'blueprint_youtube_refresh'],
      userId: 'user_1',
    })).resolves.toBe(1);
  });

  it('counts work items by queued scope', async () => {
    const db = createMockSupabase({
      ingestion_jobs: [
        { id: 'job_1', scope: 'search_video_generate', status: 'queued', requested_by_user_id: 'user_1', payload: { items: [{}, {}, {}] } },
        { id: 'job_2', scope: 'manual_refresh_selection', status: 'running', requested_by_user_id: 'user_1', payload: { items: [{}, {}] } },
        { id: 'job_3', scope: 'all_active_subscriptions', status: 'queued', requested_by_user_id: null, payload: null },
        { id: 'job_4', scope: 'blueprint_youtube_refresh', status: 'queued', requested_by_user_id: 'user_2', payload: null },
      ],
    }) as any;

    await expect(countQueueWorkItems(db, { statuses: ['queued'] })).resolves.toBe(5);
    await expect(countQueueWorkItems(db, { includeRunning: true })).resolves.toBe(7);
    await expect(countQueueWorkItems(db, { userId: 'user_1', includeRunning: true })).resolves.toBe(5);
    await expect(countQueueWorkItems(db, {
      includeRunning: true,
      scopes: ['manual_refresh_selection', 'blueprint_youtube_refresh'],
    })).resolves.toBe(3);
  });

  it('returns zero for unknown scopes and empty item payloads', () => {
    expect(getQueuedJobWorkItemCount({
      scope: 'unknown_scope',
      payload: { items: [{}, {}] },
    })).toBe(0);
    expect(getQueuedJobWorkItemCount({
      scope: 'search_video_generate',
      payload: { items: [] },
    })).toBe(0);
  });

  it('skips the attempts reread when a known attempt count is provided for failure transitions', async () => {
    const db = createMockSupabase({
      ingestion_jobs: [{
        id: 'job_fail_1',
        scope: 'search_video_generate',
        status: 'running',
        attempts: 2,
        max_attempts: 3,
        created_at: '2026-04-01T10:00:00.000Z',
        updated_at: '2026-04-01T10:00:00.000Z',
      }],
    }) as any;

    const originalFrom = db.from.bind(db);
    const selectCalls: string[] = [];
    db.from = (tableName: string) => {
      const query = originalFrom(tableName);
      const originalSelect = query.select.bind(query);
      query.select = (columns?: string, options?: { head?: boolean; count?: string }) => {
        selectCalls.push(String(columns || '*'));
        return originalSelect(columns, options);
      };
      return query;
    };

    const failedJob = await failIngestionJob(db, {
      jobId: 'job_fail_1',
      errorCode: 'TRANSIENT_ERROR',
      errorMessage: 'retry me',
      scheduleRetryInSeconds: 60,
      maxAttempts: 3,
      currentAttempts: 2,
    });

    expect(selectCalls).not.toContain('id, attempts');
    expect(failedJob).toMatchObject({
      id: 'job_fail_1',
      status: 'queued',
      error_code: 'TRANSIENT_ERROR',
    });
  });
});

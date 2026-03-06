import { describe, expect, it } from 'vitest';
import {
  countQueueWorkItems,
  getQueuedJobWorkItemCount,
} from '../../server/services/ingestionQueue';
import { createMockSupabase } from './helpers/mockSupabase';

describe('ingestion queue work item counting', () => {
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
});

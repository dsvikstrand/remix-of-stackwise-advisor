import { describe, expect, it } from 'vitest';
import { sortActiveIngestionJobs } from '@/hooks/useGenerationQueue';
import {
  getGenerationQueueScopeLabel,
  getQueueFilterForScope,
  getRetryPathForScope,
  matchesGenerationQueueFilter,
} from '@/lib/generationQueueLabels';
import type { ActiveIngestionJob } from '@/lib/subscriptionsApi';

function makeJob(input: Partial<ActiveIngestionJob> & Pick<ActiveIngestionJob, 'job_id' | 'status' | 'scope'>): ActiveIngestionJob {
  return {
    job_id: input.job_id,
    scope: input.scope,
    trigger: input.trigger || 'manual',
    status: input.status,
    created_at: input.created_at || '2026-03-01T10:00:00.000Z',
    started_at: input.started_at || null,
    next_run_at: input.next_run_at || null,
    processed_count: input.processed_count || 0,
    inserted_count: input.inserted_count || 0,
    skipped_count: input.skipped_count || 0,
    attempts: input.attempts || 0,
    max_attempts: input.max_attempts || 3,
    error_code: input.error_code || null,
    error_message: input.error_message || null,
    queue_position: input.queue_position ?? null,
    queue_ahead_count: input.queue_ahead_count ?? null,
    estimated_start_seconds: input.estimated_start_seconds ?? null,
    is_position_estimate: input.is_position_estimate ?? true,
  };
}

describe('generation queue UI logic', () => {
  it('sorts running first, then queued by queue position, then newest created_at', () => {
    const jobs: ActiveIngestionJob[] = [
      makeJob({
        job_id: 'queued_3',
        status: 'queued',
        scope: 'search_video_generate',
        queue_position: 3,
        created_at: '2026-03-01T10:03:00.000Z',
      }),
      makeJob({
        job_id: 'running_1',
        status: 'running',
        scope: 'manual_refresh_selection',
        created_at: '2026-03-01T10:02:00.000Z',
      }),
      makeJob({
        job_id: 'queued_1',
        status: 'queued',
        scope: 'source_item_unlock_generation',
        queue_position: 1,
        created_at: '2026-03-01T10:04:00.000Z',
      }),
      makeJob({
        job_id: 'queued_unknown',
        status: 'queued',
        scope: 'source_item_unlock_generation',
        queue_position: null,
        created_at: '2026-03-01T10:05:00.000Z',
      }),
    ];

    const sortedIds = sortActiveIngestionJobs(jobs).map((job) => job.job_id);
    expect(sortedIds).toEqual(['running_1', 'queued_1', 'queued_3', 'queued_unknown']);
  });

  it('maps scope labels, filters, and retry paths', () => {
    expect(getGenerationQueueScopeLabel('source_item_unlock_generation')).toBe('Source unlock');
    expect(getQueueFilterForScope('search_video_generate')).toBe('search_generate');
    expect(matchesGenerationQueueFilter('refresh_generate', 'manual_refresh_selection')).toBe(true);
    expect(matchesGenerationQueueFilter('source_unlock', 'search_video_generate')).toBe(false);
    expect(getRetryPathForScope('search_video_generate')).toBe('/search');
  });
});


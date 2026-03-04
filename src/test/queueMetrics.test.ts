import { describe, expect, it } from 'vitest';
import { parseQueueMetricsFromLogText } from '../../server/services/queueMetrics';

describe('queue metrics parser', () => {
  it('parses finished durations, failures, scope buckets, and throughput', () => {
    const raw = [
      'Mar  4 12:00:00 host app[1]: [unlock_job_finished] {"scope":"search_video_generate","duration_ms":1000}',
      'Mar  4 12:01:00 host app[1]: [unlock_job_finished] {"scope":"search_video_generate","duration_ms":3000}',
      'Mar  4 12:02:00 host app[1]: [unlock_job_failed] {"scope":"source_item_unlock","error_code":"TRANSCRIPT_FAILED"}',
    ].join('\n');

    const metrics = parseQueueMetricsFromLogText(raw);

    expect(metrics).toMatchObject({
      finished_count: 2,
      failed_count: 1,
      duration_median_ms: 2000,
      duration_p95_ms: 3000,
      duration_max_ms: 3000,
      error_code_distribution: {
        TRANSCRIPT_FAILED: 1,
      },
      scope_distribution: {
        search_video_generate: 2,
        source_item_unlock: 1,
      },
    });
    expect(metrics.jobs_per_minute_estimate).toBeCloseTo(1.5, 5);
  });

  it('accepts failed events without error_code and buckets them as UNKNOWN', () => {
    const raw = 'Mar  4 12:00:00 host app[1]: [unlock_job_failed] {"scope":"source_item_unlock"}';
    const metrics = parseQueueMetricsFromLogText(raw);
    expect(metrics.error_code_distribution).toEqual({ UNKNOWN: 1 });
  });

  it('returns null duration metrics when there are no finished jobs', () => {
    const raw = 'Mar  4 12:00:00 host app[1]: [unlock_job_failed] {"scope":"source_item_unlock","error_code":"OOPS"}';
    const metrics = parseQueueMetricsFromLogText(raw);
    expect(metrics.finished_count).toBe(0);
    expect(metrics.duration_median_ms).toBeNull();
    expect(metrics.duration_p95_ms).toBeNull();
    expect(metrics.duration_max_ms).toBeNull();
  });

  it('returns null jobs per minute when timestamps are insufficient', () => {
    const raw = [
      '[unlock_job_finished] {"scope":"search_video_generate","duration_ms":1000}',
      '[unlock_job_finished] {"scope":"search_video_generate","duration_ms":2000}',
    ].join('\n');
    const metrics = parseQueueMetricsFromLogText(raw);
    expect(metrics.jobs_per_minute_estimate).toBeNull();
  });
});

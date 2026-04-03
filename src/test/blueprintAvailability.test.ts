import { describe, expect, it } from 'vitest';
import { getBlueprintAvailabilityForVideo } from '../../server/services/blueprintAvailability';
import { createMockSupabase } from './helpers/mockSupabase';

describe('blueprint availability', () => {
  it('treats transcript insufficient context failures as cooldown-active', async () => {
    const nowIso = new Date().toISOString();
    const db = createMockSupabase({
      source_items: [
        { id: 'source_1', source_native_id: 'video_short' },
      ],
      source_item_unlocks: [
        {
          source_item_id: 'source_1',
          updated_at: nowIso,
          last_error_code: 'TRANSCRIPT_INSUFFICIENT_CONTEXT',
          last_error_message: 'This video has very limited speech.',
        },
      ],
      generation_runs: [],
    }) as any;

    const result = await getBlueprintAvailabilityForVideo(db, 'video_short');

    expect(result).toMatchObject({
      status: 'cooldown_active',
      videoId: 'video_short',
      failureSource: 'source_item_unlocks',
      lastErrorCode: 'TRANSCRIPT_INSUFFICIENT_CONTEXT',
      lastErrorMessage: 'This video has very limited speech.',
    });
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('supports Oracle-first source and unlock readers without direct source_items reads', async () => {
    const db = createMockSupabase({
      source_items: [],
      source_item_unlocks: [],
      generation_runs: [],
    }) as any;

    const result = await getBlueprintAvailabilityForVideo(db, 'video_short', {
      listSourceItemsByVideoId: async (videoId) => (
        videoId === 'video_short'
          ? [{ id: 'source_1' }]
          : []
      ),
      listUnlockRowsBySourceItemIds: async (sourceItemIds) => (
        sourceItemIds.includes('source_1')
          ? [{
            updated_at: new Date().toISOString(),
            last_error_code: 'TRANSCRIPT_INSUFFICIENT_CONTEXT',
            last_error_message: 'This video has very limited speech.',
          }]
          : []
      ),
    });

    expect(result).toMatchObject({
      status: 'cooldown_active',
      videoId: 'video_short',
      failureSource: 'source_item_unlocks',
      lastErrorCode: 'TRANSCRIPT_INSUFFICIENT_CONTEXT',
    });
  });

  it('supports Oracle-first failed generation-run readers without direct generation_runs reads', async () => {
    const db = createMockSupabase({
      source_items: [],
      source_item_unlocks: [],
      generation_runs: [],
    }) as any;

    const result = await getBlueprintAvailabilityForVideo(db, 'video_failed', {
      listSourceItemsByVideoId: async () => [],
      listFailedGenerationRunsByVideoId: async (videoId) => (
        videoId === 'video_failed'
          ? [{
            updated_at: new Date().toISOString(),
            error_code: 'TRANSCRIPT_INSUFFICIENT_CONTEXT',
            error_message: 'Transcript too short for generation.',
          }]
          : []
      ),
    });

    expect(result).toMatchObject({
      status: 'cooldown_active',
      videoId: 'video_failed',
      failureSource: 'generation_runs',
      lastErrorCode: 'TRANSCRIPT_INSUFFICIENT_CONTEXT',
      lastErrorMessage: 'Transcript too short for generation.',
    });
  });
});

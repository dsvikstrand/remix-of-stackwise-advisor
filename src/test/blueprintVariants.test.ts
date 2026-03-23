import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlueprintVariantsService } from '../../server/services/blueprintVariants';
import { createMockSupabase } from './helpers/mockSupabase';

describe('blueprintVariants service', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reclaims a stale running variant with no active job and assigns the new queue job', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T16:00:00.000Z'));

    const db = createMockSupabase({
      source_item_blueprint_variants: [
        {
          id: 'variant_1',
          source_item_id: 'source_1',
          generation_tier: 'tier',
          status: 'running',
          blueprint_id: null,
          active_job_id: null,
          last_error_code: null,
          last_error_message: null,
          created_by_user_id: 'user_old',
          created_at: '2026-03-23T14:00:00.000Z',
          updated_at: '2026-03-23T15:00:00.000Z',
        },
      ],
      ingestion_jobs: [],
    }) as any;

    const service = createBlueprintVariantsService({
      getServiceSupabaseClient: () => db,
    });

    const result = await service.claimVariantForGeneration({
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
      },
    });
    expect(db.state.source_item_blueprint_variants[0]).toMatchObject({
      status: 'running',
      active_job_id: 'job_new',
      created_by_user_id: 'user_new',
      last_error_code: null,
      last_error_message: null,
    });
  });

  it('keeps a fresh running variant in progress when its active job is still live', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T16:00:00.000Z'));

    const db = createMockSupabase({
      source_item_blueprint_variants: [
        {
          id: 'variant_live',
          source_item_id: 'source_live',
          generation_tier: 'tier',
          status: 'running',
          blueprint_id: null,
          active_job_id: 'job_live',
          last_error_code: null,
          last_error_message: null,
          created_by_user_id: 'user_live',
          created_at: '2026-03-23T15:20:00.000Z',
          updated_at: '2026-03-23T15:55:00.000Z',
        },
      ],
      ingestion_jobs: [
        {
          id: 'job_live',
          status: 'running',
          lease_expires_at: '2026-03-23T16:01:30.000Z',
          updated_at: '2026-03-23T15:59:00.000Z',
        },
      ],
    }) as any;

    const service = createBlueprintVariantsService({
      getServiceSupabaseClient: () => db,
    });

    const result = await service.claimVariantForGeneration({
      sourceItemId: 'source_live',
      generationTier: 'tier',
      userId: 'user_new',
      jobId: 'job_new',
      targetStatus: 'running',
    });

    expect(result).toMatchObject({
      outcome: 'in_progress',
      variant: {
        source_item_id: 'source_live',
        status: 'running',
        active_job_id: 'job_live',
      },
    });
    expect(db.state.source_item_blueprint_variants[0]).toMatchObject({
      status: 'running',
      active_job_id: 'job_live',
      created_by_user_id: 'user_live',
    });
  });
});

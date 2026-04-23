import { describe, expect, it, vi } from 'vitest';
import { createBlueprintCreationService } from '../../server/services/blueprintCreation';
import type { BlueprintSectionsV1 } from '../../server/services/blueprintSections';

function createDbMock(input?: {
  blueprintInsertError?: { message?: string; details?: string; hint?: string } | null;
}) {
  let insertedBlueprintPayload: Record<string, unknown> | null = null;
  let blueprintInsertCount = 0;
  let sourceItemSelectCount = 0;

  const db = {
    from(table: string) {
      if (table === 'blueprints') {
        return {
          insert(payload: Record<string, unknown>) {
            insertedBlueprintPayload = payload;
            blueprintInsertCount += 1;
            return {
              select() {
                return {
                  single: async () => ({
                    data: input?.blueprintInsertError ? null : { id: 'bp_123' },
                    error: input?.blueprintInsertError || null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === 'blueprint_tags') {
        return {
          upsert: async () => ({ error: null }),
        };
      }

      if (table === 'source_items') {
        return {
          select() {
            sourceItemSelectCount += 1;
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: null,
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return {
    db,
    getInsertedBlueprintPayload: () => insertedBlueprintPayload,
    getBlueprintInsertCount: () => blueprintInsertCount,
    getSourceItemSelectCount: () => sourceItemSelectCount,
  };
}

describe('blueprint creation canonical payload', () => {
  it('writes schema content without legacy selected_items payload', async () => {
    const { db, getInsertedBlueprintPayload } = createDbMock();
    const enqueueBlueprintYouTubeEnrichment = vi.fn(async () => undefined);
    const registerBlueprintYouTubeRefreshState = vi.fn(async () => undefined);
    const service = createBlueprintCreationService({
      getServiceSupabaseClient: () => null,
      safeGenerationTraceWrite: async () => undefined,
      startGenerationRun: async () => undefined,
      runYouTubePipeline: async ({ runId }) => ({
        run_id: runId,
        draft: {
          title: 'Blueprint title',
          description: 'A short summary for testing.',
          steps: [
            { name: 'Summary', notes: 'Step notes', timestamp: null },
          ],
          notes: null,
          tags: [],
          sectionsJson: {
            schema_version: 'blueprint_sections_v1',
            tags: [],
            summary: { text: 'A short summary for testing.' },
            takeaways: { bullets: ['One useful takeaway.'] },
            storyline: { text: 'A short storyline block.' },
            deep_dive: { bullets: ['A deep dive detail.'] },
            practical_rules: { bullets: ['A practical rule.'] },
            open_questions: { bullets: ['An open question.'] },
          } satisfies BlueprintSectionsV1,
          summaryVariants: {
            default: 'Default summary',
            eli5: 'ELI5 summary',
          },
          eli5Steps: [],
        },
        review: {
          summary: null,
        },
        meta: {
          bp_trace_version: 'yt2bp_trace_v2',
          transcript_transport: {
            provider: 'videotranscriber_temp',
            proxy_enabled: true,
            proxy_mode: 'webshare_explicit',
            proxy_selector: 'explicit',
            proxy_selected_index: null,
            proxy_host: 'p.webshare.io',
          },
        },
      }),
      toTagSlug: (value) => value,
      ensureTagId: async () => 'tag_123',
      attachBlueprintToRun: async () => undefined,
      youtubeVideoIdRegex: /^[a-zA-Z0-9_-]{11}$/,
      resolveGenerationModelProfile: () => ({
        model: 'o4-mini',
        fallbackModel: 'o4-mini',
        reasoningEffort: 'low' as const,
      }),
      claimVariantForGeneration: vi.fn(),
      markVariantReady: async () => undefined,
      markVariantFailed: async () => undefined,
      enqueueBlueprintYouTubeEnrichment,
      registerBlueprintYouTubeRefreshState,
    });

    const result = await service.createBlueprintFromVideo(db as never, {
      userId: 'user_123',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
      sourceTag: 'manual_refresh_generate',
    });

    const insertedPayload = getInsertedBlueprintPayload();
    expect(result.blueprintId).toBe('bp_123');
    expect(insertedPayload?.steps).toBeUndefined();
    expect(insertedPayload?.selected_items).toBeUndefined();
    expect(insertedPayload?.sections_json).toEqual({
      schema_version: 'blueprint_sections_v1',
      tags: [],
      summary: { text: 'A short summary for testing.' },
      takeaways: { bullets: ['One useful takeaway.'] },
      storyline: { text: 'A short storyline block.' },
      deep_dive: { bullets: ['A deep dive detail.'] },
      practical_rules: { bullets: ['A practical rule.'] },
      open_questions: { bullets: ['An open question.'] },
    });
    expect(insertedPayload?.preview_summary).toBe('A short summary for testing.');
    expect(enqueueBlueprintYouTubeEnrichment).toHaveBeenCalledWith({
      blueprintId: 'bp_123',
      db,
      traceDb: null,
      runId: result.runId,
      explicitVideoId: 'dQw4w9WgXcQ',
      explicitSourceItemId: null,
    });
    expect(registerBlueprintYouTubeRefreshState).toHaveBeenCalledWith({
      blueprintId: 'bp_123',
      db,
      runId: result.runId,
      explicitVideoId: 'dQw4w9WgXcQ',
      explicitSourceItemId: null,
    });
  });

  it('does not fail blueprint creation when YouTube metadata follow-up hooks fail', async () => {
    const { db } = createDbMock();
    const service = createBlueprintCreationService({
      getServiceSupabaseClient: () => null,
      safeGenerationTraceWrite: async () => undefined,
      startGenerationRun: async () => undefined,
      runYouTubePipeline: async ({ runId }) => ({
        run_id: runId,
        draft: {
          title: 'Blueprint title',
          description: 'A short summary for testing.',
          steps: [
            { name: 'Summary', notes: 'Step notes', timestamp: null },
          ],
          notes: null,
          tags: [],
          sectionsJson: {
            schema_version: 'blueprint_sections_v1',
            tags: [],
            summary: { text: 'A short summary for testing.' },
            takeaways: { bullets: ['One useful takeaway.'] },
            storyline: { text: 'A short storyline block.' },
            deep_dive: { bullets: ['A deep dive detail.'] },
            practical_rules: { bullets: ['A practical rule.'] },
            open_questions: { bullets: ['An open question.'] },
          } satisfies BlueprintSectionsV1,
          summaryVariants: {
            default: 'Default summary',
            eli5: 'ELI5 summary',
          },
          eli5Steps: [],
        },
        review: {
          summary: null,
        },
        meta: null,
      }),
      toTagSlug: (value) => value,
      ensureTagId: async () => 'tag_123',
      attachBlueprintToRun: async () => undefined,
      youtubeVideoIdRegex: /^[a-zA-Z0-9_-]{11}$/,
      resolveGenerationModelProfile: () => ({
        model: 'o4-mini',
        fallbackModel: 'o4-mini',
        reasoningEffort: 'low' as const,
      }),
      claimVariantForGeneration: vi.fn(),
      markVariantReady: async () => undefined,
      markVariantFailed: async () => undefined,
      enqueueBlueprintYouTubeEnrichment: async () => {
        throw new Error('fetch failed');
      },
      registerBlueprintYouTubeRefreshState: async () => {
        throw new Error('refresh register failed');
      },
    });

    const result = await service.createBlueprintFromVideo(db as never, {
      userId: 'user_123',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
      sourceTag: 'manual_refresh_generate',
    });

    expect(result.blueprintId).toBe('bp_123');
  });

  it('uses the injected source-item reader instead of direct source_items reads', async () => {
    const { db, getSourceItemSelectCount, getInsertedBlueprintPayload } = createDbMock();
    const getSourceItemById = vi.fn(async () => ({
      thumbnail_url: 'https://cdn.example.com/source-thumb.jpg',
      title: 'Oracle source title',
    }));
    const service = createBlueprintCreationService({
      getServiceSupabaseClient: () => null,
      safeGenerationTraceWrite: async () => undefined,
      startGenerationRun: async () => undefined,
      runYouTubePipeline: async ({ runId }) => ({
        run_id: runId,
        draft: {
          title: 'Blueprint title',
          description: 'A short summary for testing.',
          steps: [
            { name: 'Summary', notes: 'Step notes', timestamp: null },
          ],
          notes: null,
          tags: [],
          sectionsJson: {
            schema_version: 'blueprint_sections_v1',
            tags: [],
            summary: { text: 'A short summary for testing.' },
            takeaways: { bullets: ['One useful takeaway.'] },
            storyline: { text: 'A short storyline block.' },
            deep_dive: { bullets: ['A deep dive detail.'] },
            practical_rules: { bullets: ['A practical rule.'] },
            open_questions: { bullets: ['An open question.'] },
          } satisfies BlueprintSectionsV1,
          summaryVariants: {
            default: 'Default summary',
            eli5: 'ELI5 summary',
          },
          eli5Steps: [],
        },
        review: {
          summary: null,
        },
        meta: null,
      }),
      toTagSlug: (value) => value,
      ensureTagId: async () => 'tag_123',
      getSourceItemById,
      attachBlueprintToRun: async () => undefined,
      youtubeVideoIdRegex: /^[a-zA-Z0-9_-]{11}$/,
      resolveGenerationModelProfile: () => ({
        model: 'o4-mini',
        fallbackModel: 'o4-mini',
        reasoningEffort: 'low' as const,
      }),
      claimVariantForGeneration: vi.fn(async () => ({ outcome: 'claimed', variant: null })),
      markVariantReady: async () => undefined,
      markVariantFailed: async () => undefined,
    });

    await service.createBlueprintFromVideo(db as never, {
      userId: 'user_123',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
      videoTitle: null,
      sourceTag: 'manual_refresh_generate',
      sourceItemId: 'source_123',
    });

    expect(getSourceItemById).toHaveBeenCalledWith(db, {
      sourceItemId: 'source_123',
    });
    expect(getSourceItemSelectCount()).toBe(0);
    expect(getInsertedBlueprintPayload()?.banner_url).toBe('https://cdn.example.com/source-thumb.jpg');
  });

  it('passes queue job ownership into variant claims when provided', async () => {
    const { db } = createDbMock();
    const claimVariantForGeneration = vi.fn(async () => ({
      outcome: 'claimed' as const,
      variant: { active_job_id: 'job_123' },
    }));
    const service = createBlueprintCreationService({
      getServiceSupabaseClient: () => null,
      safeGenerationTraceWrite: async () => undefined,
      startGenerationRun: async () => undefined,
      runYouTubePipeline: async ({ runId }) => ({
        run_id: runId,
        draft: {
          title: 'Blueprint title',
          description: 'A short summary for testing.',
          steps: [{ name: 'Summary', notes: 'Step notes', timestamp: null }],
          notes: null,
          tags: [],
          sectionsJson: {
            schema_version: 'blueprint_sections_v1',
            tags: [],
            summary: { text: 'A short summary for testing.' },
            takeaways: { bullets: ['One useful takeaway.'] },
            storyline: { text: 'A short storyline block.' },
            deep_dive: { bullets: ['A deep dive detail.'] },
            practical_rules: { bullets: ['A practical rule.'] },
            open_questions: { bullets: ['An open question.'] },
          } satisfies BlueprintSectionsV1,
          summaryVariants: {
            default: 'Default summary',
            eli5: 'ELI5 summary',
          },
          eli5Steps: [],
        },
        review: { summary: null },
        meta: null,
      }),
      toTagSlug: (value) => value,
      ensureTagId: async () => 'tag_123',
      attachBlueprintToRun: async () => undefined,
      youtubeVideoIdRegex: /^[a-zA-Z0-9_-]{11}$/,
      resolveGenerationModelProfile: () => ({
        model: 'o4-mini',
        fallbackModel: 'o4-mini',
        reasoningEffort: 'low' as const,
      }),
      claimVariantForGeneration,
      markVariantReady: async () => undefined,
      markVariantFailed: async () => undefined,
      enqueueBlueprintYouTubeEnrichment: async () => undefined,
      registerBlueprintYouTubeRefreshState: async () => undefined,
    });

    await service.createBlueprintFromVideo(db as never, {
      userId: 'user_123',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
      sourceTag: 'source_page_video_library',
      sourceItemId: 'source_123',
      jobId: 'job_123',
    });

    expect(claimVariantForGeneration).toHaveBeenCalledWith(expect.objectContaining({
      sourceItemId: 'source_123',
      userId: 'user_123',
      jobId: 'job_123',
      targetStatus: 'running',
    }));
  });

  it('rethrows daily generation cap errors without masking them behind a reference error', async () => {
    const { db } = createDbMock();
    const service = createBlueprintCreationService({
      getServiceSupabaseClient: () => null,
      safeGenerationTraceWrite: async () => undefined,
      startGenerationRun: async () => undefined,
      runYouTubePipeline: async () => {
        const error = new Error('Daily generation cap reached.');
        (error as Error & { code?: string }).code = 'DAILY_GENERATION_CAP_REACHED';
        throw error;
      },
      toTagSlug: (value) => value,
      ensureTagId: async () => 'tag_123',
      attachBlueprintToRun: async () => undefined,
      youtubeVideoIdRegex: /^[a-zA-Z0-9_-]{11}$/,
      resolveGenerationModelProfile: () => ({
        model: 'o4-mini',
        fallbackModel: 'o4-mini',
        reasoningEffort: 'low' as const,
      }),
      claimVariantForGeneration: vi.fn(),
      markVariantReady: async () => undefined,
      markVariantFailed: async () => undefined,
      enqueueBlueprintYouTubeEnrichment: async () => undefined,
      registerBlueprintYouTubeRefreshState: async () => undefined,
    });

    await expect(service.createBlueprintFromVideo(db as never, {
      userId: 'user_123',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
      sourceTag: 'manual_refresh_generate',
    })).rejects.toMatchObject({
      code: 'DAILY_GENERATION_CAP_REACHED',
      message: 'Daily generation cap reached.',
    });
  });

  it('fails explicitly when the current YT2BP draft reaches persistence without sections_json', async () => {
    const { db, getInsertedBlueprintPayload } = createDbMock();
    const service = createBlueprintCreationService({
      getServiceSupabaseClient: () => null,
      safeGenerationTraceWrite: async () => undefined,
      startGenerationRun: async () => undefined,
      runYouTubePipeline: async ({ runId }) => ({
        run_id: runId,
        draft: {
          title: 'Blueprint title',
          description: 'A short summary for testing.',
          steps: [
            { name: 'Summary', notes: 'Step notes', timestamp: null },
          ],
          notes: null,
          tags: [],
          sectionsJson: null,
          summaryVariants: {
            default: 'Default summary',
            eli5: 'ELI5 summary',
          },
          eli5Steps: [],
        },
        review: {
          summary: null,
        },
        meta: null,
      }),
      toTagSlug: (value) => value,
      ensureTagId: async () => 'tag_123',
      attachBlueprintToRun: async () => undefined,
      youtubeVideoIdRegex: /^[a-zA-Z0-9_-]{11}$/,
      resolveGenerationModelProfile: () => ({
        model: 'o4-mini',
        fallbackModel: 'o4-mini',
        reasoningEffort: 'low' as const,
      }),
      claimVariantForGeneration: vi.fn(),
      markVariantReady: async () => undefined,
      markVariantFailed: async () => undefined,
      enqueueBlueprintYouTubeEnrichment: async () => undefined,
      registerBlueprintYouTubeRefreshState: async () => undefined,
    });

    await expect(service.createBlueprintFromVideo(db as never, {
      userId: 'user_123',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
      sourceTag: 'manual_refresh_generate',
    })).rejects.toMatchObject({
      code: 'CANONICAL_SECTIONS_REQUIRED',
      message: 'Current YT2BP persistence requires canonical sections_json.',
    });

    expect(getInsertedBlueprintPayload()).toBeNull();
  });

  it('fails explicitly instead of falling back to legacy steps storage when sections_json column is missing', async () => {
    const { db, getInsertedBlueprintPayload, getBlueprintInsertCount } = createDbMock({
      blueprintInsertError: {
        message: 'column "sections_json" of relation "blueprints" does not exist',
      },
    });
    const service = createBlueprintCreationService({
      getServiceSupabaseClient: () => null,
      safeGenerationTraceWrite: async () => undefined,
      startGenerationRun: async () => undefined,
      runYouTubePipeline: async ({ runId }) => ({
        run_id: runId,
        draft: {
          title: 'Blueprint title',
          description: 'A short summary for testing.',
          steps: [
            { name: 'Summary', notes: 'Step notes', timestamp: null },
          ],
          notes: null,
          tags: [],
          sectionsJson: {
            schema_version: 'blueprint_sections_v1',
            tags: [],
            summary: { text: 'A short summary for testing.' },
            takeaways: { bullets: ['One useful takeaway.'] },
            storyline: { text: 'A short storyline block.' },
            deep_dive: { bullets: ['A deep dive detail.'] },
            practical_rules: { bullets: ['A practical rule.'] },
            open_questions: { bullets: ['An open question.'] },
          } satisfies BlueprintSectionsV1,
          summaryVariants: {
            default: 'Default summary',
            eli5: 'ELI5 summary',
          },
          eli5Steps: [],
        },
        review: {
          summary: null,
        },
        meta: null,
      }),
      toTagSlug: (value) => value,
      ensureTagId: async () => 'tag_123',
      attachBlueprintToRun: async () => undefined,
      youtubeVideoIdRegex: /^[a-zA-Z0-9_-]{11}$/,
      resolveGenerationModelProfile: () => ({
        model: 'o4-mini',
        fallbackModel: 'o4-mini',
        reasoningEffort: 'low' as const,
      }),
      claimVariantForGeneration: vi.fn(),
      markVariantReady: async () => undefined,
      markVariantFailed: async () => undefined,
      enqueueBlueprintYouTubeEnrichment: async () => undefined,
      registerBlueprintYouTubeRefreshState: async () => undefined,
    });

    await expect(service.createBlueprintFromVideo(db as never, {
      userId: 'user_123',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
      sourceTag: 'manual_refresh_generate',
    })).rejects.toMatchObject({
      code: 'SECTIONS_JSON_COLUMN_REQUIRED',
      message: 'blueprints.sections_json is required for current YT2BP writes.',
    });

    expect(getBlueprintInsertCount()).toBe(1);
    expect(getInsertedBlueprintPayload()).toMatchObject({
      sections_json: {
        schema_version: 'blueprint_sections_v1',
      },
    });
    expect(getInsertedBlueprintPayload()?.steps).toBeUndefined();
  });
});

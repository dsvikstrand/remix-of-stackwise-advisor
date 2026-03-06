import { describe, expect, it, vi } from 'vitest';
import { createBlueprintCreationService } from '../../server/services/blueprintCreation';
import type { BlueprintSectionsV1 } from '../../server/services/blueprintSections';

function createDbMock() {
  let insertedBlueprintPayload: Record<string, unknown> | null = null;

  const db = {
    from(table: string) {
      if (table === 'blueprints') {
        return {
          insert(payload: Record<string, unknown>) {
            insertedBlueprintPayload = payload;
            return {
              select() {
                return {
                  single: async () => ({
                    data: { id: 'bp_123' },
                    error: null,
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

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return {
    db,
    getInsertedBlueprintPayload: () => insertedBlueprintPayload,
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
            provider: 'yt_to_text',
            proxy_enabled: true,
            proxy_mode: 'webshare_index',
            proxy_selector: 'rand',
            proxy_selected_index: 4,
            proxy_host: '10.0.0.5',
          },
        },
      }),
      toTagSlug: (value) => value,
      mapDraftStepsForBlueprint: (steps) => steps as unknown[],
      normalizeSummaryVariantText: (value) => value,
      yt2bpOutputMode: 'llm_native',
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
      mapDraftStepsForBlueprint: (steps) => steps as unknown[],
      normalizeSummaryVariantText: (value) => value,
      yt2bpOutputMode: 'llm_native',
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
      mapDraftStepsForBlueprint: (steps) => steps as unknown[],
      normalizeSummaryVariantText: (value) => value,
      yt2bpOutputMode: 'llm_native',
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
});

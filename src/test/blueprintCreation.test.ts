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
  });
});

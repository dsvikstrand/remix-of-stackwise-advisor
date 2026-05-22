import { describe, expect, it, vi } from 'vitest';
import {
  generateOutreachDrafts,
  OutreachDraftError,
  validateOutreachPostText,
  type OutreachDraftContext,
  type OutreachDraftStateStore,
} from '../../server/services/outreachDrafts';

const context: OutreachDraftContext = {
  blueprintId: 'bp_1',
  sourceItemId: 'source_1',
  youtubeVideoId: 'abc123xyz89',
  videoUrl: 'https://www.youtube.com/watch?v=abc123xyz89',
  videoTitle: 'How to learn faster',
  sourceChannelId: 'UC_test',
  sourceChannelTitle: 'Learning Creator',
  blueprintTitle: 'How to learn faster',
  blueprintSummary: 'The video explains retrieval practice and focused review.',
  blueprintReview: 'Use retrieval practice before rereading notes.',
  blueprintSectionsJson: {
    takeaways: { bullets: ['Retrieval practice beats passive review.', 'Short sessions are easier to repeat.'] },
  },
  tags: ['learning'],
};

function createStore(overrides?: Partial<OutreachDraftStateStore>): OutreachDraftStateStore {
  return {
    listRecentDrafts: vi.fn(async () => []),
    getDraftOption: vi.fn(async () => null),
    insertDraftOptions: vi.fn(async ({ rows }) => rows.map((row) => ({ id: row.id }))),
    markDraftPosting: vi.fn(async () => true),
    markDraftPosted: vi.fn(async () => true),
    markDraftPostFailed: vi.fn(async () => true),
    ...overrides,
  };
}

describe('outreach draft generation service', () => {
  it('generates three validated copy-only drafts and stores them', async () => {
    let seq = 0;
    const store = createStore();
    const result = await generateOutreachDrafts({
      adminUserId: 'admin_1',
      blueprintId: 'bp_1',
      now: new Date('2026-05-17T08:00:00.000Z'),
      randomUUID: () => `id_${++seq}`,
      resolveContext: async () => context,
      stateStore: store,
      llm: {
        generateVideoOpeners: vi.fn(async () => ({
          model: 'gpt-5.5-mini',
          reasoningEffort: 'medium',
          rawText: JSON.stringify({
            openers: [
              'The useful part for me was the distinction between retrieval practice and just rereading notes.',
              'Finally, a video that makes review loops sound less like homework and more like a cheat code 🙂',
              'The takeaway that stood out was making recall active instead of waiting until you feel ready.\n\nThat makes learning feel more like a repeatable system than a motivation problem.',
            ],
          }),
          openers: [],
        })),
      },
    });

    expect(result.options).toHaveLength(3);
    expect(result.options.map((option) => option.roleLabel)).toEqual([
      'Short insight',
      'Light/funny',
      'Thoughtful',
    ]);
    expect(result.promoVariants.length).toBeGreaterThanOrEqual(3);
    expect(result.sourceChannelSubscriberCount).toBeNull();
    expect(result.options[0].finalText).toBe('The useful part for me was the distinction between retrieval practice and just rereading notes.');
    expect(result.options[1].finalText).toContain('🙂');
    expect(result.options[2].finalText).toContain('\n\n');
    expect(result.options[0].finalText).not.toContain('BLEUP');
    expect(result.promoVariants[0].text).toContain('BLEUP');
    expect(result.promoVariants[0].text).toContain('personal learning feed');
    expect(store.insertDraftOptions).toHaveBeenCalledWith(expect.objectContaining({
      rows: expect.arrayContaining([
        expect.objectContaining({
          draft_group_id: 'id_1',
          blueprint_id: 'bp_1',
          youtube_video_id: 'abc123xyz89',
          status: 'drafted',
        }),
      ]),
    }));
  });

  it('allows posting regular-only warm-up comments', () => {
    expect(validateOutreachPostText(
      'The useful part for me was the distinction between retrieval practice and just rereading notes.',
    )).toMatchObject({
      ok: true,
    });
  });

  it('still blocks direct links in edited outreach comments', () => {
    expect(validateOutreachPostText(
      'The useful part was clear. Visit https://bleup.app for more info.',
    )).toMatchObject({
      ok: false,
      issues: ['direct_link_not_allowed'],
    });
  });

  it('blocks draft generation below the configured creator subscriber threshold', async () => {
    await expect(generateOutreachDrafts({
      adminUserId: 'admin_1',
      blueprintId: 'bp_1',
      now: new Date('2026-05-17T08:00:00.000Z'),
      randomUUID: () => 'id_1',
      resolveContext: async () => context,
      resolveChannelStats: vi.fn(async () => ({
        subscriberCount: 9999,
      })),
      minCreatorSubscribers: 10000,
      stateStore: createStore(),
      llm: {
        generateVideoOpeners: vi.fn(),
      },
    })).rejects.toMatchObject({
      errorCode: 'OUTREACH_CREATOR_SUBSCRIBERS_TOO_LOW',
      status: 409,
    } satisfies Partial<OutreachDraftError>);
  });

  it('blocks draft generation when subscriber count is unavailable by default', async () => {
    await expect(generateOutreachDrafts({
      adminUserId: 'admin_1',
      blueprintId: 'bp_1',
      now: new Date('2026-05-17T08:00:00.000Z'),
      randomUUID: () => 'id_1',
      resolveContext: async () => context,
      resolveChannelStats: vi.fn(async () => ({
        subscriberCount: null,
        hiddenSubscriberCount: true,
      })),
      minCreatorSubscribers: 10000,
      stateStore: createStore(),
      llm: {
        generateVideoOpeners: vi.fn(),
      },
    })).rejects.toMatchObject({
      errorCode: 'OUTREACH_CHANNEL_STATS_UNAVAILABLE',
      status: 409,
    } satisfies Partial<OutreachDraftError>);
  });

  it('blocks duplicate drafts for the same video', async () => {
    await expect(generateOutreachDrafts({
      adminUserId: 'admin_1',
      blueprintId: 'bp_1',
      now: new Date('2026-05-17T08:00:00.000Z'),
      randomUUID: () => 'id_1',
      resolveContext: async () => context,
      stateStore: createStore({
        listRecentDrafts: vi.fn(async () => [{
          id: 'draft_1',
          draft_group_id: 'group_1',
          admin_user_id: 'admin_1',
          blueprint_id: 'bp_old',
          source_item_id: 'source_1',
          youtube_video_id: 'abc123xyz89',
          source_channel_id: 'UC_test',
          final_text: 'Old draft',
          created_at: '2026-05-17T07:00:00.000Z',
        }]),
      }),
      llm: {
        generateVideoOpeners: vi.fn(),
      },
    })).rejects.toMatchObject({
      errorCode: 'VIDEO_ALREADY_DRAFTED',
      status: 409,
    } satisfies Partial<OutreachDraftError>);
  });
});

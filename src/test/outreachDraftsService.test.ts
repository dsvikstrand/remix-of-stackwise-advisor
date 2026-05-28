import { describe, expect, it, vi } from 'vitest';
import {
  OUTREACH_CREATOR_PRAISE_PREFIXES,
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
    listPostedDrafts: vi.fn(async () => []),
    getDraftOption: vi.fn(async () => null),
    insertDraftOptions: vi.fn(async ({ rows }) => rows.map((row) => ({ id: row.id }))),
    markDraftPosting: vi.fn(async () => true),
    markDraftPosted: vi.fn(async () => true),
    markDraftPostFailed: vi.fn(async () => true),
    markDraftVisibilityChecked: vi.fn(async () => true),
    ...overrides,
  };
}

describe('outreach draft generation service', () => {
  it('generates three validated copy-only drafts and stores them', async () => {
    let seq = 0;
    const store = createStore();
    const generateVideoOpeners = vi.fn(async () => ({
      model: 'gpt-5.5-mini',
      reasoningEffort: 'medium',
      rawText: JSON.stringify({
        openers: [
          'The useful part for me was the distinction between retrieval practice and just rereading notes.',
          'The active recall point makes the review process much easier to understand.',
          'The short-session framing makes the learning habit feel more repeatable.',
        ],
      }),
      openers: [],
    }));
    const result = await generateOutreachDrafts({
      adminUserId: 'admin_1',
      blueprintId: 'bp_1',
      now: new Date('2026-05-17T08:00:00.000Z'),
      randomUUID: () => `id_${++seq}`,
      resolveContext: async () => context,
      stateStore: store,
      llm: {
        generateVideoOpeners,
      },
    });

    expect(result.options).toHaveLength(3);
    expect(result.options.map((option) => option.roleLabel)).toEqual([
      'Short insight',
      'Short insight',
      'Short insight',
    ]);
    expect(result.promoVariants.length).toBeGreaterThanOrEqual(3);
    expect(result.sourceChannelSubscriberCount).toBeNull();
    expect(generateVideoOpeners).toHaveBeenCalledWith(expect.objectContaining({
      count: 3,
      requiredPrefixes: expect.arrayContaining([
        expect.stringMatching(/^(Really helpful breakdown of|Great video, the reminder that|Clear explanation of|This was useful, especially the point about|I liked the simple point about)$/),
      ]),
    }));
    expect(result.options.every((option) => (
      OUTREACH_CREATOR_PRAISE_PREFIXES.some((prefix) => option.finalText.startsWith(prefix))
    ))).toBe(true);
    expect(result.options[0].finalText).toContain('the useful part for me was the distinction between retrieval practice and just rereading notes.');
    expect(result.options[1].finalText).toContain('the active recall point makes the review process much easier to understand.');
    expect(result.options[2].finalText).toContain('the short-session framing makes the learning habit feel more repeatable.');
    expect(result.options[0].finalText).not.toContain('BLEUP');
    expect(result.promoVariants[0].text).toContain('P.S.');
    expect(result.promoVariants).toHaveLength(6);
    expect(result.promoVariants.some((promo) => promo.text.includes('YouTube'))).toBe(true);
    expect(result.promoVariants.every((promo) => !promo.text.includes('BLEUP'))).toBe(true);
    expect(result.promoVariants.every((promo) => !promo.text.toLowerCase().includes('profile'))).toBe(true);
    expect(result.promoVariants.every((promo) => !promo.text.includes('\n'))).toBe(true);
    expect(result.promoVariants.every((promo) => !promo.text.toLowerCase().includes('free early access'))).toBe(true);
    expect(result.promoVariants.every((promo) => validateOutreachPostText(promo.text).ok)).toBe(true);
    expect(result.limits.channelWindowCap).toBe(3);
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

  it('normalizes dash punctuation in generated drafts', async () => {
    let seq = 0;
    const result = await generateOutreachDrafts({
      adminUserId: 'admin_1',
      blueprintId: 'bp_1',
      now: new Date('2026-05-17T08:00:00.000Z'),
      randomUUID: () => `id_${++seq}`,
      resolveContext: async () => context,
      stateStore: createStore(),
      llm: {
        generateVideoOpeners: vi.fn(async () => ({
          model: 'gpt-5.5-mini',
          reasoningEffort: 'medium',
          rawText: JSON.stringify({
            openers: [
              'The cottage cheese point is practical — slower protein makes bedtime easier.',
              'Greek yogurt for cultures, cottage cheese for staying full — simple enough 🙂',
              'The snack choice is clearer when fullness and live cultures are separated.',
            ],
          }),
          openers: [],
        })),
      },
    });

    expect(result.options[0].finalText).toContain('the cottage cheese point is practical, slower protein makes bedtime easier.');
    expect(result.options[1].finalText).toContain('greek yogurt for cultures, cottage cheese for staying full, simple enough 🙂');
    expect(result.options[2].finalText).toContain('the snack choice is clearer when fullness and live cultures are separated.');
    expect(result.options.every((option) => !option.finalText.includes('—'))).toBe(true);
  });

  it('rejects overlong short opener roles', async () => {
    await expect(generateOutreachDrafts({
      adminUserId: 'admin_1',
      blueprintId: 'bp_1',
      now: new Date('2026-05-17T08:00:00.000Z'),
      randomUUID: () => 'id_1',
      resolveContext: async () => context,
      stateStore: createStore(),
      llm: {
        generateVideoOpeners: vi.fn(async () => ({
          model: 'gpt-5.5-mini',
          reasoningEffort: 'medium',
          rawText: JSON.stringify({
            openers: [
              'The cottage cheese versus Greek yogurt distinction makes the bedtime snack choice really practical because it explains fullness, live cultures, gut support, and how each one fits a different goal.',
              'Greek yogurt for cultures, cottage cheese for staying full, simple enough 🙂',
              'The snack choice is clearer when fullness and live cultures are separated.',
            ],
          }),
          openers: [],
        })),
      },
    })).rejects.toMatchObject({
      errorCode: 'DRAFT_VALIDATION_FAILED',
      status: 422,
    } satisfies Partial<OutreachDraftError>);
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

  it('allows regenerating drafts for the same video until one is posted', async () => {
    let seq = 0;
    const store = createStore({
      listRecentDrafts: vi.fn(async () => [{
        id: 'draft_1',
        draft_group_id: 'group_1',
        admin_user_id: 'admin_1',
        blueprint_id: 'bp_old',
        source_item_id: 'source_1',
        youtube_video_id: 'abc123xyz89',
        source_channel_id: 'UC_other',
        final_text: 'Old draft',
        status: 'drafted',
        created_at: '2026-05-17T07:00:00.000Z',
      }]),
    });

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
              'The useful point was making learning more active instead of just rereading notes.',
              'The review loop is clearer when recall comes before rereading.',
              'The small-session point makes the routine easier to repeat.',
            ],
          }),
          openers: [],
        })),
      },
    });

    expect(result.options).toHaveLength(3);
  });

  it('blocks duplicate drafts for the same video after one is posted', async () => {
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
          status: 'posted',
          youtube_comment_id: 'comment_1',
          posted_at: '2026-05-17T07:05:00.000Z',
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

  it('allows generated-only draft groups for the same creator window', async () => {
    let seq = 0;
    const store = createStore({
      listRecentDrafts: vi.fn(async () => [
        {
          id: 'draft_old_1',
          draft_group_id: 'group_old_1',
          admin_user_id: 'admin_1',
          blueprint_id: 'bp_old_1',
          source_item_id: 'source_old_1',
          youtube_video_id: 'old_video_1',
          source_channel_id: 'UC_test',
          final_text: 'Older creator draft one',
          created_at: '2026-05-16T07:00:00.000Z',
        },
        {
          id: 'draft_old_2',
          draft_group_id: 'group_old_2',
          admin_user_id: 'admin_1',
          blueprint_id: 'bp_old_2',
          source_item_id: 'source_old_2',
          youtube_video_id: 'old_video_2',
          source_channel_id: 'UC_test',
          final_text: 'Older creator draft two',
          created_at: '2026-05-16T08:00:00.000Z',
        },
      ]),
    });

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
              'The clearest point was that useful learning needs active recall, not just passive review.',
              'The spacing idea is easier to use when it is framed as a habit loop.',
              'Small recall sessions make the system easier to repeat consistently.',
            ],
          }),
          openers: [],
        })),
      },
    });

    expect(result.options).toHaveLength(3);
    expect(result.limits.channelWindowCap).toBe(3);
  });

  it('blocks draft generation at three posted comments for the same creator window', async () => {
    await expect(generateOutreachDrafts({
      adminUserId: 'admin_1',
      blueprintId: 'bp_1',
      now: new Date('2026-05-17T08:00:00.000Z'),
      randomUUID: () => 'id_1',
      resolveContext: async () => context,
      stateStore: createStore({
        listRecentDrafts: vi.fn(async () => [1, 2, 3].map((index) => ({
          id: `draft_old_${index}`,
          draft_group_id: `group_old_${index}`,
          admin_user_id: 'admin_1',
          blueprint_id: `bp_old_${index}`,
          source_item_id: `source_old_${index}`,
          youtube_video_id: `old_video_${index}`,
          source_channel_id: 'UC_test',
          final_text: `Older creator draft ${index}`,
          status: 'posted',
          youtube_comment_id: `comment_${index}`,
          posted_at: `2026-05-1${index}T07:05:00.000Z`,
          created_at: '2026-05-16T07:00:00.000Z',
        }))),
      }),
      llm: {
        generateVideoOpeners: vi.fn(),
      },
    })).rejects.toMatchObject({
      errorCode: 'CHANNEL_WINDOW_CAP_REACHED',
      status: 429,
      message: 'This creator already has 3 posted outreach comments in the last 7 days.',
    } satisfies Partial<OutreachDraftError>);
  });
});

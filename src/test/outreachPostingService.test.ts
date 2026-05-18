import { describe, expect, it, vi } from 'vitest';
import {
  postOutreachDraft,
  type OutreachPostYouTubeClient,
} from '../../server/services/outreachPosting';
import type {
  OutreachDraftStateStore,
  OutreachDraftStoredRow,
} from '../../server/services/outreachDrafts';

const draftRow: OutreachDraftStoredRow = {
  id: 'draft_1',
  draft_group_id: 'group_1',
  admin_user_id: 'admin_1',
  blueprint_id: 'bp_1',
  source_item_id: 'source_1',
  youtube_video_id: 'abc123xyz89',
  video_url: 'https://www.youtube.com/watch?v=abc123xyz89',
  source_channel_id: 'UC_test',
  source_channel_title: 'Creator',
  option_index: 1,
  opener_text: 'The useful part was the specific idea.',
  tail_variant_id: 'learning-blueprints-v1',
  tail_text: 'I’m building BLEUP.',
  final_text: 'The useful part was the specific idea. I’m building BLEUP as a free app for organized learning blueprints.',
  status: 'drafted',
  model: 'gpt-5.4-mini',
  reasoning_effort: 'medium',
  prompt_version: 'outreach_draft_openers_v1',
  validation_json: '{}',
  youtube_comment_id: null,
  posted_at: null,
  post_error_code: null,
  post_error_message: null,
  created_at: '2026-05-18T07:00:00.000Z',
  updated_at: '2026-05-18T07:00:00.000Z',
};

function createStore(overrides?: Partial<OutreachDraftStateStore>): OutreachDraftStateStore {
  return {
    listRecentDrafts: vi.fn(async () => []),
    getDraftOption: vi.fn(async () => draftRow),
    insertDraftOptions: vi.fn(async () => []),
    markDraftPosting: vi.fn(async () => true),
    markDraftPosted: vi.fn(async () => true),
    markDraftPostFailed: vi.fn(async () => true),
    ...overrides,
  };
}

function createYoutubeClient(overrides?: Partial<OutreachPostYouTubeClient>): OutreachPostYouTubeClient {
  return {
    postTopLevelComment: vi.fn(async () => ({ youtubeCommentId: 'comment_1' })),
    ...overrides,
  };
}

describe('outreach posting service', () => {
  it('posts a validated draft and stores the YouTube comment id', async () => {
    const store = createStore();
    const youtubeClient = createYoutubeClient();

    const result = await postOutreachDraft({
      adminUserId: 'admin_1',
      draftId: 'draft_1',
      now: new Date('2026-05-18T08:00:00.000Z'),
      stateStore: store,
      youtubeClient,
    });

    expect(youtubeClient.postTopLevelComment).toHaveBeenCalledWith({
      videoId: 'abc123xyz89',
      text: draftRow.final_text,
    });
    expect(store.markDraftPosting).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'draft_1',
      adminUserId: 'admin_1',
    }));
    expect(store.markDraftPosted).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'draft_1',
      youtubeCommentId: 'comment_1',
    }));
    expect(result).toMatchObject({
      status: 'posted',
      youtubeCommentId: 'comment_1',
    });
  });

  it('blocks posting when the video already has a posted outreach comment', async () => {
    await expect(postOutreachDraft({
      adminUserId: 'admin_1',
      draftId: 'draft_1',
      now: new Date('2026-05-18T08:00:00.000Z'),
      stateStore: createStore({
        listRecentDrafts: vi.fn(async () => [{
          id: 'posted_1',
          draft_group_id: 'group_old',
          admin_user_id: 'admin_1',
          blueprint_id: 'bp_old',
          source_item_id: 'source_old',
          youtube_video_id: 'abc123xyz89',
          source_channel_id: 'UC_other',
          final_text: 'Old posted comment',
          status: 'posted',
          youtube_comment_id: 'comment_old',
          posted_at: '2026-05-18T07:00:00.000Z',
          created_at: '2026-05-18T07:00:00.000Z',
        }]),
      }),
      youtubeClient: createYoutubeClient(),
    })).rejects.toMatchObject({
      errorCode: 'VIDEO_ALREADY_POSTED',
      status: 409,
    });
  });

  it('marks the draft failed when YouTube posting fails', async () => {
    const store = createStore();
    await expect(postOutreachDraft({
      adminUserId: 'admin_1',
      draftId: 'draft_1',
      now: new Date('2026-05-18T08:00:00.000Z'),
      stateStore: store,
      youtubeClient: createYoutubeClient({
        postTopLevelComment: vi.fn(async () => {
          throw new Error('provider down');
        }),
      }),
    })).rejects.toMatchObject({
      errorCode: 'YT_COMMENT_POST_FAILED',
      status: 502,
    });

    expect(store.markDraftPostFailed).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'draft_1',
      errorCode: 'YT_COMMENT_POST_FAILED',
    }));
  });
});

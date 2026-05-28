import { describe, expect, it, vi } from 'vitest';
import { verifyPostedOutreachComments } from '../../server/services/outreachVerification';
import type { OutreachDraftStateStore } from '../../server/services/outreachDrafts';
import { YouTubeCommentPostError } from '../../server/services/youtubeCommentPosting';

function createStore(overrides?: Partial<OutreachDraftStateStore>): OutreachDraftStateStore {
  return {
    listRecentDrafts: vi.fn(async () => []),
    listPostedDrafts: vi.fn(async () => []),
    getDraftOption: vi.fn(async () => null),
    insertDraftOptions: vi.fn(async () => []),
    markDraftPosting: vi.fn(async () => true),
    markDraftPosted: vi.fn(async () => true),
    markDraftPostFailed: vi.fn(async () => true),
    markDraftVisibilityChecked: vi.fn(async () => true),
    ...overrides,
  };
}

function postedRow(input: { id: string; commentId: string }) {
  return {
    id: input.id,
    draft_group_id: `group_${input.id}`,
    admin_user_id: 'admin_1',
    blueprint_id: `bp_${input.id}`,
    source_item_id: `source_${input.id}`,
    youtube_video_id: `video_${input.id}`,
    video_url: `https://www.youtube.com/watch?v=video_${input.id}`,
    source_channel_id: 'UC_test',
    source_channel_title: 'Test Creator',
    final_text: 'Helpful comment',
    status: 'posted',
    youtube_comment_id: input.commentId,
    posted_at: '2026-05-28T08:00:00.000Z',
    created_at: '2026-05-28T07:00:00.000Z',
  };
}

describe('outreach posted comment verification service', () => {
  it('verifies the selected posted-comment batch and separates provider failures from up-rate', async () => {
    const store = createStore({
      listPostedDrafts: vi.fn(async () => [
        postedRow({ id: '1', commentId: 'comment_visible' }),
        postedRow({ id: '2', commentId: 'comment_hidden' }),
        postedRow({ id: '3', commentId: 'comment_fail' }),
      ]),
    });
    const result = await verifyPostedOutreachComments({
      adminUserId: 'admin_1',
      limit: 10,
      now: new Date('2026-05-28T09:00:00.000Z'),
      stateStore: store,
      youtubeClient: {
        verifyTopLevelCommentVisible: vi.fn(async ({ youtubeCommentId }) => {
          if (youtubeCommentId === 'comment_fail') {
            throw new YouTubeCommentPostError('YT_PROVIDER_RATE_LIMITED', 'Rate limited.', 429);
          }
          return {
            visible: youtubeCommentId === 'comment_visible',
          };
        }),
      },
    });

    expect(store.listPostedDrafts).toHaveBeenCalledWith({
      adminUserId: 'admin_1',
      limit: 10,
    });
    expect(result).toMatchObject({
      requestedLimit: 10,
      availablePostedComments: 3,
      checked: 3,
      visible: 1,
      notVisible: 1,
      verifyFailed: 1,
      upRate: 0.5,
      quotaUnitsEstimated: 3,
    });
    expect(result.items[1]).toMatchObject({
      videoUrl: 'https://www.youtube.com/watch?v=video_2',
      sourceChannelTitle: 'Test Creator',
      finalText: 'Helpful comment',
    });
    expect(store.markDraftVisibilityChecked).toHaveBeenCalledWith(expect.objectContaining({
      draftId: '1',
      status: 'visible',
      visibleAt: '2026-05-28T09:00:00.000Z',
    }));
    expect(store.markDraftVisibilityChecked).toHaveBeenCalledWith(expect.objectContaining({
      draftId: '2',
      status: 'not_visible',
      errorCode: 'YT_COMMENT_NOT_VISIBLE',
    }));
    expect(store.markDraftVisibilityChecked).toHaveBeenCalledWith(expect.objectContaining({
      draftId: '3',
      status: 'verify_failed',
      errorCode: 'YT_PROVIDER_RATE_LIMITED',
    }));
  });
});

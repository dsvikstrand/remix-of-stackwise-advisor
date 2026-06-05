import { OutreachDraftError, type OutreachDraftStateStore } from './outreachDrafts';
import { YouTubeCommentPostError } from './youtubeCommentPosting';

export type OutreachCommentDeleteResult = {
  draftId: string;
  draftGroupId: string;
  blueprintId: string;
  sourceItemId: string;
  youtubeVideoId: string;
  videoUrl: string;
  youtubeCommentId: string;
  finalText: string;
  status: 'comment_deleted';
  deletedAt: string;
};

export type OutreachCommentDeleteYouTubeClient = {
  deleteComment: (input: {
    youtubeCommentId: string;
  }) => Promise<{
    youtubeCommentId: string;
  }>;
};

function normalizeString(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isActivePostedStatus(status: unknown) {
  const normalized = normalizeString(status).toLowerCase();
  return normalized === 'posted' || normalized === 'posted_unverified';
}

function mapDeleteProviderError(error: unknown) {
  if (error instanceof YouTubeCommentPostError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }
  return {
    status: 502,
    code: 'YT_COMMENT_DELETE_FAILED',
    message: error instanceof Error ? error.message : 'Could not remove YouTube comment.',
  };
}

export async function deleteOutreachDraftComment(input: {
  adminUserId: string;
  draftId: string;
  now?: Date;
  stateStore: OutreachDraftStateStore;
  youtubeClient: OutreachCommentDeleteYouTubeClient;
}) {
  const adminUserId = normalizeString(input.adminUserId);
  const draftId = normalizeString(input.draftId);
  if (!adminUserId) throw new OutreachDraftError(401, 'AUTH_REQUIRED', 'Sign in required.');
  if (!draftId) throw new OutreachDraftError(400, 'INVALID_DRAFT_ID', 'Missing outreach draft id.');

  const draft = await input.stateStore.getDraftOption({ draftId });
  if (!draft) {
    throw new OutreachDraftError(404, 'DRAFT_NOT_FOUND', 'Outreach draft not found.');
  }
  if (draft.admin_user_id !== adminUserId) {
    throw new OutreachDraftError(403, 'ADMIN_DRAFT_MISMATCH', 'This outreach draft belongs to a different admin.');
  }
  if (normalizeString(draft.status).toLowerCase() === 'comment_deleted') {
    throw new OutreachDraftError(409, 'COMMENT_ALREADY_DELETED', 'This outreach comment is already marked removed.');
  }
  const youtubeCommentId = normalizeString(draft.youtube_comment_id);
  if (!youtubeCommentId || !isActivePostedStatus(draft.status)) {
    throw new OutreachDraftError(409, 'COMMENT_NOT_REMOVABLE', 'This outreach draft does not have an active posted comment.');
  }

  try {
    await input.youtubeClient.deleteComment({
      youtubeCommentId,
    });
  } catch (error) {
    const mapped = mapDeleteProviderError(error);
    if (mapped.code !== 'YT_COMMENT_NOT_FOUND') {
      throw new OutreachDraftError(mapped.status, mapped.code, mapped.message);
    }
  }

  const deletedAt = (input.now || new Date()).toISOString();
  const stored = await input.stateStore.markDraftCommentDeleted({
    draftId,
    adminUserId,
    deletedAt,
    errorCode: 'YT_COMMENT_DELETED_BY_ADMIN',
    errorMessage: 'Comment was removed by admin.',
    updatedAt: deletedAt,
  });
  if (!stored) {
    throw new OutreachDraftError(409, 'COMMENT_DELETE_STATE_FAILED', 'Comment removal state could not be stored.');
  }

  return {
    draftId,
    draftGroupId: draft.draft_group_id,
    blueprintId: draft.blueprint_id,
    sourceItemId: draft.source_item_id,
    youtubeVideoId: draft.youtube_video_id,
    videoUrl: draft.video_url,
    youtubeCommentId,
    finalText: draft.final_text,
    status: 'comment_deleted',
    deletedAt,
  } satisfies OutreachCommentDeleteResult;
}

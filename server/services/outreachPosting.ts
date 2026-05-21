import {
  OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS,
  OUTREACH_DRAFT_DAILY_CAP,
  OutreachDraftError,
  validateOutreachPostText,
  type OutreachDraftStateStore,
  type OutreachDraftStoredRow,
} from './outreachDrafts';
import { YouTubeCommentPostError } from './youtubeCommentPosting';

export type OutreachPostResult = {
  draftId: string;
  draftGroupId: string;
  blueprintId: string;
  sourceItemId: string;
  youtubeVideoId: string;
  videoUrl: string;
  youtubeCommentId: string;
  finalText: string;
  status: 'posted' | 'posted_unverified';
  postedAt: string;
  verification: {
    visible: boolean;
    errorCode: string | null;
    errorMessage: string | null;
  };
};

export type OutreachPostYouTubeClient = {
  postTopLevelComment: (input: {
    videoId: string;
    text: string;
  }) => Promise<{
    youtubeCommentId: string;
  }>;
  verifyTopLevelCommentVisible?: (input: {
    youtubeCommentId: string;
  }) => Promise<{
    visible: boolean;
  }>;
};

function normalizeString(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isPosted(row: { status?: string | null; youtube_comment_id?: string | null; posted_at?: string | null }) {
  return normalizeString(row.status).toLowerCase() === 'posted'
    || Boolean(normalizeString(row.youtube_comment_id))
    || Boolean(normalizeString(row.posted_at));
}

function mapPostProviderError(error: unknown) {
  if (error instanceof YouTubeCommentPostError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }
  return {
    status: 502,
    code: 'YT_COMMENT_POST_FAILED',
    message: error instanceof Error ? error.message : 'Could not post YouTube comment.',
  };
}

function assertDraftPostableForAdmin(row: OutreachDraftStoredRow, adminUserId: string) {
  if (row.admin_user_id !== adminUserId) {
    throw new OutreachDraftError(403, 'ADMIN_DRAFT_MISMATCH', 'This outreach draft belongs to a different admin.');
  }
  if (isPosted(row)) {
    throw new OutreachDraftError(409, 'DRAFT_ALREADY_POSTED', 'This outreach draft has already been posted.');
  }
  const status = normalizeString(row.status).toLowerCase();
  if (status === 'posting') {
    throw new OutreachDraftError(409, 'DRAFT_POST_IN_PROGRESS', 'This outreach draft is already being posted.');
  }
  if (status !== 'drafted' && status !== 'post_failed') {
    throw new OutreachDraftError(409, 'DRAFT_NOT_POSTABLE', 'This outreach draft is not postable.');
  }
}

export async function postOutreachDraft(input: {
  adminUserId: string;
  draftId: string;
  finalText?: string | null;
  now?: Date;
  stateStore: OutreachDraftStateStore;
  youtubeClient: OutreachPostYouTubeClient;
}) {
  const adminUserId = normalizeString(input.adminUserId);
  const draftId = normalizeString(input.draftId);
  if (!adminUserId) throw new OutreachDraftError(401, 'AUTH_REQUIRED', 'Sign in required.');
  if (!draftId) throw new OutreachDraftError(400, 'INVALID_DRAFT_ID', 'Missing outreach draft id.');

  const draft = await input.stateStore.getDraftOption({ draftId });
  if (!draft) {
    throw new OutreachDraftError(404, 'DRAFT_NOT_FOUND', 'Outreach draft not found.');
  }
  assertDraftPostableForAdmin(draft, adminUserId);

  const validation = validateOutreachPostText(input.finalText ?? draft.final_text);
  if (!validation.ok) {
    throw new OutreachDraftError(
      422,
      'COMMENT_VALIDATION_FAILED',
      `Outreach comment failed validation: ${validation.issues.join(', ')}`,
    );
  }
  const finalText = validation.text;

  const now = input.now || new Date();
  const nowIso = now.toISOString();
  const sinceDayIso = addDays(now, -1).toISOString();
  const sinceChannelIso = addDays(now, -OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS).toISOString();
  const recentRows = await input.stateStore.listRecentDrafts({
    adminUserId,
    sinceIso: sinceChannelIso,
    limit: 500,
  });
  const postedRows = recentRows.filter(isPosted);
  const postedGroupsToday = new Set(
    postedRows
      .filter((row) => (row.posted_at || row.created_at) >= sinceDayIso)
      .map((row) => row.draft_group_id),
  );
  if (postedGroupsToday.size >= OUTREACH_DRAFT_DAILY_CAP) {
    throw new OutreachDraftError(429, 'DAILY_POST_CAP_REACHED', `Outreach post cap reached (${OUTREACH_DRAFT_DAILY_CAP}/day).`);
  }

  const videoAlreadyPosted = postedRows.some((row) => row.youtube_video_id === draft.youtube_video_id);
  if (videoAlreadyPosted) {
    throw new OutreachDraftError(409, 'VIDEO_ALREADY_POSTED', 'This video already has a posted BLEUP outreach comment.');
  }

  const channelAlreadyPosted = Boolean(draft.source_channel_id)
    && postedRows.some((row) => row.source_channel_id === draft.source_channel_id);
  if (channelAlreadyPosted) {
    throw new OutreachDraftError(429, 'CHANNEL_POST_WINDOW_CAP_REACHED', `This creator already has a posted outreach comment in the last ${OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS} days.`);
  }

  const claimed = await input.stateStore.markDraftPosting({
    draftId,
    adminUserId,
    finalText,
    updatedAt: nowIso,
  });
  if (!claimed) {
    throw new OutreachDraftError(409, 'DRAFT_NOT_POSTABLE', 'This outreach draft is no longer postable.');
  }

  let providerAcceptedPost = false;
  try {
    const posted = await input.youtubeClient.postTopLevelComment({
      videoId: draft.youtube_video_id,
      text: finalText,
    });
    providerAcceptedPost = true;
    const postedAt = new Date().toISOString();
    let verification = {
      visible: true,
      errorCode: null as string | null,
      errorMessage: null as string | null,
    };
    if (input.youtubeClient.verifyTopLevelCommentVisible) {
      try {
        const verified = await input.youtubeClient.verifyTopLevelCommentVisible({
          youtubeCommentId: posted.youtubeCommentId,
        });
        if (!verified.visible) {
          verification = {
            visible: false,
            errorCode: 'YT_COMMENT_NOT_VISIBLE_AFTER_POST',
            errorMessage: 'YouTube accepted the comment but it is not publicly visible yet.',
          };
        }
      } catch (error) {
        const mapped = mapPostProviderError(error);
        verification = {
          visible: false,
          errorCode: mapped.code,
          errorMessage: mapped.message,
        };
      }
    }
    const postStatus = verification.visible ? 'posted' : 'posted_unverified';
    const stored = await input.stateStore.markDraftPosted({
      draftId,
      adminUserId,
      finalText,
      youtubeCommentId: posted.youtubeCommentId,
      status: postStatus,
      errorCode: verification.errorCode,
      errorMessage: verification.errorMessage,
      postedAt,
      updatedAt: postedAt,
    });
    if (!stored) {
      throw new OutreachDraftError(500, 'POST_STATE_WRITE_FAILED', 'Posted to YouTube, but could not store outreach post state.');
    }
    return {
      draftId,
      draftGroupId: draft.draft_group_id,
      blueprintId: draft.blueprint_id,
      sourceItemId: draft.source_item_id,
      youtubeVideoId: draft.youtube_video_id,
      videoUrl: draft.video_url,
      youtubeCommentId: posted.youtubeCommentId,
      finalText,
      status: postStatus,
      postedAt,
      verification,
    } satisfies OutreachPostResult;
  } catch (error) {
    const mapped = error instanceof OutreachDraftError
      ? { status: error.status, code: error.errorCode, message: error.message }
      : mapPostProviderError(error);
    if (!providerAcceptedPost) {
      await input.stateStore.markDraftPostFailed({
        draftId,
        adminUserId,
        finalText,
        errorCode: mapped.code,
        errorMessage: mapped.message,
        updatedAt: new Date().toISOString(),
      }).catch(() => false);
    }
    if (error instanceof OutreachDraftError) throw error;
    throw new OutreachDraftError(mapped.status, mapped.code, mapped.message);
  }
}

import {
  OutreachDraftError,
  type OutreachDraftStateStore,
  type OutreachDraftHistoryRow,
} from './outreachDrafts';
import { YouTubeCommentPostError } from './youtubeCommentPosting';

export type OutreachCommentVisibilityStatus = 'visible' | 'not_visible' | 'verify_failed';

export type OutreachPostedCommentVerificationResult = {
  requestedLimit: number;
  availablePostedComments: number;
  checked: number;
  visible: number;
  notVisible: number;
  verifyFailed: number;
  upRate: number | null;
  quotaUnitsEstimated: number;
  items: Array<{
    draftId: string;
    draftGroupId: string;
    blueprintId: string;
    sourceItemId: string;
    youtubeVideoId: string;
    youtubeCommentId: string;
    postedAt: string | null;
    status: OutreachCommentVisibilityStatus;
    visible: boolean | null;
    errorCode: string | null;
    errorMessage: string | null;
    checkedAt: string;
  }>;
};

export type OutreachVerificationYouTubeClient = {
  verifyTopLevelCommentVisible: (input: {
    youtubeCommentId: string;
  }) => Promise<{
    visible: boolean;
  }>;
};

function normalizeString(value: unknown) {
  return String(value || '').trim();
}

function normalizeLimit(value: unknown) {
  const numeric = Math.floor(Number(value || 10));
  if (numeric <= 10) return 10;
  if (numeric <= 25) return 25;
  return 50;
}

function mapVerifyError(error: unknown) {
  if (error instanceof YouTubeCommentPostError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  return {
    code: 'YT_COMMENT_VERIFY_FAILED',
    message: error instanceof Error ? error.message : 'Could not verify YouTube comment visibility.',
  };
}

function toVerificationItem(input: {
  row: OutreachDraftHistoryRow;
  status: OutreachCommentVisibilityStatus;
  visible: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
  checkedAt: string;
}) {
  return {
    draftId: input.row.id,
    draftGroupId: input.row.draft_group_id,
    blueprintId: input.row.blueprint_id,
    sourceItemId: input.row.source_item_id,
    youtubeVideoId: input.row.youtube_video_id,
    youtubeCommentId: normalizeString(input.row.youtube_comment_id),
    postedAt: input.row.posted_at || null,
    status: input.status,
    visible: input.visible,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    checkedAt: input.checkedAt,
  };
}

export async function verifyPostedOutreachComments(input: {
  adminUserId: string;
  limit: number;
  now?: Date;
  stateStore: OutreachDraftStateStore;
  youtubeClient: OutreachVerificationYouTubeClient;
}) {
  const adminUserId = normalizeString(input.adminUserId);
  if (!adminUserId) throw new OutreachDraftError(401, 'AUTH_REQUIRED', 'Sign in required.');

  const requestedLimit = normalizeLimit(input.limit);
  const rows = await input.stateStore.listPostedDrafts({
    adminUserId,
    limit: requestedLimit,
  });
  const checkedAt = (input.now || new Date()).toISOString();
  const items: OutreachPostedCommentVerificationResult['items'] = [];

  for (const row of rows) {
    const youtubeCommentId = normalizeString(row.youtube_comment_id);
    if (!youtubeCommentId) continue;

    try {
      const result = await input.youtubeClient.verifyTopLevelCommentVisible({
        youtubeCommentId,
      });
      const status: OutreachCommentVisibilityStatus = result.visible ? 'visible' : 'not_visible';
      await input.stateStore.markDraftVisibilityChecked({
        draftId: row.id,
        adminUserId,
        status,
        errorCode: result.visible ? null : 'YT_COMMENT_NOT_VISIBLE',
        errorMessage: result.visible ? null : 'YouTube did not return this comment in public read-back. It may be pending review, filtered, or removed.',
        checkedAt,
        visibleAt: result.visible ? checkedAt : null,
      });
      items.push(toVerificationItem({
        row,
        status,
        visible: result.visible,
        errorCode: result.visible ? null : 'YT_COMMENT_NOT_VISIBLE',
        errorMessage: result.visible ? null : 'YouTube did not return this comment in public read-back. It may be pending review, filtered, or removed.',
        checkedAt,
      }));
    } catch (error) {
      const mapped = mapVerifyError(error);
      await input.stateStore.markDraftVisibilityChecked({
        draftId: row.id,
        adminUserId,
        status: 'verify_failed',
        errorCode: mapped.code,
        errorMessage: mapped.message,
        checkedAt,
        visibleAt: null,
      }).catch(() => false);
      items.push(toVerificationItem({
        row,
        status: 'verify_failed',
        visible: null,
        errorCode: mapped.code,
        errorMessage: mapped.message,
        checkedAt,
      }));
    }
  }

  const visible = items.filter((item) => item.status === 'visible').length;
  const notVisible = items.filter((item) => item.status === 'not_visible').length;
  const verifyFailed = items.filter((item) => item.status === 'verify_failed').length;
  const checked = visible + notVisible;
  return {
    requestedLimit,
    availablePostedComments: rows.length,
    checked: items.length,
    visible,
    notVisible,
    verifyFailed,
    upRate: checked > 0 ? visible / checked : null,
    quotaUnitsEstimated: items.length,
    items,
  } satisfies OutreachPostedCommentVerificationResult;
}

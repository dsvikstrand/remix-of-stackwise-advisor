import type { OutreachDraftStateStore } from './outreachDrafts';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';

function normalizeString(value: unknown) {
  return String(value || '').trim();
}

export function createOracleOutreachDraftStateStore(input: {
  controlDb: OracleControlPlaneDb;
}): OutreachDraftStateStore {
  return {
    async listRecentDrafts({ adminUserId, sinceIso, limit }) {
      let query = input.controlDb.db
        .selectFrom('outreach_draft_state')
        .select([
          'id',
          'draft_group_id',
          'admin_user_id',
          'blueprint_id',
          'source_item_id',
          'youtube_video_id',
          'source_channel_id',
          'final_text',
          'status',
          'youtube_comment_id',
          'posted_at',
          'last_visibility_checked_at',
          'last_visibility_status',
          'last_visibility_error_code',
          'last_visibility_error_message',
          'visibility_check_count',
          'last_visible_at',
          'created_at',
        ])
        .orderBy('created_at', 'desc')
        .limit(Math.max(1, Math.min(1000, Math.floor(Number(limit || 250)))));

      const normalizedAdminUserId = normalizeString(adminUserId);
      const normalizedSinceIso = normalizeString(sinceIso);
      if (normalizedAdminUserId) {
        query = query.where('admin_user_id', '=', normalizedAdminUserId);
      }
      if (normalizedSinceIso) {
        query = query.where('created_at', '>=', normalizedSinceIso);
      }

      return await query.execute();
    },

    async listPostedDrafts({ adminUserId, limit }) {
      return await input.controlDb.db
        .selectFrom('outreach_draft_state')
        .select([
          'id',
          'draft_group_id',
          'admin_user_id',
          'blueprint_id',
          'source_item_id',
          'youtube_video_id',
          'source_channel_id',
          'final_text',
          'status',
          'youtube_comment_id',
          'posted_at',
          'last_visibility_checked_at',
          'last_visibility_status',
          'last_visibility_error_code',
          'last_visibility_error_message',
          'visibility_check_count',
          'last_visible_at',
          'created_at',
        ])
        .where('admin_user_id', '=', normalizeString(adminUserId))
        .where('youtube_comment_id', 'is not', null)
        .where('status', 'in', ['posted', 'posted_unverified'])
        .orderBy('posted_at', 'desc')
        .orderBy('created_at', 'desc')
        .limit(Math.max(1, Math.min(50, Math.floor(Number(limit || 10)))))
        .execute();
    },

    async getDraftOption({ draftId }) {
      const normalizedDraftId = normalizeString(draftId);
      if (!normalizedDraftId) return null;
      const row = await input.controlDb.db
        .selectFrom('outreach_draft_state')
        .selectAll()
        .where('id', '=', normalizedDraftId)
        .executeTakeFirst();
      return row || null;
    },

    async insertDraftOptions({ rows }) {
      if (rows.length === 0) return [];
      await input.controlDb.db
        .insertInto('outreach_draft_state')
        .values(rows.map((row) => ({
          ...row,
          youtube_comment_id: null,
          posted_at: null,
          post_error_code: null,
          post_error_message: null,
          last_visibility_checked_at: null,
          last_visibility_status: null,
          last_visibility_error_code: null,
          last_visibility_error_message: null,
          visibility_check_count: 0,
          last_visible_at: null,
        })))
        .execute();
      return rows.map((row) => ({ id: row.id }));
    },

    async markDraftPosting({ draftId, adminUserId, finalText, updatedAt }) {
      const result = await input.controlDb.db
        .updateTable('outreach_draft_state')
        .set({
          final_text: finalText,
          status: 'posting',
          post_error_code: null,
          post_error_message: null,
          updated_at: updatedAt,
        })
        .where('id', '=', normalizeString(draftId))
        .where('admin_user_id', '=', normalizeString(adminUserId))
        .where('status', 'in', ['drafted', 'post_failed'])
        .executeTakeFirst();
      return Number(result.numUpdatedRows || 0) > 0;
    },

    async markDraftPosted({
      draftId,
      adminUserId,
      finalText,
      youtubeCommentId,
      status,
      errorCode,
      errorMessage,
      postedAt,
      updatedAt,
    }) {
      const result = await input.controlDb.db
        .updateTable('outreach_draft_state')
        .set({
          final_text: finalText,
          status: status || 'posted',
          youtube_comment_id: youtubeCommentId,
          posted_at: postedAt,
          post_error_code: errorCode ? errorCode.slice(0, 80) : null,
          post_error_message: errorMessage ? errorMessage.slice(0, 500) : null,
          updated_at: updatedAt,
        })
        .where('id', '=', normalizeString(draftId))
        .where('admin_user_id', '=', normalizeString(adminUserId))
        .executeTakeFirst();
      return Number(result.numUpdatedRows || 0) > 0;
    },

    async markDraftPostFailed({ draftId, adminUserId, finalText, errorCode, errorMessage, updatedAt }) {
      const result = await input.controlDb.db
        .updateTable('outreach_draft_state')
        .set({
          final_text: finalText,
          status: 'post_failed',
          post_error_code: errorCode.slice(0, 80),
          post_error_message: errorMessage.slice(0, 500),
          updated_at: updatedAt,
        })
        .where('id', '=', normalizeString(draftId))
        .where('admin_user_id', '=', normalizeString(adminUserId))
        .executeTakeFirst();
      return Number(result.numUpdatedRows || 0) > 0;
    },

    async markDraftVisibilityChecked({
      draftId,
      adminUserId,
      status,
      errorCode,
      errorMessage,
      checkedAt,
      visibleAt,
    }) {
      const result = await input.controlDb.db
        .updateTable('outreach_draft_state')
        .set(({ eb }) => ({
          last_visibility_checked_at: checkedAt,
          last_visibility_status: status,
          last_visibility_error_code: errorCode ? errorCode.slice(0, 80) : null,
          last_visibility_error_message: errorMessage ? errorMessage.slice(0, 500) : null,
          visibility_check_count: eb('visibility_check_count', '+', 1),
          last_visible_at: visibleAt,
          updated_at: checkedAt,
        }))
        .where('id', '=', normalizeString(draftId))
        .where('admin_user_id', '=', normalizeString(adminUserId))
        .executeTakeFirst();
      return Number(result.numUpdatedRows || 0) > 0;
    },
  };
}

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

    async insertDraftOptions({ rows }) {
      if (rows.length === 0) return [];
      await input.controlDb.db
        .insertInto('outreach_draft_state')
        .values(rows)
        .execute();
      return rows.map((row) => ({ id: row.id }));
    },
  };
}

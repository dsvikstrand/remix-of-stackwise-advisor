import { randomUUID } from 'node:crypto';
import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import {
  normalizeIsoOrNull,
  normalizeObject,
  normalizeRequiredIso,
  normalizeStringOrNull,
} from './oracleValueNormalization';

export type OracleNotificationType =
  | 'comment_reply'
  | 'generation_started'
  | 'generation_succeeded'
  | 'generation_failed';

export type OracleNotificationRow = {
  id: string;
  user_id: string;
  type: OracleNotificationType;
  title: string;
  body: string;
  link_path: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  updated_at: string;
  dedupe_key: string | null;
};

function normalizeRequiredString(value: unknown, fallback = '') {
  return String(value || '').trim() || fallback;
}

function normalizeNotificationType(value: unknown): OracleNotificationType {
  const normalized = String(value || '').trim();
  if (normalized === 'comment_reply') return 'comment_reply';
  if (normalized === 'generation_started') return 'generation_started';
  if (normalized === 'generation_failed') return 'generation_failed';
  return 'generation_succeeded';
}

function parseMetadataJson(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return {} as Record<string, unknown>;
  try {
    return normalizeObject(JSON.parse(normalized)) || {};
  } catch {
    return {};
  }
}

function mapNotificationRow(
  row: Record<string, unknown>,
  fallbackIso?: string,
): OracleNotificationRow {
  const createdAt = normalizeRequiredIso(row.created_at, fallbackIso);
  return {
    id: normalizeRequiredString(row.id, randomUUID()),
    user_id: normalizeRequiredString(row.user_id),
    type: normalizeNotificationType(row.type),
    title: normalizeRequiredString(row.title, 'Notification'),
    body: normalizeRequiredString(row.body),
    link_path: normalizeStringOrNull(row.link_path),
    metadata: parseMetadataJson(row.metadata_json),
    is_read: Number(row.is_read || 0) > 0,
    read_at: normalizeIsoOrNull(row.read_at),
    created_at: createdAt,
    updated_at: normalizeRequiredIso(row.updated_at, createdAt),
    dedupe_key: normalizeStringOrNull(row.dedupe_key),
  };
}

async function getOracleNotificationRowByDedupeKey(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  dedupeKey: string;
}) {
  const row = await input.controlDb.db
    .selectFrom('notification_state')
    .selectAll()
    .where('user_id', '=', input.userId)
    .where('dedupe_key', '=', input.dedupeKey)
    .executeTakeFirst();

  return row
    ? mapNotificationRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function getOracleNotificationRowById(input: {
  controlDb: OracleControlPlaneDb;
  notificationId: string;
}) {
  const notificationId = normalizeRequiredString(input.notificationId);
  if (!notificationId) return null;

  const row = await input.controlDb.db
    .selectFrom('notification_state')
    .selectAll()
    .where('id', '=', notificationId)
    .executeTakeFirst();

  return row
    ? mapNotificationRow(row as unknown as Record<string, unknown>)
    : null;
}

export async function upsertOracleNotificationRow(input: {
  controlDb: OracleControlPlaneDb;
  row: Partial<OracleNotificationRow> & {
    user_id: string;
    type: OracleNotificationType;
  };
  nowIso?: string;
}) {
  const nowIso = normalizeRequiredIso(input.nowIso);
  const userId = normalizeRequiredString(input.row.user_id);
  if (!userId) throw new Error('NOTIFICATION_USER_REQUIRED');

  const dedupeKey = normalizeStringOrNull(input.row.dedupe_key);
  const current = dedupeKey
    ? await getOracleNotificationRowByDedupeKey({
        controlDb: input.controlDb,
        userId,
        dedupeKey,
      })
    : (input.row.id
      ? await getOracleNotificationRowById({
          controlDb: input.controlDb,
          notificationId: input.row.id,
        })
      : null);

  const nextRow = mapNotificationRow({
    id: current?.id || normalizeRequiredString(input.row.id, randomUUID()),
    user_id: userId,
    type: input.row.type,
    title: input.row.title,
    body: input.row.body,
    link_path: input.row.link_path ?? null,
    metadata_json: JSON.stringify(input.row.metadata || current?.metadata || {}),
    is_read: input.row.is_read ?? current?.is_read ?? false ? 1 : 0,
    read_at: input.row.read_at ?? current?.read_at ?? null,
    dedupe_key: dedupeKey,
    created_at: current?.created_at || input.row.created_at || nowIso,
    updated_at: nowIso,
  }, nowIso);

  await input.controlDb.db
    .insertInto('notification_state')
    .values({
      id: nextRow.id,
      user_id: nextRow.user_id,
      type: nextRow.type,
      title: nextRow.title,
      body: nextRow.body,
      link_path: nextRow.link_path,
      metadata_json: JSON.stringify(nextRow.metadata),
      is_read: nextRow.is_read ? 1 : 0,
      read_at: nextRow.read_at,
      dedupe_key: nextRow.dedupe_key,
      created_at: nextRow.created_at,
      updated_at: nextRow.updated_at,
    })
    .onConflict((oc) => oc.column('id').doUpdateSet({
      type: nextRow.type,
      title: nextRow.title,
      body: nextRow.body,
      link_path: nextRow.link_path,
      metadata_json: JSON.stringify(nextRow.metadata),
      is_read: nextRow.is_read ? 1 : 0,
      read_at: nextRow.read_at,
      dedupe_key: nextRow.dedupe_key,
      updated_at: nextRow.updated_at,
    }))
    .execute();

  return nextRow;
}

export async function markOracleNotificationRead(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  notificationId: string;
  readAt?: string;
}) {
  const userId = normalizeRequiredString(input.userId);
  const notificationId = normalizeRequiredString(input.notificationId);
  if (!userId || !notificationId) return null;

  const current = await input.controlDb.db
    .selectFrom('notification_state')
    .select(['id', 'is_read', 'read_at'])
    .where('id', '=', notificationId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!current) return null;

  const readAt = normalizeRequiredIso(input.readAt);
  await input.controlDb.db
    .updateTable('notification_state')
    .set({
      is_read: 1,
      read_at: readAt,
      updated_at: readAt,
    })
    .where('id', '=', notificationId)
    .where('user_id', '=', userId)
    .execute();

  return {
    id: notificationId,
    is_read: true,
    read_at: readAt,
  };
}

export async function markAllOracleNotificationsRead(input: {
  controlDb: OracleControlPlaneDb;
  userId: string;
  readAt?: string;
}) {
  const userId = normalizeRequiredString(input.userId);
  if (!userId) return {
    updated_count: 0,
    read_at: normalizeRequiredIso(input.readAt),
  };

  const unreadRows = await input.controlDb.db
    .selectFrom('notification_state')
    .select('id')
    .where('user_id', '=', userId)
    .where('is_read', '=', 0)
    .execute();

  const readAt = normalizeRequiredIso(input.readAt);
  if (unreadRows.length > 0) {
    await input.controlDb.db
      .updateTable('notification_state')
      .set({
        is_read: 1,
        read_at: readAt,
        updated_at: readAt,
      })
      .where('user_id', '=', userId)
      .where('is_read', '=', 0)
      .execute();
  }

  return {
    updated_count: unreadRows.length,
    read_at: readAt,
  };
}

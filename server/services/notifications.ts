import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type DbClient = SupabaseClient<any, 'public', any>;

export type RetrySourceUnlockNotificationAction = {
  kind: 'retry_source_unlock';
  platform: 'youtube';
  external_id: string;
  item: {
    video_id: string;
    video_url: string;
    title: string;
    duration_seconds?: number | null;
  };
};

export type NotificationType =
  | 'comment_reply'
  | 'generation_started'
  | 'generation_succeeded'
  | 'generation_failed';

export type NotificationRow = {
  id: string;
  user_id: string;
  type: NotificationType;
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

export type NotificationEvent =
  | {
      kind: 'generation_started';
      userId: string;
      jobId: string;
      scope: string;
      queuedCount: number;
      itemTitle?: string | null;
      traceId?: string | null;
      linkPath?: string | null;
    }
  | {
      kind: 'generation_terminal';
      userId: string;
      jobId: string;
      scope: string;
      inserted: number;
      skipped: number;
      failed: number;
      itemTitle?: string | null;
      blueprintTitle?: string | null;
      failureSummary?: string | null;
      traceId?: string | null;
      linkPath?: string | null;
      firstBlueprintId?: string | null;
      retryAction?: RetrySourceUnlockNotificationAction | null;
    };

type NotificationInsertInput = {
  id?: string | null;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkPath?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
};

type NotificationOracleWriteAdapter = {
  upsertNotification: (input: {
    row: NotificationRow;
    nowIso?: string;
  }) => Promise<NotificationRow | null>;
  markNotificationRead: (input: {
    userId: string;
    notificationId: string;
    readAt?: string;
  }) => Promise<{ id: string; is_read: boolean; read_at: string | null } | null>;
  markAllNotificationsRead: (input: {
    userId: string;
    readAt?: string;
  }) => Promise<{ updated_count: number; read_at: string }>;
};

type NotificationEventBuilder<TEvent extends NotificationEvent> = (
  event: TEvent,
) => NotificationInsertInput | null;

const eventBuilders: {
  [K in NotificationEvent['kind']]: NotificationEventBuilder<Extract<NotificationEvent, { kind: K }>>;
} = {
  generation_started: buildGenerationStartedEvent,
  generation_terminal: buildGenerationTerminalEvent,
};
let notificationOracleWriteAdapter: NotificationOracleWriteAdapter | null = null;

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function encodeCursor(createdAt: string, id: string) {
  const payload = JSON.stringify({ created_at: createdAt, id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(raw: string | null | undefined) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { created_at?: string; id?: string };
    const createdAt = String(parsed.created_at || '').trim();
    const id = String(parsed.id || '').trim();
    if (!createdAt || !id) return null;
    if (!Number.isFinite(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function buildCursorFilter(cursor: { createdAt: string; id: string } | null) {
  if (!cursor) return null;
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

function buildNotificationRow(input: NotificationInsertInput, nowIso: string): NotificationRow {
  return {
    id: String(input.id || '').trim() || randomUUID(),
    user_id: String(input.userId || '').trim(),
    type: input.type,
    title: String(input.title || '').trim() || 'Notification',
    body: String(input.body || '').trim() || '',
    link_path: String(input.linkPath || '').trim() || null,
    metadata: input.metadata || {},
    is_read: false,
    read_at: null,
    created_at: nowIso,
    updated_at: nowIso,
    dedupe_key: String(input.dedupeKey || '').trim() || null,
  };
}

async function shadowUpsertNotificationRow(
  db: DbClient,
  row: NotificationRow,
): Promise<NotificationRow | null> {
  const { data, error } = await db
    .from('notifications')
    .upsert({
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      title: row.title,
      body: row.body,
      link_path: row.link_path,
      metadata: row.metadata,
      is_read: row.is_read,
      read_at: row.read_at,
      dedupe_key: row.dedupe_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
    .select('id, user_id, type, title, body, link_path, metadata, is_read, read_at, created_at, updated_at, dedupe_key')
    .maybeSingle();
  if (error) throw error;
  return (data || null) as NotificationRow | null;
}

async function shadowMarkNotificationRead(
  db: DbClient,
  input: {
    userId: string;
    notificationId: string;
    readAt: string;
  },
) {
  const { data, error } = await db
    .from('notifications')
    .update({
      is_read: true,
      read_at: input.readAt,
    })
    .eq('id', input.notificationId)
    .eq('user_id', input.userId)
    .select('id, is_read, read_at')
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        id: data.id as string,
        is_read: Boolean(data.is_read),
        read_at: (data.read_at as string | null) || input.readAt,
      }
    : null;
}

async function shadowMarkAllNotificationsRead(
  db: DbClient,
  input: {
    userId: string;
    readAt: string;
  },
) {
  const { data, error } = await db
    .from('notifications')
    .update({
      is_read: true,
      read_at: input.readAt,
    })
    .eq('user_id', input.userId)
    .eq('is_read', false)
    .select('id');
  if (error) throw error;

  return {
    updated_count: (data || []).length,
    read_at: input.readAt,
  };
}

export function configureNotificationOracleWriteAdapter(adapter: NotificationOracleWriteAdapter | null) {
  notificationOracleWriteAdapter = adapter;
}

export async function createNotification(
  db: DbClient,
  input: NotificationInsertInput,
): Promise<NotificationRow | null> {
  const userId = String(input.userId || '').trim();
  if (!userId) throw new Error('NOTIFICATION_USER_REQUIRED');
  const nowIso = new Date().toISOString();
  const row = buildNotificationRow({
    ...input,
    userId,
  }, nowIso);

  if (notificationOracleWriteAdapter) {
    const oracleRow = await notificationOracleWriteAdapter.upsertNotification({
      row,
      nowIso,
    });
    await shadowUpsertNotificationRow(db, oracleRow || row);
    return oracleRow || row;
  }

  return shadowUpsertNotificationRow(db, row);
}

function buildGenerationStartedEvent(
  event: Extract<NotificationEvent, { kind: 'generation_started' }>,
): NotificationInsertInput | null {
  const queuedCount = Math.max(0, Number(event.queuedCount || 0));
  if (queuedCount <= 0) return null;
  const itemTitle = String(event.itemTitle || '').trim();
  const title = 'Generation started';
  const body = itemTitle
    || (queuedCount === 1
      ? 'We started generating your blueprint. We will notify you when it is done.'
      : `We started ${queuedCount} blueprint generations. We will notify you when they are done.`);
  const linkPath = String(event.linkPath || '').trim() || '/wall';
  const dedupeKey = `generation_started:${event.scope}:${event.jobId}`;

  return {
    userId: event.userId,
    type: 'generation_started',
    title,
    body,
    linkPath,
    metadata: {
      job_id: event.jobId,
      scope: event.scope,
      queued_count: queuedCount,
      item_title: itemTitle || null,
      trace_id: event.traceId || null,
    },
    dedupeKey,
  };
}

function buildGenerationTerminalEvent(
  event: Extract<NotificationEvent, { kind: 'generation_terminal' }>,
): NotificationInsertInput | null {
  const inserted = Math.max(0, Number(event.inserted || 0));
  const skipped = Math.max(0, Number(event.skipped || 0));
  const failed = Math.max(0, Number(event.failed || 0));
  const hasTerminalSignal = inserted > 0 || failed > 0;
  if (!hasTerminalSignal) return null;
  const blueprintTitle = String(event.blueprintTitle || '').trim();
  const itemTitle = String(event.itemTitle || '').trim();
  const failureSummary = String(event.failureSummary || '').trim();

  const succeeded = inserted > 0;
  const type: NotificationType = succeeded ? 'generation_succeeded' : 'generation_failed';
  const title = succeeded ? 'Your blueprint generation is complete' : 'Your blueprint generation failed';
  const body = succeeded
    ? (blueprintTitle || itemTitle || `Generated ${inserted}, skipped ${skipped}, failed ${failed}.`)
    : (itemTitle && failureSummary
      ? `${itemTitle} · ${failureSummary}`
      : failureSummary || itemTitle || `Generated ${inserted}, skipped ${skipped}, failed ${failed}.`);
  const linkPath = event.firstBlueprintId
    ? `/blueprint/${event.firstBlueprintId}`
    : (String(event.linkPath || '').trim() || '/wall');
  const dedupeKey = `generation_terminal:${event.scope}:${event.jobId}:${succeeded ? 'succeeded' : 'failed'}`;

  return {
    userId: event.userId,
    type,
    title,
    body,
    linkPath,
    metadata: {
      job_id: event.jobId,
      scope: event.scope,
      inserted_count: inserted,
      skipped_count: skipped,
      failed_count: failed,
      item_title: itemTitle || null,
      blueprint_title: blueprintTitle || null,
      failure_summary: failureSummary || null,
      trace_id: event.traceId || null,
      retry_action: event.retryAction || null,
    },
    dedupeKey,
  };
}

export async function createNotificationFromEvent(
  db: DbClient,
  event: NotificationEvent,
): Promise<NotificationRow | null> {
  const builder = eventBuilders[event.kind] as NotificationEventBuilder<NotificationEvent> | undefined;
  if (!builder) return null;
  const payload = builder(event);
  if (!payload) return null;
  return createNotification(db, payload);
}

export async function listNotificationsForUser(
  db: DbClient,
  input: {
    userId: string;
    limit?: number;
    cursor?: string | null;
  },
) {
  const userId = String(input.userId || '').trim();
  if (!userId) throw new Error('NOTIFICATION_USER_REQUIRED');
  const limit = clampInt(Number(input.limit || 20), 1, 50);
  const cursor = decodeCursor(input.cursor);

  let query = db
    .from('notifications')
    .select('id, user_id, type, title, body, link_path, metadata, is_read, read_at, created_at, updated_at, dedupe_key')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  const cursorFilter = buildCursorFilter(cursor);
  if (cursorFilter) query = query.or(cursorFilter);

  const { data, error } = await query;
  if (error) throw error;

  const { count, error: countError } = await db
    .from('notifications')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (countError) throw countError;

  const items = (data || []) as NotificationRow[];
  const last = items.length === limit ? items[items.length - 1] : null;
  const nextCursor = last ? encodeCursor(last.created_at, last.id) : null;

  return {
    items,
    unread_count: Number(count || 0),
    next_cursor: nextCursor,
  };
}

export async function markNotificationRead(
  db: DbClient,
  input: {
    userId: string;
    notificationId: string;
  },
) {
  const userId = String(input.userId || '').trim();
  const notificationId = String(input.notificationId || '').trim();
  if (!userId || !notificationId) throw new Error('NOTIFICATION_MARK_READ_INVALID_INPUT');

  const readAt = new Date().toISOString();
  if (notificationOracleWriteAdapter) {
    const oracleResult = await notificationOracleWriteAdapter.markNotificationRead({
      userId,
      notificationId,
      readAt,
    });
    const shadowResult = await shadowMarkNotificationRead(db, {
      userId,
      notificationId,
      readAt,
    });
    return oracleResult || shadowResult;
  }

  return shadowMarkNotificationRead(db, {
    userId,
    notificationId,
    readAt,
  });
}

export async function markAllNotificationsRead(
  db: DbClient,
  input: { userId: string },
) {
  const userId = String(input.userId || '').trim();
  if (!userId) throw new Error('NOTIFICATION_USER_REQUIRED');

  const readAt = new Date().toISOString();
  if (notificationOracleWriteAdapter) {
    await notificationOracleWriteAdapter.markAllNotificationsRead({
      userId,
      readAt,
    });
  }

  return shadowMarkAllNotificationsRead(db, {
    userId,
    readAt,
  });
}

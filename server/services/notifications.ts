import type { SupabaseClient } from '@supabase/supabase-js';

type DbClient = SupabaseClient<any, 'public', any>;

export type NotificationType =
  | 'comment_reply'
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
      kind: 'generation_terminal';
      userId: string;
      jobId: string;
      scope: string;
      inserted: number;
      skipped: number;
      failed: number;
      traceId?: string | null;
      linkPath?: string | null;
      firstBlueprintId?: string | null;
    };

type NotificationInsertInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkPath?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
};

type NotificationEventBuilder<TEvent extends NotificationEvent> = (
  event: TEvent,
) => NotificationInsertInput | null;

const eventBuilders: {
  [K in NotificationEvent['kind']]: NotificationEventBuilder<Extract<NotificationEvent, { kind: K }>>;
} = {
  generation_terminal: buildGenerationTerminalEvent,
};

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

export async function createNotification(
  db: DbClient,
  input: NotificationInsertInput,
): Promise<NotificationRow | null> {
  const userId = String(input.userId || '').trim();
  if (!userId) throw new Error('NOTIFICATION_USER_REQUIRED');

  const payload = {
    user_id: userId,
    type: input.type,
    title: String(input.title || '').trim() || 'Notification',
    body: String(input.body || '').trim() || '',
    link_path: String(input.linkPath || '').trim() || null,
    metadata: input.metadata || {},
    dedupe_key: String(input.dedupeKey || '').trim() || null,
  };

  const { data, error } = await db
    .from('notifications')
    .upsert(payload, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
    .select('id, user_id, type, title, body, link_path, metadata, is_read, read_at, created_at, updated_at, dedupe_key')
    .maybeSingle();
  if (error) throw error;
  return (data || null) as NotificationRow | null;
}

function buildGenerationTerminalEvent(
  event: Extract<NotificationEvent, { kind: 'generation_terminal' }>,
): NotificationInsertInput | null {
  const inserted = Math.max(0, Number(event.inserted || 0));
  const skipped = Math.max(0, Number(event.skipped || 0));
  const failed = Math.max(0, Number(event.failed || 0));
  const hasTerminalSignal = inserted > 0 || failed > 0;
  if (!hasTerminalSignal) return null;

  const succeeded = inserted > 0;
  const type: NotificationType = succeeded ? 'generation_succeeded' : 'generation_failed';
  const title = succeeded ? 'Your blueprint generation is complete' : 'Your blueprint generation failed';
  const body = `Generated ${inserted}, skipped ${skipped}, failed ${failed}.`;
  const linkPath = event.firstBlueprintId
    ? `/blueprint/${event.firstBlueprintId}`
    : (String(event.linkPath || '').trim() || '/my-feed');
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
      trace_id: event.traceId || null,
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
  const { data, error } = await db
    .from('notifications')
    .update({
      is_read: true,
      read_at: readAt,
    })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select('id, is_read, read_at')
    .maybeSingle();
  if (error) throw error;

  return data
    ? {
        id: data.id as string,
        is_read: Boolean(data.is_read),
        read_at: (data.read_at as string | null) || readAt,
      }
    : null;
}

export async function markAllNotificationsRead(
  db: DbClient,
  input: { userId: string },
) {
  const userId = String(input.userId || '').trim();
  if (!userId) throw new Error('NOTIFICATION_USER_REQUIRED');

  const readAt = new Date().toISOString();
  const { data, error } = await db
    .from('notifications')
    .update({
      is_read: true,
      read_at: readAt,
    })
    .eq('user_id', userId)
    .eq('is_read', false)
    .select('id');
  if (error) throw error;

  return {
    updated_count: (data || []).length,
    read_at: readAt,
  };
}

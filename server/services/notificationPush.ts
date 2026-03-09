import type { SupabaseClient } from '@supabase/supabase-js';
import * as webpush from 'web-push';

type DbClient = SupabaseClient<any, 'public', any>;

export const NOTIFICATION_PUSH_TYPES = [
  'comment_reply',
  'generation_succeeded',
  'generation_failed',
] as const;

export type NotificationPushType = (typeof NOTIFICATION_PUSH_TYPES)[number];

export type NotificationPushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: string | null;
  platform: string | null;
  user_agent: string | null;
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type NotificationPushDispatchQueueRow = {
  id: string;
  notification_id: string;
  user_id: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string;
  last_error: string | null;
  delivered_subscription_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationPushSourceRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link_path: string | null;
  created_at: string;
};

export type NotificationPushConfig = {
  enabled: boolean;
  publicKey: string | null;
  privateKey: string | null;
  subject: string | null;
};

export type NotificationPushPayload = {
  notification_id: string;
  type: string;
  title: string;
  body: string;
  link_path: string | null;
  created_at: string;
};

export type NotificationPushSubscriptionUpsertInput = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime?: string | null;
  platform?: string | null;
  userAgent?: string | null;
};

export type ProcessNotificationPushDispatchBatchDeps = {
  maxAttempts: number;
  processingStaleMs: number;
  batchSize: number;
  sendPushNotification: (subscription: NotificationPushSubscriptionRow, payload: NotificationPushPayload) => Promise<void>;
  now?: () => Date;
};

const DEFAULT_RETRY_DELAYS_SECONDS = [30, 120, 600];

export function readNotificationPushConfigFromEnv(env: NodeJS.ProcessEnv): NotificationPushConfig {
  const enabled = parseRuntimeFlag(env.WEB_PUSH_ENABLED, false);
  const publicKey = readOptionalString(env.WEB_PUSH_VAPID_PUBLIC_KEY);
  const privateKey = readOptionalString(env.WEB_PUSH_VAPID_PRIVATE_KEY);
  const subject = readOptionalString(env.WEB_PUSH_SUBJECT);
  const configured = enabled && Boolean(publicKey && privateKey && subject);
  return {
    enabled: configured,
    publicKey: configured ? publicKey : null,
    privateKey: configured ? privateKey : null,
    subject: configured ? subject : null,
  };
}

export function isNotificationPushEligibleType(value: unknown): value is NotificationPushType {
  return NOTIFICATION_PUSH_TYPES.includes(String(value || '').trim() as NotificationPushType);
}

export function createNotificationPushSender(config: NotificationPushConfig) {
  if (!config.enabled || !config.publicKey || !config.privateKey || !config.subject) {
    return null;
  }

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  return async (subscription: NotificationPushSubscriptionRow, payload: NotificationPushPayload) => {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expiration_time ? Date.parse(subscription.expiration_time) : null,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
      {
        TTL: 60 * 60,
        urgency: payload.type === 'comment_reply' ? 'normal' : 'high',
      },
    );
  };
}

export function buildNotificationPushPayload(notification: NotificationPushSourceRow): NotificationPushPayload {
  return {
    notification_id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link_path: notification.link_path,
    created_at: notification.created_at,
  };
}

export function classifyNotificationPushError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = Number((error as { statusCode?: unknown })?.statusCode || 0);
  if (statusCode === 404 || statusCode === 410) {
    return { kind: 'permanent' as const, statusCode, message };
  }
  return { kind: 'transient' as const, statusCode: statusCode || null, message };
}

export function getNotificationPushRetryDelaySeconds(attemptCount: number) {
  return DEFAULT_RETRY_DELAYS_SECONDS[Math.max(0, attemptCount - 1)] ?? 900;
}

export async function upsertNotificationPushSubscription(
  db: DbClient,
  input: NotificationPushSubscriptionUpsertInput,
) {
  const userId = String(input.userId || '').trim();
  const endpoint = String(input.endpoint || '').trim();
  const p256dh = String(input.p256dh || '').trim();
  const auth = String(input.auth || '').trim();
  if (!userId || !endpoint || !p256dh || !auth) {
    throw new Error('PUSH_SUBSCRIPTION_INVALID_INPUT');
  }

  const { data: existing, error: existingError } = await db
    .from('notification_push_subscriptions')
    .select('id')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (existingError) throw existingError;

  const payload = {
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    expiration_time: readOptionalString(input.expirationTime) || null,
    platform: readOptionalString(input.platform) || null,
    user_agent: readOptionalString(input.userAgent) || null,
    is_active: true,
    last_seen_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await db
      .from('notification_push_subscriptions')
      .update(payload)
      .eq('id', existing.id)
      .select('id, user_id, endpoint, p256dh, auth, expiration_time, platform, user_agent, is_active, last_seen_at, created_at, updated_at')
      .maybeSingle();
    if (error) throw error;
    return data as NotificationPushSubscriptionRow | null;
  }

  const { data, error } = await db
    .from('notification_push_subscriptions')
    .insert(payload)
    .select('id, user_id, endpoint, p256dh, auth, expiration_time, platform, user_agent, is_active, last_seen_at, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as NotificationPushSubscriptionRow | null;
}

export async function deactivateNotificationPushSubscription(
  db: DbClient,
  input: { userId: string; endpoint: string },
) {
  const userId = String(input.userId || '').trim();
  const endpoint = String(input.endpoint || '').trim();
  if (!userId || !endpoint) {
    throw new Error('PUSH_SUBSCRIPTION_INVALID_INPUT');
  }

  const { data, error } = await db
    .from('notification_push_subscriptions')
    .update({
      is_active: false,
      last_seen_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .select('id, user_id, endpoint, p256dh, auth, expiration_time, platform, user_agent, is_active, last_seen_at, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as NotificationPushSubscriptionRow | null;
}

export async function deactivateNotificationPushSubscriptionById(
  db: DbClient,
  input: { id: string },
) {
  const id = String(input.id || '').trim();
  if (!id) return null;
  const { data, error } = await db
    .from('notification_push_subscriptions')
    .update({
      is_active: false,
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, user_id, endpoint, p256dh, auth, expiration_time, platform, user_agent, is_active, last_seen_at, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as NotificationPushSubscriptionRow | null;
}

export async function listActiveNotificationPushSubscriptions(
  db: DbClient,
  input: { userId: string },
) {
  const userId = String(input.userId || '').trim();
  if (!userId) return [] as NotificationPushSubscriptionRow[];
  const { data, error } = await db
    .from('notification_push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, expiration_time, platform, user_agent, is_active, last_seen_at, created_at, updated_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as NotificationPushSubscriptionRow[];
}

export async function getNotificationById(
  db: DbClient,
  input: { notificationId: string },
) {
  const notificationId = String(input.notificationId || '').trim();
  if (!notificationId) return null;
  const { data, error } = await db
    .from('notifications')
    .select('id, user_id, type, title, body, link_path, created_at')
    .eq('id', notificationId)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as NotificationPushSourceRow | null;
}

export async function recoverStaleNotificationPushDispatches(
  db: DbClient,
  input: { staleBeforeIso: string },
) {
  const staleBeforeIso = String(input.staleBeforeIso || '').trim();
  if (!staleBeforeIso) return [] as NotificationPushDispatchQueueRow[];
  const { data, error } = await db
    .from('notification_push_dispatch_queue')
    .update({
      status: 'queued',
      next_attempt_at: new Date().toISOString(),
      last_error: 'Recovered stale push dispatch.',
    })
    .eq('status', 'processing')
    .lt('updated_at', staleBeforeIso)
    .select('id, notification_id, user_id, status, attempt_count, next_attempt_at, last_error, delivered_subscription_count, last_attempt_at, sent_at, created_at, updated_at');
  if (error) throw error;
  return (data || []) as NotificationPushDispatchQueueRow[];
}

export async function claimDueNotificationPushDispatches(
  db: DbClient,
  input: {
    limit: number;
    nowIso: string;
  },
) {
  const limit = Math.max(1, Math.floor(Number(input.limit || 0) || 1));
  const nowIso = String(input.nowIso || '').trim() || new Date().toISOString();
  const futureIso = new Date(Date.parse(nowIso) + 1000).toISOString();

  const { data, error } = await db
    .from('notification_push_dispatch_queue')
    .select('id, notification_id, user_id, status, attempt_count, next_attempt_at, last_error, delivered_subscription_count, last_attempt_at, sent_at, created_at, updated_at')
    .in('status', ['queued', 'retry'])
    .lt('next_attempt_at', futureIso)
    .order('next_attempt_at', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const claimed: NotificationPushDispatchQueueRow[] = [];
  for (const row of (data || []) as NotificationPushDispatchQueueRow[]) {
    const { data: updated, error: updateError } = await db
      .from('notification_push_dispatch_queue')
      .update({
        status: 'processing',
        attempt_count: Number(row.attempt_count || 0) + 1,
        last_attempt_at: nowIso,
      })
      .eq('id', row.id)
      .eq('status', row.status)
      .select('id, notification_id, user_id, status, attempt_count, next_attempt_at, last_error, delivered_subscription_count, last_attempt_at, sent_at, created_at, updated_at')
      .maybeSingle();
    if (updateError) throw updateError;
    if (updated) claimed.push(updated as NotificationPushDispatchQueueRow);
  }
  return claimed;
}

export async function markNotificationPushDispatchSent(
  db: DbClient,
  input: {
    dispatchId: string;
    deliveredSubscriptionCount: number;
  },
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('notification_push_dispatch_queue')
    .update({
      status: 'sent',
      delivered_subscription_count: Math.max(0, Math.floor(Number(input.deliveredSubscriptionCount || 0))),
      last_error: null,
      sent_at: nowIso,
      next_attempt_at: nowIso,
    })
    .eq('id', input.dispatchId)
    .select('id, notification_id, user_id, status, attempt_count, next_attempt_at, last_error, delivered_subscription_count, last_attempt_at, sent_at, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as NotificationPushDispatchQueueRow | null;
}

export async function markNotificationPushDispatchNoSubscribers(
  db: DbClient,
  input: {
    dispatchId: string;
    lastError?: string | null;
  },
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('notification_push_dispatch_queue')
    .update({
      status: 'no_subscribers',
      delivered_subscription_count: 0,
      sent_at: nowIso,
      next_attempt_at: nowIso,
      last_error: readOptionalString(input.lastError) || null,
    })
    .eq('id', input.dispatchId)
    .select('id, notification_id, user_id, status, attempt_count, next_attempt_at, last_error, delivered_subscription_count, last_attempt_at, sent_at, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as NotificationPushDispatchQueueRow | null;
}

export async function markNotificationPushDispatchRetry(
  db: DbClient,
  input: {
    dispatchId: string;
    nextAttemptAtIso: string;
    lastError: string;
  },
) {
  const { data, error } = await db
    .from('notification_push_dispatch_queue')
    .update({
      status: 'retry',
      next_attempt_at: input.nextAttemptAtIso,
      last_error: input.lastError,
    })
    .eq('id', input.dispatchId)
    .select('id, notification_id, user_id, status, attempt_count, next_attempt_at, last_error, delivered_subscription_count, last_attempt_at, sent_at, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as NotificationPushDispatchQueueRow | null;
}

export async function markNotificationPushDispatchDead(
  db: DbClient,
  input: {
    dispatchId: string;
    lastError: string;
  },
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('notification_push_dispatch_queue')
    .update({
      status: 'dead',
      next_attempt_at: nowIso,
      last_error: input.lastError,
    })
    .eq('id', input.dispatchId)
    .select('id, notification_id, user_id, status, attempt_count, next_attempt_at, last_error, delivered_subscription_count, last_attempt_at, sent_at, created_at, updated_at')
    .maybeSingle();
  if (error) throw error;
  return data as NotificationPushDispatchQueueRow | null;
}

export async function processNotificationPushDispatchBatch(
  db: DbClient,
  deps: ProcessNotificationPushDispatchBatchDeps,
) {
  const now = deps.now || (() => new Date());
  const nowIso = now().toISOString();
  const staleBeforeIso = new Date(Date.parse(nowIso) - Math.max(5_000, deps.processingStaleMs)).toISOString();

  await recoverStaleNotificationPushDispatches(db, { staleBeforeIso });
  const claimed = await claimDueNotificationPushDispatches(db, {
    limit: Math.max(1, deps.batchSize),
    nowIso,
  });

  for (const row of claimed) {
    const notification = await getNotificationById(db, { notificationId: row.notification_id });
    if (!notification || !isNotificationPushEligibleType(notification.type)) {
      await markNotificationPushDispatchDead(db, {
        dispatchId: row.id,
        lastError: 'Notification missing or not eligible for web push.',
      });
      continue;
    }

    const subscriptions = await listActiveNotificationPushSubscriptions(db, { userId: row.user_id });
    if (subscriptions.length === 0) {
      await markNotificationPushDispatchNoSubscribers(db, {
        dispatchId: row.id,
        lastError: 'No active push subscriptions for this user.',
      });
      continue;
    }

    const payload = buildNotificationPushPayload(notification);
    let deliveredCount = 0;
    const transientErrors: string[] = [];

    for (const subscription of subscriptions) {
      try {
        await deps.sendPushNotification(subscription, payload);
        deliveredCount += 1;
      } catch (error) {
        const classified = classifyNotificationPushError(error);
        if (classified.kind === 'permanent') {
          await deactivateNotificationPushSubscriptionById(db, { id: subscription.id });
          continue;
        }
        transientErrors.push(classified.message);
      }
    }

    if (deliveredCount > 0) {
      await markNotificationPushDispatchSent(db, {
        dispatchId: row.id,
        deliveredSubscriptionCount: deliveredCount,
      });
      continue;
    }

    if (transientErrors.length === 0) {
      await markNotificationPushDispatchNoSubscribers(db, {
        dispatchId: row.id,
        lastError: 'All active push subscriptions were permanently invalidated.',
      });
      continue;
    }

    if (Number(row.attempt_count || 0) >= Math.max(1, deps.maxAttempts)) {
      await markNotificationPushDispatchDead(db, {
        dispatchId: row.id,
        lastError: transientErrors[0]?.slice(0, 500) || 'Push delivery failed permanently.',
      });
      continue;
    }

    const retryDelaySeconds = getNotificationPushRetryDelaySeconds(Number(row.attempt_count || 0));
    const nextAttemptAtIso = new Date(Date.parse(nowIso) + retryDelaySeconds * 1000).toISOString();
    await markNotificationPushDispatchRetry(db, {
      dispatchId: row.id,
      nextAttemptAtIso,
      lastError: transientErrors[0]?.slice(0, 500) || 'Transient push delivery failure.',
    });
  }

  return claimed;
}

function parseRuntimeFlag(raw: unknown, fallback: boolean) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function readOptionalString(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed ? trimmed : null;
}

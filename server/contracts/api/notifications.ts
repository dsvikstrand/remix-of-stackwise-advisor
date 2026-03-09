import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

export type NotificationList = {
  items?: Array<Record<string, any>>;
  next_cursor?: string | null;
  unread_count?: number;
};

export type NotificationsRouteDeps = {
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  listNotificationsForUser: (db: DbClient, input: { userId: string; limit?: number; cursor?: string | null }) => Promise<NotificationList>;
  markAllNotificationsRead: (db: DbClient, input: { userId: string }) => Promise<Record<string, any>>;
  markNotificationRead: (db: DbClient, input: { userId: string; notificationId: string }) => Promise<Record<string, any> | null>;
  getNotificationPushConfig: () => { enabled: boolean; vapidPublicKey: string | null };
  upsertNotificationPushSubscription: (db: DbClient, input: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    expirationTime?: string | null;
    platform?: string | null;
    userAgent?: string | null;
  }) => Promise<Record<string, any> | null>;
  deactivateNotificationPushSubscription: (db: DbClient, input: { userId: string; endpoint: string }) => Promise<Record<string, any> | null>;
  clampInt: (raw: unknown, fallbackValue: number, minValue: number, maxValue: number) => number;
};

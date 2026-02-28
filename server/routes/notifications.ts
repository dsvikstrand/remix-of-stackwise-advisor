import type express from 'express';
import type { createClient } from '@supabase/supabase-js';

type DbClient = ReturnType<typeof createClient>;

type NotificationList = {
  items?: Array<Record<string, any>>;
  next_cursor?: string | null;
  unread_count?: number;
};

export type NotificationsRouteDeps = {
  getAuthedSupabaseClient: (authToken: string) => DbClient | null;
  listNotificationsForUser: (db: DbClient, input: { userId: string; limit?: number; cursor?: string | null }) => Promise<NotificationList>;
  markAllNotificationsRead: (db: DbClient, input: { userId: string }) => Promise<Record<string, any>>;
  markNotificationRead: (db: DbClient, input: { userId: string; notificationId: string }) => Promise<Record<string, any> | null>;
  clampInt: (raw: unknown, fallbackValue: number, minValue: number, maxValue: number) => number;
};

export function registerNotificationRoutes(app: express.Express, deps: NotificationsRouteDeps) {
  app.get('/api/notifications', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const limit = deps.clampInt(req.query.limit, 20, 1, 50);
    const cursor = String(req.query.cursor || '').trim() || null;

    try {
      const list = await deps.listNotificationsForUser(db, { userId, limit, cursor });
      return res.json({
        ok: true,
        error_code: null,
        message: 'notifications fetched',
        data: list,
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Could not load notifications.',
        data: null,
      });
    }
  });

  app.post('/api/notifications/read-all', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    try {
      const result = await deps.markAllNotificationsRead(db, { userId });
      return res.json({
        ok: true,
        error_code: null,
        message: 'notifications marked read',
        data: result,
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Could not update notifications.',
        data: null,
      });
    }
  });

  app.post('/api/notifications/:id([0-9a-fA-F-]{36})/read', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    try {
      const result = await deps.markNotificationRead(db, {
        userId,
        notificationId: String(req.params.id || '').trim(),
      });
      if (!result) {
        return res.status(404).json({
          ok: false,
          error_code: 'NOT_FOUND',
          message: 'Notification not found.',
          data: null,
        });
      }

      return res.json({
        ok: true,
        error_code: null,
        message: 'notification marked read',
        data: result,
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Could not update notification.',
        data: null,
      });
    }
  });
}

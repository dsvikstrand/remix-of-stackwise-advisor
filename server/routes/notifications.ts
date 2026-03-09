import type express from 'express';
import type { NotificationsRouteDeps } from '../contracts/api/notifications';

export function registerNotificationRoutes(app: express.Express, deps: NotificationsRouteDeps) {
  app.get('/api/notifications/push-subscriptions/config', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const config = deps.getNotificationPushConfig();
    return res.json({
      ok: true,
      error_code: null,
      message: 'push config fetched',
      data: {
        enabled: config.enabled,
        vapid_public_key: config.vapidPublicKey,
      },
    });
  });

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

  app.post('/api/notifications/push-subscriptions', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const endpoint = String(req.body?.endpoint || '').trim();
    const p256dh = String(req.body?.p256dh || '').trim();
    const auth = String(req.body?.auth || '').trim();
    const expirationTime = String(req.body?.expiration_time || '').trim() || null;
    const platform = String(req.body?.platform || '').trim() || null;
    const userAgent = String(req.headers['user-agent'] || '').trim() || null;

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_PUSH_SUBSCRIPTION',
        message: 'Missing push subscription fields.',
        data: null,
      });
    }

    try {
      const result = await deps.upsertNotificationPushSubscription(db, {
        userId,
        endpoint,
        p256dh,
        auth,
        expirationTime,
        platform,
        userAgent,
      });
      return res.json({
        ok: true,
        error_code: null,
        message: 'push subscription saved',
        data: result,
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Could not save push subscription.',
        data: null,
      });
    }
  });

  app.delete('/api/notifications/push-subscriptions', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) {
      return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const endpoint = String(req.body?.endpoint || '').trim();
    if (!endpoint) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_PUSH_SUBSCRIPTION',
        message: 'Missing push subscription endpoint.',
        data: null,
      });
    }

    try {
      const result = await deps.deactivateNotificationPushSubscription(db, {
        userId,
        endpoint,
      });
      if (!result) {
        return res.status(404).json({
          ok: false,
          error_code: 'NOT_FOUND',
          message: 'Push subscription not found.',
          data: null,
        });
      }
      return res.json({
        ok: true,
        error_code: null,
        message: 'push subscription disabled',
        data: result,
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Could not disable push subscription.',
        data: null,
      });
    }
  });
}

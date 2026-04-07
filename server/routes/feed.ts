import type express from 'express';
import type { FeedRouteDeps } from '../contracts/api/feed';
import { listMyFeedItems } from '../services/myFeed';

export function registerFeedRoutes(app: express.Express, deps: FeedRouteDeps) {
  app.get('/api/my-feed', async (_req, res) => {
    const userId = String((res.locals.user as { id?: string } | undefined)?.id || '').trim();
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error_code: 'AUTH_REQUIRED',
        message: 'Unauthorized',
        data: null,
      });
    }

    const db = deps.getServiceSupabaseClient();
    if (!db) {
      return res.status(500).json({
        ok: false,
        error_code: 'CONFIG_ERROR',
        message: 'Service role client is not configured',
        data: null,
      });
    }

    try {
      const items = await listMyFeedItems({
        db,
        userId,
        readUnlockRows: deps.readUnlockRows
          ? ({ db: innerDb, sourceIds }) => deps.readUnlockRows!(innerDb, sourceIds)
          : undefined,
      });
      return res.json({
        ok: true,
        error_code: null,
        message: 'my feed',
        data: {
          items,
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Failed to load My Feed',
        data: null,
      });
    }
  });

  app.post('/api/my-feed/items/:id/accept', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const feedItemId = req.params.id;
    let feedItem: Awaited<ReturnType<typeof deps.getFeedItemById>>;
    try {
      feedItem = await deps.getFeedItemById(db, {
        feedItemId,
        userId,
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Failed to load feed item', data: null });
    }
    if (!feedItem) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Feed item not found', data: null });

    if (feedItem.blueprint_id && feedItem.state === 'my_feed_published') {
      return res.json({
        ok: true,
        error_code: null,
        message: 'item already accepted',
        data: {
          user_feed_item_id: feedItem.id,
          blueprint_id: feedItem.blueprint_id,
          state: feedItem.state,
        },
      });
    }

    if (feedItem.state !== 'my_feed_pending_accept') {
      return res.status(409).json({ ok: false, error_code: 'INVALID_STATE', message: 'Only pending items can be accepted', data: null });
    }

    const { data: sourceRow, error: sourceError } = await db
      .from('source_items')
      .select('id, source_url, source_native_id')
      .eq('id', feedItem.source_item_id)
      .maybeSingle();
    if (sourceError || !sourceRow?.source_url || !sourceRow.source_native_id) {
      await deps.patchFeedItemById(db, {
        feedItemId: feedItem.id,
        userId,
        current: feedItem,
        patch: {
          state: 'my_feed_skipped',
          last_decision_code: 'SOURCE_MISSING',
        },
        action: 'feed_route_accept_source_missing',
      });
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: sourceError?.message || 'Source item missing', data: null });
    }

    try {
      const generated = await deps.createBlueprintFromVideo(db, {
        userId,
        videoUrl: sourceRow.source_url,
        videoId: sourceRow.source_native_id,
        sourceTag: 'subscription_accept',
        sourceItemId: sourceRow.id,
      });

      await deps.patchFeedItemById(db, {
        feedItemId: feedItem.id,
        userId,
        current: feedItem,
        patch: {
          blueprint_id: generated.blueprintId,
          state: 'my_feed_published',
          last_decision_code: null,
        },
        action: 'feed_route_accept_generated',
      });

      let responseState: string = 'my_feed_published';
      let responseReasonCode: string | null = null;
      try {
        const autoResult = await deps.runAutoChannelForFeedItem({
          db,
          userId,
          userFeedItemId: feedItem.id,
          blueprintId: generated.blueprintId,
          sourceItemId: sourceRow.id,
          sourceTag: 'subscription_accept',
        });
        if (autoResult) {
          responseState = autoResult.decision === 'published' ? 'channel_published' : 'channel_rejected';
          responseReasonCode = autoResult.reasonCode;
        }
      } catch (autoChannelError) {
        console.log('[auto_channel_pipeline_failed]', JSON.stringify({
          user_id: userId,
          user_feed_item_id: feedItem.id,
          blueprint_id: generated.blueprintId,
          source_item_id: sourceRow.id,
          source_tag: 'subscription_accept',
          error: autoChannelError instanceof Error ? autoChannelError.message : String(autoChannelError),
        }));
      }

      console.log('[my_feed_pending_accepted]', JSON.stringify({
        user_feed_item_id: feedItem.id,
        source_item_id: sourceRow.id,
        blueprint_id: generated.blueprintId,
        run_id: generated.runId,
      }));

      return res.json({
        ok: true,
        error_code: null,
        message: 'item accepted and generated',
        data: {
          user_feed_item_id: feedItem.id,
          blueprint_id: generated.blueprintId,
          state: responseState,
          reason_code: responseReasonCode,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = String((error as { code?: unknown } | null)?.code || '').trim().toUpperCase();
      await deps.patchFeedItemById(db, {
        feedItemId: feedItem.id,
        userId,
        current: feedItem,
        patch: {
          state: 'my_feed_pending_accept',
          last_decision_code: errorCode || 'GENERATION_FAILED',
        },
        action: 'feed_route_accept_failed',
      });

      if (errorCode === 'DAILY_GENERATION_CAP_REACHED') {
        return res.status(429).json({
          ok: false,
          error_code: 'DAILY_GENERATION_CAP_REACHED',
          message,
          data: {
            user_feed_item_id: feedItem.id,
          },
        });
      }

      return res.status(500).json({
        ok: false,
        error_code: 'GENERATION_FAILED',
        message,
        data: {
          user_feed_item_id: feedItem.id,
        },
      });
    }
  });

  app.post('/api/my-feed/items/:id/skip', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    let feedItem: Awaited<ReturnType<typeof deps.getFeedItemById>>;
    try {
      feedItem = await deps.getFeedItemById(db, {
        feedItemId: req.params.id,
        userId,
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Failed to load feed item', data: null });
    }
    if (!feedItem) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Feed item not found', data: null });
    if (feedItem.state !== 'my_feed_pending_accept') {
      return res.status(409).json({ ok: false, error_code: 'INVALID_STATE', message: 'Only pending items can be skipped', data: null });
    }

    let data: Awaited<ReturnType<typeof deps.patchFeedItemById>>;
    try {
      data = await deps.patchFeedItemById(db, {
        feedItemId: feedItem.id,
        userId,
        current: feedItem,
        patch: {
          state: 'my_feed_skipped',
          last_decision_code: 'SKIPPED_BY_USER',
        },
        action: 'feed_route_skip',
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error instanceof Error ? error.message : 'Failed to update feed item', data: null });
    }
    if (!data) return res.status(409).json({ ok: false, error_code: 'INVALID_STATE', message: 'Only pending items can be skipped', data: null });

    return res.json({
      ok: true,
      error_code: null,
      message: 'item skipped',
      data: {
        user_feed_item_id: data.id,
        state: data.state,
      },
    });
  });

  app.post('/api/my-feed/items/:id/auto-publish', async (req, res) => {
    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

    if (!deps.autoChannelPipelineEnabled) {
      return res.status(409).json({
        ok: false,
        error_code: 'AUTO_CHANNEL_DISABLED',
        message: 'Auto-channel pipeline is disabled.',
        data: null,
      });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    let feedItem: Awaited<ReturnType<typeof deps.getFeedItemById>>;
    try {
      feedItem = await deps.getFeedItemById(db, {
        feedItemId: req.params.id,
        userId,
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Failed to load feed item', data: null });
    }
    if (!feedItem) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Feed item not found', data: null });
    if (!feedItem.blueprint_id) {
      return res.status(409).json({
        ok: false,
        error_code: 'BLUEPRINT_REQUIRED',
        message: 'Feed item has no blueprint to auto-publish.',
        data: null,
      });
    }

    const sourceTag = String(req.body?.source_tag || 'manual_save').trim() || 'manual_save';

    try {
      const result = await deps.runAutoChannelForFeedItem({
        db,
        userId,
        userFeedItemId: feedItem.id,
        blueprintId: feedItem.blueprint_id,
        sourceItemId: feedItem.source_item_id || null,
        sourceTag,
      });

      if (!result) {
        return res.status(500).json({
          ok: false,
          error_code: 'AUTO_CHANNEL_DISABLED',
          message: 'Auto-channel pipeline is disabled.',
          data: null,
        });
      }

      return res.json({
        ok: true,
        error_code: null,
        message: 'auto publish complete',
        data: {
          user_feed_item_id: result.userFeedItemId,
          candidate_id: result.candidateId,
          channel_slug: result.channelSlug,
          decision: result.decision,
          reason_code: result.reasonCode,
          classifier_mode: result.classifierMode,
          classifier_reason: result.classifierReason,
          classifier_confidence: result.classifierConfidence ?? null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        ok: false,
        error_code: 'AUTO_CHANNEL_FAILED',
        message,
        data: {
          user_feed_item_id: feedItem.id,
        },
      });
    }
  });
}

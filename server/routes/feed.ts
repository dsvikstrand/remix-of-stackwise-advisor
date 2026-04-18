import type express from 'express';
import type { FeedRouteDeps } from '../contracts/api/feed';
import { listMyFeedItems } from '../services/myFeed';

export function registerFeedRoutes(app: express.Express, deps: FeedRouteDeps) {
  app.post('/api/my-feed/youtube-save', async (req, res) => {
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

    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const videoUrl = String(body.video_url || '').trim();
    const title = String(body.title || '').trim();
    const blueprintId = String(body.blueprint_id || '').trim() || null;
    const state = String(body.state || '').trim() || 'my_feed_published';
    const sourceChannelId = String(body.source_channel_id || '').trim() || null;
    const sourceChannelTitle = String(body.source_channel_title || '').trim() || null;
    const sourceChannelUrl = String(body.source_channel_url || '').trim() || null;
    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata as Record<string, unknown>
      : null;

    if (!videoUrl || !title) {
      return res.status(400).json({
        ok: false,
        error_code: 'VALIDATION_ERROR',
        message: 'video_url and title are required.',
        data: null,
      });
    }

    try {
      const result = await deps.saveGeneratedYouTubeBlueprintToFeed(db, {
        userId,
        videoUrl,
        title,
        blueprintId,
        sourceChannelId,
        sourceChannelTitle,
        sourceChannelUrl,
        metadata,
        state,
      });
      return res.json({
        ok: true,
        error_code: null,
        message: 'youtube blueprint saved to feed',
        data: {
          source_item: result.sourceItem,
          feed_item: result.feedItem,
          existing: result.existing,
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'WRITE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to save generated blueprint to feed',
        data: null,
      });
    }
  });

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
        readChannelCandidateRows: deps.readChannelCandidateRows
          ? ({ db: innerDb, feedItemIds, statuses }) => deps.readChannelCandidateRows!({
              db: innerDb,
              feedItemIds,
              statuses,
            })
          : undefined,
        readFeedRows: deps.readFeedRows
          ? ({ db: innerDb, userId: innerUserId, limit, sourceItemIds, requireBlueprint }) => deps.readFeedRows!({
              db: innerDb,
              userId: innerUserId,
              limit,
              sourceItemIds,
              requireBlueprint,
            })
          : undefined,
        readSourceRows: deps.readSourceRows
          ? ({ db: innerDb, sourceIds }) => deps.readSourceRows!({
              db: innerDb,
              sourceIds,
            })
          : undefined,
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

    const sourceRowsResult = deps.readSourceRows
      ? { data: await deps.readSourceRows({
          db,
          sourceIds: [String(feedItem.source_item_id || '').trim()],
        }), error: null }
      : await db
        .from('source_items')
        .select('id, source_url, source_native_id')
        .eq('id', feedItem.source_item_id)
        .maybeSingle();
    const sourceRow = Array.isArray((sourceRowsResult as any)?.data)
      ? (sourceRowsResult as any).data[0]
      : (sourceRowsResult as any)?.data || null;
    const sourceError = (sourceRowsResult as any)?.error || null;
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

  app.post('/api/source-items/lookup', async (req, res) => {
    const db = deps.getServiceSupabaseClient();
    if (!db) {
      return res.status(500).json({
        ok: false,
        error_code: 'CONFIG_ERROR',
        message: 'Service role client is not configured',
        data: null,
      });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
    const sourceIds = [...new Set((Array.isArray(body.source_ids) ? body.source_ids : []).map((value) => String(value || '').trim()).filter(Boolean))];
    const blueprintIds = [...new Set((Array.isArray(body.blueprint_ids) ? body.blueprint_ids : []).map((value) => String(value || '').trim()).filter(Boolean))];

    try {
      const sourceItemIdByBlueprintId = new Map<string, string>();
      if (blueprintIds.length && deps.readPublicFeedRows) {
        const feedRows = await deps.readPublicFeedRows({
          db,
          blueprintIds,
          limit: Math.max(blueprintIds.length * 5, 25),
          requireBlueprint: true,
        });
        for (const row of feedRows || []) {
          const blueprintId = String(row.blueprint_id || '').trim();
          const sourceItemId = String(row.source_item_id || '').trim();
          if (!blueprintId || !sourceItemId || sourceItemIdByBlueprintId.has(blueprintId)) continue;
          sourceItemIdByBlueprintId.set(blueprintId, sourceItemId);
        }
      }

      const effectiveSourceIds = [...new Set([
        ...sourceIds,
        ...Array.from(sourceItemIdByBlueprintId.values()),
      ])];
      const items = effectiveSourceIds.length
        ? (deps.readSourceRows
          ? await deps.readSourceRows({ db, sourceIds: effectiveSourceIds })
          : ((await db
            .from('source_items')
            .select('id, source_page_id, source_channel_id, source_url, title, source_channel_title, thumbnail_url, metadata, source_native_id')
            .in('id', effectiveSourceIds)).data || []))
        : [];

      return res.json({
        ok: true,
        error_code: null,
        message: 'source items',
        data: {
          items,
          source_item_id_by_blueprint_id: Object.fromEntries(sourceItemIdByBlueprintId),
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Failed to load source items',
        data: null,
      });
    }
  });
}

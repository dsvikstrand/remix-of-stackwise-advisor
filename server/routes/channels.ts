import type express from 'express';
import type { ChannelsRouteDeps } from '../contracts/api/channels';
import { countBlueprintSections } from '../services/blueprintSections';
import { buildFeedSummary } from '../../src/lib/feedPreview';

type ChannelFeedTab = 'top' | 'recent';

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function normalizeChannelFeedTab(value: unknown): ChannelFeedTab {
  return String(value || '').trim().toLowerCase() === 'recent' ? 'recent' : 'top';
}

export function registerChannelCandidateRoutes(app: express.Express, deps: ChannelsRouteDeps) {
  app.get('/api/channels/:channelSlug/feed', async (req, res) => {
    const channelSlug = String(req.params.channelSlug || '').trim().toLowerCase();
    if (!channelSlug) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_CHANNEL',
        message: 'Channel slug required.',
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

    const tab = normalizeChannelFeedTab(req.query.tab);
    const limit = clampInt(req.query.limit, 16, 1, 24);
    const offset = clampInt(req.query.offset, 0, 0, 1000);
    const scanLimit = Math.max(limit * 3, Math.min(180, offset + limit * 4));

    try {
      const candidateRows = await deps.listChannelCandidateRows(db, {
        statuses: ['published'],
        channelSlug,
        limit: scanLimit,
      });
      if (!candidateRows || candidateRows.length === 0) {
        return res.json({
          ok: true,
          error_code: null,
          message: 'channel feed',
          data: {
            items: [],
            next_offset: null,
            total_count: 0,
          },
        });
      }

      const feedItemIds = candidateRows.map((row) => row.user_feed_item_id).filter(Boolean);
      const feedItems = (
        await Promise.all(
          feedItemIds.map((feedItemId) => deps.getFeedItemById(db, {
            feedItemId: String(feedItemId || '').trim(),
          })),
        )
      ).filter(Boolean);

      const blueprintIdByFeedItemId = new Map<string, string>(
        (feedItems || [])
          .map((row: any) => [String(row.id || '').trim(), String(row.blueprint_id || '').trim()] as const)
          .filter((row) => row[0] && row[1]),
      );
      const blueprintIds = [...new Set(
        feedItemIds
          .map((feedItemId) => blueprintIdByFeedItemId.get(String(feedItemId || '').trim()) || null)
          .filter((value): value is string => Boolean(value)),
      )];
      if (blueprintIds.length === 0) {
        return res.json({
          ok: true,
          error_code: null,
          message: 'channel feed',
          data: {
            items: [],
            next_offset: null,
            total_count: 0,
          },
        });
      }

      const { data: blueprints, error: blueprintsError } = await db
        .from('blueprints')
        .select('id, title, preview_summary, likes_count, created_at')
        .eq('is_public', true)
        .in('id', blueprintIds);
      if (blueprintsError) throw blueprintsError;

      const baseRows = (blueprints || []).map((row: any) => ({
        id: String(row.id || '').trim(),
        title: String(row.title || '').trim(),
        previewSummary: buildFeedSummary({
          primary: row.preview_summary,
          fallback: 'Open blueprint to view full details.',
          maxChars: 220,
        }),
        likesCount: Number(row.likes_count || 0),
        createdAt: String(row.created_at || ''),
        primaryChannelSlug: channelSlug,
      })).filter((row) => row.id);

      if (tab === 'top') {
        baseRows.sort((a, b) => {
          if (b.likesCount !== a.likesCount) return b.likesCount - a.likesCount;
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
        });
      } else {
        baseRows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      }

      const pagedBaseRows = baseRows.slice(offset, offset + limit);
      const pageBlueprintIds = pagedBaseRows.map((row) => row.id);
      const tagsByBlueprintId = new Map<string, string[]>();
      if (pageBlueprintIds.length > 0) {
        const tagRows = await deps.listBlueprintTagRows({ blueprintIds: pageBlueprintIds });
        tagRows.forEach((row) => {
          const blueprintId = String(row.blueprint_id || '').trim();
          const tagSlug = String(row.tag_slug || '').trim();
          if (!blueprintId || !tagSlug) return;
          const list = tagsByBlueprintId.get(blueprintId) || [];
          list.push(tagSlug);
          tagsByBlueprintId.set(blueprintId, Array.from(new Set(list.filter(Boolean))));
        });
      }

      const items = pagedBaseRows.map((row) => ({
        ...row,
        tags: tagsByBlueprintId.get(row.id) || [],
      }));
      const resolvedCount = offset + items.length;
      const definitelyMore = baseRows.length > resolvedCount;
      const maybeMoreBeyondScan = candidateRows.length === scanLimit && items.length > 0;

      return res.json({
        ok: true,
        error_code: null,
        message: 'channel feed',
        data: {
          items,
          next_offset: definitelyMore || maybeMoreBeyondScan ? resolvedCount : null,
          total_count: definitelyMore ? baseRows.length : (maybeMoreBeyondScan ? null : resolvedCount),
        },
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Failed to load channel feed.',
        data: null,
      });
    }
  });

  app.post('/api/channel-candidates', async (req, res) => {
    if (deps.rejectLegacyManualFlowIfDisabled(res)) return;

    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

    const body = req.body as { user_feed_item_id?: string; channel_slug?: string };
    const userFeedItemId = String(body.user_feed_item_id || '').trim();
    const channelSlug = String(body.channel_slug || '').trim();
    if (!userFeedItemId || !channelSlug) {
      return res.status(400).json({ ok: false, error_code: 'INVALID_INPUT', message: 'user_feed_item_id and channel_slug required', data: null });
    }

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    let feedItem: Awaited<ReturnType<typeof deps.getFeedItemById>>;
    try {
      feedItem = await deps.getFeedItemById(db, {
        feedItemId: userFeedItemId,
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: error instanceof Error ? error.message : 'Feed item missing',
        data: null,
      });
    }
    if (!feedItem) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: 'Feed item missing',
        data: null,
      });
    }

    let data;
    try {
      data = await deps.upsertChannelCandidate(db, {
        row: {
          user_feed_item_id: userFeedItemId,
          channel_slug: channelSlug,
          submitted_by_user_id: userId,
          status: 'pending',
        },
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error instanceof Error ? error.message : 'Failed to upsert candidate', data: null });
    }

    await deps.patchFeedItemById(db, {
      feedItemId: userFeedItemId,
      current: feedItem,
      patch: {
        blueprint_id: feedItem.blueprint_id,
        state: 'candidate_submitted',
        last_decision_code: null,
      },
      action: 'channel_route_candidate_submitted',
    });

    return res.json({
      ok: true,
      error_code: null,
      message: 'candidate upserted',
      data,
    });
  });

  app.get('/api/channel-candidates/:id', async (req, res) => {
    if (deps.rejectLegacyManualFlowIfDisabled(res)) return;

    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const candidateId = req.params.id;
    let candidate;
    try {
      candidate = await deps.getChannelCandidateById(db, { candidateId });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Failed to load candidate', data: null });
    }
    if (!candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });

    let feedItem: Awaited<ReturnType<typeof deps.getFeedItemById>>;
    try {
      feedItem = await deps.getFeedItemById(db, {
        feedItemId: candidate.user_feed_item_id,
        userId,
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Feed item missing', data: null });
    }
    if (!feedItem) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });

    let decisions;
    try {
      decisions = await deps.listChannelGateDecisions(db, { candidateId });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Failed to load candidate decisions', data: null });
    }

    return res.json({
      ok: true,
      error_code: null,
      message: 'candidate status',
      data: {
        ...candidate,
        decisions: decisions || [],
      },
    });
  });

  app.post('/api/channel-candidates/:id/evaluate', async (req, res) => {
    if (deps.rejectLegacyManualFlowIfDisabled(res)) return;

    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const candidateId = req.params.id;
    let candidate;
    try {
      candidate = await deps.getChannelCandidateById(db, { candidateId });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Failed to load candidate', data: null });
    }
    if (!candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });

    let feedItem: Awaited<ReturnType<typeof deps.getFeedItemById>>;
    try {
      feedItem = await deps.getFeedItemById(db, {
        feedItemId: candidate.user_feed_item_id,
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Feed item missing', data: null });
    }
    if (!feedItem) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: 'Feed item missing', data: null });

    const { data: blueprint, error: blueprintError } = await db
      .from('blueprints')
      .select('id, title, llm_review, sections_json, steps')
      .eq('id', feedItem.blueprint_id)
      .maybeSingle();
    if (blueprintError || !blueprint) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: blueprintError?.message || 'Blueprint missing', data: null });

    const tagSlugs = await deps.listBlueprintTagSlugs({ blueprintId: blueprint.id });

    const stepCount = countBlueprintSections({
      sectionsJson: (blueprint as { sections_json?: unknown }).sections_json ?? null,
      steps: blueprint.steps,
    });
    const evaluation = deps.evaluateCandidateForChannel({
      title: blueprint.title,
      llmReview: blueprint.llm_review,
      channelSlug: candidate.channel_slug,
      tagSlugs,
      stepCount,
    });

    try {
      await deps.insertChannelGateDecisions(db, {
        candidateId: candidate.id,
        decisions: evaluation.decisions,
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error instanceof Error ? error.message : 'Failed to write candidate decisions', data: null });
    }

    try {
      const updated = await deps.updateChannelCandidateStatus(db, {
        candidateId: candidate.id,
        status: evaluation.candidateStatus,
      });
      if (!updated) {
        return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });
      }
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error instanceof Error ? error.message : 'Failed to update candidate status', data: null });
    }
    await deps.patchFeedItemById(db, {
      feedItemId: candidate.user_feed_item_id,
      current: feedItem,
      patch: {
        blueprint_id: feedItem.blueprint_id,
        state: evaluation.feedState,
        last_decision_code: evaluation.reasonCode,
      },
      action: 'channel_route_candidate_evaluated',
    });

    console.log('[candidate_gate_result]', JSON.stringify({
      candidate_id: candidate.id,
      channel_slug: candidate.channel_slug,
      aggregate: evaluation.aggregate,
      reason_code: evaluation.reasonCode,
      execution_mode: 'all_gates_run',
      gate_mode: evaluation.mode,
      diagnostic_aggregate: evaluation.diagnosticAggregate || null,
      diagnostic_reason_code: evaluation.diagnosticReasonCode || null,
    }));
    if (evaluation.candidateStatus === 'pending_manual_review') {
      console.log('[candidate_manual_review_pending]', JSON.stringify({
        candidate_id: candidate.id,
        channel_slug: candidate.channel_slug,
        reason_code: evaluation.reasonCode,
        gate_mode: evaluation.mode,
      }));
    }

    return res.json({
      ok: true,
      error_code: null,
      message: 'candidate evaluated',
      data: {
        candidate_id: candidate.id,
        decision: evaluation.aggregate,
        next_state: evaluation.feedState,
        reason_code: evaluation.reasonCode,
      },
      meta: {
        execution_mode: 'all_gates_run',
        gate_mode: evaluation.mode,
        diagnostic_aggregate: evaluation.diagnosticAggregate || null,
        diagnostic_reason_code: evaluation.diagnosticReasonCode || null,
      },
    });
  });

  app.post('/api/channel-candidates/:id/publish', async (req, res) => {
    if (deps.rejectLegacyManualFlowIfDisabled(res)) return;

    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const candidateId = req.params.id;
    const body = req.body as { tag_slug?: string };

    let candidate;
    try {
      candidate = await deps.getChannelCandidateById(db, { candidateId });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Failed to load candidate', data: null });
    }
    if (!candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });

    let feedItem: Awaited<ReturnType<typeof deps.getFeedItemById>>;
    try {
      feedItem = await deps.getFeedItemById(db, {
        feedItemId: candidate.user_feed_item_id,
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Feed item missing', data: null });
    }
    if (!feedItem) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: 'Feed item missing', data: null });

    const { error: publishError } = await db
      .from('blueprints')
      .update({ is_public: true })
      .eq('id', feedItem.blueprint_id);
    if (publishError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: publishError.message, data: null });

    const tagSlug = String(body.tag_slug || candidate.channel_slug || 'general').trim().toLowerCase();
    let tagId: string | null = null;
    const { data: existingTag } = await db.from('tags').select('id').eq('slug', tagSlug).maybeSingle();
    if (existingTag?.id) {
      tagId = existingTag.id;
    } else {
      const { data: createdTag, error: tagCreateError } = await db
        .from('tags')
        .insert({ slug: tagSlug, created_by: userId })
        .select('id')
        .single();
      if (tagCreateError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: tagCreateError.message, data: null });
      tagId = createdTag.id;
    }

    if (deps.attachBlueprintTag) {
      await deps.attachBlueprintTag({
        blueprintId: feedItem.blueprint_id,
        tagId,
        tagSlug,
      });
    } else {
      const { error: tagLinkError } = await db
        .from('blueprint_tags')
        .upsert({ blueprint_id: feedItem.blueprint_id, tag_id: tagId }, { onConflict: 'blueprint_id,tag_id' });
      if (tagLinkError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: tagLinkError.message, data: null });
    }

    try {
      const updated = await deps.updateChannelCandidateStatus(db, {
        candidateId: candidate.id,
        status: 'published',
      });
      if (!updated) {
        return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });
      }
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error instanceof Error ? error.message : 'Failed to publish candidate', data: null });
    }
    await deps.patchFeedItemById(db, {
      feedItemId: candidate.user_feed_item_id,
      current: feedItem,
      patch: {
        blueprint_id: feedItem.blueprint_id,
        state: 'channel_published',
        last_decision_code: 'ALL_GATES_PASS',
      },
      action: 'channel_route_candidate_published',
    });

    console.log('[candidate_published]', JSON.stringify({
      candidate_id: candidate.id,
      user_feed_item_id: candidate.user_feed_item_id,
      blueprint_id: feedItem.blueprint_id,
      channel_slug: candidate.channel_slug,
      reason_code: 'ALL_GATES_PASS',
    }));

    return res.json({
      ok: true,
      error_code: null,
      message: 'candidate published',
      data: {
        candidate_id: candidate.id,
        published: true,
        channel_slug: candidate.channel_slug,
      },
    });
  });

  app.post('/api/channel-candidates/:id/reject', async (req, res) => {
    if (deps.rejectLegacyManualFlowIfDisabled(res)) return;

    const userId = (res.locals.user as { id?: string } | undefined)?.id;
    const authToken = (res.locals.authToken as string | undefined) ?? '';
    if (!userId || !authToken) return res.status(401).json({ ok: false, error_code: 'AUTH_REQUIRED', message: 'Unauthorized', data: null });

    const db = deps.getAuthedSupabaseClient(authToken);
    if (!db) return res.status(500).json({ ok: false, error_code: 'CONFIG_ERROR', message: 'Supabase not configured', data: null });

    const candidateId = req.params.id;
    const body = req.body as { reason_code?: string };
    const reasonCode = String(body.reason_code || 'MANUAL_REJECT').trim();

    let candidate;
    try {
      candidate = await deps.getChannelCandidateById(db, { candidateId });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Failed to load candidate', data: null });
    }
    if (!candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });

    let feedItem: Awaited<ReturnType<typeof deps.getFeedItemById>>;
    try {
      feedItem = await deps.getFeedItemById(db, {
        feedItemId: candidate.user_feed_item_id,
      });
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: error instanceof Error ? error.message : 'Feed item missing', data: null });
    }

    try {
      const updated = await deps.updateChannelCandidateStatus(db, {
        candidateId: candidate.id,
        status: 'rejected',
      });
      if (!updated) {
        return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });
      }
    } catch (error) {
      return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error instanceof Error ? error.message : 'Failed to reject candidate', data: null });
    }
    await deps.patchFeedItemById(db, {
      feedItemId: candidate.user_feed_item_id,
      current: feedItem,
      patch: {
        blueprint_id: feedItem?.blueprint_id || null,
        state: 'channel_rejected',
        last_decision_code: reasonCode,
      },
      action: 'channel_route_candidate_rejected',
    });

    console.log('[candidate_rejected]', JSON.stringify({
      candidate_id: candidate.id,
      user_feed_item_id: candidate.user_feed_item_id,
      blueprint_id: feedItem?.blueprint_id || null,
      channel_slug: candidate.channel_slug,
      reason_code: reasonCode,
    }));

    return res.json({
      ok: true,
      error_code: null,
      message: 'candidate rejected',
      data: {
        candidate_id: candidate.id,
        reason_code: reasonCode,
      },
    });
  });
}

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
    const limit = clampInt(req.query.limit, 20, 1, 40);
    const offset = clampInt(req.query.offset, 0, 0, 1000);
    const scanLimit = Math.max(120, Math.min(480, offset + limit * 8));

    try {
      const { data: candidateRows, error: candidateError } = await db
        .from('channel_candidates')
        .select('user_feed_item_id, created_at')
        .eq('status', 'published')
        .eq('channel_slug', channelSlug)
        .order('created_at', { ascending: false })
        .limit(scanLimit);
      if (candidateError) throw candidateError;
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
      const { data: feedItems, error: feedItemsError } = await db
        .from('user_feed_items')
        .select('id, blueprint_id')
        .in('id', feedItemIds);
      if (feedItemsError) throw feedItemsError;

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
      const { data: tagRows, error: tagError } = pageBlueprintIds.length > 0
        ? await db
            .from('blueprint_tags')
            .select('blueprint_id, tags(slug)')
            .in('blueprint_id', pageBlueprintIds)
        : { data: [], error: null };
      if (tagError) throw tagError;

      const tagsByBlueprintId = new Map<string, string[]>();
      (tagRows || []).forEach((row: any) => {
        const blueprintId = String(row.blueprint_id || '').trim();
        if (!blueprintId) return;
        const list = tagsByBlueprintId.get(blueprintId) || [];
        if (Array.isArray(row.tags)) {
          row.tags.forEach((tag: any) => {
            if (tag && typeof tag === 'object' && 'slug' in tag) {
              list.push(String(tag.slug || ''));
            }
          });
        } else if (row.tags && typeof row.tags === 'object' && 'slug' in row.tags) {
          list.push(String((row.tags as { slug?: string }).slug || ''));
        }
        tagsByBlueprintId.set(blueprintId, list.filter(Boolean));
      });

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

    const { data: feedItem, error: feedError } = await db
      .from('user_feed_items')
      .select('id, blueprint_id')
      .eq('id', userFeedItemId)
      .maybeSingle();
    if (feedError || !feedItem) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: feedError?.message || 'Feed item missing',
        data: null,
      });
    }

    const { data, error } = await db
      .from('channel_candidates')
      .upsert(
        {
          user_feed_item_id: userFeedItemId,
          channel_slug: channelSlug,
          submitted_by_user_id: userId,
          status: 'pending',
        },
        { onConflict: 'user_feed_item_id,channel_slug' },
      )
      .select('id, user_feed_item_id, channel_slug, status')
      .single();

    if (error) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: error.message, data: null });

    await db
      .from('user_feed_items')
      .update({ blueprint_id: feedItem.blueprint_id, state: 'candidate_submitted', last_decision_code: null })
      .eq('id', userFeedItemId);

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
    const { data: candidate, error: candidateError } = await db
      .from('channel_candidates')
      .select('id, user_feed_item_id, channel_slug, status, created_at, updated_at')
      .eq('id', candidateId)
      .maybeSingle();

    if (candidateError) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: candidateError.message, data: null });
    if (!candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });

    const { data: decisions } = await db
      .from('channel_gate_decisions')
      .select('gate_id, outcome, reason_code, score, policy_version, method_version, created_at')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false });

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
    const { data: candidate, error: candidateError } = await db
      .from('channel_candidates')
      .select('id, user_feed_item_id, channel_slug, status')
      .eq('id', candidateId)
      .maybeSingle();
    if (candidateError) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: candidateError.message, data: null });
    if (!candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: 'Candidate not found', data: null });

    const { data: feedItem, error: feedError } = await db
      .from('user_feed_items')
      .select('id, blueprint_id')
      .eq('id', candidate.user_feed_item_id)
      .maybeSingle();
    if (feedError || !feedItem) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: feedError?.message || 'Feed item missing', data: null });

    const { data: blueprint, error: blueprintError } = await db
      .from('blueprints')
      .select('id, title, llm_review, sections_json, steps')
      .eq('id', feedItem.blueprint_id)
      .maybeSingle();
    if (blueprintError || !blueprint) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: blueprintError?.message || 'Blueprint missing', data: null });

    const { data: tagRows } = await db
      .from('blueprint_tags')
      .select('tags(slug)')
      .eq('blueprint_id', blueprint.id);
    const tagSlugs = (tagRows || [])
      .map((row) => (row.tags as { slug?: string } | null)?.slug || '')
      .filter(Boolean);

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

    const decisionsPayload = evaluation.decisions.map((decision) => ({
      candidate_id: candidate.id,
      gate_id: decision.gate_id,
      outcome: decision.outcome,
      reason_code: decision.reason_code,
      score: decision.score ?? null,
      policy_version: 'bleuv1-gate-policy-v1.0',
      method_version: decision.method_version || 'gate-v1',
    }));

    const { error: insertError } = await db.from('channel_gate_decisions').insert(decisionsPayload);
    if (insertError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: insertError.message, data: null });

    await db.from('channel_candidates').update({ status: evaluation.candidateStatus }).eq('id', candidate.id);
    await db
      .from('user_feed_items')
      .update({ blueprint_id: feedItem.blueprint_id, state: evaluation.feedState, last_decision_code: evaluation.reasonCode })
      .eq('id', candidate.user_feed_item_id);

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

    const { data: candidate, error: candidateError } = await db
      .from('channel_candidates')
      .select('id, user_feed_item_id, channel_slug, status')
      .eq('id', candidateId)
      .maybeSingle();
    if (candidateError || !candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: candidateError?.message || 'Candidate not found', data: null });

    const { data: feedItem, error: feedError } = await db
      .from('user_feed_items')
      .select('id, blueprint_id')
      .eq('id', candidate.user_feed_item_id)
      .maybeSingle();
    if (feedError || !feedItem) return res.status(400).json({ ok: false, error_code: 'READ_FAILED', message: feedError?.message || 'Feed item missing', data: null });

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

    const { error: tagLinkError } = await db
      .from('blueprint_tags')
      .upsert({ blueprint_id: feedItem.blueprint_id, tag_id: tagId }, { onConflict: 'blueprint_id,tag_id' });
    if (tagLinkError) return res.status(400).json({ ok: false, error_code: 'WRITE_FAILED', message: tagLinkError.message, data: null });

    await db.from('channel_candidates').update({ status: 'published' }).eq('id', candidate.id);
    await db
      .from('user_feed_items')
      .update({ blueprint_id: feedItem.blueprint_id, state: 'channel_published', last_decision_code: 'ALL_GATES_PASS' })
      .eq('id', candidate.user_feed_item_id);

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

    const { data: candidate, error: candidateError } = await db
      .from('channel_candidates')
      .select('id, user_feed_item_id, channel_slug')
      .eq('id', candidateId)
      .maybeSingle();
    if (candidateError || !candidate) return res.status(404).json({ ok: false, error_code: 'NOT_FOUND', message: candidateError?.message || 'Candidate not found', data: null });

    const { data: feedItem } = await db
      .from('user_feed_items')
      .select('blueprint_id')
      .eq('id', candidate.user_feed_item_id)
      .maybeSingle();

    await db.from('channel_candidates').update({ status: 'rejected' }).eq('id', candidate.id);
    await db
      .from('user_feed_items')
      .update({ blueprint_id: feedItem?.blueprint_id || null, state: 'channel_rejected', last_decision_code: reasonCode })
      .eq('id', candidate.user_feed_item_id);

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

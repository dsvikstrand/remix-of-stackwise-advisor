import type express from 'express';
import type { ProfileRouteDeps } from '../contracts/api/profile';

export function registerProfileRoutes(app: express.Express, deps: ProfileRouteDeps) {
  app.get('/api/profile/:userId/feed', async (req, res) => {
    const profileUserId = String(req.params.userId || '').trim();
    if (!profileUserId) {
      return res.status(400).json({
        ok: false,
        error_code: 'INVALID_USER_ID',
        message: 'Missing profile user id',
        data: null,
      });
    }

    const viewerUserId = String((res.locals.user as { id?: string } | undefined)?.id || '').trim() || null;
    const isOwnerView = !!viewerUserId && viewerUserId === profileUserId;
    const db = deps.getServiceSupabaseClient();
    if (!db) {
      return res.status(500).json({
        ok: false,
        error_code: 'CONFIG_ERROR',
        message: 'Service role client is not configured',
        data: null,
      });
    }

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('user_id, is_public')
      .eq('user_id', profileUserId)
      .maybeSingle();
    if (profileError) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: profileError.message,
        data: null,
      });
    }
    if (!profile?.user_id) {
      return res.status(404).json({
        ok: false,
        error_code: 'PROFILE_NOT_FOUND',
        message: 'Profile not found',
        data: null,
      });
    }
    if (!profile.is_public && !isOwnerView) {
      return res.status(403).json({
        ok: false,
        error_code: 'PROFILE_PRIVATE',
        message: 'Profile is private',
        data: null,
      });
    }

    const { data: feedRows, error: feedError } = await db
      .from('user_feed_items')
      .select('id, source_item_id, blueprint_id, state, last_decision_code, created_at')
      .eq('user_id', profileUserId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (feedError) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: feedError.message,
        data: null,
      });
    }

    const filteredFeedRows = (feedRows || []).filter((row) => {
      const isLegacyPendingWithoutBlueprint =
        !row.blueprint_id && (row.state === 'my_feed_pending_accept' || row.state === 'my_feed_skipped');
      return !isLegacyPendingWithoutBlueprint;
    });
    if (!filteredFeedRows.length) {
      return res.json({
        ok: true,
        error_code: null,
        message: 'profile feed',
        data: {
          profile_user_id: profileUserId,
          is_owner_view: isOwnerView,
          items: [],
        },
      });
    }

    const sourceIds = Array.from(new Set(filteredFeedRows.map((row) => row.source_item_id).filter(Boolean))) as string[];
    const blueprintIds = Array.from(new Set(filteredFeedRows.map((row) => row.blueprint_id).filter(Boolean))) as string[];
    const feedItemIds = filteredFeedRows.map((row) => row.id);

    const [{ data: sources, error: sourcesError }, { data: blueprints, error: blueprintsError }, { data: candidates, error: candidatesError }, { data: unlocks, error: unlocksError }] = await Promise.all([
      db
        .from('source_items')
        .select('id, source_channel_id, source_url, title, source_channel_title, thumbnail_url, metadata')
        .in('id', sourceIds),
      blueprintIds.length
        ? db.from('blueprints').select('id, title, banner_url, llm_review, is_public, steps').in('id', blueprintIds)
        : Promise.resolve({ data: [], error: null }),
      db
        .from('channel_candidates')
        .select('id, user_feed_item_id, channel_slug, status, created_at')
        .in('user_feed_item_id', feedItemIds)
        .order('created_at', { ascending: false }),
      sourceIds.length
        ? db
          .from('source_item_unlocks')
          .select('source_item_id, last_error_code, transcript_status')
          .in('source_item_id', sourceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (sourcesError || blueprintsError || candidatesError || unlocksError) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: sourcesError?.message || blueprintsError?.message || candidatesError?.message || unlocksError?.message || 'Failed to load feed',
        data: null,
      });
    }

    const { data: tagRows, error: tagRowsError } = blueprintIds.length
      ? await db
        .from('blueprint_tags')
        .select('blueprint_id, tags(slug)')
        .in('blueprint_id', blueprintIds)
      : { data: [] as Array<{ blueprint_id: string; tags: { slug: string } | { slug: string }[] | null }>, error: null };
    if (tagRowsError) {
      return res.status(400).json({
        ok: false,
        error_code: 'READ_FAILED',
        message: tagRowsError.message,
        data: null,
      });
    }

    const tagsByBlueprint = new Map<string, string[]>();
    (tagRows || []).forEach((row) => {
      const list = tagsByBlueprint.get(row.blueprint_id) || [];
      if (Array.isArray(row.tags)) {
        row.tags.forEach((tag) => {
          if (tag && typeof tag === 'object' && 'slug' in tag) list.push(String((tag as { slug: string }).slug));
        });
      } else if (row.tags && typeof row.tags === 'object' && 'slug' in row.tags) {
        list.push(String((row.tags as { slug: string }).slug));
      }
      tagsByBlueprint.set(row.blueprint_id, list);
    });

    const sourceMap = new Map((sources || []).map((row) => [row.id, row]));
    const blueprintMap = new Map((blueprints || []).map((row) => [row.id, row]));
    const transcriptHiddenSourceIds = new Set(
      (unlocks || [])
        .filter((row) => {
          const status = deps.normalizeTranscriptTruthStatus((row as { transcript_status?: unknown }).transcript_status);
          if (status === 'confirmed_no_speech' || status === 'retrying') return true;
          const normalizedErrorCode = String(row.last_error_code || '').trim().toUpperCase();
          return normalizedErrorCode === 'NO_TRANSCRIPT_PERMANENT' || normalizedErrorCode === 'TRANSCRIPT_UNAVAILABLE';
        })
        .map((row) => String(row.source_item_id || '').trim())
        .filter(Boolean),
    );
    const candidateMap = new Map<string, { id: string; channelSlug: string; status: string }>();
    (candidates || []).forEach((row) => {
      if (candidateMap.has(row.user_feed_item_id)) return;
      candidateMap.set(row.user_feed_item_id, {
        id: row.id,
        channelSlug: row.channel_slug,
        status: row.status,
      });
    });

    const visibleFeedRows = filteredFeedRows.filter((row) => {
      if (row.blueprint_id) return true;
      const sourceItemId = String(row.source_item_id || '').trim();
      return !sourceItemId || !transcriptHiddenSourceIds.has(sourceItemId);
    });

    const items = visibleFeedRows.map((row) => {
      const source = sourceMap.get(row.source_item_id);
      const blueprint = row.blueprint_id ? blueprintMap.get(row.blueprint_id) : null;
      const sourceMetadata =
        source?.metadata
        && typeof source.metadata === 'object'
        && source.metadata !== null
          ? (source.metadata as Record<string, unknown>)
          : null;
      const metadataSourceChannelTitle =
        sourceMetadata && typeof sourceMetadata.source_channel_title === 'string'
          ? String(sourceMetadata.source_channel_title || '').trim() || null
          : (
            sourceMetadata && typeof sourceMetadata.channel_title === 'string'
              ? String(sourceMetadata.channel_title || '').trim() || null
              : null
          );

      return {
        id: row.id,
        state: row.state,
        lastDecisionCode: row.last_decision_code,
        createdAt: row.created_at,
        source: source
          ? {
              id: source.id,
              sourceChannelId: source.source_channel_id || null,
              sourceUrl: source.source_url,
              title: source.title,
              sourceChannelTitle: source.source_channel_title || metadataSourceChannelTitle || null,
              thumbnailUrl: source.thumbnail_url || null,
              channelBannerUrl:
                source.metadata
                && typeof source.metadata === 'object'
                && source.metadata !== null
                && 'channel_banner_url' in source.metadata
                  ? String((source.metadata as Record<string, unknown>).channel_banner_url || '') || null
                  : null,
            }
          : null,
        blueprint: blueprint
          ? {
              id: blueprint.id,
              title: blueprint.title,
              bannerUrl: blueprint.banner_url,
              llmReview: blueprint.llm_review,
              isPublic: blueprint.is_public,
              steps: blueprint.steps,
              tags: tagsByBlueprint.get(blueprint.id) || [],
            }
          : null,
        candidate: candidateMap.get(row.id) || null,
      };
    });

    return res.json({
      ok: true,
      error_code: null,
      message: 'profile feed',
      data: {
        profile_user_id: profileUserId,
        is_owner_view: isOwnerView,
        items,
      },
    });
  });
}

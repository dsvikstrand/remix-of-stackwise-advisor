import type { OracleControlPlaneDb } from './oracleControlPlaneDb';
import type {
  OutreachDraftGenerationResult,
  OutreachDraftHistoryRow,
  OutreachDraftStateStore,
} from './outreachDrafts';

const AUTO_PROMO_SUFFIX = 'More on my channel.';

export type OutreachAutoPostConfig = {
  enabled: boolean;
  adminUserId: string;
  activatedAtIso: string | null;
  monitorLimit: number;
  scanIntervalMs: number;
  minViews: number;
  minComments: number;
  minDurationSeconds: number;
  delayMinMs: number;
  delayMaxMs: number;
  dailyCap: number;
  creatorMinSpacingMs: number;
  creatorWindowCap: number;
  creatorWindowDays: number;
  visibilityHealthMinChecked: number;
  visibilityHealthMinRate: number;
  visibilityHealthMaxNotVisibleStreak: number;
};

export type OutreachAutoCandidate = {
  blueprintId: string;
  sourceItemId: string;
  generatedAtIso: string;
};

export type OutreachAutoStatsItem = {
  sourceItemId: string;
  sourceChannelId: string | null;
  videoId: string | null;
  viewCount: number | null;
  commentCount: number | null;
  durationSeconds: number | null;
  status: 'refreshed' | 'skipped' | 'failed';
  errorMessage: string | null;
};

export type OutreachAutoPostDeps = {
  controlDb: OracleControlPlaneDb;
  config: OutreachAutoPostConfig;
  randomUUID: () => string;
  now?: () => Date;
  log?: (event: string, payload: Record<string, unknown>) => void;
  listCandidates: (input: {
    adminUserId: string;
    activatedAtIso: string;
    limit: number;
  }) => Promise<OutreachAutoCandidate[]>;
  refreshStats: (input: {
    adminUserId: string;
    sourceItemIds: string[];
  }) => Promise<{ items: OutreachAutoStatsItem[] }>;
  generateDraft: (input: {
    adminUserId: string;
    blueprintId: string;
  }) => Promise<OutreachDraftGenerationResult>;
  postDraft: (input: {
    adminUserId: string;
    draftId: string;
    finalText: string;
  }) => Promise<{
    draftId: string;
    draftGroupId: string;
    blueprintId: string;
    sourceItemId: string;
    youtubeVideoId: string;
    youtubeCommentId: string;
    status: string;
    postedAt: string;
  }>;
  stateStore: OutreachDraftStateStore;
};

type ExistingAutoState = {
  id: string;
  admin_user_id: string;
  blueprint_id: string;
  source_item_id: string;
  youtube_video_id: string | null;
  video_url: string | null;
  source_channel_id: string | null;
  source_channel_title: string | null;
  status: string;
  eligible_after: string | null;
  draft_id: string | null;
  draft_group_id: string | null;
  final_text: string | null;
  youtube_comment_id: string | null;
  view_count: number | null;
  comment_count: number | null;
  duration_seconds: number | null;
  decision_code: string | null;
  decision_message: string | null;
  decision_json: string | null;
  activation_started_at: string;
  first_seen_at: string;
  last_scanned_at: string | null;
  posted_at: string | null;
  skipped_at: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeString(value: unknown) {
  return String(value || '').trim();
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function addMs(date: Date, ms: number) {
  return new Date(date.getTime() + ms);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isPosted(row: {
  status?: string | null;
  youtube_comment_id?: string | null;
  posted_at?: string | null;
}) {
  const status = normalizeString(row.status).toLowerCase();
  return status === 'posted'
    || status === 'posted_unverified'
    || Boolean(normalizeString(row.youtube_comment_id))
    || Boolean(normalizeString(row.posted_at));
}

function appendPromoText(commentText: string, promoText: string) {
  const comment = normalizeString(commentText);
  const promo = normalizeString(promoText);
  if (!comment) return promo;
  if (!promo) return comment;
  return `${comment}\n\n${promo}`;
}

function buildDefaultAutoFinalText(result: OutreachDraftGenerationResult) {
  const option = result.options[0] || null;
  const promo = result.promoVariants[0]?.text || '';
  if (!option?.id || !option.finalText || !promo) return null;
  return {
    draftId: option.id,
    draftGroupId: result.draftGroupId,
    finalText: appendPromoText(option.finalText, `${promo} ${AUTO_PROMO_SUFFIX}`),
  };
}

function randomDelayMs(input: {
  minMs: number;
  maxMs: number;
  randomInt: () => number;
}) {
  const minMs = Math.max(0, Math.floor(input.minMs));
  const maxMs = Math.max(minMs, Math.floor(input.maxMs));
  const span = Math.max(0, maxMs - minMs);
  if (span === 0) return minMs;
  return minMs + (Math.abs(input.randomInt()) % (span + 1));
}

function statsPass(item: OutreachAutoStatsItem, config: OutreachAutoPostConfig) {
  const viewCount = normalizeNumber(item.viewCount);
  const commentCount = normalizeNumber(item.commentCount);
  const durationSeconds = normalizeNumber(item.durationSeconds);
  if (item.status === 'failed') {
    return { ok: false, code: 'stats_fetch_failed', message: item.errorMessage || 'Could not fetch video stats.' };
  }
  if (!item.videoId) return { ok: false, code: 'video_id_missing', message: 'Could not resolve YouTube video id.' };
  if (!item.sourceChannelId) return { ok: false, code: 'source_channel_missing', message: 'Could not resolve source channel.' };
  if (viewCount === null || viewCount < config.minViews) {
    return { ok: false, code: 'views_too_low', message: `Video has ${viewCount ?? 'unknown'} views; required ${config.minViews}.` };
  }
  if (commentCount === null || commentCount < config.minComments) {
    return { ok: false, code: 'comments_too_low', message: `Video has ${commentCount ?? 'unknown'} comments; required ${config.minComments}.` };
  }
  if (durationSeconds === null || durationSeconds < config.minDurationSeconds) {
    return { ok: false, code: 'duration_too_short', message: `Video is ${durationSeconds ?? 'unknown'}s; required ${config.minDurationSeconds}s.` };
  }
  return { ok: true, code: 'stats_pass', message: 'Stats passed.' };
}

function shouldContinueWatchingStatsFailure(code: string) {
  return code === 'stats_missing'
    || code === 'stats_fetch_failed'
    || code === 'views_too_low'
    || code === 'comments_too_low';
}

function countPostedGroups(rows: OutreachDraftHistoryRow[]) {
  return new Set(rows.filter(isPosted).map((row) => normalizeString(row.draft_group_id) || row.id)).size;
}

function getLatestCreatorPostAt(rows: OutreachDraftHistoryRow[], sourceChannelId: string) {
  let latest: string | null = null;
  for (const row of rows) {
    if (!isPosted(row)) continue;
    if (normalizeString(row.source_channel_id) !== sourceChannelId) continue;
    const postedAt = normalizeString(row.posted_at) || normalizeString(row.created_at);
    if (!postedAt) continue;
    if (!latest || postedAt > latest) latest = postedAt;
  }
  return latest;
}

function hasDuplicatePosted(rows: OutreachDraftHistoryRow[], input: {
  blueprintId: string;
  youtubeVideoId: string | null;
}) {
  return rows.some((row) => (
    isPosted(row)
    && (
      normalizeString(row.blueprint_id) === input.blueprintId
      || (
        Boolean(input.youtubeVideoId)
        && normalizeString(row.youtube_video_id) === input.youtubeVideoId
      )
    )
  ));
}

function checkVisibilityHealth(rows: OutreachDraftHistoryRow[], config: OutreachAutoPostConfig) {
  const checked = rows
    .filter(isPosted)
    .filter((row) => normalizeString(row.last_visibility_status))
    .slice(0, 25);
  if (checked.length < config.visibilityHealthMinChecked) {
    return { ok: true, code: 'visibility_insufficient_history', message: 'Not enough checked comments to close health gate.' };
  }
  const visible = checked.filter((row) => row.last_visibility_status === 'visible').length;
  const notVisible = checked.filter((row) => row.last_visibility_status === 'not_visible').length;
  const denominator = visible + notVisible;
  if (denominator >= config.visibilityHealthMinChecked && denominator > 0) {
    const rate = visible / denominator;
    if (rate < config.visibilityHealthMinRate) {
      return { ok: false, code: 'visibility_rate_low', message: `Recent visibility rate ${Math.round(rate * 100)}% is below gate.` };
    }
  }

  let notVisibleStreak = 0;
  for (const row of checked) {
    if (row.last_visibility_status === 'not_visible') notVisibleStreak += 1;
    else break;
  }
  if (notVisibleStreak >= config.visibilityHealthMaxNotVisibleStreak) {
    return { ok: false, code: 'visibility_not_visible_streak', message: `Recent not-visible streak is ${notVisibleStreak}.` };
  }
  return { ok: true, code: 'visibility_pass', message: 'Visibility health passed.' };
}

async function getLastScanAt(input: OutreachAutoPostDeps) {
  const key = `outreach_auto_post:last_scan_at:${input.config.adminUserId}`;
  const row = await input.controlDb.db
    .selectFrom('control_meta')
    .select(['value_json'])
    .where('key', '=', key)
    .executeTakeFirst();
  try {
    const parsed = JSON.parse(String(row?.value_json || '{}')) as { last_scan_at?: string };
    return normalizeString(parsed.last_scan_at) || null;
  } catch {
    return null;
  }
}

async function setLastScanAt(input: OutreachAutoPostDeps, nowIso: string) {
  const key = `outreach_auto_post:last_scan_at:${input.config.adminUserId}`;
  await input.controlDb.db
    .insertInto('control_meta')
    .values({
      key,
      value_json: JSON.stringify({ last_scan_at: nowIso }),
      updated_at: nowIso,
    })
    .onConflict((oc) => oc.column('key').doUpdateSet({
      value_json: JSON.stringify({ last_scan_at: nowIso }),
      updated_at: nowIso,
    }))
    .execute();
}

async function listAutoStatesByBlueprint(input: OutreachAutoPostDeps, blueprintIds: string[]) {
  const ids = [...new Set(blueprintIds.map(normalizeString).filter(Boolean))];
  if (ids.length === 0) return new Map<string, ExistingAutoState>();
  const rows = await input.controlDb.db
    .selectFrom('outreach_auto_post_state')
    .selectAll()
    .where('admin_user_id', '=', input.config.adminUserId)
    .where('blueprint_id', 'in', ids)
    .execute() as ExistingAutoState[];
  return new Map(rows.map((row) => [row.blueprint_id, row]));
}

async function upsertAutoState(input: OutreachAutoPostDeps, row: Omit<ExistingAutoState, 'created_at'> & { created_at?: string }) {
  await input.controlDb.db
    .insertInto('outreach_auto_post_state')
    .values({
      ...row,
      created_at: row.created_at || row.updated_at,
    })
    .onConflict((oc) => oc.columns(['admin_user_id', 'blueprint_id']).doUpdateSet({
      source_item_id: row.source_item_id,
      youtube_video_id: row.youtube_video_id,
      video_url: row.video_url,
      source_channel_id: row.source_channel_id,
      source_channel_title: row.source_channel_title,
      status: row.status,
      eligible_after: row.eligible_after,
      draft_id: row.draft_id,
      draft_group_id: row.draft_group_id,
      final_text: row.final_text,
      youtube_comment_id: row.youtube_comment_id,
      view_count: row.view_count,
      comment_count: row.comment_count,
      duration_seconds: row.duration_seconds,
      decision_code: row.decision_code,
      decision_message: row.decision_message,
      decision_json: row.decision_json,
      activation_started_at: row.activation_started_at,
      last_scanned_at: row.last_scanned_at,
      posted_at: row.posted_at,
      skipped_at: row.skipped_at,
      updated_at: row.updated_at,
    }))
    .execute();
}

async function markTerminal(input: OutreachAutoPostDeps, args: {
  state: ExistingAutoState | null;
  candidate: OutreachAutoCandidate;
  stats?: OutreachAutoStatsItem | null;
  status: string;
  code: string;
  message: string;
  nowIso: string;
  decision?: Record<string, unknown>;
}) {
  await upsertAutoState(input, {
    id: args.state?.id || input.randomUUID(),
    admin_user_id: input.config.adminUserId,
    blueprint_id: args.candidate.blueprintId,
    source_item_id: args.candidate.sourceItemId,
    youtube_video_id: args.stats?.videoId || args.state?.youtube_video_id || null,
    video_url: args.state?.video_url || null,
    source_channel_id: args.stats?.sourceChannelId || args.state?.source_channel_id || null,
    source_channel_title: args.state?.source_channel_title || null,
    status: args.status,
    eligible_after: null,
    draft_id: args.state?.draft_id || null,
    draft_group_id: args.state?.draft_group_id || null,
    final_text: args.state?.final_text || null,
    youtube_comment_id: args.state?.youtube_comment_id || null,
    view_count: args.stats?.viewCount ?? args.state?.view_count ?? null,
    comment_count: args.stats?.commentCount ?? args.state?.comment_count ?? null,
    duration_seconds: args.stats?.durationSeconds ?? args.state?.duration_seconds ?? null,
    decision_code: args.code,
    decision_message: args.message.slice(0, 500),
    decision_json: JSON.stringify(args.decision || {}),
    activation_started_at: input.config.activatedAtIso!,
    first_seen_at: args.state?.first_seen_at || args.nowIso,
    last_scanned_at: args.nowIso,
    posted_at: args.state?.posted_at || null,
    skipped_at: args.nowIso,
    created_at: args.state?.created_at || args.nowIso,
    updated_at: args.nowIso,
  });
}

async function markWatching(input: OutreachAutoPostDeps, args: {
  state: ExistingAutoState | null;
  candidate: OutreachAutoCandidate;
  stats?: OutreachAutoStatsItem | null;
  code: string;
  message: string;
  nowIso: string;
  decision?: Record<string, unknown>;
}) {
  await upsertAutoState(input, {
    id: args.state?.id || input.randomUUID(),
    admin_user_id: input.config.adminUserId,
    blueprint_id: args.candidate.blueprintId,
    source_item_id: args.candidate.sourceItemId,
    youtube_video_id: args.stats?.videoId || args.state?.youtube_video_id || null,
    video_url: args.state?.video_url || null,
    source_channel_id: args.stats?.sourceChannelId || args.state?.source_channel_id || null,
    source_channel_title: args.state?.source_channel_title || null,
    status: 'watching',
    eligible_after: null,
    draft_id: args.state?.draft_id || null,
    draft_group_id: args.state?.draft_group_id || null,
    final_text: args.state?.final_text || null,
    youtube_comment_id: args.state?.youtube_comment_id || null,
    view_count: args.stats?.viewCount ?? args.state?.view_count ?? null,
    comment_count: args.stats?.commentCount ?? args.state?.comment_count ?? null,
    duration_seconds: args.stats?.durationSeconds ?? args.state?.duration_seconds ?? null,
    decision_code: args.code,
    decision_message: args.message.slice(0, 500),
    decision_json: JSON.stringify(args.decision || {}),
    activation_started_at: input.config.activatedAtIso!,
    first_seen_at: args.state?.first_seen_at || args.nowIso,
    last_scanned_at: args.nowIso,
    posted_at: args.state?.posted_at || null,
    skipped_at: null,
    created_at: args.state?.created_at || args.nowIso,
    updated_at: args.nowIso,
  });
}

async function scanCandidates(input: OutreachAutoPostDeps, now: Date) {
  const nowIso = now.toISOString();
  const lastScanAt = await getLastScanAt(input);
  if (lastScanAt && Date.parse(lastScanAt) > now.getTime() - input.config.scanIntervalMs) {
    return { scanned: 0, ready: 0, skipped: 0, reason: 'scan_interval' };
  }

  const candidates = await input.listCandidates({
    adminUserId: input.config.adminUserId,
    activatedAtIso: input.config.activatedAtIso!,
    limit: input.config.monitorLimit,
  });
  await setLastScanAt(input, nowIso);
  if (candidates.length === 0) return { scanned: 0, ready: 0, skipped: 0, reason: 'empty' };

  const existingByBlueprint = await listAutoStatesByBlueprint(
    input,
    candidates.map((candidate) => candidate.blueprintId),
  );
  const openCandidates = candidates.filter((candidate) => {
    const existing = existingByBlueprint.get(candidate.blueprintId);
    return !existing || existing.status === 'scan_failed' || existing.status === 'watching';
  });
  if (openCandidates.length === 0) return { scanned: candidates.length, ready: 0, skipped: 0, reason: 'all_known' };

  const refreshed = await input.refreshStats({
    adminUserId: input.config.adminUserId,
    sourceItemIds: openCandidates.map((candidate) => candidate.sourceItemId),
  });
  const statsBySourceItem = new Map(refreshed.items.map((item) => [item.sourceItemId, item]));
  const recentRows = await input.stateStore.listRecentDrafts({
    adminUserId: input.config.adminUserId,
    sinceIso: addDays(now, -Math.max(input.config.creatorWindowDays, 1)).toISOString(),
    limit: 1000,
  });

  let ready = 0;
  let skipped = 0;
  for (const candidate of openCandidates) {
    const existing = existingByBlueprint.get(candidate.blueprintId) || null;
    const stats = statsBySourceItem.get(candidate.sourceItemId) || null;
    if (!stats) {
      skipped += 1;
      await markWatching(input, {
        state: existing,
        candidate,
        stats,
        code: 'stats_missing',
        message: 'Stats refresh did not return this source item.',
        nowIso,
      });
      continue;
    }
    const statsCheck = statsPass(stats, input.config);
    if (!statsCheck.ok) {
      skipped += 1;
      if (shouldContinueWatchingStatsFailure(statsCheck.code)) {
        await markWatching(input, {
          state: existing,
          candidate,
          stats,
          code: statsCheck.code,
          message: statsCheck.message,
          nowIso,
        });
        continue;
      }
      await markTerminal(input, {
        state: existing,
        candidate,
        stats,
        status: 'skipped_stats',
        code: statsCheck.code,
        message: statsCheck.message,
        nowIso,
      });
      continue;
    }
    if (hasDuplicatePosted(recentRows, { blueprintId: candidate.blueprintId, youtubeVideoId: stats.videoId })) {
      skipped += 1;
      await markTerminal(input, {
        state: existing,
        candidate,
        stats,
        status: 'skipped_duplicate',
        code: 'already_posted',
        message: 'This blueprint/video already has a posted outreach comment.',
        nowIso,
      });
      continue;
    }
    const sourceChannelId = stats.sourceChannelId || '';
    const channelRows = recentRows.filter((row) => isPosted(row) && normalizeString(row.source_channel_id) === sourceChannelId);
    if (countPostedGroups(channelRows) >= input.config.creatorWindowCap) {
      skipped += 1;
      await markTerminal(input, {
        state: existing,
        candidate,
        stats,
        status: 'skipped_creator_cap',
        code: 'creator_window_cap',
        message: 'Creator weekly post cap is full.',
        nowIso,
      });
      continue;
    }
    const latestCreatorPostAt = getLatestCreatorPostAt(recentRows, sourceChannelId);
    if (latestCreatorPostAt && Date.parse(latestCreatorPostAt) > now.getTime() - input.config.creatorMinSpacingMs) {
      skipped += 1;
      await markTerminal(input, {
        state: existing,
        candidate,
        stats,
        status: 'skipped_creator_spacing',
        code: 'creator_spacing',
        message: 'Creator received an outreach comment inside the minimum spacing window.',
        nowIso,
      });
      continue;
    }

    try {
      const draft = await input.generateDraft({
        adminUserId: input.config.adminUserId,
        blueprintId: candidate.blueprintId,
      });
      const final = buildDefaultAutoFinalText(draft);
      if (!final) throw new Error('Draft generation returned no postable option or promo.');
      const delayMs = randomDelayMs({
        minMs: input.config.delayMinMs,
        maxMs: input.config.delayMaxMs,
        randomInt: () => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
      });
      await upsertAutoState(input, {
        id: existing?.id || input.randomUUID(),
        admin_user_id: input.config.adminUserId,
        blueprint_id: candidate.blueprintId,
        source_item_id: candidate.sourceItemId,
        youtube_video_id: draft.youtubeVideoId || stats.videoId,
        video_url: draft.videoUrl,
        source_channel_id: draft.sourceChannelId || stats.sourceChannelId,
        source_channel_title: draft.sourceChannelTitle,
        status: 'auto_ready',
        eligible_after: addMs(now, delayMs).toISOString(),
        draft_id: final.draftId,
        draft_group_id: final.draftGroupId,
        final_text: final.finalText,
        youtube_comment_id: null,
        view_count: stats.viewCount,
        comment_count: stats.commentCount,
        duration_seconds: stats.durationSeconds,
        decision_code: 'auto_ready',
        decision_message: 'Candidate passed scan checks and draft was generated.',
        decision_json: JSON.stringify({ delay_ms: delayMs }),
        activation_started_at: input.config.activatedAtIso!,
        first_seen_at: existing?.first_seen_at || nowIso,
        last_scanned_at: nowIso,
        posted_at: null,
        skipped_at: null,
        created_at: existing?.created_at || nowIso,
        updated_at: nowIso,
      });
      ready += 1;
    } catch (error) {
      skipped += 1;
      const code = error && typeof error === 'object' && 'errorCode' in error
        ? normalizeString((error as { errorCode?: unknown }).errorCode)
        : 'draft_generation_failed';
      await markTerminal(input, {
        state: existing,
        candidate,
        stats,
        status: code.includes('CHANNEL') ? 'skipped_creator_cap' : 'skipped_generation_failed',
        code,
        message: error instanceof Error ? error.message : 'Could not generate outreach draft.',
        nowIso,
      });
    }
  }
  return { scanned: openCandidates.length, ready, skipped, reason: 'scanned' };
}

async function claimNextReady(input: OutreachAutoPostDeps, nowIso: string) {
  const row = await input.controlDb.db
    .selectFrom('outreach_auto_post_state')
    .selectAll()
    .where('admin_user_id', '=', input.config.adminUserId)
    .where('status', '=', 'auto_ready')
    .where('eligible_after', '<=', nowIso)
    .orderBy('eligible_after', 'asc')
    .orderBy('created_at', 'asc')
    .limit(1)
    .executeTakeFirst() as ExistingAutoState | undefined;
  if (!row?.id) return null;
  const updated = await input.controlDb.db
    .updateTable('outreach_auto_post_state')
    .set({
      status: 'posting',
      updated_at: nowIso,
    })
    .where('id', '=', row.id)
    .where('status', '=', 'auto_ready')
    .executeTakeFirst();
  if (Number(updated.numUpdatedRows || 0) <= 0) return null;
  return {
    ...row,
    status: 'posting',
    updated_at: nowIso,
  };
}

async function markExistingState(input: OutreachAutoPostDeps, row: ExistingAutoState, patch: Partial<ExistingAutoState>) {
  await input.controlDb.db
    .updateTable('outreach_auto_post_state')
    .set(patch)
    .where('id', '=', row.id)
    .execute();
}

async function postReadyCandidate(input: OutreachAutoPostDeps, now: Date) {
  const nowIso = now.toISOString();
  const row = await claimNextReady(input, nowIso);
  if (!row) return { attempted: 0, posted: 0, skipped: 0, reason: 'none_ready' };

  const candidate = {
    blueprintId: row.blueprint_id,
    sourceItemId: row.source_item_id,
    generatedAtIso: row.first_seen_at,
  };
  const refreshed = await input.refreshStats({
    adminUserId: input.config.adminUserId,
    sourceItemIds: [row.source_item_id],
  });
  const stats = refreshed.items[0] || null;
  const statsCheck = stats ? statsPass(stats, input.config) : { ok: false, code: 'stats_missing', message: 'Stats refresh did not return this source item.' };
  if (!stats || !statsCheck.ok) {
    await markTerminal(input, {
      state: row,
      candidate,
      stats,
      status: 'skipped_stats_stale',
      code: statsCheck.code,
      message: statsCheck.message,
      nowIso,
    });
    return { attempted: 1, posted: 0, skipped: 1, reason: 'stats_stale' };
  }

  const recentRows = await input.stateStore.listRecentDrafts({
    adminUserId: input.config.adminUserId,
    sinceIso: addDays(now, -Math.max(input.config.creatorWindowDays, 1)).toISOString(),
    limit: 1000,
  });
  const health = checkVisibilityHealth(recentRows, input.config);
  if (!health.ok) {
    await markTerminal(input, {
      state: row,
      candidate,
      stats,
      status: 'skipped_health_pause',
      code: health.code,
      message: health.message,
      nowIso,
    });
    return { attempted: 1, posted: 0, skipped: 1, reason: 'health_pause' };
  }
  if (hasDuplicatePosted(recentRows, { blueprintId: row.blueprint_id, youtubeVideoId: row.youtube_video_id || stats.videoId })) {
    await markTerminal(input, {
      state: row,
      candidate,
      stats,
      status: 'skipped_duplicate',
      code: 'already_posted',
      message: 'This blueprint/video already has a posted outreach comment.',
      nowIso,
    });
    return { attempted: 1, posted: 0, skipped: 1, reason: 'duplicate' };
  }
  const postedToday = recentRows.filter((recentRow) => (
    isPosted(recentRow)
    && normalizeString(recentRow.posted_at || recentRow.created_at) >= addDays(now, -1).toISOString()
  ));
  if (input.config.dailyCap > 0 && countPostedGroups(postedToday) >= input.config.dailyCap) {
    await markTerminal(input, {
      state: row,
      candidate,
      stats,
      status: 'skipped_global_cap',
      code: 'daily_cap',
      message: 'Global daily auto-post cap is full.',
      nowIso,
    });
    return { attempted: 1, posted: 0, skipped: 1, reason: 'daily_cap' };
  }

  const sourceChannelId = stats.sourceChannelId || row.source_channel_id || '';
  const channelRows = recentRows.filter((recentRow) => isPosted(recentRow) && normalizeString(recentRow.source_channel_id) === sourceChannelId);
  if (countPostedGroups(channelRows) >= input.config.creatorWindowCap) {
    await markTerminal(input, {
      state: row,
      candidate,
      stats,
      status: 'skipped_creator_cap',
      code: 'creator_window_cap',
      message: 'Creator weekly post cap is full.',
      nowIso,
    });
    return { attempted: 1, posted: 0, skipped: 1, reason: 'creator_cap' };
  }
  const latestCreatorPostAt = getLatestCreatorPostAt(recentRows, sourceChannelId);
  if (latestCreatorPostAt && Date.parse(latestCreatorPostAt) > now.getTime() - input.config.creatorMinSpacingMs) {
    await markTerminal(input, {
      state: row,
      candidate,
      stats,
      status: 'skipped_creator_spacing',
      code: 'creator_spacing',
      message: 'Creator received an outreach comment inside the minimum spacing window.',
      nowIso,
    });
    return { attempted: 1, posted: 0, skipped: 1, reason: 'creator_spacing' };
  }
  if (!row.draft_id || !row.final_text) {
    await markTerminal(input, {
      state: row,
      candidate,
      stats,
      status: 'skipped_generation_failed',
      code: 'draft_missing',
      message: 'Auto-ready row is missing draft id or final text.',
      nowIso,
    });
    return { attempted: 1, posted: 0, skipped: 1, reason: 'draft_missing' };
  }

  try {
    const posted = await input.postDraft({
      adminUserId: input.config.adminUserId,
      draftId: row.draft_id,
      finalText: row.final_text,
    });
    await markExistingState(input, row, {
      status: 'posted',
      youtube_comment_id: posted.youtubeCommentId,
      posted_at: posted.postedAt,
      decision_code: 'posted',
      decision_message: `Auto-posted with YouTube status ${posted.status}.`,
      decision_json: JSON.stringify({ draft_id: posted.draftId, draft_group_id: posted.draftGroupId }),
      updated_at: posted.postedAt,
    });
    return { attempted: 1, posted: 1, skipped: 0, reason: 'posted' };
  } catch (error) {
    const code = error && typeof error === 'object' && 'errorCode' in error
      ? normalizeString((error as { errorCode?: unknown }).errorCode)
      : 'post_failed';
    const status = code.includes('VIDEO_ALREADY') || code.includes('DUPLICATE')
      ? 'skipped_duplicate'
      : code.includes('CHANNEL')
        ? 'skipped_creator_cap'
        : 'post_failed';
    await markTerminal(input, {
      state: row,
      candidate,
      stats,
      status,
      code,
      message: error instanceof Error ? error.message : 'Could not post outreach comment.',
      nowIso,
    });
    return { attempted: 1, posted: 0, skipped: 1, reason: status };
  }
}

export async function runOutreachAutoPostCycle(input: OutreachAutoPostDeps) {
  const config = input.config;
  const log = input.log || (() => undefined);
  if (!config.enabled) return { enabled: false };
  if (!normalizeString(config.adminUserId)) {
    log('outreach_auto_post_skipped', { reason: 'missing_admin_user_id' });
    return { enabled: true, skipped: true, reason: 'missing_admin_user_id' };
  }
  if (!normalizeString(config.activatedAtIso)) {
    log('outreach_auto_post_skipped', { reason: 'missing_activation_timestamp' });
    return { enabled: true, skipped: true, reason: 'missing_activation_timestamp' };
  }

  const now = input.now ? input.now() : new Date();
  const scan = await scanCandidates(input, now);
  const post = await postReadyCandidate(input, now);
  const result = { enabled: true, scan, post };
  log('outreach_auto_post_cycle', result as unknown as Record<string, unknown>);
  return result;
}

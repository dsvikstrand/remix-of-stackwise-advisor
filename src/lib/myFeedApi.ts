import { supabase } from '@/integrations/supabase/client';
import { config } from '@/config/runtime';
import { normalizeTag } from '@/lib/tagging';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { evaluateCandidateGates } from '@/lib/candidateGates';
import { buildYouTubeThumbnailUrl, extractYouTubeVideoId, toYouTubeIdentity } from '@/lib/sourceIdentity';

export async function ensureSourceItemForYouTube(input: {
  videoUrl: string;
  title: string;
  sourceChannelId?: string | null;
  sourceChannelTitle?: string | null;
  sourceChannelUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const videoId = extractYouTubeVideoId(input.videoUrl);
  if (!videoId) throw new Error('Invalid YouTube URL.');

  const identity = toYouTubeIdentity(videoId);
  const { data: existingSource } = await supabase
    .from('source_items')
    .select('id, source_channel_id, source_channel_title, thumbnail_url, metadata')
    .eq('canonical_key', identity.canonicalKey)
    .maybeSingle();

  const existingMetadata =
    existingSource?.metadata
    && typeof existingSource.metadata === 'object'
    && existingSource.metadata !== null
      ? (existingSource.metadata as Record<string, unknown>)
      : {};
  const effectiveSourceChannelId = input.sourceChannelId || existingSource?.source_channel_id || null;
  const effectiveSourceChannelTitle = input.sourceChannelTitle || existingSource?.source_channel_title || null;
  const effectiveThumbnailUrl = String(existingSource?.thumbnail_url || '').trim() || buildYouTubeThumbnailUrl(identity.sourceNativeId);
  const metadata: Record<string, unknown> = {
    ...existingMetadata,
    ...(input.metadata || {}),
  };
  if (effectiveSourceChannelId) metadata.source_channel_id = effectiveSourceChannelId;
  if (effectiveSourceChannelTitle) metadata.source_channel_title = effectiveSourceChannelTitle;
  if (input.sourceChannelUrl) metadata.source_channel_url = input.sourceChannelUrl;

  const { data, error } = await supabase
    .from('source_items')
    .upsert(
      {
        source_type: identity.sourceType,
        source_native_id: identity.sourceNativeId,
        canonical_key: identity.canonicalKey,
        source_url: input.videoUrl,
        title: input.title,
        source_channel_id: effectiveSourceChannelId,
        source_channel_title: effectiveSourceChannelTitle,
        thumbnail_url: effectiveThumbnailUrl,
        metadata,
        ingest_status: 'ready',
      },
      { onConflict: 'canonical_key' },
    )
    .select('id, canonical_key, thumbnail_url')
    .single();

  if (error) throw error;
  return data;
}

export async function getExistingUserFeedItem(userId: string, sourceItemId: string) {
  const { data, error } = await supabase
    .from('user_feed_items')
    .select('id, blueprint_id, state')
    .eq('user_id', userId)
    .eq('source_item_id', sourceItemId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertUserFeedItem(input: {
  userId: string;
  sourceItemId: string;
  blueprintId: string;
  state?: string;
}) {
  const { data, error } = await supabase
    .from('user_feed_items')
    .upsert(
      {
        user_id: input.userId,
        source_item_id: input.sourceItemId,
        blueprint_id: input.blueprintId,
        state: input.state || 'my_feed_published',
      },
      { onConflict: 'user_id,source_item_id' },
    )
    .select('id, user_id, source_item_id, blueprint_id, state')
    .single();

  if (error) throw error;
  return data;
}

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
};

class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getApiBase() {
  if (config.agenticBackendUrl) {
    return `${config.agenticBackendUrl.replace(/\/$/, '')}/api`;
  }
  return null;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in required.');
  return { Authorization: `Bearer ${token}` };
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getAuthHeader();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
      ...(init?.headers || {}),
    },
  });

  const json = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !json) {
    const message = json?.message || `Request failed (${response.status})`;
    throw new ApiRequestError(response.status, message);
  }
  if (!json.ok) {
    throw new ApiRequestError(response.status, json.message || 'Request failed.');
  }

  return json;
}

function shouldFallbackToSupabase(error: unknown) {
  if (!(error instanceof ApiRequestError)) return true;
  return error.status === 404 || error.status >= 500;
}

async function ensureTagBySlug(slug: string, userId: string) {
  const normalized = normalizeTag(slug);
  const { data: existing, error: existingError } = await supabase
    .from('tags')
    .select('id, slug')
    .eq('slug', normalized)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from('tags')
    .insert({ slug: normalized, created_by: userId })
    .select('id, slug')
    .single();

  if (createError) throw createError;
  return created;
}

async function submitCandidateAndEvaluateFallback(input: {
  userId: string;
  userFeedItemId: string;
  blueprintId: string;
  channelSlug: string;
  title: string;
  llmReview?: string | null;
  stepCount: number;
  tagSlugs: string[];
}) {
  const { data: candidate, error: candidateError } = await supabase
    .from('channel_candidates')
    .upsert(
      {
        user_feed_item_id: input.userFeedItemId,
        channel_slug: input.channelSlug,
        submitted_by_user_id: input.userId,
        status: 'pending',
      },
      { onConflict: 'user_feed_item_id,channel_slug' },
    )
    .select('id, status, channel_slug, user_feed_item_id')
    .single();

  if (candidateError) throw candidateError;

  await supabase
    .from('user_feed_items')
    .update({ blueprint_id: input.blueprintId, state: 'candidate_submitted', last_decision_code: null })
    .eq('id', input.userFeedItemId)
    .eq('user_id', input.userId);

  const evaluation = evaluateCandidateGates({
    title: input.title,
    description: null,
    llmReview: input.llmReview,
    stepCount: input.stepCount,
    tagSlugs: input.tagSlugs,
    channelSlug: input.channelSlug,
  });

  const decisionsPayload = evaluation.decisions.map((d) => ({
    candidate_id: candidate.id,
    gate_id: d.gate_id,
    outcome: d.outcome,
    reason_code: d.reason_code,
    score: d.score ?? null,
    method_version: d.method_version ?? 'gate-v1',
    policy_version: 'bleuv1-gate-policy-v1.0',
  }));

  const { error: decisionError } = await supabase
    .from('channel_gate_decisions')
    .insert(decisionsPayload);

  if (decisionError) throw decisionError;

  if (evaluation.aggregate === 'pass') {
    const { error: passError } = await supabase
      .from('channel_candidates')
      .update({ status: 'passed' })
      .eq('id', candidate.id);

    if (passError) throw passError;

    return {
      candidateId: candidate.id,
      status: 'passed' as const,
      reasonCode: evaluation.primaryReason,
    };
  }

  if (evaluation.aggregate === 'warn') {
    const { error: warnError } = await supabase
      .from('channel_candidates')
      .update({ status: 'pending_manual_review' })
      .eq('id', candidate.id);

    if (warnError) throw warnError;

    const { error: feedWarnError } = await supabase
      .from('user_feed_items')
      .update({ blueprint_id: input.blueprintId, state: 'candidate_pending_manual_review', last_decision_code: evaluation.primaryReason })
      .eq('id', input.userFeedItemId)
      .eq('user_id', input.userId);

    if (feedWarnError) throw feedWarnError;

    return {
      candidateId: candidate.id,
      status: 'pending_manual_review' as const,
      reasonCode: evaluation.primaryReason,
    };
  }

  const { error: failError } = await supabase
    .from('channel_candidates')
    .update({ status: 'rejected' })
    .eq('id', candidate.id);

  if (failError) throw failError;

  const { error: feedFailError } = await supabase
    .from('user_feed_items')
    .update({ blueprint_id: input.blueprintId, state: 'channel_rejected', last_decision_code: evaluation.primaryReason })
    .eq('id', input.userFeedItemId)
    .eq('user_id', input.userId);

  if (feedFailError) throw feedFailError;

  return {
    candidateId: candidate.id,
    status: 'rejected' as const,
    reasonCode: evaluation.primaryReason,
  };
}

export async function submitCandidateAndEvaluate(input: {
  userId: string;
  userFeedItemId: string;
  blueprintId: string;
  channelSlug: string;
  title: string;
  llmReview?: string | null;
  stepCount: number;
  tagSlugs: string[];
}) {
  const apiBase = getApiBase();
  if (!apiBase) {
    return submitCandidateAndEvaluateFallback(input);
  }
  try {
    const upsertResult = await apiRequest<{
      id: string;
      user_feed_item_id: string;
      channel_slug: string;
      status: string;
    }>('/channel-candidates', {
      method: 'POST',
      body: JSON.stringify({
        user_feed_item_id: input.userFeedItemId,
        channel_slug: input.channelSlug,
      }),
    });

    const candidateId = upsertResult.data.id;

    const evalResult = await apiRequest<{
      candidate_id: string;
      decision: 'pass' | 'warn' | 'block';
      next_state: 'candidate_submitted' | 'candidate_pending_manual_review' | 'channel_rejected';
      reason_code: string;
    }>(`/channel-candidates/${candidateId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const nextState = evalResult.data.next_state;
    return {
      candidateId,
      status: nextState === 'candidate_pending_manual_review'
        ? ('pending_manual_review' as const)
        : nextState === 'channel_rejected'
          ? ('rejected' as const)
          : ('passed' as const),
      reasonCode: evalResult.data.reason_code,
    };
  } catch (error) {
    if (!shouldFallbackToSupabase(error)) throw error;
    return submitCandidateAndEvaluateFallback(input);
  }
}

async function publishCandidateFallback(input: {
  userId: string;
  candidateId: string;
  userFeedItemId: string;
  blueprintId: string;
  channelSlug: string;
}) {
  const channel = CHANNELS_CATALOG.find((c) => c.slug === input.channelSlug);
  const tagSlug = channel?.tagSlug || 'general';
  const tag = await ensureTagBySlug(tagSlug, input.userId);

  const { error: publicError } = await supabase
    .from('blueprints')
    .update({ is_public: true })
    .eq('id', input.blueprintId)
    .eq('creator_user_id', input.userId);

  if (publicError) throw publicError;

  const { error: tagError } = await supabase
    .from('blueprint_tags')
    .upsert({ blueprint_id: input.blueprintId, tag_id: tag.id }, { onConflict: 'blueprint_id,tag_id' });

  if (tagError) throw tagError;

  const { error: candidateError } = await supabase
    .from('channel_candidates')
    .update({ status: 'published' })
    .eq('id', input.candidateId);

  if (candidateError) throw candidateError;

  const { error: feedError } = await supabase
    .from('user_feed_items')
    .update({ blueprint_id: input.blueprintId, state: 'channel_published', last_decision_code: 'ALL_GATES_PASS' })
    .eq('id', input.userFeedItemId)
    .eq('user_id', input.userId);

  if (feedError) throw feedError;
}

export async function publishCandidate(input: {
  userId: string;
  candidateId: string;
  userFeedItemId: string;
  blueprintId: string;
  channelSlug: string;
}) {
  const apiBase = getApiBase();
  if (!apiBase) {
    return publishCandidateFallback(input);
  }
  try {
    await apiRequest<{ candidate_id: string; published: boolean; channel_slug: string }>(
      `/channel-candidates/${input.candidateId}/publish`,
      {
        method: 'POST',
        body: JSON.stringify({ tag_slug: input.channelSlug }),
      },
    );
  } catch (error) {
    if (!shouldFallbackToSupabase(error)) throw error;
    return publishCandidateFallback(input);
  }
}

async function rejectCandidateFallback(input: {
  userId: string;
  candidateId: string;
  userFeedItemId: string;
  blueprintId: string;
  reasonCode: string;
}) {
  const { error: candidateError } = await supabase
    .from('channel_candidates')
    .update({ status: 'rejected' })
    .eq('id', input.candidateId);

  if (candidateError) throw candidateError;

  const { error: feedError } = await supabase
    .from('user_feed_items')
    .update({ blueprint_id: input.blueprintId, state: 'channel_rejected', last_decision_code: input.reasonCode })
    .eq('id', input.userFeedItemId)
    .eq('user_id', input.userId);

  if (feedError) throw feedError;
}

export async function rejectCandidate(input: {
  userId: string;
  candidateId: string;
  userFeedItemId: string;
  blueprintId: string;
  reasonCode: string;
}) {
  const apiBase = getApiBase();
  if (!apiBase) {
    return rejectCandidateFallback(input);
  }
  try {
    await apiRequest<{ candidate_id: string; reason_code: string }>(
      `/channel-candidates/${input.candidateId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason_code: input.reasonCode }),
      },
    );
  } catch (error) {
    if (!shouldFallbackToSupabase(error)) throw error;
    return rejectCandidateFallback(input);
  }
}

export async function autoPublishMyFeedItem(input: {
  userFeedItemId: string;
  sourceTag?: string;
}) {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('Backend API is not configured.');
  }

  const response = await apiRequest<{
    user_feed_item_id: string;
    candidate_id: string;
    channel_slug: string;
    decision: 'published' | 'held';
    reason_code: string;
    classifier_mode?: 'deterministic_v1' | 'general_placeholder' | 'llm_labeler_v1';
    classifier_reason?: 'tag_match' | 'alias_match' | 'fallback_general' | 'llm_valid' | 'llm_retry_valid';
    classifier_confidence?: number | null;
  }>(`/my-feed/items/${input.userFeedItemId}/auto-publish`, {
    method: 'POST',
    body: JSON.stringify({
      source_tag: input.sourceTag || 'manual_save',
    }),
  });

  return {
    userFeedItemId: response.data.user_feed_item_id,
    candidateId: response.data.candidate_id,
    channelSlug: response.data.channel_slug,
    decision: response.data.decision,
    reasonCode: response.data.reason_code,
    classifierMode: response.data.classifier_mode || null,
    classifierReason: response.data.classifier_reason || null,
    classifierConfidence: typeof response.data.classifier_confidence === 'number'
      ? response.data.classifier_confidence
      : null,
  };
}

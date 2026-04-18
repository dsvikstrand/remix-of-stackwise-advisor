import { createClient } from '@supabase/supabase-js';
import { evaluateCandidateForChannel } from '../gates';
import type { CandidateGateDecision, GateMode } from '../gates/types';
import {
  getChannelResolutionMeta,
  type ChannelClassifierReason as DeterministicClassifierReason,
} from './deterministicChannelClassifier';
import {
  labelChannelFromArtifact,
  type LlmChannelClassifierReason,
} from './channelLabeler';
import { countBlueprintSections, getBlueprintSummaryText } from './blueprintSections';

type DbClient = ReturnType<typeof createClient>;

export interface AutoChannelResolver {
  resolveChannelSlugForBlueprint(input: {
    blueprintId: string;
    title: string;
    summary?: string | null;
    tagSlugs: string[];
    defaultChannelSlug: string;
    classifierMode: AutoChannelClassifierMode;
  }): AutoChannelResolution | Promise<AutoChannelResolution>;
}

export type AutoChannelClassifierMode = 'deterministic_v1' | 'general_placeholder' | 'llm_labeler_v1';
export type ChannelClassifierReason = DeterministicClassifierReason | LlmChannelClassifierReason;

export type AutoChannelResolution = {
  channelSlug: string;
  classifierMode: AutoChannelClassifierMode;
  classifierReason: ChannelClassifierReason;
  classifierConfidence?: number | null;
  classifierFailureClass?: string | null;
  classifierFailureDetail?: string | null;
  classifierReturnedSlug?: string | null;
  classifierRetryUsed?: boolean;
  classifierFallbackUsed?: boolean;
  classifierAttemptCount?: number;
};

class DeterministicAutoChannelResolver implements AutoChannelResolver {
  resolveChannelSlugForBlueprint(input: {
    blueprintId: string;
    title: string;
    summary?: string | null;
    tagSlugs: string[];
    defaultChannelSlug: string;
    classifierMode: AutoChannelClassifierMode;
  }) {
    const fallbackSlug = String(input.defaultChannelSlug || 'general').trim().toLowerCase() || 'general';
    if (input.classifierMode === 'general_placeholder') {
      return {
        channelSlug: fallbackSlug,
        classifierMode: input.classifierMode,
        classifierReason: 'fallback_general',
        classifierConfidence: null,
      };
    }
    if (input.classifierMode === 'llm_labeler_v1') {
      return labelChannelFromArtifact({
        title: input.title,
        summary: input.summary || null,
        tagSlugs: input.tagSlugs,
        fallbackSlug,
      }).then((result) => ({
        channelSlug: result.channelSlug,
        classifierMode: input.classifierMode,
        classifierReason: result.classifierReason,
        classifierConfidence: result.rawConfidence,
        classifierFailureClass: result.failureClass,
        classifierFailureDetail: result.failureDetail,
        classifierReturnedSlug: result.returnedSlug,
        classifierRetryUsed: result.retryUsed,
        classifierFallbackUsed: result.fallbackUsed,
        classifierAttemptCount: result.attemptCount,
      }));
    }
    const meta = getChannelResolutionMeta({
      tagSlugs: input.tagSlugs,
      fallbackSlug,
    });
    return {
      channelSlug: meta.resolvedSlug,
      classifierMode: input.classifierMode,
      classifierReason: meta.reason,
      classifierConfidence: null,
    };
  }
}

export type AutoChannelPipelineInput = {
  db: DbClient;
  userId: string;
  userFeedItemId: string;
  blueprintId: string;
  defaultChannelSlug: string;
  gateMode: GateMode;
  sourceTag: string;
  classifierMode: AutoChannelClassifierMode;
  resolver?: AutoChannelResolver;
  listBlueprintTagSlugs: (input: {
    blueprintId: string;
  }) => Promise<string[]>;
  attachBlueprintTag?: (input: {
    blueprintId: string;
    tagId: string;
    tagSlug: string;
  }) => Promise<void>;
  patchFeedItemById?: (input: {
    db: DbClient;
    feedItemId: string;
    userId: string;
    patch: {
      blueprint_id?: string | null;
      state?: string;
      last_decision_code?: string | null;
    };
    action: string;
  }) => Promise<unknown>;
  getChannelCandidateById?: (input: {
    candidateId: string;
  }) => Promise<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
    created_at?: string | null;
    updated_at?: string | null;
  } | null>;
  getChannelCandidateByFeedChannel?: (input: {
    userFeedItemId: string;
    channelSlug: string;
  }) => Promise<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
    created_at?: string | null;
    updated_at?: string | null;
  } | null>;
  upsertChannelCandidate?: (input: {
    row: {
      id?: string;
      user_feed_item_id: string;
      channel_slug: string;
      submitted_by_user_id: string;
      status: string;
      created_at?: string | null;
      updated_at?: string | null;
    };
  }) => Promise<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
    created_at?: string | null;
    updated_at?: string | null;
  }>;
  updateChannelCandidateStatus?: (input: {
    candidateId: string;
    status: string;
  }) => Promise<{
    id: string;
    user_feed_item_id: string;
    channel_slug: string;
    status: string;
    created_at?: string | null;
    updated_at?: string | null;
  } | null>;
  insertChannelGateDecisions?: (input: {
    candidateId: string;
    decisions: CandidateGateDecision[];
  }) => Promise<void>;
};

export type AutoChannelPipelineResult = {
  userFeedItemId: string;
  blueprintId: string;
  candidateId: string;
  channelSlug: string;
  decision: 'published' | 'held';
  reasonCode: string;
  aggregate: 'pass' | 'warn' | 'block';
  gateMode: GateMode;
  idempotent: boolean;
  classifierMode: AutoChannelClassifierMode;
  classifierReason: ChannelClassifierReason;
  classifierConfidence?: number | null;
};

function toTagSlug(raw: string) {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function ensureTagId(db: DbClient, userId: string, tagSlug: string): Promise<string> {
  const slug = toTagSlug(tagSlug);
  if (!slug) throw new Error('INVALID_TAG');

  const { data: existing } = await db.from('tags').select('id').eq('slug', slug).maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await db
    .from('tags')
    .insert({ slug, created_by: userId })
    .select('id')
    .single();
  if (error) {
    const { data: retry } = await db.from('tags').select('id').eq('slug', slug).maybeSingle();
    if (retry?.id) return retry.id;
    throw error;
  }
  return created.id;
}

export async function runAutoChannelPipeline(input: AutoChannelPipelineInput): Promise<AutoChannelPipelineResult> {
  const resolver = input.resolver || new DeterministicAutoChannelResolver();

  const { data: blueprint, error: blueprintError } = await input.db
    .from('blueprints')
    .select('id, title, llm_review, sections_json, steps')
    .eq('id', input.blueprintId)
    .maybeSingle();
  if (blueprintError || !blueprint) {
    throw new Error(blueprintError?.message || 'Blueprint not found');
  }

  const tagSlugs = await input.listBlueprintTagSlugs({ blueprintId: input.blueprintId });
  const summary = getBlueprintSummaryText({
    sectionsJson: blueprint.sections_json,
    steps: blueprint.steps,
    maxChars: 600,
  });
  if (input.classifierMode === 'llm_labeler_v1') {
    console.log('[auto_channel_label_started]', JSON.stringify({
      blueprint_id: input.blueprintId,
      user_feed_item_id: input.userFeedItemId,
      fallback_slug: input.defaultChannelSlug,
      tag_count: tagSlugs.length,
      summary_chars: summary.length,
    }));
  }
  const resolution = await resolver.resolveChannelSlugForBlueprint({
    blueprintId: input.blueprintId,
    title: blueprint.title,
    summary,
    tagSlugs,
    defaultChannelSlug: input.defaultChannelSlug,
    classifierMode: input.classifierMode,
  });
  if (input.classifierMode === 'llm_labeler_v1') {
    console.log('[auto_channel_label_result]', JSON.stringify({
      blueprint_id: input.blueprintId,
      user_feed_item_id: input.userFeedItemId,
      classifier_mode: resolution.classifierMode,
      classifier_reason: resolution.classifierReason,
      classifier_confidence: resolution.classifierConfidence ?? null,
      classifier_failure_class: resolution.classifierFailureClass ?? null,
      classifier_failure_detail: resolution.classifierFailureDetail ?? null,
      classifier_returned_slug: resolution.classifierReturnedSlug ?? null,
      classifier_retry_used: resolution.classifierRetryUsed ?? null,
      classifier_fallback_used: resolution.classifierFallbackUsed ?? null,
      classifier_attempt_count: resolution.classifierAttemptCount ?? null,
      channel_slug: resolution.channelSlug,
    }));
  }
  const channelSlug = String(resolution.channelSlug || input.defaultChannelSlug || 'general').trim().toLowerCase() || 'general';

  const existingCandidate = input.getChannelCandidateByFeedChannel
    ? await input.getChannelCandidateByFeedChannel({
        userFeedItemId: input.userFeedItemId,
        channelSlug,
      })
    : await input.db
      .from('channel_candidates')
      .select('id, user_feed_item_id, channel_slug, status, created_at, updated_at')
      .eq('user_feed_item_id', input.userFeedItemId)
      .eq('channel_slug', channelSlug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        return data;
      });

  if (existingCandidate?.status === 'published') {
    return {
      userFeedItemId: input.userFeedItemId,
      blueprintId: input.blueprintId,
      candidateId: existingCandidate.id,
      channelSlug,
      decision: 'published',
      reasonCode: 'ALREADY_PUBLISHED',
      aggregate: 'pass',
      gateMode: input.gateMode,
      idempotent: true,
      classifierMode: resolution.classifierMode,
      classifierReason: resolution.classifierReason,
      classifierConfidence: resolution.classifierConfidence ?? null,
    };
  }

  const candidate = input.upsertChannelCandidate
    ? await input.upsertChannelCandidate({
        row: {
          id: existingCandidate?.id,
          user_feed_item_id: input.userFeedItemId,
          channel_slug: channelSlug,
          submitted_by_user_id: input.userId,
          status: existingCandidate?.status || 'pending',
          created_at: existingCandidate?.created_at || null,
          updated_at: existingCandidate?.updated_at || null,
        },
      })
    : await input.db
      .from('channel_candidates')
      .upsert(
        {
          user_feed_item_id: input.userFeedItemId,
          channel_slug: channelSlug,
          submitted_by_user_id: input.userId,
          status: 'pending',
        },
        { onConflict: 'user_feed_item_id,channel_slug' },
      )
      .select('id, user_feed_item_id, channel_slug, status, created_at, updated_at')
      .single()
      .then(({ data, error }) => {
        if (error || !data) throw new Error(error?.message || 'Could not upsert channel candidate');
        return data;
      });

  const stepCount = countBlueprintSections({
    sectionsJson: blueprint.sections_json,
    steps: blueprint.steps,
  });
  const evaluation = evaluateCandidateForChannel(
    {
      title: blueprint.title,
      llmReview: blueprint.llm_review,
      channelSlug,
      tagSlugs,
      stepCount,
      classificationMode: resolution.classifierMode,
    },
    {
      modeOverride: input.gateMode,
    },
  );

  if (input.insertChannelGateDecisions) {
    await input.insertChannelGateDecisions({
      candidateId: candidate.id,
      decisions: evaluation.decisions,
    });
  } else {
    const decisionsPayload = evaluation.decisions.map((decision) => ({
      candidate_id: candidate.id,
      gate_id: decision.gate_id,
      outcome: decision.outcome,
      reason_code: decision.reason_code,
      score: decision.score ?? null,
      policy_version: 'bleuv1-gate-policy-v1.0',
      method_version: decision.method_version || 'gate-v1',
    }));

    const { error: decisionInsertError } = await input.db
      .from('channel_gate_decisions')
      .insert(decisionsPayload);
    if (decisionInsertError) {
      throw new Error(decisionInsertError.message);
    }
  }

  if (evaluation.aggregate === 'pass') {
    const tagId = await ensureTagId(input.db, input.userId, channelSlug);

    const { error: publicError } = await input.db
      .from('blueprints')
      .update({ is_public: true })
      .eq('id', input.blueprintId);
    if (publicError) throw new Error(publicError.message);

    if (input.attachBlueprintTag) {
      await input.attachBlueprintTag({
        blueprintId: input.blueprintId,
        tagId,
        tagSlug: channelSlug,
      });
    } else {
      const { error: tagLinkError } = await input.db
        .from('blueprint_tags')
        .upsert({ blueprint_id: input.blueprintId, tag_id: tagId }, { onConflict: 'blueprint_id,tag_id' });
      if (tagLinkError) throw new Error(tagLinkError.message);
    }

    if (input.updateChannelCandidateStatus) {
      const publishedCandidate = await input.updateChannelCandidateStatus({
        candidateId: candidate.id,
        status: 'published',
      });
      if (!publishedCandidate) throw new Error('Could not publish channel candidate');
    } else {
      const { error: candidatePublishError } = await input.db
        .from('channel_candidates')
        .update({ status: 'published' })
        .eq('id', candidate.id);
      if (candidatePublishError) throw new Error(candidatePublishError.message);
    }

    if (input.patchFeedItemById) {
      await input.patchFeedItemById({
        db: input.db,
        feedItemId: input.userFeedItemId,
        userId: input.userId,
        patch: {
          blueprint_id: input.blueprintId,
          state: 'channel_published',
          last_decision_code: evaluation.reasonCode,
        },
        action: 'auto_channel_pipeline_publish',
      });
    } else {
      const { error: feedPublishError } = await input.db
        .from('user_feed_items')
        .update({ blueprint_id: input.blueprintId, state: 'channel_published', last_decision_code: evaluation.reasonCode })
        .eq('id', input.userFeedItemId)
        .eq('user_id', input.userId);
      if (feedPublishError) throw new Error(feedPublishError.message);
    }

    return {
      userFeedItemId: input.userFeedItemId,
      blueprintId: input.blueprintId,
      candidateId: candidate.id,
      channelSlug,
      decision: 'published',
      reasonCode: evaluation.reasonCode,
      aggregate: evaluation.aggregate,
      gateMode: input.gateMode,
      idempotent: false,
      classifierMode: resolution.classifierMode,
      classifierReason: resolution.classifierReason,
      classifierConfidence: resolution.classifierConfidence ?? null,
    };
  }

  if (input.updateChannelCandidateStatus) {
    const rejectedCandidate = await input.updateChannelCandidateStatus({
      candidateId: candidate.id,
      status: 'rejected',
    });
    if (!rejectedCandidate) throw new Error('Could not reject channel candidate');
  } else {
    const { error: candidateRejectError } = await input.db
      .from('channel_candidates')
      .update({ status: 'rejected' })
      .eq('id', candidate.id);
    if (candidateRejectError) throw new Error(candidateRejectError.message);
  }

  if (input.patchFeedItemById) {
    await input.patchFeedItemById({
      db: input.db,
      feedItemId: input.userFeedItemId,
      userId: input.userId,
      patch: {
        blueprint_id: input.blueprintId,
        state: 'channel_rejected',
        last_decision_code: evaluation.reasonCode,
      },
      action: 'auto_channel_pipeline_reject',
    });
  } else {
    const { error: feedRejectError } = await input.db
      .from('user_feed_items')
      .update({ blueprint_id: input.blueprintId, state: 'channel_rejected', last_decision_code: evaluation.reasonCode })
      .eq('id', input.userFeedItemId)
      .eq('user_id', input.userId);
    if (feedRejectError) throw new Error(feedRejectError.message);
  }

  return {
    userFeedItemId: input.userFeedItemId,
    blueprintId: input.blueprintId,
    candidateId: candidate.id,
    channelSlug,
    decision: 'held',
    reasonCode: evaluation.reasonCode,
    aggregate: evaluation.aggregate,
    gateMode: input.gateMode,
    idempotent: false,
    classifierMode: resolution.classifierMode,
    classifierReason: resolution.classifierReason,
    classifierConfidence: resolution.classifierConfidence ?? null,
  };
}

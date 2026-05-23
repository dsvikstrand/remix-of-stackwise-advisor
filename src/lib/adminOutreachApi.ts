import { config } from '@/config/runtime';
import { supabase } from '@/integrations/supabase/client';

type ApiEnvelope<T> = {
  ok: boolean;
  error_code: string | null;
  message: string;
  data: T;
};

export type OutreachDraftOption = {
  id: string;
  optionIndex: number;
  roleId: string;
  roleLabel: string;
  openerText: string;
  tailVariantId: string;
  tailText: string;
  finalText: string;
};

export type OutreachPromoVariant = {
  id: string;
  text: string;
};

export type OutreachDraftGenerationResult = {
  draftGroupId: string;
  blueprintId: string;
  sourceItemId: string;
  youtubeVideoId: string;
  videoUrl: string;
  sourceChannelId: string | null;
  sourceChannelTitle: string | null;
  sourceChannelSubscriberCount: number | null;
  model: string;
  reasoningEffort: string;
  promptVersion: string;
  options: OutreachDraftOption[];
  promoVariants: OutreachPromoVariant[];
  limits: {
    dailyCap: number;
    channelWindowDays: number;
    channelWindowCap: number;
    videoAlreadyDrafted: boolean;
  };
};

export type OutreachPostResult = {
  draftId: string;
  draftGroupId: string;
  blueprintId: string;
  sourceItemId: string;
  youtubeVideoId: string;
  videoUrl: string;
  youtubeCommentId: string;
  finalText: string;
  status: 'posted' | 'posted_unverified';
  postedAt: string;
  verification?: {
    visible: boolean;
    errorCode: string | null;
    errorMessage: string | null;
  };
};

export type OutreachCandidateStatsRefreshResult = {
  requested: number;
  refreshed: number;
  skipped: number;
  quotaUnitsEstimated: number;
  items: Array<{
    sourceItemId: string;
    videoId: string | null;
    viewCount: number | null;
    commentCount: number | null;
    status: 'refreshed' | 'skipped' | 'failed';
    errorMessage: string | null;
  }>;
};

function getApiBase() {
  if (!config.agenticBackendUrl) return null;
  return `${config.agenticBackendUrl.replace(/\/$/, '')}/api`;
}

async function getRequiredAuthHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in required.');
  return { Authorization: `Bearer ${token}` };
}

export async function generateOutreachDrafts(input: {
  blueprintId: string;
}) {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/admin/outreach-drafts/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      blueprint_id: input.blueprintId,
    }),
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<OutreachDraftGenerationResult> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Outreach draft request failed (${response.status})`);
  }
  return json.data;
}

export async function postOutreachDraft(input: {
  draftId: string;
  finalText: string;
}) {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/admin/outreach-drafts/${encodeURIComponent(input.draftId)}/post`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      final_text: input.finalText,
    }),
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<OutreachPostResult> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Outreach post request failed (${response.status})`);
  }
  return json.data;
}

export async function refreshOutreachCandidateStats(input: {
  sourceItemIds: string[];
}) {
  const base = getApiBase();
  if (!base) throw new Error('Backend API is not configured.');

  const authHeader = await getRequiredAuthHeader();
  const response = await fetch(`${base}/admin/outreach-drafts/candidate-stats/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    body: JSON.stringify({
      source_item_ids: input.sourceItemIds,
    }),
  });
  const json = (await response.json().catch(() => null)) as ApiEnvelope<OutreachCandidateStatsRefreshResult> | null;
  if (!response.ok || !json?.ok || !json.data) {
    throw new Error(json?.message || `Outreach stats refresh failed (${response.status})`);
  }
  return json.data;
}

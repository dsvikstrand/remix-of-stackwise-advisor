import { z } from 'zod';

export type OutreachDraftContext = {
  blueprintId: string;
  sourceItemId: string;
  youtubeVideoId: string;
  videoUrl: string;
  videoTitle: string;
  sourceChannelId: string | null;
  sourceChannelTitle: string | null;
  sourceChannelSubscriberCount?: number | null;
  blueprintTitle: string;
  blueprintSummary: string | null;
  blueprintReview: string | null;
  blueprintSectionsJson: unknown;
  tags: string[];
};

export type OutreachDraftOption = {
  id?: string;
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
    videoAlreadyDrafted: boolean;
  };
};

export type OutreachDraftLLM = {
  generateVideoOpeners: (input: {
    context: OutreachDraftContext;
    count: number;
  }) => Promise<{
    model: string;
    reasoningEffort: string;
    rawText: string | null;
    openers: string[];
  }>;
};

export type OutreachChannelStatsResolver = (input: {
  sourceChannelId: string;
}) => Promise<{
  subscriberCount: number | null;
  hiddenSubscriberCount?: boolean | null;
}>;

export type OutreachDraftHistoryRow = {
  id: string;
  draft_group_id: string;
  admin_user_id: string;
  blueprint_id: string;
  source_item_id: string;
  youtube_video_id: string;
  source_channel_id: string | null;
  final_text: string;
  status?: string | null;
  youtube_comment_id?: string | null;
  posted_at?: string | null;
  created_at: string;
};

export type OutreachDraftStoredRow = OutreachDraftHistoryRow & {
  video_url: string;
  source_channel_title: string | null;
  option_index: number;
  opener_text: string;
  tail_variant_id: string;
  tail_text: string;
  model: string;
  reasoning_effort: string;
  prompt_version: string;
  validation_json: string;
  updated_at: string;
  post_error_code: string | null;
  post_error_message: string | null;
};

export type OutreachDraftStateStore = {
  listRecentDrafts: (input: {
    adminUserId?: string | null;
    sinceIso?: string | null;
    limit?: number;
  }) => Promise<OutreachDraftHistoryRow[]>;
  getDraftOption: (input: {
    draftId: string;
  }) => Promise<OutreachDraftStoredRow | null>;
  insertDraftOptions: (input: {
    rows: Array<{
      id: string;
      draft_group_id: string;
      admin_user_id: string;
      blueprint_id: string;
      source_item_id: string;
      youtube_video_id: string;
      video_url: string;
      source_channel_id: string | null;
      source_channel_title: string | null;
      option_index: number;
      opener_text: string;
      tail_variant_id: string;
      tail_text: string;
      final_text: string;
      status: string;
      model: string;
      reasoning_effort: string;
      prompt_version: string;
      validation_json: string;
      created_at: string;
      updated_at: string;
    }>;
  }) => Promise<Array<{ id: string }>>;
  markDraftPosting: (input: {
    draftId: string;
    adminUserId: string;
    finalText: string;
    updatedAt: string;
  }) => Promise<boolean>;
  markDraftPosted: (input: {
    draftId: string;
    adminUserId: string;
    finalText: string;
    youtubeCommentId: string;
    status?: 'posted' | 'posted_unverified';
    errorCode?: string | null;
    errorMessage?: string | null;
    postedAt: string;
    updatedAt: string;
  }) => Promise<boolean>;
  markDraftPostFailed: (input: {
    draftId: string;
    adminUserId: string;
    finalText: string;
    errorCode: string;
    errorMessage: string;
    updatedAt: string;
  }) => Promise<boolean>;
};

export class OutreachDraftError extends Error {
  status: number;
  errorCode: string;

  constructor(status: number, errorCode: string, message: string) {
    super(message);
    this.name = 'OutreachDraftError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

export const OUTREACH_DRAFT_PROMPT_VERSION = 'outreach_draft_openers_v1';
export const OUTREACH_DRAFT_DAILY_CAP = 5;
export const OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS = 7;
export const OUTREACH_DRAFT_OPTION_COUNT = 3;

const MAX_OPENER_CHARS = 420;
const MAX_FINAL_COMMENT_CHARS = 1200;

export const OUTREACH_TAIL_VARIANTS = [
  {
    id: 'too-many-videos-v2',
    text: 'Too many useful videos, not enough time? BLEUP turns YouTube into a personal learning feed. Visit my channel to learn more.',
  },
  {
    id: 'keep-up-without-watching-all-v2',
    text: 'Want to keep up with YouTube without watching everything? BLEUP helps turn new videos into quick learning blueprints. Visit my channel for more info.',
  },
  {
    id: 'watch-later-growing-v2',
    text: 'If your Watch Later list keeps growing, BLEUP helps you find the useful takeaways faster. Visit my channel to see how it works.',
  },
  {
    id: 'learning-from-youtube-v2',
    text: 'Learning from YouTube is great, but keeping up is hard. BLEUP gives you a faster way to follow useful videos. Visit my channel to learn more.',
  },
  {
    id: 'creators-you-follow-v2',
    text: 'Want a quicker way to learn from the creators you follow? BLEUP turns new videos into skimmable blueprints. Visit my channel for more info.',
  },
  {
    id: 'drowning-in-content-v2',
    text: 'If you use YouTube to learn, BLEUP helps you keep up without drowning in content. Visit my channel to see how it works.',
  },
] as const;

const OpenersSchema = z.object({
  openers: z.array(z.string().min(20).max(MAX_OPENER_CHARS)).min(1).max(5),
});

export const OUTREACH_COMMENT_ROLES = [
  {
    id: 'short_insight',
    label: 'Short insight',
  },
  {
    id: 'light_funny',
    label: 'Light/funny',
  },
  {
    id: 'thoughtful',
    label: 'Thoughtful',
  },
] as const;

function normalizeText(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCommentText(value: unknown) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeSubscriberCount(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null;
}

function extractKeywords(value: string) {
  return new Set(
    normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4),
  );
}

function similarityScore(a: string, b: string) {
  const aWords = extractKeywords(a);
  const bWords = extractKeywords(b);
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let intersection = 0;
  for (const word of aWords) {
    if (bWords.has(word)) intersection += 1;
  }
  return intersection / Math.max(1, Math.min(aWords.size, bWords.size));
}

function parseOpeners(rawText: string | null, fallbackOpeners: string[]) {
  const candidates: unknown[] = [];
  const raw = String(rawText || '').trim();
  if (raw) {
    candidates.push(raw);
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) candidates.push(match[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(String(candidate));
      const validated = OpenersSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data.openers.map(normalizeCommentText).filter(Boolean);
      }
    } catch {
      // Continue to fallback parsing.
    }
  }

  const validated = OpenersSchema.safeParse({ openers: fallbackOpeners });
  return validated.success ? validated.data.openers.map(normalizeCommentText).filter(Boolean) : [];
}

function compactBlueprintContext(context: OutreachDraftContext) {
  const sections = context.blueprintSectionsJson && typeof context.blueprintSectionsJson === 'object'
    ? JSON.stringify(context.blueprintSectionsJson).slice(0, 1800)
    : '';
  return {
    videoTitle: context.videoTitle,
    creator: context.sourceChannelTitle,
    blueprintTitle: context.blueprintTitle,
    summary: context.blueprintSummary,
    review: context.blueprintReview,
    tags: context.tags.slice(0, 8),
    sections,
  };
}

function selectTailVariant(input: {
  blueprintId: string;
  optionIndex: number;
}) {
  const seed = `${input.blueprintId}:${input.optionIndex}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % OUTREACH_TAIL_VARIANTS.length;
  return OUTREACH_TAIL_VARIANTS[index];
}

function validateFinalDraft(input: {
  opener: string;
  finalText: string;
  recentFinalTexts: string[];
}) {
  const issues: string[] = [];
  if (input.opener.length < 20) issues.push('opener_too_short');
  if (input.opener.length > MAX_OPENER_CHARS) issues.push('opener_too_long');
  if (input.finalText.length > MAX_FINAL_COMMENT_CHARS) issues.push('final_too_long');
  if (/https?:\/\//i.test(input.finalText)) issues.push('direct_link_not_allowed');
  const tooSimilar = input.recentFinalTexts.some((recent) => similarityScore(input.finalText, recent) >= 0.82);
  if (tooSimilar) issues.push('too_similar_to_recent');
  return {
    ok: issues.length === 0,
    issues,
  };
}

export function validateOutreachPostText(finalText: string) {
  const text = String(finalText || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const issues: string[] = [];
  if (text.length < 40) issues.push('final_too_short');
  if (text.length > MAX_FINAL_COMMENT_CHARS) issues.push('final_too_long');
  if (/https?:\/\//i.test(text)) issues.push('direct_link_not_allowed');
  return {
    ok: issues.length === 0,
    issues,
    text,
  };
}

export async function generateOutreachDrafts(input: {
  adminUserId: string;
  blueprintId: string;
  now?: Date;
  randomUUID: () => string;
  resolveContext: (input: { adminUserId: string; blueprintId: string }) => Promise<OutreachDraftContext | null>;
  resolveChannelStats?: OutreachChannelStatsResolver;
  minCreatorSubscribers?: number;
  blockUnknownSubscriberCount?: boolean;
  stateStore: OutreachDraftStateStore;
  llm: OutreachDraftLLM;
}) {
  const adminUserId = normalizeText(input.adminUserId);
  const blueprintId = normalizeText(input.blueprintId);
  if (!adminUserId) throw new OutreachDraftError(401, 'AUTH_REQUIRED', 'Sign in required.');
  if (!blueprintId) throw new OutreachDraftError(400, 'INVALID_BLUEPRINT_ID', 'Missing blueprint id.');

  const now = input.now || new Date();
  const nowIso = now.toISOString();
  const context = await input.resolveContext({ adminUserId, blueprintId });
  if (!context) {
    throw new OutreachDraftError(404, 'CONTEXT_NOT_FOUND', 'Could not resolve generated blueprint source context.');
  }
  const minCreatorSubscribers = Math.max(0, Math.floor(Number(input.minCreatorSubscribers || 0)));
  const blockUnknownSubscriberCount = input.blockUnknownSubscriberCount !== false;
  let sourceChannelSubscriberCount = normalizeSubscriberCount(context.sourceChannelSubscriberCount);
  if (minCreatorSubscribers > 0) {
    if (!context.sourceChannelId) {
      throw new OutreachDraftError(
        409,
        'OUTREACH_CHANNEL_STATS_UNAVAILABLE',
        'Skipped outreach: this video has no creator channel id, so subscriber count could not be checked.',
      );
    }
    if (sourceChannelSubscriberCount === null && input.resolveChannelStats) {
      const stats = await input.resolveChannelStats({ sourceChannelId: context.sourceChannelId });
      sourceChannelSubscriberCount = normalizeSubscriberCount(stats.subscriberCount);
    }
    if (sourceChannelSubscriberCount === null && blockUnknownSubscriberCount) {
      throw new OutreachDraftError(
        409,
        'OUTREACH_CHANNEL_STATS_UNAVAILABLE',
        'Skipped outreach: creator subscriber count is unavailable, so this needs manual review before posting.',
      );
    }
    if (sourceChannelSubscriberCount !== null && sourceChannelSubscriberCount < minCreatorSubscribers) {
      throw new OutreachDraftError(
        409,
        'OUTREACH_CREATOR_SUBSCRIBERS_TOO_LOW',
        `Skipped outreach: creator has ${sourceChannelSubscriberCount.toLocaleString('en-US')} subscribers, below the ${minCreatorSubscribers.toLocaleString('en-US')} subscriber threshold.`,
      );
    }
  }

  const sinceDayIso = addDays(now, -1).toISOString();
  const sinceChannelIso = addDays(now, -OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS).toISOString();
  const recentRows = await input.stateStore.listRecentDrafts({
    adminUserId,
    sinceIso: sinceChannelIso,
    limit: 500,
  });
  const dailyGroups = new Set(
    recentRows
      .filter((row) => row.created_at >= sinceDayIso)
      .map((row) => row.draft_group_id),
  );
  if (dailyGroups.size >= OUTREACH_DRAFT_DAILY_CAP) {
    throw new OutreachDraftError(429, 'DAILY_CAP_REACHED', `Outreach draft cap reached (${OUTREACH_DRAFT_DAILY_CAP}/day).`);
  }

  const videoAlreadyDrafted = recentRows.some((row) => row.youtube_video_id === context.youtubeVideoId);
  if (videoAlreadyDrafted) {
    throw new OutreachDraftError(409, 'VIDEO_ALREADY_DRAFTED', 'This video already has an outreach draft.');
  }

  const channelAlreadyDrafted = Boolean(context.sourceChannelId)
    && recentRows.some((row) => row.source_channel_id === context.sourceChannelId);
  if (channelAlreadyDrafted) {
    throw new OutreachDraftError(429, 'CHANNEL_WINDOW_CAP_REACHED', `This creator already has an outreach draft in the last ${OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS} days.`);
  }

  const llmResult = await input.llm.generateVideoOpeners({
    context: {
      ...context,
      blueprintSectionsJson: compactBlueprintContext(context),
    },
    count: OUTREACH_DRAFT_OPTION_COUNT,
  });
  const rawOpeners = parseOpeners(llmResult.rawText, llmResult.openers);
  const uniqueOpeners = Array.from(new Set(rawOpeners.map(normalizeCommentText).filter(Boolean))).slice(0, OUTREACH_DRAFT_OPTION_COUNT);
  if (uniqueOpeners.length < OUTREACH_DRAFT_OPTION_COUNT) {
    throw new OutreachDraftError(502, 'LLM_INVALID_OUTPUT', 'Outreach draft generation returned too few usable openers.');
  }

  const recentFinalTexts = recentRows.map((row) => row.final_text).filter(Boolean);
  const draftGroupId = input.randomUUID();
  const options = uniqueOpeners.map((openerText, index) => {
    const tail = selectTailVariant({ blueprintId, optionIndex: index });
    const role = OUTREACH_COMMENT_ROLES[index] || OUTREACH_COMMENT_ROLES[0];
    const finalText = openerText;
    const validation = validateFinalDraft({
      opener: openerText,
      finalText,
      recentFinalTexts,
    });
    if (!validation.ok) {
      throw new OutreachDraftError(422, 'DRAFT_VALIDATION_FAILED', `Generated draft failed validation: ${validation.issues.join(', ')}`);
    }
    return {
      id: input.randomUUID(),
      optionIndex: index + 1,
      roleId: role.id,
      roleLabel: role.label,
      openerText,
      tailVariantId: tail.id,
      tailText: tail.text,
      finalText,
    };
  });

  const inserted = await input.stateStore.insertDraftOptions({
    rows: options.map((option) => ({
      id: option.id!,
      draft_group_id: draftGroupId,
      admin_user_id: adminUserId,
      blueprint_id: context.blueprintId,
      source_item_id: context.sourceItemId,
      youtube_video_id: context.youtubeVideoId,
      video_url: context.videoUrl,
      source_channel_id: context.sourceChannelId,
      source_channel_title: context.sourceChannelTitle,
      option_index: option.optionIndex,
      opener_text: option.openerText,
      tail_variant_id: option.tailVariantId,
      tail_text: option.tailText,
      final_text: option.finalText,
      status: 'drafted',
      model: llmResult.model,
      reasoning_effort: llmResult.reasoningEffort,
      prompt_version: OUTREACH_DRAFT_PROMPT_VERSION,
      validation_json: JSON.stringify({ ok: true, issues: [] }),
      created_at: nowIso,
      updated_at: nowIso,
    })),
  });
  const insertedIds = inserted.map((row) => row.id);

  return {
    draftGroupId,
    blueprintId: context.blueprintId,
    sourceItemId: context.sourceItemId,
    youtubeVideoId: context.youtubeVideoId,
    videoUrl: context.videoUrl,
    sourceChannelId: context.sourceChannelId,
    sourceChannelTitle: context.sourceChannelTitle,
    sourceChannelSubscriberCount,
    model: llmResult.model,
    reasoningEffort: llmResult.reasoningEffort,
    promptVersion: OUTREACH_DRAFT_PROMPT_VERSION,
    options: options.map((option, index) => ({
      ...option,
      id: insertedIds[index] || option.id,
    })),
    promoVariants: OUTREACH_TAIL_VARIANTS.map((variant) => ({
      id: variant.id,
      text: variant.text,
    })),
    limits: {
      dailyCap: OUTREACH_DRAFT_DAILY_CAP,
      channelWindowDays: OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS,
      videoAlreadyDrafted: false,
    },
  } satisfies OutreachDraftGenerationResult;
}

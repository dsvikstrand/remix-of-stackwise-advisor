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
    channelWindowCap: number;
    videoAlreadyDrafted: boolean;
  };
};

export type OutreachDraftLLM = {
  generateVideoOpeners: (input: {
    context: OutreachDraftContext;
    count: number;
    requiredPrefixes?: string[];
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
  video_url?: string | null;
  source_channel_id: string | null;
  source_channel_title?: string | null;
  final_text: string;
  status?: string | null;
  youtube_comment_id?: string | null;
  posted_at?: string | null;
  last_visibility_checked_at?: string | null;
  last_visibility_status?: string | null;
  last_visibility_error_code?: string | null;
  last_visibility_error_message?: string | null;
  visibility_check_count?: number | null;
  last_visible_at?: string | null;
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
  listPostedDrafts: (input: {
    adminUserId: string;
    limit: number;
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
  markDraftVisibilityChecked: (input: {
    draftId: string;
    adminUserId: string;
    status: 'visible' | 'not_visible' | 'verify_failed';
    errorCode: string | null;
    errorMessage: string | null;
    checkedAt: string;
    visibleAt: string | null;
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
export const OUTREACH_DRAFT_DAILY_CAP = 0;
export const OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS = 7;
export const OUTREACH_DRAFT_CHANNEL_WINDOW_CAP = 3;
export const OUTREACH_DRAFT_OPTION_COUNT = 1;
const OUTREACH_DRAFT_PREFIX_CHOICE_COUNT = 2;

const MAX_OPENER_CHARS = 420;
const MAX_SHORT_OPENER_CHARS = 140;
const MAX_FINAL_COMMENT_CHARS = 1200;

export const OUTREACH_CREATOR_PRAISE_PREFIXES = [
  'Great video, I liked the reminder that',
  'Really helpful, the simple point about',
  'This was useful, especially the reminder that',
  'Clear and helpful, I liked how you explained',
  'Nice breakdown, the part about',
] as const;

export const OUTREACH_PROMO_QUESTIONS = [
  'Use YouTube to learn?',
  'Learning from YouTube?',
  'Watch Later always growing?',
  'Too many useful videos, not enough time?',
  'Too many good videos in your feed?',
] as const;

export const OUTREACH_PROMO_FINISHERS = [
  'I share practical ways to keep up with it all.',
  'I share ways to keep track of useful takeaways.',
  'I help make useful videos easier to revisit.',
  'I help make it easier to keep up.',
  'I can help keep useful takeaways easier to revisit.',
] as const;

const OpenersSchema = z.object({
  openers: z.array(z.string().min(20).max(MAX_OPENER_CHARS)).min(1).max(5),
});

const CommentSchema = z.object({
  comment: z.string().min(20).max(MAX_OPENER_CHARS),
});

export const OUTREACH_COMMENT_ROLES = [
  {
    id: 'short_insight_1',
    label: 'Short insight',
  },
  {
    id: 'short_insight_2',
    label: 'Short insight',
  },
  {
    id: 'short_insight_3',
    label: 'Short insight',
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
    .replace(/[—–]/g, ',')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?, ?/g, ', ')
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

function isPostedOutreachRow(row: {
  status?: string | null;
  youtube_comment_id?: string | null;
  posted_at?: string | null;
}) {
  const status = normalizeText(row.status).toLowerCase();
  return status === 'posted'
    || status === 'posted_unverified'
    || Boolean(normalizeText(row.youtube_comment_id))
    || Boolean(normalizeText(row.posted_at));
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
      const commentValidated = CommentSchema.safeParse(parsed);
      if (commentValidated.success) {
        return [normalizeCommentText(commentValidated.data.comment)].filter(Boolean);
      }
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

function normalizeTakeawayBullet(value: unknown) {
  return normalizeText(value)
    .replace(/^[-*•\d.)\s]+/, '')
    .slice(0, 120)
    .trim();
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function extractArrayBullets(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      const record = readRecord(item);
      return record
        ? record.text || record.title || record.summary || record.body || ''
        : '';
    })
    .map(normalizeTakeawayBullet)
    .filter((item) => item.length >= 12);
}

function extractTakeawayBullets(sectionsJson: unknown) {
  const root = readRecord(sectionsJson);
  if (!root) return [];
  const candidates: unknown[] = [
    readRecord(root.takeaways)?.bullets,
    root.takeaways,
    readRecord(root.key_takeaways)?.bullets,
    root.key_takeaways,
    readRecord(root.keyTakeaways)?.bullets,
    root.keyTakeaways,
  ];
  for (const candidate of candidates) {
    const bullets = extractArrayBullets(candidate);
    if (bullets.length > 0) {
      return Array.from(new Set(bullets)).slice(0, 5);
    }
  }
  return [];
}

function compactBlueprintContext(context: OutreachDraftContext) {
  return {
    videoTitle: context.videoTitle,
    sourceChannelTitle: context.sourceChannelTitle,
    takeaways: extractTakeawayBullets(context.blueprintSectionsJson),
  };
}

function stableHash(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function selectTailVariant(input: {
  blueprintId: string;
  optionIndex: number;
}) {
  return buildPromoVariants({ blueprintId: input.blueprintId, count: 1, salt: `tail:${input.optionIndex}` })[0];
}

function buildPromoVariants(input: {
  blueprintId: string;
  count: number;
  salt?: string;
}): OutreachPromoVariant[] {
  const combinations = OUTREACH_PROMO_QUESTIONS.flatMap((question, questionIndex) => (
    OUTREACH_PROMO_FINISHERS.map((finisher, finisherIndex) => ({
      id: `promo-q${questionIndex + 1}-f${finisherIndex + 1}`,
      text: `P.S. ${question} ${finisher}`,
    }))
  ));
  const start = stableHash(`${input.blueprintId}:${input.salt || 'promo'}`) % combinations.length;
  const step = 7; // Coprime with 25 combinations, so resamples spread across both banks.
  return Array.from({ length: Math.min(input.count, combinations.length) }, (_, index) => (
    combinations[(start + (index * step)) % combinations.length]
  ));
}

function selectCreatorPraisePrefixes(input: {
  blueprintId: string;
  count: number;
}) {
  const seed = `${OUTREACH_DRAFT_PROMPT_VERSION}:${input.blueprintId}`;
  const startIndex = stableHash(seed) % OUTREACH_CREATOR_PRAISE_PREFIXES.length;
  return Array.from({ length: input.count }, (_, index) => (
    OUTREACH_CREATOR_PRAISE_PREFIXES[(startIndex + index) % OUTREACH_CREATOR_PRAISE_PREFIXES.length]
  ));
}

function lowercaseFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function ensureCreatorPraisePrefix(openerText: string, prefixes: string[]) {
  const opener = normalizeCommentText(openerText);
  const normalizedPrefixes = prefixes
    .map((prefix) => normalizeCommentText(prefix).replace(/[.!:,]+$/g, '').trim())
    .filter(Boolean);
  const fallbackPrefix = normalizedPrefixes[0] || '';
  if (!opener || !fallbackPrefix) return opener;
  if (normalizedPrefixes.some((prefix) => opener.toLowerCase().startsWith(prefix.toLowerCase()))) {
    return opener;
  }
  return `${fallbackPrefix} ${lowercaseFirst(opener)}`;
}

function validateFinalDraft(input: {
  opener: string;
  finalText: string;
  recentFinalTexts: string[];
  roleId: string;
}) {
  const issues: string[] = [];
  if (input.opener.length < 20) issues.push('opener_too_short');
  if (input.opener.length > MAX_OPENER_CHARS) issues.push('opener_too_long');
  if (input.roleId.startsWith('short_insight') && input.opener.length > MAX_SHORT_OPENER_CHARS) {
    issues.push('opener_too_long_for_role');
  }
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
  if (OUTREACH_DRAFT_DAILY_CAP > 0 && dailyGroups.size >= OUTREACH_DRAFT_DAILY_CAP) {
    throw new OutreachDraftError(429, 'DAILY_CAP_REACHED', `Outreach draft cap reached (${OUTREACH_DRAFT_DAILY_CAP}/day).`);
  }

  const videoAlreadyPosted = recentRows.some(
    (row) => row.youtube_video_id === context.youtubeVideoId && isPostedOutreachRow(row),
  );
  if (videoAlreadyPosted) {
    throw new OutreachDraftError(409, 'VIDEO_ALREADY_DRAFTED', 'This video already has a posted outreach comment.');
  }

  const channelDraftGroups = new Set(
    recentRows
      .filter((row) => (
        Boolean(context.sourceChannelId)
        && row.source_channel_id === context.sourceChannelId
        && isPostedOutreachRow(row)
      ))
      .map((row) => row.draft_group_id),
  );
  if (channelDraftGroups.size >= OUTREACH_DRAFT_CHANNEL_WINDOW_CAP) {
    throw new OutreachDraftError(
      429,
      'CHANNEL_WINDOW_CAP_REACHED',
      `This creator already has ${OUTREACH_DRAFT_CHANNEL_WINDOW_CAP} posted outreach comments in the last ${OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS} days.`,
    );
  }

  const requiredPrefixes = selectCreatorPraisePrefixes({
    blueprintId,
    count: OUTREACH_DRAFT_PREFIX_CHOICE_COUNT,
  });
  const compactContext = compactBlueprintContext(context);
  const llmResult = await input.llm.generateVideoOpeners({
    context: {
      ...context,
      videoTitle: compactContext.videoTitle,
      sourceChannelTitle: compactContext.sourceChannelTitle,
      blueprintTitle: '',
      blueprintSummary: null,
      blueprintReview: null,
      tags: [],
      blueprintSectionsJson: { takeaways: compactContext.takeaways },
    },
    count: OUTREACH_DRAFT_OPTION_COUNT,
    requiredPrefixes,
  });
  const rawOpeners = parseOpeners(llmResult.rawText, llmResult.openers);
  const normalizedOpeners = rawOpeners
    .map((opener) => ensureCreatorPraisePrefix(opener, requiredPrefixes))
    .filter(Boolean);
  const uniqueOpeners = Array.from(new Set(normalizedOpeners)).slice(0, OUTREACH_DRAFT_OPTION_COUNT);
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
      roleId: role.id,
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
    promoVariants: buildPromoVariants({ blueprintId: context.blueprintId, count: 6 }),
    limits: {
      dailyCap: OUTREACH_DRAFT_DAILY_CAP,
      channelWindowDays: OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS,
      channelWindowCap: OUTREACH_DRAFT_CHANNEL_WINDOW_CAP,
      videoAlreadyDrafted: false,
    },
  } satisfies OutreachDraftGenerationResult;
}

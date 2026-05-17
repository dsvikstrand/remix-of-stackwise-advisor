import { z } from 'zod';

export type OutreachDraftContext = {
  blueprintId: string;
  sourceItemId: string;
  youtubeVideoId: string;
  videoUrl: string;
  videoTitle: string;
  sourceChannelId: string | null;
  sourceChannelTitle: string | null;
  blueprintTitle: string;
  blueprintSummary: string | null;
  blueprintReview: string | null;
  blueprintSectionsJson: unknown;
  tags: string[];
};

export type OutreachDraftOption = {
  id?: string;
  optionIndex: number;
  openerText: string;
  tailVariantId: string;
  tailText: string;
  finalText: string;
};

export type OutreachDraftGenerationResult = {
  draftGroupId: string;
  blueprintId: string;
  sourceItemId: string;
  youtubeVideoId: string;
  videoUrl: string;
  sourceChannelId: string | null;
  sourceChannelTitle: string | null;
  model: string;
  reasoningEffort: string;
  promptVersion: string;
  options: OutreachDraftOption[];
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

export type OutreachDraftHistoryRow = {
  id: string;
  draft_group_id: string;
  admin_user_id: string;
  blueprint_id: string;
  source_item_id: string;
  youtube_video_id: string;
  source_channel_id: string | null;
  final_text: string;
  created_at: string;
};

export type OutreachDraftStateStore = {
  listRecentDrafts: (input: {
    adminUserId?: string | null;
    sinceIso?: string | null;
    limit?: number;
  }) => Promise<OutreachDraftHistoryRow[]>;
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
    id: 'learning-blueprints-v1',
    text: 'I’m building a free app called BLEUP that turns videos like this into organized learning blueprints. I tested it with this topic, and it helped me keep the main ideas and follow-up steps in one place. I have a short demo on my channel if that sounds useful.',
  },
  {
    id: 'keep-up-v1',
    text: 'I’m building BLEUP because I follow a lot of educational creators and wanted a faster way to keep up. It turns useful videos into compact blueprints with the main ideas and next steps. I have a short demo on my channel if that sounds useful.',
  },
  {
    id: 'structured-notes-v1',
    text: 'I tested this in BLEUP, a free app I’m building for turning useful YouTube videos into structured notes and follow-up steps. It made this easier to revisit without rewatching the whole video. I have a short demo on my channel if you’re curious.',
  },
  {
    id: 'community-feed-v1',
    text: 'I’m building BLEUP as a community feed for useful YouTube learning videos, where each video becomes a compact blueprint. This one worked well as a test because the ideas are worth saving. I have a short demo on my channel if that sounds useful.',
  },
  {
    id: 'creator-value-v1',
    text: 'I like tools that help more people get value from long creator videos, so I’m building BLEUP around videos like this. It turns the main ideas into a compact learning blueprint. I have a short demo on my channel if that sounds useful.',
  },
  {
    id: 'follow-up-steps-v1',
    text: 'I’m building BLEUP to help turn educational videos into clear takeaways and follow-up steps. I tested it with this topic, and it helped me separate the important points from the extra context. I have a short demo on my channel if that sounds useful.',
  },
] as const;

const OpenersSchema = z.object({
  openers: z.array(z.string().min(20).max(MAX_OPENER_CHARS)).min(1).max(5),
});

function normalizeText(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
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
        return validated.data.openers.map(normalizeText).filter(Boolean);
      }
    } catch {
      // Continue to fallback parsing.
    }
  }

  const validated = OpenersSchema.safeParse({ openers: fallbackOpeners });
  return validated.success ? validated.data.openers.map(normalizeText).filter(Boolean) : [];
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
  if (!/\bBLEUP\b/i.test(input.finalText)) issues.push('missing_bleup');
  if (!/\bI[’']?m building\b/i.test(input.finalText)) issues.push('missing_builder_disclosure');
  if (/https?:\/\//i.test(input.finalText)) issues.push('direct_link_not_allowed');
  const tooSimilar = input.recentFinalTexts.some((recent) => similarityScore(input.finalText, recent) >= 0.82);
  if (tooSimilar) issues.push('too_similar_to_recent');
  return {
    ok: issues.length === 0,
    issues,
  };
}

export async function generateOutreachDrafts(input: {
  adminUserId: string;
  blueprintId: string;
  now?: Date;
  randomUUID: () => string;
  resolveContext: (input: { adminUserId: string; blueprintId: string }) => Promise<OutreachDraftContext | null>;
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
  const uniqueOpeners = Array.from(new Set(rawOpeners.map(normalizeText).filter(Boolean))).slice(0, OUTREACH_DRAFT_OPTION_COUNT);
  if (uniqueOpeners.length < OUTREACH_DRAFT_OPTION_COUNT) {
    throw new OutreachDraftError(502, 'LLM_INVALID_OUTPUT', 'Outreach draft generation returned too few usable openers.');
  }

  const recentFinalTexts = recentRows.map((row) => row.final_text).filter(Boolean);
  const draftGroupId = input.randomUUID();
  const options = uniqueOpeners.map((openerText, index) => {
    const tail = selectTailVariant({ blueprintId, optionIndex: index });
    const finalText = `${openerText}\n\n${tail.text}`.trim();
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
    model: llmResult.model,
    reasoningEffort: llmResult.reasoningEffort,
    promptVersion: OUTREACH_DRAFT_PROMPT_VERSION,
    options: options.map((option, index) => ({
      ...option,
      id: insertedIds[index] || option.id,
    })),
    limits: {
      dailyCap: OUTREACH_DRAFT_DAILY_CAP,
      channelWindowDays: OUTREACH_DRAFT_CHANNEL_WINDOW_DAYS,
      videoAlreadyDrafted: false,
    },
  } satisfies OutreachDraftGenerationResult;
}

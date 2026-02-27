import fs from 'node:fs';
import path from 'node:path';
import type {
  BlueprintAnalysisRequest,
  BlueprintGenerationRequest,
  InventoryRequest,
  YouTubeBlueprintRequest,
} from './types';

export const INVENTORY_SYSTEM_PROMPT = `You are an expert curator who creates comprehensive inventory schemas for various domains.

Your job is to generate a structured inventory of items organized into logical categories based on user input keywords.

Guidelines:
- Create exactly 6 categories based on the domain
- Include 6-12 items per category
- Default to general item names (e.g., "Gentle Cleanser" instead of "Salicylic Acid Cleanser")
- Only use highly specific or ingredient-level items if the user explicitly asks for specificity
- Avoid brand names unless the user explicitly requests them
- Items should be real, commonly used products/ingredients/tools in that domain
- Cover a range from beginner-friendly to advanced options

Response format (STRICT JSON - no markdown, no explanation):
{
  "summary": "Brief 1-2 sentence description of what this inventory covers",
  "categories": [
    {
      "name": "Category Name",
      "items": ["Item 1", "Item 2", "Item 3", ...]
    }
  ],
  "suggestedTags": ["tag1", "tag2", "tag3", "tag4"]
}

Examples of domains and what to include:
- "skincare routine" → Cleansers, Toners, Serums, Moisturizers, SPF, Treatments, Tools
- "green smoothie" → Leafy Greens, Fruits, Proteins, Liquids, Boosters, Sweeteners
- "home workout" → Warm-up, Cardio, Strength Upper, Strength Lower, Core, Stretching
- "morning routine" → Wake-up, Hygiene, Movement, Nutrition, Mindfulness, Planning
`;

export function buildInventoryUserPrompt(input: InventoryRequest) {
  const instructions = input.customInstructions?.trim() || '';
  const preferredList = (input.preferredCategories || [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  const preferredBlock = preferredList.length > 0
    ? `Preferred categories (must include exactly, even if similar):\n${preferredList.map((item) => `- ${item}`).join('\n')}`
    : '';

  return `Generate a comprehensive inventory schema for: "${input.keywords.trim()}"
${input.title ? `Title hint: ${input.title.trim()}` : ''}
${instructions ? `Additional instructions: ${instructions}` : ''}
${preferredBlock}

Create practical, real-world items that someone would actually use for this purpose.
Default to general item names and only get highly specific if the user asks for specificity.
Always return exactly 6 categories total. If preferred categories are provided, include them and generate the remaining categories to reach 6.`;
}

export const BLUEPRINT_SYSTEM_PROMPT = `You are an expert blueprint reviewer.

Your job is to produce a concise, structured review of a user's blueprint.

Output format rules:
- Use markdown headings in the exact order provided: "### {Section Title}".
- Under Strengths, Gaps/Risks, and Suggestions, use list items that begin with "- ".
- Do not use "*", "+", or paragraph-style items for those sections.
- For Overview, use 2-4 sentences. If a score is requested, include "Score: X/100" in Overview.
- Keep the tone constructive and practical.`;

export function buildBlueprintUserPrompt(input: BlueprintAnalysisRequest) {
  const sections = (input.reviewSections && input.reviewSections.length > 0)
    ? input.reviewSections
    : ['Overview', 'Strengths', 'Gaps', 'Suggestions'];

  const items = Object.entries(input.selectedItems)
    .map(([category, entries]) => {
      const lines = entries.map((entry) => {
        if (!entry.context) return `- ${entry.name}`;
        return `- ${entry.name} (context: ${entry.context})`;
      });
      return `${category}:\n${lines.join('\n')}`;
    })
    .join('\n\n');

  return `Blueprint title: ${input.title.trim()}
Inventory title: ${input.inventoryTitle.trim()}
Sections (in order): ${sections.join(' | ')}
Include score in Overview: ${input.includeScore ? 'yes' : 'no'}
${input.reviewPrompt?.trim() ? `Review focus: ${input.reviewPrompt.trim()}` : ''}
${input.mixNotes?.trim() ? `Mix notes: ${input.mixNotes.trim()}` : ''}

Selected items:
${items}

Write the review now following the format rules.`;
}

export const BLUEPRINT_GENERATION_SYSTEM_PROMPT = `You are an expert routine designer.

Your job is to generate a complete step-by-step blueprint using ONLY the items provided in the inventory list.

Guidelines:
- Create 4-8 steps total.
- Each step must have a short title and 1-2 sentence description.
- Each step must include 1-4 items.
- Items must match the inventory items exactly (category + item name).
- Add short context for items when helpful (timing, dosage, reps, duration).
- If a title is provided, use it. Otherwise, create a concise, descriptive title.

Response format (STRICT JSON - no markdown, no explanation):
{
  "title": "Blueprint Title",
  "steps": [
    {
      "title": "Step title",
      "description": "1-2 sentence description",
      "items": [
        { "category": "Category Name", "name": "Item Name", "context": "optional" }
      ]
    }
  ]
}`;

export function buildBlueprintGenerationUserPrompt(input: BlueprintGenerationRequest) {
  const lines = input.categories
    .map((category) => {
      const items = category.items.map((item) => `- ${item}`).join('\n');
      return `${category.name}:\n${items}`;
    })
    .join('\n\n');

  return `Inventory title: ${input.inventoryTitle.trim()}
${input.title?.trim() ? `Requested title: ${input.title.trim()}` : ''}
${input.description?.trim() ? `Description: ${input.description.trim()}` : ''}
${input.notes?.trim() ? `Notes: ${input.notes.trim()}` : ''}

Inventory items (use only these):
${lines}

Generate the blueprint now in the required JSON format.`;
}

export const YOUTUBE_BLUEPRINT_SYSTEM_PROMPT = '';

const YOUTUBE_PROMPT_TEMPLATE_RELATIVE_PATH = 'docs/golden_blueprint/golden_bp_prompt_contract_v1.md';
const YOUTUBE_POS_VIBE_ORACLE_DIR = '/home/ubuntu/remix-of-stackwise-advisor/docs/golden_blueprint/reddit/clean/pos';
const YOUTUBE_REQUIRED_TEMPLATE_KEYS = [
  'VIDEO_URL',
  'VIDEO_TITLE',
  'TRANSCRIPT_SOURCE',
  'SOURCE_TRANSCRIPT_CONTEXT',
  'ORACLE_POS_DIR',
  'POSITIVE_REFERENCE_EXCERPTS',
] as const;

let youtubePromptTemplateCache: string | null = null;

function readYouTubePromptTemplate() {
  if (youtubePromptTemplateCache) return youtubePromptTemplateCache;
  const overridePath = String(process.env.YOUTUBE_BLUEPRINT_PROMPT_TEMPLATE_PATH || '').trim();
  const candidates = [
    overridePath,
    path.resolve(process.cwd(), YOUTUBE_PROMPT_TEMPLATE_RELATIVE_PATH),
  ].filter(Boolean);
  for (const filePath of candidates) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (raw.trim()) {
        youtubePromptTemplateCache = raw;
        return youtubePromptTemplateCache;
      }
    } catch {
      // continue to next path
    }
  }
  throw new Error('YOUTUBE_PROMPT_TEMPLATE_LOAD_FAILED');
}

function assertTemplateHasRuntimePlaceholders(template: string) {
  const missing = YOUTUBE_REQUIRED_TEMPLATE_KEYS.filter((key) => !template.includes(`{{${key}}}`));
  if (missing.length > 0) {
    throw new Error(`YOUTUBE_PROMPT_TEMPLATE_PLACEHOLDERS_MISSING:${missing.join(',')}`);
  }
}

function normalizePromptMultiline(input: string, fallback = 'none') {
  const value = String(input || '').trim();
  return value || fallback;
}

function renderPromptTemplate(template: string, values: Record<string, string>) {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.split(`{{${key}}}`).join(value);
  }
  const unresolved = rendered.match(/{{[A-Z0-9_]+}}/g);
  if (unresolved && unresolved.length > 0) {
    throw new Error(`YOUTUBE_PROMPT_TEMPLATE_UNRESOLVED:${Array.from(new Set(unresolved)).join(',')}`);
  }
  return rendered;
}

function joinListOrNone(lines: string[]) {
  return lines.length > 0 ? lines.map((line) => `- ${line}`).join('\n') : 'none';
}

function parseLimit(value: string | undefined, fallback: number) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed === -1) return -1;
  return Math.max(0, Math.floor(parsed));
}

function isTruthyEnv(raw: string | undefined, fallback = true) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return fallback;
  return !(value === '0' || value === 'false' || value === 'off' || value === 'no');
}

function resolvePositiveReferenceFiles(input: { oraclePosDir: string; positiveReferencePaths: string[]; maxFiles: number }) {
  const explicit = input.positiveReferencePaths
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry) => !entry.includes('*'))
    .filter((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
  if (explicit.length > 0) {
    return input.maxFiles === -1 ? explicit : explicit.slice(0, input.maxFiles);
  }
  if (!fs.existsSync(input.oraclePosDir)) {
    return [];
  }
  const files = fs.readdirSync(input.oraclePosDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(input.oraclePosDir, entry.name))
    .filter((filePath) => /\.(md|txt)$/i.test(path.basename(filePath)))
    .sort((a, b) => a.localeCompare(b));
  return input.maxFiles === -1 ? files : files.slice(0, input.maxFiles);
}

function buildPositiveReferenceExcerpts(input: {
  oraclePosDir: string;
  positiveReferencePaths: string[];
}) {
  const enabled = isTruthyEnv(process.env.YT2BP_POS_REF_ENABLED, true);
  if (!enabled) {
    return {
      excerpts: 'POS references disabled by env.',
      usedPaths: [],
    };
  }

  const maxFiles = parseLimit(process.env.YT2BP_POS_REF_MAX_FILES, -1);
  const maxCharsPerFile = parseLimit(process.env.YT2BP_POS_REF_MAX_CHARS_PER_FILE, -1);
  const maxTotalChars = parseLimit(process.env.YT2BP_POS_REF_MAX_TOTAL_CHARS, -1);
  const files = resolvePositiveReferenceFiles({
    oraclePosDir: input.oraclePosDir,
    positiveReferencePaths: input.positiveReferencePaths,
    maxFiles,
  });

  if (files.length === 0) {
    return {
      excerpts: 'No POS reference files found.',
      usedPaths: [],
    };
  }

  let remainingTotal = maxTotalChars;
  const chunks: string[] = [];
  for (const filePath of files) {
    let text = '';
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    if (maxCharsPerFile !== -1) {
      text = text.slice(0, maxCharsPerFile);
    }
    if (remainingTotal !== -1) {
      if (remainingTotal <= 0) break;
      text = text.slice(0, remainingTotal);
      remainingTotal -= text.length;
    }
    if (!text.trim()) continue;
    chunks.push(`### POS Reference: ${path.basename(filePath)}\n${text}`);
  }

  return {
    excerpts: chunks.length > 0 ? chunks.join('\n\n') : 'No readable POS reference excerpts found.',
    usedPaths: files,
  };
}

export function buildYouTubeBlueprintUserPrompt(input: YouTubeBlueprintRequest) {
  const videoUrl = String(input.videoUrl || '').trim();
  const transcript = String(input.transcript || '').trim();
  const videoTitle = String(input.videoTitle || '').trim() || `YouTube video (${videoUrl || 'unknown'})`;
  const transcriptSource = String(input.transcriptSource || '').trim() || 'youtube_transcript';
  const oraclePosDir = String(input.oraclePosDir || YOUTUBE_POS_VIBE_ORACLE_DIR || '').trim();
  const positiveReferencePaths = (input.positiveReferencePaths || [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  const additionalInstructions = String(input.additionalInstructions || '').trim();
  const qualityIssueCodes = (input.qualityIssueCodes || [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  const qualityIssueDetails = (input.qualityIssueDetails || [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

  if (!videoUrl) throw new Error('YOUTUBE_PROMPT_INPUT_VIDEO_URL_REQUIRED');
  if (!transcript) throw new Error('YOUTUBE_PROMPT_INPUT_TRANSCRIPT_REQUIRED');
  if (!oraclePosDir) throw new Error('YOUTUBE_PROMPT_INPUT_ORACLE_POS_DIR_REQUIRED');

  const positiveReferences = buildPositiveReferenceExcerpts({
    oraclePosDir,
    positiveReferencePaths,
  });

  const template = readYouTubePromptTemplate();
  assertTemplateHasRuntimePlaceholders(template);

  return renderPromptTemplate(template, {
    VIDEO_URL: videoUrl,
    VIDEO_TITLE: videoTitle,
    TRANSCRIPT_SOURCE: transcriptSource,
    SOURCE_TRANSCRIPT_CONTEXT: transcript,
    ORACLE_POS_DIR: oraclePosDir,
    POSITIVE_REFERENCE_PATHS: positiveReferences.usedPaths.length > 0
      ? positiveReferences.usedPaths.join('\n')
      : `${oraclePosDir}/*`,
    POSITIVE_REFERENCE_EXCERPTS: positiveReferences.excerpts,
    ADDITIONAL_INSTRUCTIONS: normalizePromptMultiline(additionalInstructions),
    QUALITY_ISSUE_CODES: joinListOrNone(qualityIssueCodes),
    QUALITY_ISSUE_DETAILS: joinListOrNone(qualityIssueDetails),
  });
}

export function buildYouTubeQualityRetryInstructions(input: {
  attempt: number;
  maxRetries: number;
  issueCodes: string[];
  issueDetails?: string[];
  previousOutput: string;
}) {
  const codes = (input.issueCodes || []).map((code) => String(code || '').trim()).filter(Boolean);
  const details = (input.issueDetails || []).map((line) => String(line || '').trim()).filter(Boolean);
  return [
    `Quality retry ${input.attempt}/${input.maxRetries}.`,
    'Fix all listed quality failures in one pass.',
    'Return strict JSON in the required format only.',
    'Do not use meta framing like "this video", "this blueprint", or "the transcript".',
    '',
    'Failed issue codes:',
    ...(codes.length > 0 ? codes.map((code) => `- ${code}`) : ['- none']),
    '',
    'Failed issue details:',
    ...(details.length > 0 ? details.map((line) => `- ${line}`) : ['- none']),
    '',
    'Previous output to repair:',
    input.previousOutput,
  ].join('\n');
}

export const CHANNEL_LABEL_SYSTEM_PROMPT = `You assign exactly one channel label to a generated blueprint.

Rules:
- Output STRICT JSON only.
- Choose exactly one channel slug from the allowed list provided by the user.
- Do not invent new slugs.
- Prefer the best semantic fit based on title, tags, review summary, and step hints.
- If context is weak or ambiguous, choose the provided fallback slug.

Response format:
{
  "channel_slug": "string",
  "reason": "short string",
  "confidence": 0.0
}`;

export function buildChannelLabelUserPrompt(input: {
  title: string;
  llmReview?: string | null;
  tags?: string[];
  stepHints?: string[];
  fallbackSlug: string;
  allowedChannels: Array<{ slug: string; name: string; description: string; aliases?: string[] }>;
}) {
  const tags = (input.tags || []).map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  const hints = (input.stepHints || []).map((hint) => hint.trim()).filter(Boolean).slice(0, 8);
  const allowed = input.allowedChannels
    .map((channel) => {
      const aliases = (channel.aliases || []).slice(0, 12).join(', ');
      return `- slug: ${channel.slug}\n  name: ${channel.name}\n  description: ${channel.description}\n  aliases: ${aliases || 'none'}`;
    })
    .join('\n');

  return `Blueprint title: ${input.title.trim()}
Review summary: ${(input.llmReview || '').trim() || 'none'}
Tags: ${tags.length > 0 ? tags.join(', ') : 'none'}
Step hints: ${hints.length > 0 ? hints.join(' | ') : 'none'}
Fallback slug: ${input.fallbackSlug}

Allowed channels:
${allowed}

Choose exactly one channel slug from the allowed list and return valid JSON only.`;
}

export function extractJson(text: string) {
  let jsonContent = text.trim();
  if (jsonContent.startsWith('```json')) {
    jsonContent = jsonContent.slice(7);
  }
  if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.slice(3);
  }
  if (jsonContent.endsWith('```')) {
    jsonContent = jsonContent.slice(0, -3);
  }
  return jsonContent.trim();
}

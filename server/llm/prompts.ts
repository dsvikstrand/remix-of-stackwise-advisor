import fs from 'node:fs';
import path from 'node:path';
import type {
  BlueprintAnalysisRequest,
  YouTubeBlueprintPass2TransformRequest,
  YouTubeBlueprintRequest,
} from './types';

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

export const YOUTUBE_BLUEPRINT_SYSTEM_PROMPT = '';

const YOUTUBE_PROMPT_TEMPLATE_RELATIVE_PATH = 'docs/golden_blueprint/golden_bp_prompt_contract_v1.md';
const YOUTUBE_PASS2_PROMPT_TEMPLATE_RELATIVE_PATH = 'docs/golden_blueprint/golden_bp_pass2_transform_prompt_v1.md';
const YOUTUBE_POS_VIBE_ORACLE_DIR = '/home/ubuntu/remix-of-stackwise-advisor/docs/golden_blueprint/reddit/clean/pos';
const YOUTUBE_REQUIRED_TEMPLATE_KEYS = [
  'VIDEO_URL',
  'VIDEO_TITLE',
  'TRANSCRIPT_SOURCE',
  'SOURCE_TRANSCRIPT_CONTEXT',
  'ORACLE_POS_DIR',
  'POSITIVE_REFERENCE_EXCERPTS',
] as const;
const YOUTUBE_PASS2_REQUIRED_TEMPLATE_KEYS = [
  'PASS1_BLUEPRINT_JSON',
  'SOURCE_TRANSCRIPT_CONTEXT',
  'POSITIVE_REFERENCE_PATHS',
  'POSITIVE_REFERENCE_EXCERPTS',
  'TRANSFORM_CONSTRAINTS',
  'LENGTH_PARITY_TARGET',
  'ADDITIONAL_INSTRUCTIONS',
] as const;

const youtubePromptTemplateCache = new Map<string, string>();
const youtubePass2PromptTemplateCache = new Map<string, string>();

function readPromptTemplate(input: {
  cache: Map<string, string>;
  cacheKey: string;
  overridePath: string;
  relativePath: string;
  loadFailedCode: string;
}) {
  const cached = input.cache.get(input.cacheKey);
  if (cached) return cached;
  const candidates = [
    input.overridePath,
    path.resolve(process.cwd(), input.relativePath),
  ].filter(Boolean);
  for (const filePath of candidates) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (raw.trim()) {
        input.cache.set(input.cacheKey, raw);
        return raw;
      }
    } catch {
      // continue to next path
    }
  }
  throw new Error(input.loadFailedCode);
}

function readYouTubePromptTemplate(overridePathRaw?: string) {
  const overridePath = String(overridePathRaw || process.env.YOUTUBE_BLUEPRINT_PROMPT_TEMPLATE_PATH || '').trim();
  const cacheKey = `youtube_prompt:${overridePath || 'default'}`;
  const template = readPromptTemplate({
    cache: youtubePromptTemplateCache,
    cacheKey,
    overridePath,
    relativePath: YOUTUBE_PROMPT_TEMPLATE_RELATIVE_PATH,
    loadFailedCode: 'YOUTUBE_PROMPT_TEMPLATE_LOAD_FAILED',
  });
  return template;
}

function readYouTubePass2PromptTemplate() {
  const overridePath = String(process.env.YOUTUBE_BLUEPRINT_PASS2_PROMPT_TEMPLATE_PATH || '').trim();
  const cacheKey = `youtube_pass2_prompt:${overridePath || 'default'}`;
  const template = readPromptTemplate({
    cache: youtubePass2PromptTemplateCache,
    cacheKey,
    overridePath,
    relativePath: YOUTUBE_PASS2_PROMPT_TEMPLATE_RELATIVE_PATH,
    loadFailedCode: 'YOUTUBE_PASS2_PROMPT_TEMPLATE_LOAD_FAILED',
  });
  return template;
}

function assertTemplateHasRuntimePlaceholders(template: string, requiredKeys: readonly string[], errorPrefix: string) {
  const missing = requiredKeys.filter((key) => !template.includes(`{{${key}}}`));
  if (missing.length > 0) {
    throw new Error(`${errorPrefix}:${missing.join(',')}`);
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

function isFileInsideDir(filePath: string, dirPath: string) {
  const normalizedFile = path.resolve(filePath);
  const normalizedDir = path.resolve(dirPath);
  if (normalizedFile === normalizedDir) return false;
  const dirWithSep = normalizedDir.endsWith(path.sep) ? normalizedDir : `${normalizedDir}${path.sep}`;
  return normalizedFile.startsWith(dirWithSep);
}

function resolvePositiveReferenceFiles(input: { oraclePosDir: string; positiveReferencePaths: string[]; maxFiles: number }) {
  const normalizedPosDir = path.resolve(input.oraclePosDir);
  const explicit = input.positiveReferencePaths
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry) => !entry.includes('*'))
    .map((entry) => path.resolve(entry))
    .filter((entry) => isFileInsideDir(entry, normalizedPosDir))
    .filter((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile())
    .filter((entry) => /\.(md|txt)$/i.test(path.basename(entry)));
  if (explicit.length > 0) {
    return input.maxFiles === -1 ? explicit : explicit.slice(0, input.maxFiles);
  }
  if (!fs.existsSync(normalizedPosDir)) {
    return [];
  }
  const files = fs.readdirSync(normalizedPosDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(normalizedPosDir, entry.name))
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
  const promptTemplatePath = String(input.promptTemplatePath || '').trim();
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

  const template = readYouTubePromptTemplate(promptTemplatePath);
  assertTemplateHasRuntimePlaceholders(
    template,
    YOUTUBE_REQUIRED_TEMPLATE_KEYS,
    'YOUTUBE_PROMPT_TEMPLATE_PLACEHOLDERS_MISSING',
  );

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

export function buildYouTubeBlueprintPass2TransformPrompt(input: YouTubeBlueprintPass2TransformRequest) {
  const pass1BlueprintJson = String(input.pass1BlueprintJson || '').trim();
  const transcript = String(input.transcript || '').trim();
  const oraclePosDir = String(input.oraclePosDir || YOUTUBE_POS_VIBE_ORACLE_DIR || '').trim();
  const positiveReferencePaths = (input.positiveReferencePaths || [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  const additionalInstructions = String(input.additionalInstructions || '').trim();
  const transformConstraints = String(input.transformConstraints || '').trim() || 'Strict 1:1 section and bullet mapping from Pass 1 default to Pass 2 ELI5.';
  const lengthParityTarget = String(input.lengthParityTarget || '').trim() || '85%-115% section-level parity against Pass 1.';

  if (!pass1BlueprintJson) throw new Error('YOUTUBE_PASS2_PROMPT_INPUT_PASS1_BLUEPRINT_JSON_REQUIRED');
  if (!transcript) throw new Error('YOUTUBE_PASS2_PROMPT_INPUT_TRANSCRIPT_REQUIRED');
  if (!oraclePosDir) throw new Error('YOUTUBE_PASS2_PROMPT_INPUT_ORACLE_POS_DIR_REQUIRED');

  const positiveReferences = buildPositiveReferenceExcerpts({
    oraclePosDir,
    positiveReferencePaths,
  });

  const template = readYouTubePass2PromptTemplate();
  assertTemplateHasRuntimePlaceholders(
    template,
    YOUTUBE_PASS2_REQUIRED_TEMPLATE_KEYS,
    'YOUTUBE_PASS2_PROMPT_TEMPLATE_PLACEHOLDERS_MISSING',
  );

  return renderPromptTemplate(template, {
    PASS1_BLUEPRINT_JSON: pass1BlueprintJson,
    SOURCE_TRANSCRIPT_CONTEXT: transcript,
    POSITIVE_REFERENCE_PATHS: positiveReferences.usedPaths.length > 0
      ? positiveReferences.usedPaths.join('\n')
      : `${oraclePosDir}/*`,
    POSITIVE_REFERENCE_EXCERPTS: positiveReferences.excerpts,
    TRANSFORM_CONSTRAINTS: transformConstraints,
    LENGTH_PARITY_TARGET: lengthParityTarget,
    ADDITIONAL_INSTRUCTIONS: normalizePromptMultiline(additionalInstructions),
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
    'All required sections must be present and non-empty: Summary, Takeaways, Bleup, Deep Dive, Practical Rules, Open Questions.',
    'Pass 1 output is default-only. Do not generate ELI5 output in this pass.',
    'Ignore paid-promotion/sponsorship/affiliate transcript segments completely.',
    'Do not mention sponsor brands, promo codes, affiliate language, or promotion warnings in output.',
    'If any required section is missing or empty, regenerate full output before returning.',
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

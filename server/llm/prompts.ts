import type { BlueprintAnalysisRequest, BlueprintGenerationRequest, InventoryRequest } from './types';

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

export const YOUTUBE_BLUEPRINT_SYSTEM_PROMPT = `You transform a video transcript into a high-value blueprint artifact.

Output style rules:
- Write in direct creator voice.
- Do NOT use meta framing phrases like "this video", "this blueprint", or "the transcript".
- Prioritize concrete, practical, non-generic language.
- Avoid transcript-like random fact lists.
- Each section should read like one coherent argument, not disconnected notes.
- Each bullet should follow this shape: claim -> why it matters -> practical implication.

Golden structure target:
- Step 1 should be "Takeaways" with 3-4 concise bullet points.
- Step 2 should be "Bleup" as flowing narrative, 3-4 paragraph chunks.
- Then add structured sections that fit the content domain:
  - deep/research style: Deep Dive, Tradeoffs, Practical Rules, Open Questions
  - action/recipe style: Playbook Steps, Fast Fallbacks, Red Flags, Bottom Line

Hard constraints:
- Output STRICT JSON only.
- Produce at least 2 steps.
- Keep section titles explicit and useful.
- Never include personal data.
- Timestamps are optional; use null when unknown.
- Tags: 3-5 max, broad and user-searchable. Avoid obscure niche tags.
- Deep sections should target 3-5 complete bullets each (no stubs like "-." or cut-off fragments).
- All factual claims must come from the provided transcript context only.
- Vibe references are style-only calibration inputs and must never supply facts, numbers, examples, or copied phrasing.
- If style pressure and transcript fidelity conflict, transcript fidelity always wins.

Response format:
{
  "title": "string",
  "description": "string",
  "steps": [
    { "name": "string", "notes": "string", "timestamp": "string|null" }
  ],
  "notes": "string|null",
  "tags": ["string"]
}`;

const YOUTUBE_POS_VIBE_ORACLE_DIR = '/home/ubuntu/remix-of-stackwise-advisor/docs/golden_blueprint/reddit/clean/pos';

export function buildYouTubeBlueprintUserPrompt(input: { videoUrl: string; transcript: string; additionalInstructions?: string }) {
  const videoUrl = String(input.videoUrl || '').trim();
  const transcript = String(input.transcript || '').trim();
  const oraclePosDir = String(YOUTUBE_POS_VIBE_ORACLE_DIR || '').trim();
  if (!videoUrl) {
    throw new Error('YOUTUBE_PROMPT_INPUT_VIDEO_URL_REQUIRED');
  }
  if (!transcript) {
    throw new Error('YOUTUBE_PROMPT_INPUT_TRANSCRIPT_REQUIRED');
  }
  if (!oraclePosDir) {
    throw new Error('YOUTUBE_PROMPT_INPUT_ORACLE_POS_DIR_REQUIRED');
  }

  const trimmedTranscript = transcript.slice(0, 18_000);
  const extra = String(input.additionalInstructions || '').trim();
  const vibeContext = `Vibe calibration context (style-only):
- Read all positive examples from Oracle POS dir: ${oraclePosDir}
- Use those examples only for tone, pacing, readability, and engagement feel.
- Do NOT import facts, numbers, examples, or distinctive wording from those references.
- Keep all factual content grounded in the transcript below.
`;
  return `Video URL: ${videoUrl}

Transcript:
${trimmedTranscript}

${vibeContext}

${extra ? `Additional instructions:\n${extra}\n` : ''}

Final generation directive:
- Use transcript as the only factual source of truth.
- Use Oracle POS references only for vibe/engagement calibration.
- Follow required section contract and output strict JSON now.

Generate a usable blueprint now.`;
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
    previousOutput,
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

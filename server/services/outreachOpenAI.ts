import { getOpenAIConstructor } from '../llm/openaiRuntime';
import type { OutreachDraftContext, OutreachDraftLLM } from './outreachDrafts';

const OUTREACH_SYSTEM_PROMPT = [
  'You are writing one friendly YouTube comment.',
  'Persona:',
  'Sound like a normal viewer who uses YouTube to learn useful things. Be warm, relaxed, supportive, and easy to relate to.',
  '',
  'Audience:',
  'The comment is for the creator and regular viewers reading the comments. Write so casual viewers can understand it quickly without background knowledge.',
  '',
  'Task:',
  'Use the video title and takeaways to write one short comment. Pick one simple useful idea and react to it naturally. Value for readers is key here: the comment should point to something helpful, but keep it light, simple, and easy to understand.',
  '',
  'Style:',
  'Keep it plain, friendly, and easy to read at a glance. The comment should feel like a real viewer leaving a kind note after learning something useful.',
  '',
  'Length:',
  'Keep the comment short, ideally under 110 characters. Never exceed 130 characters.',
].join('\n');

type OutreachServiceTier = 'auto' | 'default' | 'flex' | 'priority';

function normalizeReasoningEffort(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'none' || normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'xhigh') {
    return normalized;
  }
  return 'medium';
}

function normalizeServiceTier(value: unknown): OutreachServiceTier | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'auto') return 'auto';
  if (normalized === 'default') return 'default';
  if (normalized === 'flex') return 'flex';
  if (normalized === 'priority') return 'priority';
  return null;
}

function extractTakeaways(context: OutreachDraftContext) {
  const raw = context.blueprintSectionsJson && typeof context.blueprintSectionsJson === 'object'
    ? (context.blueprintSectionsJson as { takeaways?: unknown }).takeaways
    : null;
  return Array.isArray(raw)
    ? raw.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
    : [];
}

function buildPrompt(input: {
  context: OutreachDraftContext;
  count: number;
  requiredPrefixes?: string[];
}) {
  const context = input.context;
  const requiredPrefixes = (input.requiredPrefixes || []).slice(0, 3);
  const prefixLines = requiredPrefixes.length > 0
    ? [
      '',
      'Sentence start:',
      'Start your comment with one of these sentence starts exactly:',
      ...requiredPrefixes.map((prefix, index) => `${index + 1}. ${prefix}`),
      '',
      'Please select the one that fits your comment best.',
    ]
    : [];
  return [
    'Create exactly one YouTube comment.',
    ...prefixLines,
    '',
    'Never add: URLs. app or promo mention. like/subscribe requests. Return strict JSON: {"comment":"..."}.',
    '',
    'Video context:',
    JSON.stringify({
      video_title: context.videoTitle,
      creator: context.sourceChannelTitle,
      takeaways: extractTakeaways(context),
    }, null, 2).slice(0, 1600),
  ].join('\n');
}

export function createOutreachOpenAIClient(): OutreachDraftLLM {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const model = String(process.env.OPENAI_OUTREACH_MODEL || 'gpt-5.4').trim() || 'gpt-5.4';
  const reasoningEffort = normalizeReasoningEffort(process.env.OPENAI_OUTREACH_REASONING_EFFORT || 'low');
  const serviceTier = normalizeServiceTier(process.env.OPENAI_OUTREACH_SERVICE_TIER || 'flex');
  const OpenAI = getOpenAIConstructor();
  const client = new OpenAI({ apiKey });

  return {
    async generateVideoOpeners(input) {
      const payload: {
        model: string;
        instructions: string;
        input: string;
        reasoning?: { effort: 'low' | 'medium' | 'high' | 'xhigh' };
        service_tier?: OutreachServiceTier;
      } = {
        model,
        instructions: OUTREACH_SYSTEM_PROMPT,
        input: buildPrompt(input),
      };
      if (reasoningEffort !== 'none') {
        payload.reasoning = {
          effort: reasoningEffort as 'low' | 'medium' | 'high' | 'xhigh',
        };
      }
      if (serviceTier) {
        payload.service_tier = serviceTier;
      }
      const response = await client.responses.create(payload);
      const rawText = response.output_text?.trim() || null;
      return {
        model,
        reasoningEffort,
        rawText,
        openers: [],
      };
    },
  };
}

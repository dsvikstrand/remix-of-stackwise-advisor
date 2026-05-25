import { getOpenAIConstructor } from '../llm/openaiRuntime';
import type { OutreachDraftContext, OutreachDraftLLM } from './outreachDrafts';

const OUTREACH_SYSTEM_PROMPT = [
  'You write YouTube comment openers for a founder doing transparent, low-volume outreach.',
  'Only write the video-specific opener. Do not mention BLEUP, apps, channels, demos, links, promotion, or the founder.',
  'The opener must be useful even if no promotion is added after it.',
  'Be specific to the video. Avoid generic praise. Avoid hype. Avoid medical/financial claims beyond the video context.',
  'Always sound friendly, useful, and encouraging toward the creator.',
  'Never use sarcasm, dunking, mockery, gotcha framing, or jokes that imply the creator/video is obvious, silly, wrong, or being corrected.',
  'Create three distinct neutral short insight comments in the exact requested order.',
  'Return strict JSON: {"openers":["...", "...", "..."]}.',
].join('\n');

function normalizeReasoningEffort(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'none' || normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'xhigh') {
    return normalized;
  }
  return 'medium';
}

function buildPrompt(input: {
  context: OutreachDraftContext;
  count: number;
}) {
  const context = input.context;
  return [
    `Create exactly ${input.count} distinct YouTube comment opener options in this order:`,
    '1. Short insight: one sentence, neutral, useful, and specific, ideally under 110 characters.',
    '2. Short insight: one sentence, neutral, useful, and specific, ideally under 110 characters.',
    '3. Short insight: one sentence, neutral, useful, and specific, ideally under 110 characters.',
    '',
    'Rules:',
    '- Mention one concrete distinction, idea, example, or takeaway from the video.',
    '- Sound like a supportive real viewer who learned something, not an ad.',
    '- Be friendly and encouraging to the creator.',
    '- Do not sound sarcastic, dismissive, superior, or like you are correcting the creator.',
    '- Do not use jokes, emojis, hype, or overly clever phrasing.',
    '- Do not include a URL.',
    '- Do not mention BLEUP or any app.',
    '- Do not ask for likes/subscribes.',
    '- Keep all three options compact. Each should read like one quick YouTube comment line.',
    '',
    'Video/blueprint context:',
    JSON.stringify({
      video_title: context.videoTitle,
      creator: context.sourceChannelTitle,
      blueprint_title: context.blueprintTitle,
      summary: context.blueprintSummary,
      review: context.blueprintReview,
      tags: context.tags,
      sections: context.blueprintSectionsJson,
    }, null, 2).slice(0, 5000),
  ].join('\n');
}

export function createOutreachOpenAIClient(): OutreachDraftLLM {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const model = String(process.env.OPENAI_OUTREACH_MODEL || 'gpt-5.5-mini').trim() || 'gpt-5.5-mini';
  const reasoningEffort = normalizeReasoningEffort(process.env.OPENAI_OUTREACH_REASONING_EFFORT || 'medium');
  const OpenAI = getOpenAIConstructor();
  const client = new OpenAI({ apiKey });

  return {
    async generateVideoOpeners(input) {
      const payload: {
        model: string;
        instructions: string;
        input: string;
        reasoning?: { effort: 'low' | 'medium' | 'high' | 'xhigh' };
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

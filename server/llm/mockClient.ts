import type {
  BannerRequest,
  BannerResult,
  BlueprintAnalysisRequest,
  ChannelLabelRequest,
  ChannelLabelResult,
  LLMGenerationOptions,
  LLMClient,
  YouTubeBlueprintPass2TransformRequest,
  YouTubeBlueprintPass2TransformResult,
  YouTubeBlueprintRequest,
  YouTubeBlueprintSectionsResult,
} from './types';

export function createMockClient(): LLMClient {
  return {
    async analyzeBlueprint(input: BlueprintAnalysisRequest): Promise<string> {
      const sections = input.reviewSections && input.reviewSections.length > 0
        ? input.reviewSections
        : ['Overview', 'Strengths', 'Gaps', 'Suggestions'];
      const overviewScore = input.includeScore ? 'Score: 72/100' : '';
      return sections.map((section) => {
        if (section.toLowerCase().includes('overview')) {
          return `### ${section}\nA helpful overview for ${input.title}.${overviewScore ? `\n${overviewScore}` : ''}`;
        }
        return `### ${section}\n- Example point 1\n- Example point 2`;
      }).join('\n\n');
    },
    async generateBanner(input: BannerRequest): Promise<BannerResult> {
      const title = input.title.trim() || 'Blueprint';
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024">
          <defs>
            <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#f97316" stop-opacity="0.35"/>
            </linearGradient>
          </defs>
          <rect width="1536" height="1024" fill="#0b1220"/>
          <rect width="1536" height="1024" fill="url(#g)"/>
          <circle cx="1200" cy="200" r="180" fill="#22d3ee" opacity="0.15"/>
          <circle cx="240" cy="840" r="220" fill="#fb923c" opacity="0.12"/>
          <text x="96" y="140" fill="#e2e8f0" font-size="48" font-family="Inter, Arial, sans-serif" opacity="0.7">
            ${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </text>
        </svg>
      `;

      return {
        buffer: Buffer.from(svg),
        mimeType: 'image/svg+xml',
        prompt: 'mock-banner',
      };
    },
    async generateYouTubeBlueprint(
      input: YouTubeBlueprintRequest,
      _options?: LLMGenerationOptions,
    ): Promise<YouTubeBlueprintSectionsResult> {
      const payload: YouTubeBlueprintSectionsResult = {
        schema_version: 'blueprint_sections_v1',
        tags: ['youtube', 'guide'],
        summary: {
          text: 'Mock YouTube blueprint generated from transcript.',
        },
        takeaways: {
          bullets: [
            'Review the key ideas in the video.',
            'Apply the main action item.',
          ],
        },
        storyline: {
          text: 'This is a mock storyline block that summarizes the core progression.',
        },
        deep_dive: {
          bullets: [
            'Mock deep-dive detail one.',
            'Mock deep-dive detail two.',
          ],
        },
        practical_rules: {
          bullets: [
            'Use the video ideas as a practical checklist.',
            'Keep implementation simple and consistent.',
          ],
        },
        open_questions: {
          bullets: [
            'What is the best way to apply this in practice?',
            'Which constraints matter most?',
          ],
        },
      };
      return {
        ...payload,
        raw_response: JSON.stringify(payload),
      };
    },
    async generateYouTubeBlueprintPass2Transform(
      input: YouTubeBlueprintPass2TransformRequest,
      _options?: LLMGenerationOptions,
    ): Promise<YouTubeBlueprintPass2TransformResult> {
      let pass1: { steps?: Array<{ name?: string; notes?: string; timestamp?: string | null }>; description?: string } = {};
      try {
        pass1 = JSON.parse(String(input.pass1BlueprintJson || '{}'));
      } catch {
        pass1 = {};
      }
      const steps = Array.isArray(pass1.steps) ? pass1.steps : [];
      return {
        eli5_steps: steps
          .map((step) => ({
            name: String(step.name || '').trim(),
            notes: String(step.notes || '').trim() || 'Simplified explanation.',
            timestamp: step.timestamp ?? null,
          }))
          .filter((step) => step.name && step.notes),
        eli5_summary: String(pass1.description || '').trim() || 'Simplified summary.',
      };
    },
    async generateChannelLabel(input: ChannelLabelRequest): Promise<ChannelLabelResult> {
      const text = [
        input.title,
        input.summary || '',
        ...(input.tags || []),
      ].join(' ').toLowerCase();

      let preferred = input.fallbackSlug;
      if (/\b(llm|prompt|automation|agent|ai)\b/.test(text)) {
        preferred = 'ai-tools-automation';
      } else if (/\b(skin|acne|moistur|spf|serum|cleanser)\b/.test(text)) {
        preferred = 'skincare-personal-care';
      } else if (/\b(meal|nutrition|diet|protein|cook)\b/.test(text)) {
        preferred = 'nutrition-meal-planning';
      }

      const allowed = new Set((input.allowedChannels || []).map((channel) => channel.slug));
      const channelSlug = allowed.has(preferred) ? preferred : input.fallbackSlug;

      return {
        channelSlug,
        reason: 'mock-channel-label',
        confidence: channelSlug === input.fallbackSlug ? 0.55 : 0.82,
      };
    },
  };
}

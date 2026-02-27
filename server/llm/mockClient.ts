import type {
  BannerRequest,
  BannerResult,
  BlueprintAnalysisRequest,
  BlueprintGenerationRequest,
  BlueprintGenerationResult,
  ChannelLabelRequest,
  ChannelLabelResult,
  LLMGenerationOptions,
  InventoryRequest,
  InventorySchema,
  LLMClient,
  YouTubeBlueprintRequest,
  YouTubeBlueprintResult,
} from './types';

export function createMockClient(): LLMClient {
  return {
    async generateInventory(input: InventoryRequest, _options?: LLMGenerationOptions): Promise<InventorySchema> {
      const title = input.title?.trim() || `${input.keywords.trim()} Inventory`;
      return {
        summary: `A starter inventory for ${title.toLowerCase()}.`,
        categories: [
          { name: 'Category 1', items: ['Item A', 'Item B', 'Item C'] },
          { name: 'Category 2', items: ['Item D', 'Item E', 'Item F'] },
          { name: 'Category 3', items: ['Item G', 'Item H', 'Item I'] },
          { name: 'Category 4', items: ['Item J', 'Item K', 'Item L'] },
          { name: 'Category 5', items: ['Item M', 'Item N', 'Item O'] },
          { name: 'Category 6', items: ['Item P', 'Item Q', 'Item R'] },
        ],
        suggestedTags: ['starter', 'routine', 'blueprint', 'community'],
      };
    },
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
    async generateBlueprint(input: BlueprintGenerationRequest, _options?: LLMGenerationOptions): Promise<BlueprintGenerationResult> {
      const title = input.title?.trim() || `${input.inventoryTitle.trim()} Blueprint`;
      const categories = input.categories || [];
      const pickItem = (index: number) => {
        const category = categories[index % categories.length];
        const item = category?.items?.[0];
        if (!category || !item) return null;
        return { category: category.name, name: item, context: 'Mock context' };
      };
      const steps = [
        {
          title: 'Step 1',
          description: 'Mock step description.',
          items: [pickItem(0)].filter(Boolean) as NonNullable<ReturnType<typeof pickItem>>[],
        },
        {
          title: 'Step 2',
          description: 'Mock step description.',
          items: [pickItem(1)].filter(Boolean) as NonNullable<ReturnType<typeof pickItem>>[],
        },
        {
          title: 'Step 3',
          description: 'Mock step description.',
          items: [pickItem(2)].filter(Boolean) as NonNullable<ReturnType<typeof pickItem>>[],
        },
      ].filter((step) => step.items.length > 0);

      return {
        title,
        steps,
      };
    },
    async generateYouTubeBlueprint(input: YouTubeBlueprintRequest, _options?: LLMGenerationOptions): Promise<YouTubeBlueprintResult> {
      return {
        title: `Blueprint from ${input.videoUrl}`,
        description: 'Mock YouTube blueprint generated from transcript.',
        notes: 'Mock notes.',
        tags: ['youtube', 'guide'],
        steps: [
          { name: 'Step 1', notes: 'Review the key ideas in the video.', timestamp: null },
          { name: 'Step 2', notes: 'Apply the main action item.', timestamp: null },
        ],
      };
    },
    async generateChannelLabel(input: ChannelLabelRequest): Promise<ChannelLabelResult> {
      const text = [
        input.title,
        input.llmReview || '',
        ...(input.tags || []),
        ...(input.stepHints || []),
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

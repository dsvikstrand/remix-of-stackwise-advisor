import type { InventoryRequest } from './types';

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

import OpenAI from 'openai';
import { z } from 'zod';
import type { InventoryRequest, InventorySchema, LLMClient } from './types';
import { INVENTORY_SYSTEM_PROMPT, buildInventoryUserPrompt, extractJson } from './prompts';

const InventorySchemaValidator = z.object({
  summary: z.string(),
  categories: z.array(
    z.object({
      name: z.string(),
      items: z.array(z.string()),
    })
  ),
  suggestedTags: z.array(z.string()).optional(),
});

export function createOpenAIClient(): LLMClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5';
  const client = new OpenAI({ apiKey });

  return {
    async generateInventory(input: InventoryRequest): Promise<InventorySchema> {
      const response = await client.responses.create({
        model,
        instructions: INVENTORY_SYSTEM_PROMPT,
        input: buildInventoryUserPrompt(input),
      });

      const outputText = response.output_text?.trim();
      if (!outputText) {
        throw new Error('No output text from OpenAI');
      }

      const parsed = JSON.parse(extractJson(outputText));
      return InventorySchemaValidator.parse(parsed);
    },
  };
}

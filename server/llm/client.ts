import type { LLMClient } from './types';
import { createOpenAIClient } from './openaiClient';
import { createMockClient } from './mockClient';

export function createLLMClient(): LLMClient {
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  if (provider === 'mock') {
    return createMockClient();
  }
  return createOpenAIClient();
}

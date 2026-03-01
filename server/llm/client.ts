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

export function createLLMClientForPurpose(input?: {
  purpose?: 'default' | 'youtube_generation';
  codexEnabled?: boolean;
  createCodexClient?: () => LLMClient;
}): LLMClient {
  const purpose = input?.purpose || 'default';
  if (
    purpose === 'youtube_generation'
    && Boolean(input?.codexEnabled)
    && typeof input?.createCodexClient === 'function'
  ) {
    return input.createCodexClient();
  }
  return createLLMClient();
}

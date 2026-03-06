import { createRequire } from 'node:module';

type OpenAIConstructor = typeof import('openai').default;

const require = createRequire(import.meta.url);

let cachedOpenAIConstructor: OpenAIConstructor | null = null;

export function getOpenAIConstructor(): OpenAIConstructor {
  if (cachedOpenAIConstructor) {
    return cachedOpenAIConstructor;
  }

  const loaded = require('openai') as { default?: OpenAIConstructor } | OpenAIConstructor;
  cachedOpenAIConstructor = (
    typeof loaded === 'function'
      ? loaded
      : loaded.default
  ) as OpenAIConstructor;

  if (!cachedOpenAIConstructor) {
    throw new Error('OPENAI_RUNTIME_UNAVAILABLE');
  }

  return cachedOpenAIConstructor;
}

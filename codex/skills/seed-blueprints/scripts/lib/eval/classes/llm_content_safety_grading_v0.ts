import type { EvalClass } from '../types';
import { safetyModerationV0 } from './safety_moderation_v0';

const DEFAULT_PACK = 'eval/methods/v0/llm_content_safety_grading_v0/global_pack_v0.json';

export const llmContentSafetyGradingV0: EvalClass<unknown, Record<string, unknown>> = {
  id: 'llm_content_safety_grading_v0',
  run: async (input, params, ctx) => {
    const p = { ...(params || {}) };
    if (!String((p as any).global_pack_path || '').trim()) {
      (p as any).global_pack_path = DEFAULT_PACK;
    }
    const out = await safetyModerationV0.run(input, p, ctx);
    return {
      ...out,
      gate_id: 'llm_content_safety_grading_v0',
    };
  },
};

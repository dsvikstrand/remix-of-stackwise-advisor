import fs from 'node:fs';
import path from 'node:path';

import OpenAI from 'openai';
import { z } from 'zod';

import type { GeneratedBlueprint } from '../../seed_types';
import type { EvalClass, EvalResult } from '../types';
import { mkEvalResult } from '../utils';

type QualityCriterion = {
  id: string;
  text: string;
  required: boolean;
  min_score: number;
};

type QualityConfig = {
  version: number;
  judge_model: string;
  prompt_version: string;
  scale: { min: number; max: number };
  retry_policy?: { max_retries?: number; selection?: string };
  criteria: QualityCriterion[];
};

const JudgeResponseSchema = z.object({
  scores: z.array(
    z.object({
      id: z.string().min(1),
      score: z.number().finite(),
    })
  ),
  overall: z.number().finite().optional(),
});

function readConfig(configPath?: string): QualityConfig {
  const fallback: QualityConfig = {
    version: 0,
    judge_model: 'o4-mini',
    prompt_version: 'yt2bp_quality_v0',
    scale: { min: 0, max: 5 },
    retry_policy: { max_retries: 2, selection: 'best_overall' },
    criteria: [
      { id: 'step_purpose_clarity', text: 'Each step has a clear purpose and outcome.', required: true, min_score: 3.5 },
      { id: 'step_actionability', text: 'Steps are specific and actionable, not vague summaries.', required: true, min_score: 3.5 },
      { id: 'step_redundancy_control', text: 'Steps avoid redundant micro-fragmentation and repeated instructions.', required: true, min_score: 3.5 },
      { id: 'sequence_progression', text: 'Step order follows a natural progression with coherent flow.', required: true, min_score: 3.5 },
      { id: 'coverage_sufficiency', text: 'The blueprint covers critical actions without major missing middle steps.', required: true, min_score: 3.2 },
    ],
  };

  const abs = path.resolve(
    configPath || path.join('eval', 'methods', 'v0', 'llm_blueprint_quality_v0', 'global_pack_v0.json')
  );
  if (!fs.existsSync(abs)) return fallback;
  try {
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8')) as Partial<QualityConfig>;
    return {
      ...fallback,
      ...parsed,
      scale: {
        min: Number(parsed?.scale?.min ?? fallback.scale.min),
        max: Number(parsed?.scale?.max ?? fallback.scale.max),
      },
      criteria: Array.isArray(parsed?.criteria) ? (parsed.criteria as QualityCriterion[]) : fallback.criteria,
    };
  } catch {
    return fallback;
  }
}

function buildInput(blueprints: GeneratedBlueprint[], config: QualityConfig) {
  const criteriaLines = (config.criteria || [])
    .map((c) => `- ${c.id}: ${c.text} (required=${c.required}, min_score=${c.min_score})`)
    .join('\n');
  return [
    'Grade blueprint quality.',
    `Scale: ${config.scale.min}..${config.scale.max}`,
    `PromptVersion: ${config.prompt_version}`,
    '',
    'Criteria:',
    criteriaLines,
    '',
    'Blueprints JSON:',
    JSON.stringify(blueprints, null, 2),
    '',
    'Return ONLY strict JSON:',
    '{"scores":[{"id":"criterion_id","score":0}],"overall":0}',
  ].join('\n');
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export const llmBlueprintQualityV0: EvalClass<GeneratedBlueprint[], Record<string, unknown>> = {
  id: 'llm_blueprint_quality_v0',
  run: async (blueprints: GeneratedBlueprint[], params: Record<string, unknown>, ctx): Promise<EvalResult> => {
    const onMissingRaw = String((params as any)?.on_missing_api_key || '').trim().toLowerCase();
    const onMissing =
      onMissingRaw === 'skip' || onMissingRaw === 'hard_fail'
        ? (onMissingRaw as 'skip' | 'hard_fail')
        : ctx.mode === 'user'
          ? 'skip'
          : 'hard_fail';

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const ok = onMissing === 'skip';
      return mkEvalResult(
        'llm_blueprint_quality_v0',
        ok,
        ok ? 'warn' : 'hard_fail',
        0,
        ok ? 'skipped_missing_openai_api_key' : 'missing_openai_api_key',
        { skipped: ok, on_missing_api_key: onMissing }
      );
    }

    const configPath = String((params as any)?.global_pack_path || '').trim() || undefined;
    const config = readConfig(configPath);

    const min = Number(config.scale?.min ?? 0);
    const max = Number(config.scale?.max ?? 5);

    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: String((params as any)?.judge_model || config.judge_model || 'o4-mini'),
      instructions: [
        'You are a strict JSON generator.',
        'Do not include markdown fences.',
        'Return only JSON with fields: scores and overall.',
      ].join('\n'),
      input: buildInput(Array.isArray(blueprints) ? blueprints : [], config),
    });

    let text = String(response.output_text || '').trim();
    if (!text) {
      return mkEvalResult('llm_blueprint_quality_v0', false, 'hard_fail', 0, 'judge_empty_output');
    }
    if (text.startsWith('```json')) text = text.slice(7);
    if (text.startsWith('```')) text = text.slice(3);
    if (text.endsWith('```')) text = text.slice(0, -3);
    text = text.trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return mkEvalResult('llm_blueprint_quality_v0', false, 'hard_fail', 0, 'judge_invalid_json');
    }

    let judged: z.infer<typeof JudgeResponseSchema>;
    try {
      judged = JudgeResponseSchema.parse(parsed);
    } catch {
      return mkEvalResult('llm_blueprint_quality_v0', false, 'hard_fail', 0, 'judge_schema_mismatch');
    }

    const expectedIds = (config.criteria || []).map((c) => String(c.id || '').trim()).filter(Boolean).sort();
    const actualIds = (judged.scores || []).map((s) => String(s.id || '').trim()).filter(Boolean).sort();
    if (expectedIds.length !== actualIds.length || expectedIds.some((id, i) => id !== actualIds[i])) {
      return mkEvalResult('llm_blueprint_quality_v0', false, 'hard_fail', 0, 'quality_criterion_id_mismatch', {
        expected_ids: expectedIds,
        actual_ids: actualIds,
      });
    }

    const byId = new Map((judged.scores || []).map((s) => [String(s.id), Number(s.score)]));
    const scored = (config.criteria || []).map((c) => {
      const score = clamp(Number(byId.get(c.id) ?? min), min, max);
      const pass = !c.required || score >= Number(c.min_score);
      return {
        id: c.id,
        score,
        min_score: Number(c.min_score),
        required: Boolean(c.required),
        pass,
      };
    });

    const failures = scored.filter((x) => !x.pass).map((x) => x.id);
    const overall = Number.isFinite(Number(judged.overall))
      ? clamp(Number(judged.overall), min, max)
      : scored.reduce((sum, x) => sum + x.score, 0) / Math.max(1, scored.length);

    const norm = max > min ? (overall - min) / (max - min) : 0;
    const ok = failures.length === 0;

    return mkEvalResult(
      'llm_blueprint_quality_v0',
      ok,
      ok ? 'info' : 'hard_fail',
      clamp(norm, 0, 1),
      ok ? 'ok' : 'below_min_score',
      {
        overall,
        scale: { min, max },
        failures,
        scores: scored,
        prompt_version: config.prompt_version,
      }
    );
  },
};

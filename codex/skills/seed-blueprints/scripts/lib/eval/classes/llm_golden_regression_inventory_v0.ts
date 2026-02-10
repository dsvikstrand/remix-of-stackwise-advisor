import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import OpenAI from 'openai';
import { z } from 'zod';

import type { InventorySchema } from '../../seed_types';
import { resolveDomainAsset } from '../domain_assets';
import type { EvalClass, EvalContext, EvalResult } from '../types';
import { mkEvalResult } from '../utils';

type CriteriaItemV0 = {
  id: string;
  text: string;
  max_drop: number;
};

type MethodGlobalPackV0 = {
  version: 0;
  judge_model: string;
  prompt_version: string;
  scale: { min: number; max: number };
  criteria_global: CriteriaItemV0[];
};

type MethodDomainPackV0 = {
  version: 0;
  criteria_domain: CriteriaItemV0[];
};

type ScorecardV0 = {
  version: 0;
  eval_id: string;
  domain_id: string;
  golden_fixture_id: string;
  golden_fixture_path: string;
  golden_fixture_hash: string;
  judge_model: string;
  prompt_version: string;
  scale: { min: number; max: number };
  criteria: CriteriaItemV0[];
  scores: Array<{ id: string; score: number }>;
  overall: number;
  createdAt: string;
};

const ScoreResponseValidator = z.object({
  scores: z.array(
    z.object({
      id: z.string().min(1),
      score: z.number().finite(),
    })
  ),
  overall: z.number().finite(),
});

function sha256Hex(raw: string) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function readJsonStrict<T>(absPath: string): T {
  const raw = fs.readFileSync(absPath, 'utf8');
  return JSON.parse(raw) as T;
}

function normalizeFixtureId(input: string) {
  const id = String(input || '').trim();
  if (!id) return '';
  return id.toLowerCase().endsWith('.json') ? id : `${id}.json`;
}

function defaultMethodPaths(evalId: string, domainId: string) {
  const base = path.join('eval', 'methods', 'v0', evalId);
  return {
    globalPackPath: path.join(base, 'global_pack_v0.json'),
    domainPackPath: path.join(base, 'packs_domains', domainId, 'pack_v0.json'),
    scorecardDir: path.join(base, 'artifacts', 'golden_scores', domainId),
  };
}

function defaultScorecardPath(methodScorecardDir: string, goldenFixtureId: string) {
  return path.join(methodScorecardDir, `${goldenFixtureId.replace(/\.json$/i, '')}.score_v0.json`);
}

function buildJudgeInput(args: {
  inventory: InventorySchema;
  criteria: CriteriaItemV0[];
  scale: { min: number; max: number };
}) {
  const criteriaLines = (args.criteria || []).map((c) => `- ${c.id}: ${c.text}`).join('\n');
  return [
    'You are grading a generated "library inventory" against a fixed rubric.',
    `Score each criterion on a ${args.scale.min}..${args.scale.max} scale.`,
    '',
    'Rubric criteria:',
    criteriaLines || '(none)',
    '',
    'Inventory JSON:',
    JSON.stringify(args.inventory, null, 2),
    '',
    'Return ONLY strict JSON with this shape:',
    '{"scores":[{"id":"<criterion_id>","score":<number>}...],"overall":<number>}',
  ].join('\n');
}

async function scoreWithOpenAI(args: {
  model: string;
  promptVersion: string;
  criteria: CriteriaItemV0[];
  scale: { min: number; max: number };
  inventory: InventorySchema;
}): Promise<{ scores: Array<{ id: string; score: number }>; overall: number; rawText: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model: args.model,
    instructions: [
      'You are a strict JSON generator.',
      `PromptVersion: ${args.promptVersion}`,
      'Do not include markdown fences. Do not include any text outside JSON.',
    ].join('\n'),
    input: buildJudgeInput({ inventory: args.inventory, criteria: args.criteria, scale: args.scale }),
  });

  const outputText = response.output_text?.trim();
  if (!outputText) throw new Error('No output text from judge');

  // Be tolerant to accidental fences.
  let jsonText = outputText;
  if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
  if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
  if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Judge output is not valid JSON');
  }

  const v = ScoreResponseValidator.parse(parsed);

  // Clamp to range to avoid tiny formatting weirdness.
  const clamp = (x: number) => Math.max(args.scale.min, Math.min(args.scale.max, x));
  const scores = v.scores.map((s) => ({ id: s.id, score: clamp(Number(s.score)) }));
  const overall = clamp(Number(v.overall));
  return { scores, overall, rawText: outputText };
}

export const llmGoldenRegressionInventoryV0: EvalClass<InventorySchema, Record<string, unknown>> = {
  id: 'llm_golden_regression_inventory_v0',
  run: async (inv: InventorySchema, params: Record<string, unknown>, ctx: EvalContext): Promise<EvalResult> => {
    const apiKeyPresent = Boolean(process.env.OPENAI_API_KEY);
    const onMissingRaw = String((params as any)?.on_missing_api_key || '').trim().toLowerCase();
    const onMissing = onMissingRaw === 'skip' || onMissingRaw === 'hard_fail' ? (onMissingRaw as 'skip' | 'hard_fail') : ctx.mode === 'user' ? 'skip' : 'hard_fail';
    if (!apiKeyPresent) {
      const ok = onMissing === 'skip';
      return mkEvalResult(
        'llm_golden_regression_inventory_v0',
        ok,
        ok ? 'warn' : 'hard_fail',
        0,
        ok ? 'skipped_missing_openai_api_key' : 'missing_openai_api_key',
        {
          skipped: ok,
          on_missing_api_key: onMissing,
          hint: 'Set OPENAI_API_KEY to enable this eval. Use --bootstrap-llm-golden-scores to write scorecards.',
        }
      );
    }

    const domainId = String(ctx.domain_id || '').trim();
    if (!domainId) {
      return mkEvalResult('llm_golden_regression_inventory_v0', false, 'hard_fail', 0, 'missing_domain_id', {
        expected: 'set --domain or provide persona default_domain/safety.domain',
      });
    }

    const goldenFixtureRaw = String((params as any)?.golden_fixture_id || '').trim();
    const goldenFixtureId = normalizeFixtureId(goldenFixtureRaw);
    if (!goldenFixtureId) {
      return mkEvalResult('llm_golden_regression_inventory_v0', false, 'hard_fail', 0, 'missing_golden_fixture_id', {
        expected: 'params.golden_fixture_id',
      });
    }

    const evalIdConst = 'llm_golden_regression_inventory_v0';
    const methodPaths = defaultMethodPaths(evalIdConst, domainId);
    const globalPackPath = String((params as any)?.global_pack_path || methodPaths.globalPackPath).trim();
    const domainPackPath = String((params as any)?.domain_pack_path || methodPaths.domainPackPath).trim();
    const scorecardPath = String((params as any)?.scorecard_path || defaultScorecardPath(methodPaths.scorecardDir, goldenFixtureId)).trim();

    // Load golden fixture (domain-owned).
    let goldenDir: { absPath: string; relPath: string };
    try {
      goldenDir = resolveDomainAsset(domainId, 'golden/libraries');
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return mkEvalResult('llm_golden_regression_inventory_v0', false, 'hard_fail', 0, 'invalid_domain_asset_path', {
        domain_id: domainId,
        error: err.message.slice(0, 200),
      });
    }

    const goldenAbs = path.join(goldenDir.absPath, goldenFixtureId);
    if (!fs.existsSync(goldenAbs)) {
      return mkEvalResult('llm_golden_regression_inventory_v0', false, 'hard_fail', 0, 'missing_golden_fixture', {
        domain_id: domainId,
        expected_path: path.join(goldenDir.relPath, goldenFixtureId).replace(/\\/g, '/'),
      });
    }

    let goldenRaw = '';
    let goldenInv: InventorySchema | null = null;
    try {
      goldenRaw = fs.readFileSync(goldenAbs, 'utf8');
      const parsed = JSON.parse(goldenRaw);
      goldenInv = (parsed && parsed.generated && parsed.generated.categories) ? (parsed.generated as InventorySchema) : (parsed as InventorySchema);
    } catch {
      return mkEvalResult('llm_golden_regression_inventory_v0', false, 'hard_fail', 0, 'invalid_golden_fixture_json', {
        domain_id: domainId,
        expected_path: path.join(goldenDir.relPath, goldenFixtureId).replace(/\\/g, '/'),
      });
    }
    const goldenHash = sha256Hex(goldenRaw);
    const goldenFixturePathRel = path.join(goldenDir.relPath, goldenFixtureId).replace(/\\/g, '/');

    // Load packs (method-owned).
    if (!fs.existsSync(globalPackPath)) {
      return mkEvalResult('llm_golden_regression_inventory_v0', false, 'hard_fail', 0, 'missing_global_pack', { expected_path: globalPackPath });
    }
    const globalPack = readJsonStrict<MethodGlobalPackV0>(globalPackPath);
    if (Number((globalPack as any)?.version || 0) !== 0) {
      return mkEvalResult('llm_golden_regression_inventory_v0', false, 'hard_fail', 0, 'bad_global_pack_version', { path: globalPackPath });
    }
    const domainPack = fs.existsSync(domainPackPath) ? readJsonStrict<MethodDomainPackV0>(domainPackPath) : null;
    if (domainPack && Number((domainPack as any)?.version || 0) !== 0) {
      return mkEvalResult('llm_golden_regression_inventory_v0', false, 'hard_fail', 0, 'bad_domain_pack_version', { path: domainPackPath });
    }

    const criteria = [
      ...((globalPack.criteria_global || []) as CriteriaItemV0[]),
      ...(((domainPack as any)?.criteria_domain || []) as CriteriaItemV0[]),
    ].filter((c) => c && String((c as any).id || '').trim() && String((c as any).text || '').trim());

    if (!criteria.length) {
      return mkEvalResult('llm_golden_regression_inventory_v0', false, 'hard_fail', 0, 'no_criteria', {
        global_pack_path: globalPackPath,
        domain_pack_path: fs.existsSync(domainPackPath) ? domainPackPath : null,
      });
    }

    const judgeModel = String(globalPack.judge_model || '').trim() || 'o4-mini';
    const promptVersion = String(globalPack.prompt_version || '').trim() || 'v0';
    const scale = globalPack.scale || { min: 0, max: 10 };

    const readScorecardIfValid = (): ScorecardV0 | null => {
      if (!scorecardPath || !fs.existsSync(scorecardPath)) return null;
      let card: any;
      try {
        card = readJsonStrict<any>(scorecardPath);
      } catch {
        return null;
      }
      if (Number(card?.version || 0) !== 0) return null;
      if (String(card?.eval_id || '') !== evalIdConst) return null;
      if (String(card?.golden_fixture_path || '') !== goldenFixturePathRel) return null;
      if (String(card?.golden_fixture_hash || '') !== goldenHash) return null;
      if (String(card?.judge_model || '') !== judgeModel) return null;
      if (String(card?.prompt_version || '') !== promptVersion) return null;
      return card as ScorecardV0;
    };

    const minOverallRaw = (params as any)?.min_overall;
    const minOverall = minOverallRaw === undefined || minOverallRaw === null ? null : Number(minOverallRaw);

    const cached = readScorecardIfValid();

    let goldenScores: Array<{ id: string; score: number }> = [];
    let goldenOverall = 0;
    let goldenScorecardGenerated: ScorecardV0 | null = null;
    let goldenRawText = '';
    if (cached) {
      goldenScores = cached.scores || [];
      goldenOverall = Number(cached.overall || 0) || 0;
    } else {
      const gRes = await scoreWithOpenAI({
        model: judgeModel,
        promptVersion,
        criteria,
        scale,
        inventory: goldenInv!,
      });
      goldenScores = gRes.scores;
      goldenOverall = gRes.overall;
      goldenRawText = gRes.rawText;
      goldenScorecardGenerated = {
        version: 0,
        eval_id: evalIdConst,
        domain_id: domainId,
        golden_fixture_id: goldenFixtureId,
        golden_fixture_path: goldenFixturePathRel,
        golden_fixture_hash: goldenHash,
        judge_model: judgeModel,
        prompt_version: promptVersion,
        scale,
        criteria,
        scores: goldenScores,
        overall: goldenOverall,
        createdAt: new Date().toISOString(),
      };
    }

    const candidateRes = await scoreWithOpenAI({
      model: judgeModel,
      promptVersion,
      criteria,
      scale,
      inventory: inv,
    });

    const byIdGolden = new Map(goldenScores.map((s) => [s.id, Number(s.score) || 0]));
    const byIdCand = new Map(candidateRes.scores.map((s) => [s.id, Number(s.score) || 0]));
    const deltas = criteria.map((c) => {
      const g = Number(byIdGolden.get(c.id) ?? 0);
      const n = Number(byIdCand.get(c.id) ?? 0);
      const delta = g - n;
      return { id: c.id, golden: g, candidate: n, delta, max_drop: Number(c.max_drop ?? 0) };
    });

    const exceeded = deltas.filter((d) => d.delta > d.max_drop);
    const okByDeltas = exceeded.length === 0;
    const okByOverall = minOverall === null || (Number(candidateRes.overall) || 0) >= minOverall;
    const ok = okByDeltas && okByOverall;

    const reason = !okByOverall ? 'below_min_overall' : okByDeltas ? 'ok' : 'delta_exceeded';
    const score = Number(candidateRes.overall) / Math.max(1, Number(scale.max) || 10);

    const writeScorecard = (params as any)?.write_scorecard === true;
    if (writeScorecard && goldenScorecardGenerated && scorecardPath) {
      try {
        fs.mkdirSync(path.dirname(scorecardPath), { recursive: true });
        fs.writeFileSync(scorecardPath, JSON.stringify(goldenScorecardGenerated, null, 2) + '\n', 'utf8');
      } catch {
        // Never fail the run due to inability to write a convenience artifact.
      }
    }

    const data: any = {
      domain_id: domainId,
      node_id: ctx.node_id,
      golden_fixture_id: goldenFixtureId,
      golden_fixture_hash: goldenHash,
      golden_fixture_path: goldenFixturePathRel,
      global_pack_path: globalPackPath.replace(/\\/g, '/'),
      domain_pack_path: fs.existsSync(domainPackPath) ? domainPackPath.replace(/\\/g, '/') : null,
      scorecard_path: scorecardPath.replace(/\\/g, '/'),
      scorecard_used: Boolean(cached),
      write_scorecard: writeScorecard,
      judge_model: judgeModel,
      prompt_version: promptVersion,
      scale,
      min_overall: minOverall,
      overall_golden: goldenOverall,
      overall_candidate: candidateRes.overall,
      exceeded_count: exceeded.length,
      exceeded: exceeded.slice(0, 10),
      deltas: deltas.slice(0, 50),
    };

    // Large artifacts are extracted by the runner into files (ai/llm_eval/...).
    data.__judge_raw = {
      golden: cached ? null : goldenRawText,
      candidate: candidateRes.rawText,
    };
    if (goldenScorecardGenerated) data.__golden_scorecard = goldenScorecardGenerated;

    return mkEvalResult('llm_golden_regression_inventory_v0', ok, ok ? 'info' : 'warn', ok ? score : 0, reason, data);
  },
};

// No exported runner adapter needed: the runner awaits EvalClass.run now (supports Promise).

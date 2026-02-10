import fs from 'node:fs';
import crypto from 'node:crypto';
import type { AssEvalConfigV2, EvalInstance, UnknownEvalPolicy } from './types';

function sha256Hex(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function normalizeUnknownPolicy(x: unknown): UnknownEvalPolicy {
  return x === 'warn' || x === 'skip' ? x : 'hard_fail';
}

function normalizeEvalInstance(x: unknown): EvalInstance | null {
  if (!isPlainObject(x)) return null;
  const evalId = String(x.eval_id || '').trim();
  if (!evalId) return null;
  const params = isPlainObject(x.params) ? (x.params as Record<string, unknown>) : undefined;
  const severityRaw = String(x.severity || '').trim();
  const severity = severityRaw === 'info' || severityRaw === 'warn' || severityRaw === 'hard_fail' ? (severityRaw as any) : undefined;
  const scoreWeightRaw = x.score_weight;
  const score_weight = scoreWeightRaw === undefined ? undefined : Math.max(0, Number(scoreWeightRaw) || 0);
  const retryBudgetRaw = x.retry_budget;
  const retry_budget = retryBudgetRaw === undefined ? undefined : Math.max(0, Number(retryBudgetRaw) || 0);
  return {
    eval_id: evalId,
    ...(params ? { params } : {}),
    ...(severity ? { severity } : {}),
    ...(score_weight !== undefined ? { score_weight } : {}),
    ...(retry_budget !== undefined ? { retry_budget } : {}),
  };
}

export function readAssEvalConfigV2(filePath: string): { config: AssEvalConfigV2; hash: string } {
  const p = String(filePath || '').trim();
  if (!p) throw new Error('ass eval config path is empty');
  const raw = fs.readFileSync(p, 'utf-8');
  const hash = sha256Hex(raw);
  const parsed = JSON.parse(raw) as unknown;
  if (!isPlainObject(parsed)) throw new Error('ASS eval config must be a JSON object');
  if (Number((parsed as any).version || 0) !== 2) throw new Error('ASS eval config version must be 2');

  const nodesRaw = (parsed as any).nodes;
  if (!isPlainObject(nodesRaw)) throw new Error('ASS eval config must include nodes: { ... }');

  const nodes: AssEvalConfigV2['nodes'] = {};
  for (const [nodeId, nodeVal] of Object.entries(nodesRaw)) {
    if (!isPlainObject(nodeVal)) continue;
    const evalsRaw = (nodeVal as any).evals;
    const evals = Array.isArray(evalsRaw) ? evalsRaw.map(normalizeEvalInstance).filter(Boolean) : [];
    nodes[String(nodeId)] = { evals };
  }

  const config: AssEvalConfigV2 = {
    version: 2,
    unknown_eval_policy: normalizeUnknownPolicy((parsed as any).unknown_eval_policy),
    nodes,
  };

  return { config, hash };
}


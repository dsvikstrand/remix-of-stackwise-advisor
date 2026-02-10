import type { EvalResult, EvalSeverity } from './types';

export function mkEvalResult(
  gateId: string,
  ok: boolean,
  severity: EvalSeverity,
  score: number,
  reason: string,
  data?: Record<string, unknown>
): EvalResult {
  return { gate_id: gateId, ok, severity, score, reason, ...(data ? { data } : {}) };
}


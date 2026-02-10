import type { PersonaV0 } from '../persona_v0';

export type EvalSeverity = 'info' | 'warn' | 'hard_fail';

export type EvalResult = {
  gate_id: string;
  ok: boolean;
  severity: EvalSeverity;
  score: number;
  reason: string;
  data?: Record<string, unknown>;
};

export type UnknownEvalPolicy = 'hard_fail' | 'warn' | 'skip';

export type EvalContext = {
  run_id: string;
  node_id: string;
  run_type: string;
  attempt: number;
  candidate: number;
  persona: PersonaV0 | null;
  mode: 'seed' | 'user';
};

export type EvalClass<Input = unknown, Params = Record<string, unknown>> = {
  id: string;
  run: (input: Input, params: Params, ctx: EvalContext) => EvalResult;
};

export type EvalInstance = {
  eval_id: string;
  params?: Record<string, unknown>;
  severity?: EvalSeverity;
  score_weight?: number;
  retry_budget?: number;
};

export type AssEvalConfigV2 = {
  version: 2;
  unknown_eval_policy?: UnknownEvalPolicy;
  nodes: Record<
    string,
    {
      evals: EvalInstance[];
    }
  >;
};


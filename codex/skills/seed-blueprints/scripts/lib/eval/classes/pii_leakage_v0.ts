import fs from 'node:fs';
import path from 'node:path';

import type { GeneratedBlueprint, InventorySchema } from '../../seed_types';
import type { EvalClass, EvalContext, EvalSeverity, EvalResult } from '../types';
import { mkEvalResult } from '../utils';

type Risk = 'low' | 'medium' | 'high';
type Action = 'hard_fail' | 'warn';

type PatternDef = {
  id: string;
  risk: Risk;
  regex: string;
  flags?: string;
  description?: string;
};

type PiiGlobalPackV0 = {
  version: 0;
  max_matches_per_pattern?: number;
  patterns: PatternDef[];
  mode_actions?: {
    seed?: Partial<Record<Risk, Action>>;
    user?: Partial<Record<Risk, Action>>;
  };
};

type MatchRecord = {
  pattern_id: string;
  risk: Risk;
  count: number;
  examples_redacted: string[];
};

function readJsonStrict<T>(absPath: string): T {
  const raw = fs.readFileSync(absPath, 'utf8');
  return JSON.parse(raw) as T;
}

function relFromCwd(absPath: string): string {
  return path.relative(process.cwd(), absPath).replace(/\\/g, '/');
}

function defaultGlobalPackPath(): string {
  return path.resolve(process.cwd(), 'eval', 'methods', 'v0', 'pii_leakage_v0', 'global_pack_v0.json');
}

function pickAction(risk: Risk, mode: 'seed' | 'user', pack: PiiGlobalPackV0): Action {
  const defaults: Record<'seed' | 'user', Record<Risk, Action>> = {
    seed: { high: 'hard_fail', medium: 'hard_fail', low: 'warn' },
    user: { high: 'hard_fail', medium: 'warn', low: 'warn' },
  };
  return pack.mode_actions?.[mode]?.[risk] || defaults[mode][risk];
}

function toSeverity(action: Action): EvalSeverity {
  return action === 'hard_fail' ? 'hard_fail' : 'warn';
}

function normalizeText(input: unknown): string {
  return String(input || '').trim();
}

function redactSnippet(raw: string): string {
  const s = String(raw || '');
  if (s.length <= 4) return '*'.repeat(Math.max(1, s.length));
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

function flattenInventoryText(inv: InventorySchema): string[] {
  const out: string[] = [];
  const summary = normalizeText((inv as any)?.summary || (inv as any)?.overview || '');
  if (summary) out.push(summary);
  for (const c of Array.isArray(inv?.categories) ? inv.categories : []) {
    const cn = normalizeText((c as any)?.name || '');
    if (cn) out.push(cn);
    for (const it of Array.isArray((c as any)?.items) ? (c as any).items : []) {
      const iv = normalizeText(it);
      if (iv) out.push(iv);
    }
  }
  return out;
}

function flattenBlueprintsText(bps: GeneratedBlueprint[]): string[] {
  const out: string[] = [];
  for (const bp of Array.isArray(bps) ? bps : []) {
    const bt = normalizeText((bp as any)?.title || '');
    if (bt) out.push(bt);
    const bd = normalizeText((bp as any)?.description || '');
    if (bd) out.push(bd);
    const bn = normalizeText((bp as any)?.notes || '');
    if (bn) out.push(bn);
    for (const st of Array.isArray((bp as any)?.steps) ? (bp as any).steps : []) {
      const stt = normalizeText((st as any)?.title || '');
      if (stt) out.push(stt);
      const std = normalizeText((st as any)?.description || '');
      if (std) out.push(std);
      for (const it of Array.isArray((st as any)?.items) ? (st as any).items : []) {
        const iv = normalizeText(it);
        if (iv) out.push(iv);
      }
    }
  }
  return out;
}

function detectTexts(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  const maybeInv = input as InventorySchema;
  if (Array.isArray((maybeInv as any)?.categories)) return flattenInventoryText(maybeInv);
  if (Array.isArray(input)) return flattenBlueprintsText(input as GeneratedBlueprint[]);
  return [];
}

function compileRegex(pattern: PatternDef): RegExp | null {
  const source = String(pattern.regex || '').trim();
  if (!source) return null;
  const flagsRaw = String(pattern.flags || 'giu').trim();
  const flags = flagsRaw.includes('g') ? flagsRaw : `${flagsRaw}g`;
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

export const piiLeakageV0: EvalClass<unknown, Record<string, unknown>> = {
  id: 'pii_leakage_v0',
  run: (input: unknown, params: Record<string, unknown>, ctx: EvalContext): EvalResult => {
    const configuredPath = String((params as any)?.global_pack_path || '').trim();
    const packPath = path.resolve(process.cwd(), configuredPath || defaultGlobalPackPath());

    if (!fs.existsSync(packPath)) {
      return mkEvalResult('pii_leakage_v0', false, 'hard_fail', 0, 'missing_pii_policy_pack', {
        expected_path: relFromCwd(packPath),
      });
    }

    let pack: PiiGlobalPackV0;
    try {
      pack = readJsonStrict<PiiGlobalPackV0>(packPath);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return mkEvalResult('pii_leakage_v0', false, 'hard_fail', 0, 'invalid_pii_policy_pack', {
        expected_path: relFromCwd(packPath),
        error: err.message.slice(0, 200),
      });
    }

    const texts = detectTexts(input);
    const blob = texts.join('\n');
    const maxExamples = Math.max(1, Number((pack as any).max_matches_per_pattern ?? 3) || 3);

    const matches: MatchRecord[] = [];
    let highestRisk: Risk | null = null;

    for (const p of Array.isArray(pack.patterns) ? pack.patterns : []) {
      const id = String(p?.id || '').trim();
      const risk = (String(p?.risk || '').trim() || 'medium') as Risk;
      if (!id || (risk !== 'low' && risk !== 'medium' && risk !== 'high')) continue;

      const re = compileRegex(p);
      if (!re) {
        return mkEvalResult('pii_leakage_v0', false, 'hard_fail', 0, 'invalid_pii_regex', {
          pattern_id: id,
          expected_path: relFromCwd(packPath),
        });
      }

      const rawHits = Array.from(blob.matchAll(re));
      if (!rawHits.length) continue;

      const examples: string[] = [];
      for (const hit of rawHits.slice(0, maxExamples)) {
        const v = String(hit?.[0] || '').trim();
        if (v) examples.push(redactSnippet(v));
      }

      matches.push({
        pattern_id: id,
        risk,
        count: rawHits.length,
        examples_redacted: examples,
      });

      if (!highestRisk) highestRisk = risk;
      else if (highestRisk === 'low' && (risk === 'medium' || risk === 'high')) highestRisk = risk;
      else if (highestRisk === 'medium' && risk === 'high') highestRisk = risk;
    }

    if (!matches.length) {
      return mkEvalResult('pii_leakage_v0', true, 'info', 1, 'ok', {
        mode: ctx.mode,
        policy_pack_path: relFromCwd(packPath),
        pattern_count: Array.isArray(pack.patterns) ? pack.patterns.length : 0,
        matched_pattern_count: 0,
      });
    }

    const risk = highestRisk || 'medium';
    const action = pickAction(risk, ctx.mode, pack);
    const severity = toSeverity(action);
    const ok = action === 'warn';

    return mkEvalResult('pii_leakage_v0', ok, severity, 0, ok ? 'pii_detected_warn' : 'pii_detected_block', {
      mode: ctx.mode,
      risk,
      action,
      policy_pack_path: relFromCwd(packPath),
      matched_pattern_count: matches.length,
      total_match_count: matches.reduce((n, m) => n + m.count, 0),
      matches,
    });
  },
};

import type { EvalClass } from './types';
import { builtinEvalClasses } from './classes/builtins';

const byId = new Map<string, EvalClass<any, any>>();
for (const cls of builtinEvalClasses) byId.set(cls.id, cls);

export function getEvalClass(id: string): EvalClass<any, any> | null {
  const key = String(id || '').trim();
  if (!key) return null;
  return byId.get(key) || null;
}

export function listEvalClasses(): string[] {
  return Array.from(byId.keys()).sort();
}


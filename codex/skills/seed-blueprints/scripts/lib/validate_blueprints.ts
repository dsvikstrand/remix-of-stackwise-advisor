import type { GeneratedBlueprint, InventorySchema } from './seed_types';

export type BlueprintValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    blueprintCount: number;
    stepCountTotal: number;
    itemRefsTotal: number;
  };
};

export function validateBlueprints(inventory: InventorySchema, blueprints: GeneratedBlueprint[]): BlueprintValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const categories = Array.isArray(inventory?.categories) ? inventory.categories : [];
  const catMap = new Map<string, Set<string>>();
  for (const c of categories) {
    const name = String(c?.name || '').trim();
    if (!name) continue;
    const items = new Set((Array.isArray(c?.items) ? c.items : []).map((x) => String(x || '').trim()).filter(Boolean));
    catMap.set(name.toLowerCase(), items);
  }

  let stepCountTotal = 0;
  let itemRefsTotal = 0;

  const bps = Array.isArray(blueprints) ? blueprints : [];
  for (const bp of bps) {
    const title = String(bp?.title || '').trim();
    const steps = Array.isArray(bp?.steps) ? bp.steps : [];
    stepCountTotal += steps.length;

    for (const st of steps) {
      const stepTitle = String(st?.title || '').trim();
      const items = Array.isArray(st?.items) ? st.items : [];
      itemRefsTotal += items.length;

      for (const it of items) {
        const cat = String(it?.category || '').trim();
        const name = String(it?.name || '').trim();
        if (!cat || !name) {
          warnings.push(`missing_ref_fields: blueprint=${title || '(untitled)'} step=${stepTitle || '(untitled)'}`);
          continue;
        }
        const set = catMap.get(cat.toLowerCase());
        if (!set) {
          errors.push(`unknown_category: ${cat} (blueprint=${title || '(untitled)'})`);
          continue;
        }
        if (!set.has(name)) {
          errors.push(`unknown_item: ${cat} :: ${name} (blueprint=${title || '(untitled)'})`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      blueprintCount: bps.length,
      stepCountTotal,
      itemRefsTotal,
    },
  };
}


import fs from 'node:fs';
import path from 'node:path';
import type { ControlPackV0 } from '../../control_pack_v0';
import type { PromptPackV0 } from '../../prompt_pack_v0';
import type { PersonaV0 } from '../../persona_v0';
import type { GeneratedBlueprint, InventorySchema } from '../../seed_types';
import { validateBlueprints } from '../../validate_blueprints';
import { resolveDomainAsset } from '../domain_assets';
import type { EvalClass } from '../types';
import { mkEvalResult } from '../utils';

function normalizeSlug(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function uniqStrings(input: string[]) {
  const out: string[] = [];
  for (const raw of input || []) {
    const s = String(raw || '').trim();
    if (!s) continue;
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

type DomainRubricV0 = {
  version: number;
  id?: string;
  inventory?: {
    minCategories?: number;
    minItemsTotal?: number;
    minItemsPerCategory?: number;
    maxDupRatio?: number;
    maxDominantCategoryRatio?: number;
    minItemLen?: number;
    maxShortItemRatio?: number;
    forbidden_terms?: string[];
  };
};

function readJsonFileStrict<T>(absPath: string): T {
  const raw = fs.readFileSync(absPath, 'utf8');
  return JSON.parse(raw) as T;
}

function normalizeText(input: unknown): string {
  return String(input || '').trim().toLowerCase();
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const uni = a.size + b.size - inter;
  return uni > 0 ? inter / uni : 0;
}

export const builtinEvalClasses: Array<EvalClass<any, any>> = [
  {
    id: 'structural_inventory',
    run: (inv: InventorySchema) => {
      const cats = Array.isArray(inv?.categories) ? inv.categories : [];
      if (cats.length === 0) return mkEvalResult('structural_inventory', false, 'warn', 0, 'no_categories', { categoryCount: 0 });
      const empty = cats.filter((c) => !(c.items || []).length).length;
      if (empty > 0) {
        return mkEvalResult('structural_inventory', false, 'warn', 0, 'empty_categories', {
          categoryCount: cats.length,
          emptyCategoryCount: empty,
        });
      }
      return mkEvalResult('structural_inventory', true, 'info', 1, 'ok', { categoryCount: cats.length });
    },
  },
  {
    id: 'bounds_inventory',
    run: (inv: InventorySchema) => {
      const cats = Array.isArray(inv?.categories) ? inv.categories : [];
      const limits = {
        maxCategories: 30,
        maxCategoryNameLen: 80,
        maxItemsPerCategory: 80,
        maxItemNameLen: 80,
      };
      if (cats.length > limits.maxCategories) {
        return mkEvalResult('bounds_inventory', false, 'warn', 0, 'too_many_categories', {
          categoryCount: cats.length,
          maxCategories: limits.maxCategories,
        });
      }
      for (const c of cats) {
        const name = String(c?.name || '');
        if (name.length > limits.maxCategoryNameLen) {
          return mkEvalResult('bounds_inventory', false, 'warn', 0, 'category_name_too_long', {
            categoryNameLen: name.length,
            maxCategoryNameLen: limits.maxCategoryNameLen,
          });
        }
        const items = Array.isArray(c?.items) ? c.items : [];
        if (items.length > limits.maxItemsPerCategory) {
          return mkEvalResult('bounds_inventory', false, 'warn', 0, 'too_many_items_in_category', {
            itemCount: items.length,
            maxItemsPerCategory: limits.maxItemsPerCategory,
          });
        }
        for (const it of items) {
          const itNameLen = String(it || '').length;
          if (itNameLen > limits.maxItemNameLen) {
            return mkEvalResult('bounds_inventory', false, 'warn', 0, 'item_name_too_long', {
              itemNameLen: itNameLen,
              maxItemNameLen: limits.maxItemNameLen,
            });
          }
        }
      }
      return mkEvalResult('bounds_inventory', true, 'info', 1, 'ok', limits);
    },
  },
  {
    id: 'inventory_quality_heuristics_v0',
    run: (inv: InventorySchema, params: Record<string, unknown>) => {
      const cats = Array.isArray(inv?.categories) ? inv.categories : [];
      const minCategories = Math.max(0, Number((params as any)?.minCategories ?? 4) || 0);
      const minItemsTotal = Math.max(0, Number((params as any)?.minItemsTotal ?? 20) || 0);
      const minItemsPerCategory = Math.max(0, Number((params as any)?.minItemsPerCategory ?? 3) || 0);
      const maxDupRatioRaw = (params as any)?.maxDupRatio;
      const maxDupRatio = maxDupRatioRaw === undefined || maxDupRatioRaw === null ? 0.15 : Math.max(0, Number(maxDupRatioRaw) || 0);
      const maxDominantCategoryRatioRaw = (params as any)?.maxDominantCategoryRatio;
      const maxDominantCategoryRatio =
        maxDominantCategoryRatioRaw === undefined || maxDominantCategoryRatioRaw === null
          ? 0.55
          : Math.max(0, Number(maxDominantCategoryRatioRaw) || 0);
      const minItemLen = Math.max(1, Number((params as any)?.minItemLen ?? 4) || 1);
      const maxShortItemRatioRaw = (params as any)?.maxShortItemRatio;
      const maxShortItemRatio =
        maxShortItemRatioRaw === undefined || maxShortItemRatioRaw === null ? 0.3 : Math.max(0, Number(maxShortItemRatioRaw) || 0);

      const normalizeItem = (s: unknown) => String(s || '').trim().toLowerCase();

      let totalItems = 0;
      let dominantCategoryCount = 0;
      let minItemsInAnyCategory = Number.POSITIVE_INFINITY;
      let shortItems = 0;
      const all: string[] = [];
      const perCategory: Array<{ name: string; count: number }> = [];

      for (const c of cats) {
        const items = Array.isArray((c as any)?.items) ? ((c as any).items as unknown[]) : [];
        const count = items.length;
        perCategory.push({ name: String((c as any)?.name || ''), count });
        totalItems += count;
        dominantCategoryCount = Math.max(dominantCategoryCount, count);
        minItemsInAnyCategory = Math.min(minItemsInAnyCategory, count);
        for (const it of items) {
          const v = normalizeItem(it);
          if (!v) continue;
          all.push(v);
          if (v.length < minItemLen) shortItems += 1;
        }
      }

      const uniq = new Set(all);
      const uniqCount = uniq.size;
      const dupCount = Math.max(0, all.length - uniqCount);
      const dupRatio = all.length > 0 ? dupCount / all.length : 0;
      const dominantCategoryRatio = totalItems > 0 ? dominantCategoryCount / totalItems : 0;
      const shortItemRatio = all.length > 0 ? shortItems / all.length : 0;

      const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
      const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

      const sCats = minCategories > 0 ? clamp01(safeDiv(cats.length, minCategories)) : 1;
      const sTotal = minItemsTotal > 0 ? clamp01(safeDiv(totalItems, minItemsTotal)) : 1;
      const sPerCat = minItemsPerCategory > 0 ? clamp01(safeDiv(Number.isFinite(minItemsInAnyCategory) ? minItemsInAnyCategory : 0, minItemsPerCategory)) : 1;
      const sDup = maxDupRatio > 0 ? clamp01(1 - safeDiv(dupRatio, maxDupRatio)) : 1;
      const sDom = maxDominantCategoryRatio > 0 ? clamp01(1 - safeDiv(dominantCategoryRatio, maxDominantCategoryRatio)) : 1;
      const sShort = maxShortItemRatio > 0 ? clamp01(1 - safeDiv(shortItemRatio, maxShortItemRatio)) : 1;

      const score = clamp01((sCats + sTotal + sPerCat + sDup + sDom + sShort) / 6);

      const failures: string[] = [];
      if (minCategories > 0 && cats.length < minCategories) failures.push('too_few_categories');
      if (minItemsTotal > 0 && totalItems < minItemsTotal) failures.push('too_few_items_total');
      if (minItemsPerCategory > 0 && (Number.isFinite(minItemsInAnyCategory) ? minItemsInAnyCategory : 0) < minItemsPerCategory)
        failures.push('too_few_items_in_a_category');
      if (maxDupRatio > 0 && dupRatio > maxDupRatio) failures.push('too_many_duplicates');
      if (maxDominantCategoryRatio > 0 && dominantCategoryRatio > maxDominantCategoryRatio) failures.push('category_dominance_too_high');
      if (maxShortItemRatio > 0 && shortItemRatio > maxShortItemRatio) failures.push('too_many_short_items');

      const ok = failures.length === 0;
      const data = {
        thresholds: {
          minCategories,
          minItemsTotal,
          minItemsPerCategory,
          maxDupRatio,
          maxDominantCategoryRatio,
          minItemLen,
          maxShortItemRatio,
        },
        stats: {
          categoryCount: cats.length,
          totalItems,
          minItemsInAnyCategory: Number.isFinite(minItemsInAnyCategory) ? minItemsInAnyCategory : 0,
          dominantCategoryCount,
          dominantCategoryRatio,
          uniqCount,
          dupCount,
          dupRatio,
          shortItems,
          shortItemRatio,
        },
        perCategory: perCategory
          .slice()
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        failures,
      };

      return mkEvalResult('inventory_quality_heuristics_v0', ok, ok ? 'info' : 'warn', score, ok ? 'ok' : 'quality_issues', data);
    },
  },
  {
    id: 'structural_blueprints',
    run: (blueprints: GeneratedBlueprint[]) => {
      if (!Array.isArray(blueprints) || blueprints.length === 0) {
        return mkEvalResult('structural_blueprints', false, 'warn', 0, 'no_blueprints', { blueprintCount: 0 });
      }
      for (const bp of blueprints) {
        if (!String(bp?.title || '').trim()) return mkEvalResult('structural_blueprints', false, 'warn', 0, 'missing_blueprint_title');
        if (!Array.isArray(bp?.steps) || bp.steps.length === 0) {
          return mkEvalResult('structural_blueprints', false, 'warn', 0, 'blueprint_has_no_steps', { title: String(bp?.title || '') });
        }
        for (const st of bp.steps || []) {
          if (!Array.isArray(st?.items) || st.items.length === 0) {
            return mkEvalResult('structural_blueprints', false, 'warn', 0, 'step_has_no_items', { stepTitle: String(st?.title || '') });
          }
        }
      }
      return mkEvalResult('structural_blueprints', true, 'info', 1, 'ok', { blueprintCount: blueprints.length });
    },
  },
  {
    id: 'bounds_blueprints',
    run: (blueprints: GeneratedBlueprint[]) => {
      const limits = {
        maxSteps: 20,
        maxStepTitleLen: 120,
        maxStepDescriptionLen: 800,
        maxItemsPerStep: 40,
      };
      for (const bp of blueprints || []) {
        if ((bp.steps || []).length > limits.maxSteps) {
          return mkEvalResult('bounds_blueprints', false, 'warn', 0, 'too_many_steps', {
            stepCount: (bp.steps || []).length,
            maxSteps: limits.maxSteps,
          });
        }
        for (const st of bp.steps || []) {
          const titleLen = String(st?.title || '').length;
          if (titleLen > limits.maxStepTitleLen) {
            return mkEvalResult('bounds_blueprints', false, 'warn', 0, 'step_title_too_long', { titleLen, maxStepTitleLen: limits.maxStepTitleLen });
          }
          const descLen = String(st?.description || '').length;
          if (descLen > limits.maxStepDescriptionLen) {
            return mkEvalResult('bounds_blueprints', false, 'warn', 0, 'step_description_too_long', {
              descLen,
              maxStepDescriptionLen: limits.maxStepDescriptionLen,
            });
          }
          if ((st.items || []).length > limits.maxItemsPerStep) {
            return mkEvalResult('bounds_blueprints', false, 'warn', 0, 'too_many_items_in_step', {
              itemCount: (st.items || []).length,
              maxItemsPerStep: limits.maxItemsPerStep,
            });
          }
        }
      }
      return mkEvalResult('bounds_blueprints', true, 'info', 1, 'ok', limits);
    },
  },
  {
    id: 'crossref_blueprints_to_inventory',
    run: (input: { inventory: InventorySchema; blueprints: GeneratedBlueprint[] }) => {
      const v = validateBlueprints(input.inventory, input.blueprints);
      return mkEvalResult(
        'crossref_blueprints_to_inventory',
        v.ok,
        v.ok ? 'info' : 'warn',
        v.ok ? 1 : 0,
        v.ok ? 'ok' : 'invalid_refs',
        {
          errorCount: v.errors.length,
          warningCount: v.warnings.length,
          sampleError: v.errors[0] ? String(v.errors[0]).slice(0, 200) : '',
        }
      );
    },
  },
  {
    id: 'structural_prompt_pack',
    run: (pack: PromptPackV0) => {
      const goal = String(pack?.goal || '').trim();
      if (!goal) return mkEvalResult('structural_prompt_pack', false, 'warn', 0, 'missing_goal');

      const lib = pack?.library as any;
      if (!lib || !String(lib.topic || '').trim()) return mkEvalResult('structural_prompt_pack', false, 'warn', 0, 'missing_library_topic');
      if (!String(lib.title || '').trim()) return mkEvalResult('structural_prompt_pack', false, 'warn', 0, 'missing_library_title');

      const bps = Array.isArray(pack?.blueprints) ? pack.blueprints : [];
      if (bps.length === 0) return mkEvalResult('structural_prompt_pack', false, 'warn', 0, 'no_blueprints', { blueprintCount: 0 });
      for (const bp of bps) {
        if (!String(bp?.title || '').trim()) return mkEvalResult('structural_prompt_pack', false, 'warn', 0, 'missing_blueprint_title');
      }
      return mkEvalResult('structural_prompt_pack', true, 'info', 1, 'ok', { blueprintCount: bps.length });
    },
  },
  {
    id: 'bounds_prompt_pack',
    run: (pack: PromptPackV0) => {
      const limits = {
        maxGoalLen: 200,
        maxTitleLen: 80,
        maxDescriptionLen: 240,
        maxNotesLen: 1200,
        maxTags: 12,
        maxTagLen: 40,
        maxBlueprints: 8,
      };

      const goal = String(pack?.goal || '');
      if (goal.length > limits.maxGoalLen) return mkEvalResult('bounds_prompt_pack', false, 'warn', 0, 'goal_too_long', limits);

      const lib = pack?.library;
      const libTitleLen = String(lib?.title || '').length;
      if (libTitleLen > limits.maxTitleLen) return mkEvalResult('bounds_prompt_pack', false, 'warn', 0, 'library_title_too_long', limits);
      const libDescLen = String(lib?.description || '').length;
      if (libDescLen > limits.maxDescriptionLen) return mkEvalResult('bounds_prompt_pack', false, 'warn', 0, 'library_description_too_long', limits);
      const libNotesLen = String(lib?.notes || '').length;
      if (libNotesLen > limits.maxNotesLen) return mkEvalResult('bounds_prompt_pack', false, 'warn', 0, 'library_notes_too_long', limits);

      const bps = Array.isArray(pack?.blueprints) ? pack.blueprints : [];
      if (bps.length > limits.maxBlueprints) return mkEvalResult('bounds_prompt_pack', false, 'warn', 0, 'too_many_blueprints', limits);
      for (const bp of bps) {
        const tLen = String(bp?.title || '').length;
        if (tLen > limits.maxTitleLen) return mkEvalResult('bounds_prompt_pack', false, 'warn', 0, 'blueprint_title_too_long', limits);
        const dLen = String(bp?.description || '').length;
        if (dLen > limits.maxDescriptionLen) return mkEvalResult('bounds_prompt_pack', false, 'warn', 0, 'blueprint_description_too_long', limits);
        const nLen = String(bp?.notes || '').length;
        if (nLen > limits.maxNotesLen) return mkEvalResult('bounds_prompt_pack', false, 'warn', 0, 'blueprint_notes_too_long', limits);
        const tags = (bp?.tags || []).map((x) => String(x || '')).filter(Boolean);
        if (tags.length > limits.maxTags) return mkEvalResult('bounds_prompt_pack', false, 'warn', 0, 'too_many_tags', limits);
        for (const tag of tags) {
          if (String(tag).length > limits.maxTagLen) return mkEvalResult('bounds_prompt_pack', false, 'warn', 0, 'tag_too_long', limits);
        }
      }

      return mkEvalResult('bounds_prompt_pack', true, 'info', 1, 'ok', limits);
    },
  },
  {
    id: 'persona_alignment_prompts_v0',
    run: (input: { persona: PersonaV0 | null; pack: PromptPackV0 }, params: Record<string, unknown>) => {
      const persona = input.persona;
      const pack = input.pack;
      if (!persona) return mkEvalResult('persona_alignment_prompts_v0', true, 'info', 0, 'no_persona', { skipped: true });

      const minTagOverlapRatioRaw = (params || ({} as any)).minTagOverlapRatio;
      const minTagOverlapRatio =
        minTagOverlapRatioRaw === undefined || minTagOverlapRatioRaw === null ? 0.25 : Math.max(0, Number(minTagOverlapRatioRaw) || 0);
      const hardFailOnMustAvoid = (params || ({} as any)).hardFailOnMustAvoid !== false;

      const personaTags = uniqStrings([
        ...((persona.interests?.topics || []) as string[]),
        ...((persona.interests?.tags_prefer || []) as string[]),
      ])
        .map(normalizeSlug)
        .filter(Boolean);
      const personaTagSet = new Set(personaTags);

      const avoidTags = uniqStrings([...(persona.interests?.tags_avoid || [])]).map(normalizeSlug).filter(Boolean);
      const mustInclude = uniqStrings([...(persona.constraints?.must_include || [])]).map((s) => String(s).toLowerCase());
      const mustAvoid = uniqStrings([...(persona.constraints?.must_avoid || [])]).map((s) => String(s).toLowerCase());

      const packTags = uniqStrings([
        ...((pack.library?.tags || []) as string[]),
        ...(pack.blueprints || []).flatMap((bp) => (bp?.tags || []) as string[]),
      ])
        .map(normalizeSlug)
        .filter(Boolean);
      const packTagSet = new Set(packTags);

      let overlapCount = 0;
      for (const t of packTagSet) if (personaTagSet.has(t)) overlapCount += 1;
      const overlapRatio = overlapCount / Math.max(1, packTagSet.size);

      const blob = [
        pack.goal,
        pack.library?.topic,
        pack.library?.title,
        pack.library?.description,
        pack.library?.notes,
        ...(pack.blueprints || []).flatMap((bp) => [bp?.title, bp?.description, bp?.notes]),
        ...packTags,
      ]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const mustIncludeHits = mustInclude.filter((t) => t && blob.includes(t));
      const avoidTagHits = avoidTags.filter((t) => t && packTagSet.has(t));
      const mustAvoidInstructionHits = mustAvoid.filter((t) => t && blob.includes(t));

      const data = {
        persona_id: persona.id,
        minTagOverlapRatio,
        hardFailOnMustAvoid,
        pack_tag_count: packTagSet.size,
        persona_tag_count: personaTagSet.size,
        overlap_count: overlapCount,
        overlap_ratio: overlapRatio,
        must_include_total: mustInclude.length,
        must_include_hits: mustIncludeHits.length,
        avoid_tags_total: avoidTags.length,
        avoid_tags_hits: avoidTagHits.length,
        must_avoid_instructions_total: mustAvoid.length,
        must_avoid_instructions_hits: mustAvoidInstructionHits.length,
        hit_terms: {
          must_include: mustIncludeHits.slice(0, 8),
          avoid_tags: avoidTagHits.slice(0, 8),
          must_avoid_instructions: mustAvoidInstructionHits.slice(0, 8),
        },
      };

      if (hardFailOnMustAvoid && avoidTagHits.length > 0) {
        return mkEvalResult('persona_alignment_prompts_v0', false, 'hard_fail', 0, 'avoid_tag_hit', data);
      }

      if (overlapRatio < minTagOverlapRatio) {
        return mkEvalResult('persona_alignment_prompts_v0', false, 'hard_fail', overlapRatio, 'low_tag_overlap', data);
      }

      if (mustInclude.length && mustIncludeHits.length < mustInclude.length) {
        return mkEvalResult('persona_alignment_prompts_v0', true, 'warn', overlapRatio, 'ok_missing_must_include', data);
      }

      return mkEvalResult('persona_alignment_prompts_v0', true, 'info', overlapRatio, 'ok', data);
    },
  },
  {
    id: 'structural_control_pack',
    run: (pack: ControlPackV0) => {
      if (Number(pack?.version) !== 0) return mkEvalResult('structural_control_pack', false, 'warn', 0, 'bad_version');
      const goal = String(pack?.goal || '').trim();
      if (!goal) return mkEvalResult('structural_control_pack', false, 'warn', 0, 'missing_goal');
      const lib = pack?.library as any;
      if (!lib || !lib.controls) return mkEvalResult('structural_control_pack', false, 'warn', 0, 'missing_library_controls');
      const bps = Array.isArray(pack?.blueprints) ? pack.blueprints : [];
      if (!bps.length) return mkEvalResult('structural_control_pack', false, 'warn', 0, 'no_blueprints', { blueprintCount: 0 });
      for (const bp of bps) {
        if (!bp || !bp.controls || !String(bp.controls.focus || '').trim()) {
          return mkEvalResult('structural_control_pack', false, 'warn', 0, 'missing_blueprint_focus');
        }
      }
      return mkEvalResult('structural_control_pack', true, 'info', 1, 'ok', { blueprintCount: bps.length });
    },
  },
  {
    id: 'bounds_control_pack',
    run: (pack: ControlPackV0) => {
      const limits = {
        maxGoalLen: 200,
        maxNameLen: 80,
        maxNotesLen: 1200,
        maxTags: 12,
        maxTagLen: 40,
        maxBlueprints: 8,
      };
      const goal = String(pack?.goal || '');
      if (goal.length > limits.maxGoalLen) return mkEvalResult('bounds_control_pack', false, 'warn', 0, 'goal_too_long', limits);
      const libNameLen = String(pack?.library?.name || '').length;
      if (libNameLen > limits.maxNameLen) return mkEvalResult('bounds_control_pack', false, 'warn', 0, 'library_name_too_long', limits);
      const libNotesLen = String(pack?.library?.notes || '').length;
      if (libNotesLen > limits.maxNotesLen) return mkEvalResult('bounds_control_pack', false, 'warn', 0, 'library_notes_too_long', limits);
      const libTags = ((pack?.library?.tags || []) as any[]).map((x) => String(x || '')).filter(Boolean);
      if (libTags.length > limits.maxTags) return mkEvalResult('bounds_control_pack', false, 'warn', 0, 'too_many_library_tags', limits);
      for (const tag of libTags) {
        if (String(tag).length > limits.maxTagLen) return mkEvalResult('bounds_control_pack', false, 'warn', 0, 'library_tag_too_long', limits);
      }

      const bps = Array.isArray(pack?.blueprints) ? pack.blueprints : [];
      if (bps.length > limits.maxBlueprints) return mkEvalResult('bounds_control_pack', false, 'warn', 0, 'too_many_blueprints', limits);
      for (const bp of bps) {
        const nameLen = String(bp?.name || '').length;
        if (nameLen > limits.maxNameLen) return mkEvalResult('bounds_control_pack', false, 'warn', 0, 'blueprint_name_too_long', limits);
        const notesLen = String(bp?.notes || '').length;
        if (notesLen > limits.maxNotesLen) return mkEvalResult('bounds_control_pack', false, 'warn', 0, 'blueprint_notes_too_long', limits);
        const tags = ((bp?.tags || []) as any[]).map((x) => String(x || '')).filter(Boolean);
        if (tags.length > limits.maxTags) return mkEvalResult('bounds_control_pack', false, 'warn', 0, 'too_many_blueprint_tags', limits);
        for (const tag of tags) {
          if (String(tag).length > limits.maxTagLen) return mkEvalResult('bounds_control_pack', false, 'warn', 0, 'blueprint_tag_too_long', limits);
        }
      }
      return mkEvalResult('bounds_control_pack', true, 'info', 1, 'ok', limits);
    },
  },
  {
    id: 'persona_alignment_controls_v0',
    run: (input: { persona: PersonaV0 | null; pack: ControlPackV0 }, params: Record<string, unknown>) => {
      const persona = input.persona;
      const pack = input.pack;
      if (!persona) return mkEvalResult('persona_alignment_controls_v0', true, 'info', 0, 'no_persona', { skipped: true });

      const expectedDomain = String(persona?.safety?.domain || '').trim();
      const domain = String((pack as any)?.library?.controls?.domain || '').trim();
      const domainCustom = String((pack as any)?.library?.controls?.domain_custom || '').trim();
      const allowCustomDomain = (params || ({} as any)).allowCustomDomain === true;

      const data = {
        persona_id: persona.id,
        expected_domain: expectedDomain || null,
        domain: domain || null,
        domain_custom: domainCustom || null,
        allowCustomDomain,
      };

      if (expectedDomain) {
        if (domain === expectedDomain) return mkEvalResult('persona_alignment_controls_v0', true, 'info', 1, 'ok', data);
        if (domain === 'custom' && allowCustomDomain) return mkEvalResult('persona_alignment_controls_v0', true, 'warn', 0.5, 'ok_custom_domain', data);
        return mkEvalResult('persona_alignment_controls_v0', false, 'hard_fail', 0, 'domain_mismatch', data);
      }

      return mkEvalResult('persona_alignment_controls_v0', true, 'warn', 0.25, 'missing_expected_domain', data);
    },
  },
  {
    id: 'testonly_fail_once',
    run: (_input: unknown, params: Record<string, unknown>, ctx) => {
      const failOnAttemptRaw = (params || ({} as any)).failOnAttempt;
      const failOnAttempt = Math.max(1, Number(failOnAttemptRaw || 1) || 1);
      if (ctx.attempt === failOnAttempt) {
        return mkEvalResult('testonly_fail_once', false, 'warn', 0, 'forced_retry', { attempt: ctx.attempt });
      }
      return mkEvalResult('testonly_fail_once', true, 'info', 1, 'ok', { failOnAttempt, attempt: ctx.attempt });
    },
  },
  {
    id: 'requires_domain_golden_stub_v0',
    run: (_input: unknown, _params: Record<string, unknown>, ctx) => {
      const domainId = String(ctx.domain_id || '').trim();
      if (!domainId) {
        return mkEvalResult('requires_domain_golden_stub_v0', false, 'hard_fail', 0, 'missing_domain_id', {
          expected: 'set --domain or provide persona default_domain/safety.domain',
        });
      }

      let asset: { absPath: string; relPath: string };
      try {
        asset = resolveDomainAsset(domainId, 'golden/stub.json');
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return mkEvalResult('requires_domain_golden_stub_v0', false, 'hard_fail', 0, 'invalid_domain_asset_path', {
          domain_id: domainId,
          error: err.message.slice(0, 200),
        });
      }

      const ok = fs.existsSync(asset.absPath);
      return mkEvalResult(
        'requires_domain_golden_stub_v0',
        ok,
        ok ? 'info' : 'hard_fail',
        ok ? 1 : 0,
        ok ? 'ok' : 'missing_domain_asset',
        {
          domain_id: domainId,
          expected_path: asset.relPath,
        }
      );
    },
  },
  {
    id: 'domain_rubric_inventory_v0',
    run: (inv: InventorySchema, _params: Record<string, unknown>, ctx) => {
      const domainId = String(ctx.domain_id || '').trim();
      if (!domainId) {
        return mkEvalResult('domain_rubric_inventory_v0', false, 'hard_fail', 0, 'missing_domain_id', {
          expected: 'set --domain or provide persona default_domain/safety.domain',
        });
      }

      let rubricPath: { absPath: string; relPath: string };
      try {
        rubricPath = resolveDomainAsset(domainId, 'rubric_v0.json');
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return mkEvalResult('domain_rubric_inventory_v0', false, 'hard_fail', 0, 'invalid_domain_asset_path', {
          domain_id: domainId,
          error: err.message.slice(0, 200),
        });
      }

      if (!fs.existsSync(rubricPath.absPath)) {
        return mkEvalResult('domain_rubric_inventory_v0', false, 'hard_fail', 0, 'missing_domain_asset', {
          domain_id: domainId,
          expected_path: rubricPath.relPath,
        });
      }

      let rubric: DomainRubricV0;
      try {
        rubric = readJsonFileStrict<DomainRubricV0>(rubricPath.absPath);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return mkEvalResult('domain_rubric_inventory_v0', false, 'hard_fail', 0, 'invalid_rubric_json', {
          domain_id: domainId,
          expected_path: rubricPath.relPath,
          error: err.message.slice(0, 200),
        });
      }

      const rules = rubric?.inventory || {};
      const cats = Array.isArray(inv?.categories) ? inv.categories : [];
      const minCategories = Math.max(0, Number(rules.minCategories ?? 0) || 0);
      const minItemsTotal = Math.max(0, Number(rules.minItemsTotal ?? 0) || 0);
      const minItemsPerCategory = Math.max(0, Number(rules.minItemsPerCategory ?? 0) || 0);
      const maxDupRatio = rules.maxDupRatio === undefined ? null : Math.max(0, Number(rules.maxDupRatio) || 0);
      const maxDominantCategoryRatio =
        rules.maxDominantCategoryRatio === undefined ? null : Math.max(0, Number(rules.maxDominantCategoryRatio) || 0);
      const minItemLen = Math.max(1, Number(rules.minItemLen ?? 1) || 1);
      const maxShortItemRatio = rules.maxShortItemRatio === undefined ? null : Math.max(0, Number(rules.maxShortItemRatio) || 0);
      const forbidden = Array.isArray(rules.forbidden_terms) ? rules.forbidden_terms.map(normalizeText).filter(Boolean) : [];

      let totalItems = 0;
      let dominantCategoryCount = 0;
      let minItemsInAnyCategory = Number.POSITIVE_INFINITY;
      let shortItems = 0;
      const allItemsNorm: string[] = [];
      const allText: string[] = [];

      for (const c of cats) {
        const catName = normalizeText((c as any)?.name || '');
        if (catName) allText.push(catName);
        const items = Array.isArray((c as any)?.items) ? ((c as any).items as unknown[]) : [];
        totalItems += items.length;
        dominantCategoryCount = Math.max(dominantCategoryCount, items.length);
        minItemsInAnyCategory = Math.min(minItemsInAnyCategory, items.length);
        for (const it of items) {
          const v = normalizeText(it);
          if (!v) continue;
          allItemsNorm.push(v);
          allText.push(v);
          if (v.length < minItemLen) shortItems += 1;
        }
      }

      const uniq = new Set(allItemsNorm);
      const dupCount = Math.max(0, allItemsNorm.length - uniq.size);
      const dupRatio = allItemsNorm.length > 0 ? dupCount / allItemsNorm.length : 0;
      const dominantCategoryRatio = totalItems > 0 ? dominantCategoryCount / totalItems : 0;
      const shortItemRatio = allItemsNorm.length > 0 ? shortItems / allItemsNorm.length : 0;

      const failures: string[] = [];
      if (minCategories > 0 && cats.length < minCategories) failures.push('too_few_categories');
      if (minItemsTotal > 0 && totalItems < minItemsTotal) failures.push('too_few_items_total');
      if (minItemsPerCategory > 0 && (Number.isFinite(minItemsInAnyCategory) ? minItemsInAnyCategory : 0) < minItemsPerCategory)
        failures.push('too_few_items_in_a_category');
      if (maxDupRatio !== null && dupRatio > maxDupRatio) failures.push('too_many_duplicates');
      if (maxDominantCategoryRatio !== null && dominantCategoryRatio > maxDominantCategoryRatio) failures.push('category_dominance_too_high');
      if (maxShortItemRatio !== null && shortItemRatio > maxShortItemRatio) failures.push('too_many_short_items');

      const textJoined = allText.join(' ');
      const forbiddenHits = forbidden.filter((t) => t && textJoined.includes(t));
      if (forbiddenHits.length) failures.push('forbidden_terms_present');

      const ok = failures.length === 0;
      const data = {
        domain_id: domainId,
        rubric_path: rubricPath.relPath,
        stats: {
          categoryCount: cats.length,
          totalItems,
          minItemsInAnyCategory: Number.isFinite(minItemsInAnyCategory) ? minItemsInAnyCategory : 0,
          dominantCategoryRatio,
          dupRatio,
          shortItemRatio,
        },
        forbidden_hits: forbiddenHits.slice(0, 10),
        failures,
      };
      const score = ok ? 1 : 0;
      return mkEvalResult('domain_rubric_inventory_v0', ok, ok ? 'info' : 'warn', score, ok ? 'ok' : 'rubric_violations', data);
    },
  },
  {
    id: 'golden_regression_inventory_v0',
    run: (inv: InventorySchema, params: Record<string, unknown>, ctx) => {
      const domainId = String(ctx.domain_id || '').trim();
      if (!domainId) {
        return mkEvalResult('golden_regression_inventory_v0', false, 'hard_fail', 0, 'missing_domain_id', {
          expected: 'set --domain or provide persona default_domain/safety.domain',
        });
      }

      const minScoreRaw = (params || ({} as any)).minScore;
      const minScore = minScoreRaw === undefined || minScoreRaw === null ? 0.08 : Math.max(0, Number(minScoreRaw) || 0);

      let dir: { absPath: string; relPath: string };
      try {
        dir = resolveDomainAsset(domainId, 'golden/libraries');
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return mkEvalResult('golden_regression_inventory_v0', false, 'hard_fail', 0, 'invalid_domain_asset_path', {
          domain_id: domainId,
          error: err.message.slice(0, 200),
        });
      }

      if (!fs.existsSync(dir.absPath) || !fs.statSync(dir.absPath).isDirectory()) {
        return mkEvalResult('golden_regression_inventory_v0', false, 'hard_fail', 0, 'missing_domain_asset', {
          domain_id: domainId,
          expected_path: dir.relPath,
        });
      }

      const files = fs
        .readdirSync(dir.absPath)
        .filter((f) => f.toLowerCase().endsWith('.json'))
        .slice(0, 50);
      if (!files.length) {
        return mkEvalResult('golden_regression_inventory_v0', false, 'hard_fail', 0, 'no_golden_fixtures', {
          domain_id: domainId,
          expected_path: dir.relPath + '/*.json',
        });
      }

      const invCats = new Set((Array.isArray(inv?.categories) ? inv.categories : []).map((c) => normalizeText((c as any)?.name || '')).filter(Boolean));
      const invItems = new Set(
        (Array.isArray(inv?.categories) ? inv.categories : [])
          .flatMap((c) => (Array.isArray((c as any)?.items) ? (c as any).items : []))
          .map((x) => normalizeText(x))
          .filter(Boolean)
      );

      let best = 0;
      let bestFile = '';
      for (const f of files) {
        const abs = path.join(dir.absPath, f);
        let g: any;
        try {
          g = readJsonFileStrict<any>(abs);
        } catch {
          continue;
        }
        const gInv = (g && g.generated && g.generated.categories) ? (g.generated as InventorySchema) : (g as InventorySchema);
        const gCats = new Set(
          (Array.isArray(gInv?.categories) ? gInv.categories : []).map((c) => normalizeText((c as any)?.name || '')).filter(Boolean)
        );
        const gItems = new Set(
          (Array.isArray(gInv?.categories) ? gInv.categories : [])
            .flatMap((c) => (Array.isArray((c as any)?.items) ? (c as any).items : []))
            .map((x) => normalizeText(x))
            .filter(Boolean)
        );
        const catScore = jaccard(invCats, gCats);
        const itemScore = jaccard(invItems, gItems);
        const score = 0.35 * catScore + 0.65 * itemScore;
        if (score > best) {
          best = score;
          bestFile = f;
        }
      }

      const ok = best >= minScore;
      return mkEvalResult('golden_regression_inventory_v0', ok, ok ? 'info' : 'warn', best, ok ? 'ok' : 'below_min_score', {
        domain_id: domainId,
        golden_dir: dir.relPath,
        best_file: bestFile || null,
        best_score: best,
        minScore,
        fileCount: files.length,
      });
    },
  },
];

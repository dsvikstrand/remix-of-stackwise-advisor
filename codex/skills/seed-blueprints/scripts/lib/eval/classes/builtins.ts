import type { ControlPackV0 } from '../../control_pack_v0';
import type { PromptPackV0 } from '../../prompt_pack_v0';
import type { PersonaV0 } from '../../persona_v0';
import type { GeneratedBlueprint, InventorySchema } from '../../seed_types';
import { validateBlueprints } from '../../validate_blueprints';
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
];


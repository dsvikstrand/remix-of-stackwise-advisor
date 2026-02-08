import { type PersonaV0 } from './persona_v0';
import { type PromptPackV0 } from './prompt_pack_v0';

export type ControlPackV0RunType = 'seed' | 'library' | 'blueprint';

export type ControlPackV0Domain =
  | 'skincare'
  | 'fitness'
  | 'nutrition'
  | 'productivity'
  | 'sleep'
  | 'mindfulness'
  | 'supplements'
  | 'cooking'
  | 'general'
  | 'custom';
export type ControlPackV0Audience = 'beginner' | 'intermediate' | 'advanced';
export type ControlPackV0Style = 'friendly' | 'practical' | 'coach' | 'clinical';
export type ControlPackV0Strictness = 'low' | 'medium' | 'high';
export type ControlPackV0Length = 'short' | 'medium' | 'long';
export type ControlPackV0Variety = 'low' | 'medium' | 'high';
export type ControlPackV0Caution = 'conservative' | 'balanced' | 'aggressive';

export type ControlPackV0LibraryControls = {
  domain: ControlPackV0Domain;
  domain_custom?: string;
  audience: ControlPackV0Audience;
  style: ControlPackV0Style;
  strictness: ControlPackV0Strictness;
  length_hint: ControlPackV0Length;
};

export type ControlPackV0BlueprintControls = {
  focus: string;
  focus_custom?: string;
  length: ControlPackV0Length;
  strictness: ControlPackV0Strictness;
  variety: ControlPackV0Variety;
  caution: ControlPackV0Caution;
};

export type ControlPackV0Library = {
  name?: string;
  notes?: string;
  controls: ControlPackV0LibraryControls;
  tags?: string[];
};

export type ControlPackV0Blueprint = {
  name?: string;
  notes?: string;
  controls: ControlPackV0BlueprintControls;
  tags?: string[];
};

export type ControlPackV0 = {
  version: 0;
  run_type: ControlPackV0RunType;
  goal: string;
  persona_id?: string;
  library: ControlPackV0Library;
  blueprints: ControlPackV0Blueprint[];
};

function normalizeSlug(input: string) {
  return String(input || '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniq(list: string[]) {
  return Array.from(new Set(list.map((s) => String(s || '').trim()).filter(Boolean)));
}

function inferDomain(p: PersonaV0 | null, goal: string): ControlPackV0Domain {
  const t = `${(p?.safety?.domain || '').toLowerCase()} ${(p?.interests?.topics || []).join(' ').toLowerCase()} ${String(
    goal || ''
  ).toLowerCase()}`;
  if (t.includes('skincare')) return 'skincare';
  if (t.includes('sleep')) return 'sleep';
  if (t.includes('mindfulness') || t.includes('meditation') || t.includes('breath')) return 'mindfulness';
  if (t.includes('nutrition') || t.includes('diet') || t.includes('supplement')) return 'nutrition';
  if (t.includes('supplement') || t.includes('nootropic')) return 'supplements';
  if (t.includes('cooking') || t.includes('recipe') || t.includes('meal')) return 'cooking';
  if (t.includes('fitness') || t.includes('workout') || t.includes('strength')) return 'fitness';
  if (t.includes('productivity') || t.includes('planning') || t.includes('focus')) return 'productivity';
  return 'general';
}

function pickStyle(p: PersonaV0 | null): ControlPackV0Style {
  const tone = (p?.style?.tone || '').toLowerCase();
  if (tone === 'clinical') return 'clinical';
  if (tone === 'coach') return 'coach';
  if (tone === 'practical') return 'practical';
  return 'friendly';
}

function pickAudience(p: PersonaV0 | null): ControlPackV0Audience {
  const lvl = (p?.interests?.audience_level || '').toLowerCase();
  if (lvl === 'advanced') return 'advanced';
  if (lvl === 'intermediate') return 'intermediate';
  return 'beginner';
}

function pickStrictness(p: PersonaV0 | null): ControlPackV0Strictness {
  const must = (p?.constraints?.must_include || []).length;
  const avoid = (p?.constraints?.must_avoid || []).length;
  const n = must + avoid;
  if (n >= 6) return 'high';
  if (n >= 2) return 'medium';
  return 'low';
}

function focusTemplates(domain: ControlPackV0Domain): string[] {
  if (domain === 'skincare') return ['starter', 'hydration', 'weekly-reset', 'actives-lite', 'barrier-care'];
  if (domain === 'nutrition') return ['balanced-basics', 'protein-focus', 'meal-prep', 'hydration', 'gentle-cut'];
  if (domain === 'fitness') return ['strength-basics', 'hypertrophy', 'conditioning', 'mobility', 'recovery-day'];
  if (domain === 'productivity') return ['morning-focus', 'daily-plan', 'deep-work', 'evening-reset', 'weekly-review'];
  if (domain === 'sleep') return ['evening-reset', 'weekly-reset', 'starter', 'recovery', 'consistency'];
  if (domain === 'mindfulness') return ['starter', 'morning-focus', 'evening-reset', 'weekly-reset', 'consistency'];
  if (domain === 'supplements') return ['balanced-basics', 'protein-focus', 'hydration', 'starter', 'consistency'];
  if (domain === 'cooking') return ['meal-prep', 'balanced-basics', 'starter', 'weekly', 'consistency'];
  return ['starter', 'consistency', 'weekly', 'recovery', 'upgrade'];
}

export function composeControlPackV0(opts: {
  runType: ControlPackV0RunType;
  goal: string;
  persona: PersonaV0 | null;
  blueprintCount: number;
  templateOffset?: number;
}): ControlPackV0 {
  const goal = String(opts.goal || '').trim();
  if (!goal) throw new Error('composeControlPackV0: missing goal');
  const p = opts.persona;
  const domain = inferDomain(p, goal);
  const audience = pickAudience(p);
  const style = pickStyle(p);
  const strictness = pickStrictness(p);

  const blueprintCountRaw = Math.max(1, Number(opts.blueprintCount || 0) || 1);
  const offset = Math.max(0, Number(opts.templateOffset || 0) || 0);
  const focuses = focusTemplates(domain);

  const tags = uniq([
    ...(p?.interests?.tags_prefer || []),
    ...(p?.interests?.topics || []),
    domain,
    audience,
  ])
    .map(normalizeSlug)
    .filter(Boolean)
    .slice(0, 10);

  const library: ControlPackV0Library = {
    controls: {
      domain,
      audience,
      style,
      strictness,
      length_hint: 'medium',
    },
    tags,
  };

  const blueprints: ControlPackV0Blueprint[] = Array.from({ length: blueprintCountRaw }).map((_, i) => {
    const focus = focuses[(offset + i) % focuses.length] || 'starter';
    const bpTags = uniq([...tags, focus]).map(normalizeSlug).filter(Boolean).slice(0, 12);
    return {
      controls: {
        focus,
        length: 'medium',
        strictness,
        variety: 'medium',
        caution: domain === 'fitness' || domain === 'nutrition' || domain === 'skincare' ? 'balanced' : 'balanced',
      },
      tags: bpTags,
    };
  });

  return {
    version: 0,
    run_type: opts.runType,
    goal,
    ...(p ? { persona_id: p.id } : {}),
    library,
    blueprints,
  };
}

function toTitleCase(input: string) {
  const cleaned = String(input || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function focusToTitle(focus: string) {
  const map: Record<string, string> = {
    starter: 'Quick Starter',
    'strength-basics': 'Strength Basics',
    hypertrophy: 'Hypertrophy Focus',
    conditioning: 'Conditioning Sprint',
    mobility: 'Mobility and Recovery',
    'recovery-day': 'Recovery Day',
    hydration: 'Hydration Focus',
    'weekly-reset': 'Weekly Reset',
    'actives-lite': 'Actives Lite',
    'barrier-care': 'Barrier Care',
    'balanced-basics': 'Balanced Basics',
    'protein-focus': 'Protein Focus',
    'meal-prep': 'Meal Prep Plan',
    'gentle-cut': 'Gentle Cut',
    'morning-focus': 'Morning Focus Block',
    'daily-plan': 'Daily Plan',
    'deep-work': 'Deep Work Sprint',
    'evening-reset': 'Evening Reset',
    'weekly-review': 'Weekly Review',
    consistency: 'Consistency Plan',
    weekly: 'Weekend Reset',
    upgrade: 'Upgrade Path',
    recovery: 'Recovery Routine',
  };
  const key = normalizeSlug(focus);
  return map[key] || toTitleCase(key);
}

export function renderControlPackToPromptPackV0(pack: ControlPackV0, persona: PersonaV0 | null): PromptPackV0 {
  const goal = String(pack.goal || '').trim() || 'Seed';
  const domain = pack.library?.controls?.domain || inferDomain(persona, goal);
  const domainCustom =
    domain === 'custom' ? String(pack.library?.controls?.domain_custom || '').trim() : '';
  const audience = pack.library?.controls?.audience || pickAudience(persona);
  const style = pack.library?.controls?.style || pickStyle(persona);

  const baseTitle = (pack.library?.name || '').trim() || toTitleCase(goal).slice(0, 60).trim() || 'Seed Library';
  const libraryTitle = baseTitle.toLowerCase().endsWith('library') ? baseTitle : `${baseTitle} Library`;

  const libTags = uniq((pack.library?.tags || []) as string[])
    .map(normalizeSlug)
    .filter(Boolean)
    .slice(0, 10);

  const personaMustInclude = uniq((persona?.constraints?.must_include || []) as string[]);
  const personaMustAvoid = uniq((persona?.constraints?.must_avoid || []) as string[]);

  const notesParts: string[] = [];
  notesParts.push(`Mode: controls_v0`);
  notesParts.push(`Domain: ${domain}`);
  if (domain === 'custom' && domainCustom) notesParts.push(`DomainCustom: ${domainCustom}`);
  notesParts.push(`Audience: ${audience}`);
  notesParts.push(`Style: ${style}`);
  if (pack.library?.controls?.strictness) notesParts.push(`Strictness: ${pack.library.controls.strictness}`);
  if (pack.library?.controls?.length_hint) notesParts.push(`Length: ${pack.library.controls.length_hint}`);
  if (pack.library?.notes) notesParts.push(`Notes: ${String(pack.library.notes).trim()}`);
  if (personaMustInclude.length) notesParts.push(`Must include: ${personaMustInclude.join('; ')}`);
  if (personaMustAvoid.length) notesParts.push(`Avoid: ${personaMustAvoid.join('; ')}`);

  const library = {
    topic: domain === 'custom' && domainCustom ? `${domainCustom} routine` : goal,
    title: libraryTitle,
    description: `A practical library of items to support: ${goal}.`,
    notes: notesParts.filter(Boolean).join(' '),
    tags: libTags,
  };

  const blueprints = (pack.blueprints || []).map((bp) => {
    const focus = String(bp?.controls?.focus || 'starter').trim() || 'starter';
    const focusCustom =
      focus === 'custom' ? String(bp?.controls?.focus_custom || '').trim() : '';
    const bpTitle = (bp?.name || '').trim() || focusToTitle(focus);
    const bpTags = uniq([...(libTags || []), ...(((bp?.tags || []) as string[]) || []), focus])
      .map(normalizeSlug)
      .filter(Boolean)
      .slice(0, 12);
    const bpNotesParts: string[] = [];
    bpNotesParts.push(`Mode: controls_v0`);
    bpNotesParts.push(`Focus: ${focus}`);
    if (focus === 'custom' && focusCustom) bpNotesParts.push(`FocusCustom: ${focusCustom}`);
    if (bp?.controls?.length) bpNotesParts.push(`Length: ${bp.controls.length}`);
    if (bp?.controls?.strictness) bpNotesParts.push(`Strictness: ${bp.controls.strictness}`);
    if (bp?.controls?.variety) bpNotesParts.push(`Variety: ${bp.controls.variety}`);
    if (bp?.controls?.caution) bpNotesParts.push(`Caution: ${bp.controls.caution}`);
    if (bp?.notes) bpNotesParts.push(`Notes: ${String(bp.notes).trim()}`);
    const focusForText = focus === 'custom' && focusCustom ? focusCustom : focus;
    return {
      title: bpTitle,
      description: `A ${focusForText.replace(/-/g, ' ')} routine aligned with ${goal}.`,
      notes: bpNotesParts.filter(Boolean).join(' '),
      tags: bpTags,
    };
  });

  return {
    version: 0,
    run_type: pack.run_type,
    goal,
    ...(persona ? { persona_id: persona.id } : {}),
    library,
    blueprints,
  };
}

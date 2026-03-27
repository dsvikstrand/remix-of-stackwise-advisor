import type { Json } from '@/integrations/supabase/types';

export type BlueprintSectionRenderItem = {
  name: string;
};

export type BlueprintSectionRenderBlock = {
  id?: string;
  title: string;
  description: string;
  items: BlueprintSectionRenderItem[];
};

export type BlueprintSectionsV1 = {
  schema_version: 'blueprint_sections_v1';
  tags: string[];
  summary: {
    text: string;
  };
  takeaways: {
    bullets: string[];
  };
  storyline: {
    text: string;
  };
  deep_dive: {
    bullets: string[];
  };
  practical_rules: {
    bullets: string[];
  };
  open_questions: {
    bullets: string[];
  };
};

type RenderInput = {
  id?: string;
  title: string;
  description: string;
  items?: Array<{ name?: string }>;
};

function normalizeSectionKey(rawTitle: string) {
  return String(rawTitle || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isAllowedSectionKey(key: string) {
  return key === 'summary'
    || key === 'takeaways'
    || key === 'lightning takeaways'
    || key === 'bleup'
    || key === 'storyline'
    || key === 'deep dive'
    || key === 'mechanism deep dive'
    || key === 'practical rules'
    || key === 'decision rules'
    || key === 'open questions'
    || key === 'caveats';
}

function toBulletStrings(items: Array<{ name?: string }> | undefined) {
  if (!Array.isArray(items)) return [] as string[];
  return items
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean);
}

export function buildBlueprintSectionsV1FromRenderSteps(input: {
  steps: RenderInput[];
  tags?: string[];
}): BlueprintSectionsV1 | null {
  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (steps.length === 0) return null;

  const byKey = new Map<string, RenderInput>();
  for (const step of steps) {
    const key = normalizeSectionKey(step.title);
    if (!key || !isAllowedSectionKey(key) || byKey.has(key)) continue;
    byKey.set(key, step);
  }

  const summary = byKey.get('summary');
  const takeaways = byKey.get('takeaways');
  const storyline = byKey.get('bleup') || byKey.get('storyline');
  const deepDive = byKey.get('deep dive');
  const practicalRules = byKey.get('practical rules');
  const openQuestions = byKey.get('open questions') || byKey.get('caveats');

  if (!summary || !takeaways || !storyline || !deepDive || !practicalRules || !openQuestions) {
    return null;
  }

  return {
    schema_version: 'blueprint_sections_v1',
    tags: Array.isArray(input.tags)
      ? input.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
      : [],
    summary: {
      text: String(summary.description || '').trim(),
    },
    takeaways: {
      bullets: toBulletStrings(takeaways.items),
    },
    storyline: {
      text: String(storyline.description || '').trim(),
    },
    deep_dive: {
      bullets: toBulletStrings(deepDive.items),
    },
    practical_rules: {
      bullets: toBulletStrings(practicalRules.items),
    },
    open_questions: {
      bullets: toBulletStrings(openQuestions.items),
    },
  };
}

export function buildRenderBlocksFromBlueprintSections(input: BlueprintSectionsV1): BlueprintSectionRenderBlock[] {
  return [
    {
      id: 'sections-v1-summary',
      title: 'Summary',
      description: String(input.summary?.text || '').trim(),
      items: [],
    },
    {
      id: 'sections-v1-takeaways',
      title: 'Takeaways',
      description: '',
      items: (input.takeaways?.bullets || []).map((bullet) => ({ name: String(bullet || '').trim() })).filter((item) => item.name),
    },
    {
      id: 'sections-v1-storyline',
      title: 'Bleup',
      description: String(input.storyline?.text || '').trim(),
      items: [],
    },
    {
      id: 'sections-v1-deep-dive',
      title: 'Deep Dive',
      description: '',
      items: (input.deep_dive?.bullets || []).map((bullet) => ({ name: String(bullet || '').trim() })).filter((item) => item.name),
    },
    {
      id: 'sections-v1-practical-rules',
      title: 'Practical Rules',
      description: '',
      items: (input.practical_rules?.bullets || []).map((bullet) => ({ name: String(bullet || '').trim() })).filter((item) => item.name),
    },
    {
      id: 'sections-v1-open-questions',
      title: 'Caveats',
      description: '',
      items: (input.open_questions?.bullets || []).map((bullet) => ({ name: String(bullet || '').trim() })).filter((item) => item.name),
    },
  ];
}

export function parseBlueprintSectionsV1(input: Json | null | undefined): BlueprintSectionsV1 | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (String(value.schema_version || '').trim() !== 'blueprint_sections_v1') return null;

  const tags = Array.isArray(value.tags)
    ? value.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : [];

  const readTextSection = (key: string) => {
    const section = value[key];
    if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
    const text = String((section as Record<string, unknown>).text || '').trim();
    return { text };
  };

  const readBulletSection = (key: string) => {
    const section = value[key];
    if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
    const bullets = Array.isArray((section as Record<string, unknown>).bullets)
      ? ((section as Record<string, unknown>).bullets as unknown[])
          .map((bullet) => String(bullet || '').trim())
          .filter(Boolean)
      : [];
    return { bullets };
  };

  const summary = readTextSection('summary');
  const takeaways = readBulletSection('takeaways');
  const storyline = readTextSection('storyline');
  const deepDive = readBulletSection('deep_dive');
  const practicalRules = readBulletSection('practical_rules');
  const openQuestions = readBulletSection('open_questions');

  if (!summary && !takeaways && !storyline && !deepDive && !practicalRules && !openQuestions) {
    return null;
  }

  return {
    schema_version: 'blueprint_sections_v1',
    tags,
    summary: summary || { text: '' },
    takeaways: takeaways || { bullets: [] },
    storyline: storyline || { text: '' },
    deep_dive: deepDive || { bullets: [] },
    practical_rules: practicalRules || { bullets: [] },
    open_questions: openQuestions || { bullets: [] },
  };
}

export function countBlueprintSectionsV1(input: Json | null | undefined) {
  const parsed = parseBlueprintSectionsV1(input);
  if (!parsed) return 0;

  let count = 0;
  if (String(parsed.summary.text || '').trim()) count += 1;
  if (parsed.takeaways.bullets.length > 0) count += 1;
  if (String(parsed.storyline.text || '').trim()) count += 1;
  if (parsed.deep_dive.bullets.length > 0) count += 1;
  if (parsed.practical_rules.bullets.length > 0) count += 1;
  if (parsed.open_questions.bullets.length > 0) count += 1;
  return count;
}

type StoredStepItem = {
  name?: string | null;
};

type StoredStepLike = {
  title?: string | null;
  description?: string | null;
  items?: StoredStepItem[] | null;
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
    || key === 'open questions';
}

function toBulletStrings(items: StoredStepItem[] | null | undefined) {
  if (!Array.isArray(items)) return [] as string[];
  return items
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean);
}

export function buildBlueprintSectionsV1FromStoredSteps(input: {
  steps: StoredStepLike[];
  tags?: string[];
}): BlueprintSectionsV1 | null {
  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (steps.length === 0) return null;

  const byKey = new Map<string, StoredStepLike>();
  for (const step of steps) {
    const key = normalizeSectionKey(String(step?.title || ''));
    if (!key || !isAllowedSectionKey(key) || byKey.has(key)) continue;
    byKey.set(key, step);
  }

  const summary = byKey.get('summary');
  const takeaways = byKey.get('takeaways');
  const storyline = byKey.get('bleup') || byKey.get('storyline');
  const deepDive = byKey.get('deep dive');
  const practicalRules = byKey.get('practical rules');
  const openQuestions = byKey.get('open questions');

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

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

export type DraftStepLike = {
  name?: string | null;
  notes?: string | null;
  timestamp?: string | null;
};

function cleanSummaryText(raw: string) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .trim();
}

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

export function parseBlueprintSectionsV1(input: unknown): BlueprintSectionsV1 | null {
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

export function getBlueprintSummaryText(input: {
  sectionsJson?: unknown;
  steps?: unknown;
  maxChars?: number;
}) {
  const maxChars = Math.max(80, Math.min(600, Number(input.maxChars || 600)));
  const parsedSections = parseBlueprintSectionsV1(input.sectionsJson);
  const schemaSummary = cleanSummaryText(String(parsedSections?.summary.text || ''))
    .replace(/^summary\s*(—|-|:)?\s*/i, '')
    .trim();
  if (schemaSummary) {
    return schemaSummary.length <= maxChars
      ? schemaSummary
      : `${schemaSummary.slice(0, maxChars).trim()}...`;
  }

  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  const sections: Array<{ name: string; notes: string }> = [];
  for (const step of rawSteps) {
    if (!step || typeof step !== 'object') continue;
    const record = step as Record<string, unknown>;
    const name = String(record.title || record.name || '').trim();
    const notes = String(record.description || record.notes || '').trim();
    if (!name && !notes) continue;
    sections.push({ name, notes });
    if (sections.length >= 12) break;
  }
  const preferred = sections.find((section) => /^summary\b/i.test(section.name)) || sections[0] || null;
  const raw = cleanSummaryText(String(preferred?.notes || ''))
    .replace(/^summary\s*(—|-|:)?\s*/i, '')
    .trim();
  if (!raw) return '';
  return raw.length <= maxChars ? raw : `${raw.slice(0, maxChars).trim()}...`;
}

export function countBlueprintSections(input: {
  sectionsJson?: unknown;
  steps?: unknown;
}) {
  const parsedSections = parseBlueprintSectionsV1(input.sectionsJson);
  if (parsedSections) {
    let count = 0;
    if (String(parsedSections.summary.text || '').trim()) count += 1;
    if (parsedSections.takeaways.bullets.length > 0) count += 1;
    if (String(parsedSections.storyline.text || '').trim()) count += 1;
    if (parsedSections.deep_dive.bullets.length > 0) count += 1;
    if (parsedSections.practical_rules.bullets.length > 0) count += 1;
    if (parsedSections.open_questions.bullets.length > 0) count += 1;
    return count;
  }

  return Array.isArray(input.steps) ? input.steps.length : 0;
}

function formatBulletsAsNotes(items: string[]) {
  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join('\n');
}

export function buildLegacyDraftStepsFromBlueprintSections(
  input: BlueprintSectionsV1 | null | undefined,
): DraftStepLike[] {
  if (!input || input.schema_version !== 'blueprint_sections_v1') return [];

  return [
    {
      name: 'Summary',
      notes: String(input.summary?.text || '').trim(),
      timestamp: null,
    },
    {
      name: 'Takeaways',
      notes: formatBulletsAsNotes(input.takeaways?.bullets || []),
      timestamp: null,
    },
    {
      name: 'Bleup',
      notes: String(input.storyline?.text || '').trim(),
      timestamp: null,
    },
    {
      name: 'Deep Dive',
      notes: formatBulletsAsNotes(input.deep_dive?.bullets || []),
      timestamp: null,
    },
    {
      name: 'Practical Rules',
      notes: formatBulletsAsNotes(input.practical_rules?.bullets || []),
      timestamp: null,
    },
    {
      name: 'Caveats',
      notes: formatBulletsAsNotes(input.open_questions?.bullets || []),
      timestamp: null,
    },
  ].filter((step) => String(step.notes || '').trim());
}

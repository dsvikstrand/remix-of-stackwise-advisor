import type { YouTubeBlueprintResult, YouTubeDraftStep } from '../llm/types';

export type GoldenBlueprintDomain = 'deep' | 'action';

export type GoldenBlueprintFormatResult = {
  domain: GoldenBlueprintDomain;
  steps: YouTubeDraftStep[];
  summaryWordCount: number;
  tags: string[];
};

const ACTION_KEYWORDS = [
  'recipe',
  'cook',
  'cooking',
  'kitchen',
  'meal',
  'ingredient',
  'oven',
  'sausage',
  'chowder',
  'tutorial',
  'how to',
  'step by step',
  'routine',
  'prep',
  'workout',
  'exercise',
];

const DEEP_KEYWORDS = [
  'study',
  'research',
  'paper',
  'benchmark',
  'analysis',
  'evidence',
  'mechanism',
  'meta',
  'rct',
  'trial',
  'protocol',
  'model',
  'agent',
  'architecture',
];

const META_FRAMING_PATTERNS = [
  /\bthis\s+video\b/gi,
  /\bthis\s+blueprint\b/gi,
  /\bthe\s+transcript\b/gi,
];

const GENERIC_SECTION_LABELS = new Set([
  'lightning takeaways',
  'takeaways',
  'summary',
  'bleup',
  'mechanism deep dive',
  'deep dive',
  'tradeoffs',
  'decision rules',
  'practical rules',
  'open questions',
  'bottom line',
  'playbook steps',
  'fast fallbacks',
  'red flags',
  'steps',
]);

const MIN_SECTION_BULLETS = 3;
const MAX_SECTION_BULLETS = 5;
const INCOMPLETE_TAIL_WORDS = new Set([
  'and',
  'or',
  'with',
  'to',
  'for',
  'of',
  'the',
  'a',
  'an',
  'in',
  'on',
  'at',
  'by',
  'from',
  'into',
  'about',
  'via',
  'through',
  'using',
]);

const ALLOWED_GENERAL_TAGS = new Set([
  'ai',
  'software',
  'coding',
  'developer-tools',
  'productivity',
  'automation',
  'research',
  'science',
  'health',
  'nutrition',
  'supplements',
  'fitness',
  'muscle',
  'longevity',
  'recipe',
  'cooking',
  'food',
  'business',
  'finance',
  'mindset',
  'education',
  'tutorial',
  'news',
  'analysis',
]);

const BROAD_TAG_RULES: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\b(ai|artificial intelligence|llm|agent|openai|gpt|gemini|claude)\b/i, tag: 'ai' },
  { pattern: /\b(code|coding|programming|typescript|javascript|python|repo|github)\b/i, tag: 'coding' },
  { pattern: /\bsoftware|app|backend|frontend|api|deployment|architecture\b/i, tag: 'software' },
  { pattern: /\bdeveloper tool|workflow|automation|autonomous\b/i, tag: 'developer-tools' },
  { pattern: /\bproductivity|focus|workflow|efficiency\b/i, tag: 'productivity' },
  { pattern: /\bautomate|automation|pipeline\b/i, tag: 'automation' },
  { pattern: /\bresearch|study|trial|rct|paper|meta analysis|arxiv\b/i, tag: 'research' },
  { pattern: /\bscience|scientific|mechanism\b/i, tag: 'science' },
  { pattern: /\bhealth|wellness|metabolic|inflammation|blood sugar\b/i, tag: 'health' },
  { pattern: /\bnutrition|diet|macros|protein|carb|fat\b/i, tag: 'nutrition' },
  { pattern: /\bsupplement|amino|glycine|leucine|coq10|nmn|nr\b/i, tag: 'supplements' },
  { pattern: /\bfitness|workout|training|exercise\b/i, tag: 'fitness' },
  { pattern: /\bmuscle|hypertrophy|strength\b/i, tag: 'muscle' },
  { pattern: /\blongevity|aging|anti aging|lifespan\b/i, tag: 'longevity' },
  { pattern: /\brecipe|ingredients|cook|cooking|kitchen|meal\b/i, tag: 'recipe' },
  { pattern: /\bcooking|bake|fry|simmer|boil|grill\b/i, tag: 'cooking' },
  { pattern: /\bfood|dish|meal prep|flavor\b/i, tag: 'food' },
  { pattern: /\bbusiness|saas|startup|founder\b/i, tag: 'business' },
  { pattern: /\bfinance|invest|market|valuation|stock\b/i, tag: 'finance' },
  { pattern: /\bmindset|habit|discipline|motivation\b/i, tag: 'mindset' },
  { pattern: /\blearn|education|teaching|explain\b/i, tag: 'education' },
  { pattern: /\bguide|tutorial|how to|step by step\b/i, tag: 'tutorial' },
  { pattern: /\bnews|update|announcement|launch\b/i, tag: 'news' },
  { pattern: /\banalysis|breakdown|tradeoff\b/i, tag: 'analysis' },
];

function normalizeWhitespace(value: string) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripMetaFraming(value: string) {
  let next = String(value || '');
  for (const pattern of META_FRAMING_PATTERNS) {
    next = next.replace(pattern, '');
  }
  return normalizeWhitespace(next)
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function toSentences(value: string) {
  const cleaned = stripMetaFraming(value);
  if (!cleaned) return [] as string[];
  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((chunk) => normalizeWhitespace(chunk))
    .filter((chunk) => chunk.length >= 24);
}

function wordCount(value: string) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function dedupeKeepOrder(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function toSimpleTag(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function compactSentence(value: string, maxWords = 26) {
  const words = normalizeWhitespace(value).split(' ').filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ').replace(/[.,;:!?]+$/, '')}.`;
}

function normalizeHeadingKey(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/^#+\s+/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/:$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericSectionLabel(value: string) {
  const key = normalizeHeadingKey(value);
  if (!key.length) return false;
  if (GENERIC_SECTION_LABELS.has(key)) return true;
  for (const label of GENERIC_SECTION_LABELS) {
    if (
      key.startsWith(`${label}:`)
      || key.startsWith(`${label} `)
      || key.startsWith(`${label}(`)
      || key.startsWith(`${label} (`)
    ) {
      return true;
    }
  }
  return false;
}

function stripListPrefix(value: string) {
  return String(value || '')
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .trim();
}

function toSentenceCandidates(value: string) {
  const lines = String(value || '').split(/\r?\n/);
  const cleaned = lines
    .map((line) => normalizeWhitespace(stripListPrefix(line)))
    .filter(Boolean)
    .filter((line) => !isGenericSectionLabel(line))
    .join(' ');
  return toSentences(cleaned);
}

function detectDomain(draft: YouTubeBlueprintResult): GoldenBlueprintDomain {
  const corpus = [
    draft.title,
    draft.description,
    draft.notes || '',
    ...(draft.tags || []),
    ...(draft.steps || []).map((step) => `${step.name} ${step.notes}`),
  ]
    .join(' ')
    .toLowerCase();

  let actionScore = 0;
  for (const keyword of ACTION_KEYWORDS) {
    if (corpus.includes(keyword)) actionScore += 1;
  }
  let deepScore = 0;
  for (const keyword of DEEP_KEYWORDS) {
    if (corpus.includes(keyword)) deepScore += 1;
  }
  return actionScore > deepScore ? 'action' : 'deep';
}

function selectTakeawayCandidates(draft: YouTubeBlueprintResult, domain: GoldenBlueprintDomain) {
  const sentenceCandidates = dedupeKeepOrder([
    ...toSentenceCandidates(draft.description),
    ...toSentenceCandidates(draft.notes || ''),
    ...(draft.steps || []).flatMap((step) => [
      ...toSentenceCandidates(step.notes),
      ...toSentenceCandidates(step.name),
    ]),
  ])
    .map((sentence) => compactSentence(sentence, 20))
    .filter((sentence) => sentence.length >= 18)
    .filter((sentence) => !isGenericSectionLabel(sentence))
    .slice(0, 4);

  const defaults = domain === 'action'
    ? [
        'Run the sequence in order and keep adjustments small between attempts.',
        'Focus on repeatable execution signals instead of one-off perfection.',
        'Use quick fallback fixes before changing the whole approach.',
      ]
    : [
        'Focus on mechanism and evidence, not headline-level claims.',
        'Use practical decision rules instead of abstract conclusions.',
        'Treat this as a framework for tradeoffs, not a single universal rule.',
      ];

  const final = [...sentenceCandidates];
  for (const fallback of defaults) {
    if (final.length >= 4) break;
    if (!final.some((entry) => entry.toLowerCase() === fallback.toLowerCase())) {
      final.push(fallback);
    }
  }
  return final.slice(0, Math.max(3, Math.min(4, final.length)));
}

function buildSummaryParagraphs(draft: YouTubeBlueprintResult, domain: GoldenBlueprintDomain) {
  const sentencePool = dedupeKeepOrder([
    ...toSentenceCandidates(draft.description),
    ...toSentenceCandidates(draft.notes || ''),
    ...(draft.steps || []).flatMap((step) => toSentenceCandidates(step.notes)),
  ]);

  const extraDomainSentences = domain === 'action'
    ? [
        'Treat this as an execution loop: run, evaluate texture/quality signals, then adjust one variable at a time.',
        'The fastest progress comes from consistent repeats with small corrective changes, not from restarting the whole process.',
      ]
    : [
        'Treat outcomes as context-dependent and prioritize decision quality over one-dimensional headline metrics.',
        'Use this as a practical framework for action and tradeoffs instead of a universal rule that applies unchanged everywhere.',
      ];

  const selected: string[] = [];
  let idx = 0;
  while (wordCount(selected.join(' ')) < 220 && idx < sentencePool.length) {
    selected.push(sentencePool[idx]);
    idx += 1;
  }
  for (const sentence of extraDomainSentences) {
    if (wordCount(selected.join(' ')) >= 220) break;
    selected.push(sentence);
  }

  if (selected.length < 6) {
    selected.push(...extraDomainSentences);
  }

  let trimmed = [...selected];
  while (wordCount(trimmed.join(' ')) > 350 && trimmed.length > 6) {
    trimmed = trimmed.slice(0, -1);
  }
  if (wordCount(trimmed.join(' ')) < 180) {
    trimmed = dedupeKeepOrder([...trimmed, ...extraDomainSentences]);
  }

  const targetParagraphs = wordCount(trimmed.join(' ')) > 290 ? 4 : 3;
  const chunkSize = Math.max(2, Math.ceil(trimmed.length / targetParagraphs));
  const paragraphs: string[] = [];
  for (let i = 0; i < trimmed.length; i += chunkSize) {
    const paragraph = normalizeWhitespace(trimmed.slice(i, i + chunkSize).join(' '));
    if (paragraph) paragraphs.push(paragraph);
  }
  return paragraphs.slice(0, 4);
}

function buildTopSummary(summaryParagraphs: string[]) {
  const filtered = summaryParagraphs
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);
  if (filtered.length === 0) return '';
  let summary = filtered[0];
  if (wordCount(summary) < 80 && filtered[1]) {
    summary = `${summary} ${filtered[1]}`;
  }
  const words = summary.split(/\s+/).filter(Boolean);
  if (words.length > 170) {
    summary = `${words.slice(0, 170).join(' ')}.`;
  }
  return normalizeWhitespace(summary);
}

function toBulletBlock(lines: string[]) {
  return lines
    .map((line) => stripMetaFraming(line))
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join('\n');
}

function sanitizeBulletCandidate(value: string) {
  let next = stripMetaFraming(stripListPrefix(value));
  next = normalizeWhitespace(next)
    .replace(/^[\s\-*•.,;:()]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!next) return null;
  if (!/[a-z0-9]/i.test(next)) return null;
  if (/^[-.]+$/.test(next)) return null;
  if (next.length < 14) return null;
  const words = next.split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;
  if (/^(what|when|why|how)\b/i.test(next) && words.length < 5) return null;
  const lastWord = words[words.length - 1]?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  if (INCOMPLETE_TAIL_WORDS.has(lastWord)) return null;
  if (!/[.!?]$/.test(next)) next = `${next}.`;
  return next;
}

function makeWhyItMattersTail(value: string) {
  const low = value.toLowerCase();
  if (low.includes('why it matters')) return value;
  if (low.includes('use this when') || low.includes('apply this when')) return value;
  if (low.includes('this means') || low.includes('which means')) return value;
  if (low.includes('so you can')) return value;
  return `${value.replace(/[.!?]+$/, '')}. Why it matters: this changes how you decide when and how to apply it.`;
}

function normalizeBulletGroup(primary: string[], fallback: string[]) {
  const output: string[] = [];
  const pushUnique = (candidate: string | null) => {
    if (!candidate) return;
    const key = candidate.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) return;
    if (output.some((existing) => existing.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === key)) return;
    output.push(candidate);
  };

  for (const item of primary) {
    pushUnique(sanitizeBulletCandidate(item));
    if (output.length >= MAX_SECTION_BULLETS) break;
  }
  for (const item of fallback) {
    if (output.length >= MAX_SECTION_BULLETS) break;
    pushUnique(sanitizeBulletCandidate(item));
  }
  return output.slice(0, Math.max(MIN_SECTION_BULLETS, Math.min(MAX_SECTION_BULLETS, output.length)));
}

function toGuidedBullet(value: string) {
  const sanitized = sanitizeBulletCandidate(value);
  if (!sanitized) return null;
  return sanitizeBulletCandidate(makeWhyItMattersTail(sanitized));
}

function normalizeGuidedBulletGroup(primary: string[], fallback: string[]) {
  const guidedPrimary = primary
    .map((item) => toGuidedBullet(item))
    .filter((item): item is string => Boolean(item));
  const guidedFallback = fallback
    .map((item) => toGuidedBullet(item))
    .filter((item): item is string => Boolean(item));
  return normalizeBulletGroup(guidedPrimary, guidedFallback);
}

function chooseGeneralTags(draft: YouTubeBlueprintResult, domain: GoldenBlueprintDomain) {
  const corpus = [
    draft.title,
    draft.description,
    draft.notes || '',
    ...(draft.tags || []),
    ...(draft.steps || []).flatMap((step) => [step.name, step.notes]),
  ]
    .join(' ')
    .toLowerCase();

  const selected: string[] = [];
  const add = (tag: string) => {
    if (selected.length >= 5) return;
    if (!ALLOWED_GENERAL_TAGS.has(tag)) return;
    if (selected.includes(tag)) return;
    selected.push(tag);
  };

  for (const rule of BROAD_TAG_RULES) {
    if (rule.pattern.test(corpus)) add(rule.tag);
  }

  for (const rawTag of draft.tags || []) {
    const simple = toSimpleTag(rawTag);
    if (ALLOWED_GENERAL_TAGS.has(simple)) add(simple);
  }

  if (selected.length === 0) {
    if (domain === 'deep') {
      add('research');
      add('analysis');
    } else {
      add('tutorial');
      add('productivity');
    }
  }

  return selected.slice(0, 5);
}

function buildDeepSections(draft: YouTubeBlueprintResult) {
  const mechanismCandidates = dedupeKeepOrder(
    (draft.steps || [])
      .slice(0, 8)
      .map((step) => {
        if (isGenericSectionLabel(step.name)) return '';
        const note = compactSentence(step.notes, 28);
        if (!note) return '';
        return `${stripMetaFraming(step.name)}: ${note}`;
      })
      .filter(Boolean),
  );
  const mechanismBullets = normalizeGuidedBulletGroup(
    mechanismCandidates,
    [
      'Functional outcomes can improve even when headline metrics move slowly.',
      'Timing and protocol context often drive most of the measurable effect.',
      'Baseline behavior quality changes the size of incremental gains.',
      'Meaningful gains often come from consistency rather than one-off optimization.',
    ],
  );

  return [
    {
      name: 'Deep Dive',
      notes: toBulletBlock(mechanismBullets),
      timestamp: null,
    },
    {
      name: 'Tradeoffs',
      notes: toBulletBlock(
        normalizeGuidedBulletGroup(
          [
            'Upside: clearer decision quality and better maintenance-oriented outcomes.',
            'Constraint: this is not a one-variable shortcut.',
            'Unknown: effect size can vary by baseline quality and adherence.',
          ],
          [
            'Upside and constraints should be evaluated against baseline habits.',
            'Unknowns usually come from adherence differences, not only mechanism quality.',
          ],
        ),
      ),
      timestamp: null,
    },
    {
      name: 'Practical Rules',
      notes: toBulletBlock(
        normalizeGuidedBulletGroup(
          [
            'Use this when long-term function and consistency are the main goals.',
            'Pair the protocol with strong fundamentals before expecting outsized gains.',
            'Avoid treating the approach as universal across every context.',
          ],
          [
            'Apply this as a repeatable framework, then adjust based on measured response.',
            'Use one-variable changes between cycles so signal remains interpretable.',
          ],
        ),
      ),
      timestamp: null,
    },
    {
      name: 'Open Questions',
      notes: toBulletBlock(
        normalizeGuidedBulletGroup(
          [
            'Which contexts produce the strongest repeatable outcomes?',
            'How much of the effect depends on baseline quality and consistency?',
            'Where does incremental value flatten for advanced users?',
          ],
          [
            'What minimum viable protocol still delivers useful outcomes?',
            'Which early signals reliably predict long-term benefit?',
          ],
        ),
      ),
      timestamp: null,
    },
  ] satisfies YouTubeDraftStep[];
}

function buildActionSections(draft: YouTubeBlueprintResult) {
  const stepBullets = dedupeKeepOrder(
    (draft.steps || [])
      .map((step) => stripMetaFraming(step.name))
      .filter((name) => name.length >= 10)
      .filter((name) => !isGenericSectionLabel(name))
      .map((name) => compactSentence(name, 14))
      .filter(Boolean),
  ).slice(0, 6);

  return [
    {
      name: 'Playbook Steps',
      notes: toBulletBlock(
        normalizeGuidedBulletGroup(
          stepBullets,
          [
            'Set up the minimum ingredients/tools first.',
            'Run the core sequence in order.',
            'Check quality signals before final adjustments.',
            'Make one change at a time between attempts.',
          ],
        ),
      ),
      timestamp: null,
    },
    {
      name: 'Fast Fallbacks',
      notes: toBulletBlock(
        normalizeGuidedBulletGroup(
          [
            'If output is too heavy, reduce one intensity variable first.',
            'If output is too light, extend the core processing window.',
            'If flavor/signal is flat, adjust in small increments and retest.',
          ],
          [
            'Use a single fallback per run so you can isolate what changed.',
          ],
        ),
      ),
      timestamp: null,
    },
    {
      name: 'Red Flags',
      notes: toBulletBlock(
        normalizeGuidedBulletGroup(
          [
            'Core texture or quality signal breaks early in the flow.',
            'Adjustments are stacked all at once and hide root cause.',
            'Final output looks complete but misses the intended payoff.',
          ],
          [
            'Large late-stage corrections usually indicate upstream sequence drift.',
          ],
        ),
      ),
      timestamp: null,
    },
    {
      name: 'Bottom Line',
      notes: 'Run the sequence consistently, measure the right signals, and iterate with small controlled adjustments.',
      timestamp: null,
    },
  ] satisfies YouTubeDraftStep[];
}

export function normalizeYouTubeDraftToGoldenV1(draft: YouTubeBlueprintResult): GoldenBlueprintFormatResult {
  const domain = detectDomain(draft);
  const takeaways = selectTakeawayCandidates(draft, domain);
  const summaryParagraphs = buildSummaryParagraphs(draft, domain);
  const topSummary = buildTopSummary(summaryParagraphs);
  const tags = chooseGeneralTags(draft, domain);

  const steps: YouTubeDraftStep[] = [
    {
      name: 'Summary',
      notes: topSummary || summaryParagraphs[0] || '',
      timestamp: null,
    },
    {
      name: 'Takeaways',
      notes: toBulletBlock(takeaways),
      timestamp: null,
    },
    {
      name: 'Bleup',
      notes: summaryParagraphs.join('\n\n'),
      timestamp: null,
    },
    ...(domain === 'deep' ? buildDeepSections(draft) : buildActionSections(draft)),
  ];

  return {
    domain,
    steps,
    summaryWordCount: wordCount(summaryParagraphs.join(' ')),
    tags,
  };
}

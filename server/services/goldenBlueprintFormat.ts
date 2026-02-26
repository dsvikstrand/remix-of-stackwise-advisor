import type { YouTubeBlueprintResult, YouTubeDraftStep } from '../llm/types';

export type GoldenBlueprintDomain = 'deep' | 'action';

export type GoldenBlueprintFormatResult = {
  domain: GoldenBlueprintDomain;
  steps: YouTubeDraftStep[];
  summaryWordCount: number;
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
  return key.length > 0 && GENERIC_SECTION_LABELS.has(key);
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

function toBulletBlock(lines: string[]) {
  return lines
    .map((line) => stripMetaFraming(line))
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join('\n');
}

function buildDeepSections(draft: YouTubeBlueprintResult) {
  const mechanismBullets = dedupeKeepOrder(
    (draft.steps || [])
      .slice(0, 4)
      .map((step) => {
        if (isGenericSectionLabel(step.name)) return '';
        const note = compactSentence(step.notes, 28);
        if (!note) return '';
        return `${stripMetaFraming(step.name)}: ${note}`;
      })
      .filter(Boolean),
  ).slice(0, 4);

  return [
    {
      name: 'Deep Dive',
      notes: toBulletBlock(
        mechanismBullets.length > 0
          ? mechanismBullets
          : [
              'Functional outcomes can improve even when headline metrics move slowly.',
              'Timing and protocol context often drive most of the measurable effect.',
              'Baseline behavior quality changes the size of incremental gains.',
            ],
      ),
      timestamp: null,
    },
    {
      name: 'Tradeoffs',
      notes: toBulletBlock([
        'Upside: clearer decision quality and better maintenance-oriented outcomes.',
        'Constraint: this is not a one-variable shortcut.',
        'Unknown: effect size can vary by baseline quality and adherence.',
      ]),
      timestamp: null,
    },
    {
      name: 'Practical Rules',
      notes: toBulletBlock([
        'Use this when long-term function and consistency are the main goals.',
        'Pair the protocol with strong fundamentals before expecting outsized gains.',
        'Avoid treating the approach as universal across every context.',
      ]),
      timestamp: null,
    },
    {
      name: 'Bottom Line',
      notes: 'Use this as a practical framework for mechanism, tradeoffs, and decisions, then adapt to your own context.',
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
        stepBullets.length > 0
          ? stepBullets
          : [
              'Set up the minimum ingredients/tools first.',
              'Run the core sequence in order.',
              'Check quality signals before final adjustments.',
              'Make one change at a time between attempts.',
            ],
      ),
      timestamp: null,
    },
    {
      name: 'Fast Fallbacks',
      notes: toBulletBlock([
        'If output is too heavy, reduce one intensity variable first.',
        'If output is too light, extend the core processing window.',
        'If flavor/signal is flat, adjust in small increments and retest.',
      ]),
      timestamp: null,
    },
    {
      name: 'Red Flags',
      notes: toBulletBlock([
        'Core texture or quality signal breaks early in the flow.',
        'Adjustments are stacked all at once and hide root cause.',
        'Final output looks complete but misses the intended payoff.',
      ]),
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

  const steps: YouTubeDraftStep[] = [
    {
      name: 'Takeaways',
      notes: toBulletBlock(takeaways),
      timestamp: null,
    },
    {
      name: 'Summary',
      notes: summaryParagraphs.join('\n\n'),
      timestamp: null,
    },
    ...(domain === 'deep' ? buildDeepSections(draft) : buildActionSections(draft)),
  ];

  return {
    domain,
    steps,
    summaryWordCount: wordCount(summaryParagraphs.join(' ')),
  };
}

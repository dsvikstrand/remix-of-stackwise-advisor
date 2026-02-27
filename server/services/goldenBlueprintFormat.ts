import type { YouTubeBlueprintResult, YouTubeDraftStep } from '../llm/types';

export type GoldenBlueprintDomain = 'deep' | 'action';

export type GoldenBlueprintFormatResult = {
  domain: GoldenBlueprintDomain;
  steps: YouTubeDraftStep[];
  summaryWordCount: number;
  tags: string[];
  structureGate: GoldenStructureGateResult;
  qualityGate: GoldenQualityGateResult;
};

export type GoldenStructureGateResult = {
  ok: boolean;
  issues: string[];
};

export type GoldenQualityGateIssue = {
  code: string;
  section?: string;
  detail?: string;
};

export type GoldenQualityGateResult = {
  ok: boolean;
  issues: string[];
  detail: GoldenQualityGateIssue[];
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
const MIN_TAKEAWAYS_BULLETS = 3;
const MAX_TAKEAWAYS_BULLETS = 4;
const REPETITION_TRIGRAM_SECTION_THRESHOLD = 0.14;
const REPETITION_TRIGRAM_GLOBAL_THRESHOLD = 0.10;
const DUPLICATE_SENTENCE_REUSE_THRESHOLD = 3;
const BOILERPLATE_TAIL_PATTERN = /why it matters:\s*this changes how you decide when and how to apply it\.?/gi;
const MECHANISM_TERMS = new Set([
  'mechanism',
  'pathway',
  'receptor',
  'membrane',
  'mitochondria',
  'mitochondrial',
  'signal',
  'signaling',
  'hormone',
  'metabolic',
  'enzyme',
  'oxidative',
  'inflammation',
  'electrolyte',
  'neuro',
  'gaba',
  'detox',
]);
const CONTEXT_TERMS = new Set([
  'if',
  'when',
  'unless',
  'context',
  'depends',
  'under',
  'with',
  'without',
  'while',
  'versus',
  'based',
  'because',
  'given',
  'where',
]);
const GENERIC_BULLET_PATTERNS = [
  /\b(improves?|improved|improvement)\s+(outcomes?|results?)\b/i,
  /\b(helps?|supports?)\s+(consistency|performance|recovery|goals?)\b/i,
];
const STOPWORDS = new Set([
  'the', 'and', 'that', 'with', 'from', 'into', 'this', 'your', 'about', 'have', 'will', 'their', 'there',
  'which', 'would', 'could', 'should', 'what', 'when', 'where', 'while', 'because', 'than', 'then', 'them',
  'they', 'these', 'those', 'just', 'more', 'most', 'very', 'much', 'many', 'some', 'such', 'only', 'over',
  'under', 'after', 'before', 'also', 'using', 'used', 'use', 'like', 'make', 'made', 'into', 'onto', 'across',
  'between', 'through', 'around', 'about', 'other', 'each', 'both', 'same', 'here', 'there', 'video', 'blueprint',
]);
const REQUIRED_GOLDEN_SECTION_ORDER = [
  'Summary',
  'Takeaways',
  'Bleup',
  'Deep Dive',
  'Tradeoffs',
  'Practical Rules',
  'Open Questions',
] as const;
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

function parseBulletLines(notes: string) {
  return String(notes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^[-*•]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
      return match ? match[1].trim() : '';
    })
    .map((line) => sanitizeBulletCandidate(line))
    .filter((line): line is string => Boolean(line));
}

function parseLooseBulletLines(notes: string) {
  return String(notes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^[-*•]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
      return match ? stripMetaFraming(stripListPrefix(match[1])) : '';
    })
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 10)
    .filter((line) => !isGenericSectionLabel(line));
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
  return value;
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

function tokenizeWords(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSentenceKey(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectSectionText(step: YouTubeDraftStep) {
  const bullets = parseBulletLines(step.notes || '');
  const looseBullets = parseLooseBulletLines(step.notes || '');
  const text = normalizeWhitespace(String(step.notes || ''));
  return { bullets, looseBullets, text };
}

function isGate2ScopeSection(sectionName: string) {
  const normalized = normalizeWhitespace(sectionName);
  return normalized !== 'Summary';
}

function trigramRepetitionRatio(value: string) {
  const tokens = tokenizeWords(value);
  if (tokens.length < 3) return 0;
  const total = tokens.length - 2;
  const counts = new Map<string, number>();
  for (let i = 0; i < tokens.length - 2; i += 1) {
    const key = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let repeated = 0;
  for (const count of counts.values()) {
    if (count > 1) repeated += count - 1;
  }
  return total > 0 ? repeated / total : 0;
}

function extractDomainEntities(input: { transcript?: string; title?: string; description?: string; tags?: string[] }) {
  const combined = [
    input.title || '',
    input.description || '',
    ...(input.tags || []),
    input.transcript || '',
  ].join(' ');
  const tokens = tokenizeWords(combined).filter((token) => token.length >= 4 && !STOPWORDS.has(token));
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([token]) => token),
  );
}

function hasSpecificityAnchor(
  bullet: string,
  context: { domainEntities: Set<string> },
) {
  const text = String(bullet || '');
  if (/\b\d+([.:x-]\d+)?\b/.test(text)) return true;
  const tokens = tokenizeWords(text);
  const mechanismHits = tokens.filter((token) => MECHANISM_TERMS.has(token)).length;
  const contextHits = tokens.filter((token) => CONTEXT_TERMS.has(token)).length;
  const entityHits = tokens.filter((token) => context.domainEntities.has(token)).length;
  return mechanismHits + contextHits + entityHits >= 2;
}

function isGenericBulletWithoutContext(
  bullet: string,
  context: { domainEntities: Set<string> },
) {
  const text = String(bullet || '').trim();
  if (!text) return false;
  const generic = GENERIC_BULLET_PATTERNS.some((pattern) => pattern.test(text));
  if (!generic) return false;
  return !hasSpecificityAnchor(text, context);
}

function dedupeSentencesKeepOrder(value: string) {
  const sentences = toSentences(value);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sentence of sentences) {
    const key = normalizeSentenceKey(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(sentence);
  }
  return out.join(' ');
}

export function evaluateGoldenQuality(input: {
  steps: YouTubeDraftStep[];
  transcript?: string;
  title?: string;
  description?: string;
  tags?: string[];
}): GoldenQualityGateResult {
  const issues: GoldenQualityGateIssue[] = [];
  const steps = input.steps || [];
  const context = {
    domainEntities: extractDomainEntities({
      transcript: input.transcript,
      title: input.title,
      description: input.description,
      tags: input.tags,
    }),
  };
  const sectionMap = new Map<string, { bullets: string[]; looseBullets: string[]; text: string }>();
  for (const step of steps) {
    sectionMap.set(normalizeWhitespace(step.name), collectSectionText(step));
  }
  const gate2ScopeSteps = steps.filter((step) => isGate2ScopeSection(step.name));

  for (const step of gate2ScopeSteps) {
    const section = normalizeWhitespace(step.name);
    const text = sectionMap.get(section)?.text || '';
    const sectionRatio = trigramRepetitionRatio(text);
    if (sectionRatio > REPETITION_TRIGRAM_SECTION_THRESHOLD) {
      issues.push({
        code: 'REPETITION_TRIGRAM_SECTION',
        section,
        detail: `ratio=${sectionRatio.toFixed(3)}`,
      });
    }
  }

  const globalText = gate2ScopeSteps.map((step) => sectionMap.get(normalizeWhitespace(step.name))?.text || '').join('\n');
  const globalRatio = trigramRepetitionRatio(globalText);
  if (globalRatio > REPETITION_TRIGRAM_GLOBAL_THRESHOLD) {
    issues.push({
      code: 'REPETITION_TRIGRAM_GLOBAL',
      detail: `ratio=${globalRatio.toFixed(3)}`,
    });
  }

  const sentenceSectionMap = new Map<string, Set<string>>();
  for (const step of gate2ScopeSteps) {
    const section = normalizeWhitespace(step.name);
    const payload = sectionMap.get(section);
    if (!payload) continue;
    const sentenceCandidates = [
      ...toSentences(payload.text),
      ...payload.looseBullets,
    ];
    for (const sentence of sentenceCandidates) {
      const key = normalizeSentenceKey(sentence);
      if (!key || key.length < 14) continue;
      if (!sentenceSectionMap.has(key)) sentenceSectionMap.set(key, new Set());
      sentenceSectionMap.get(key)?.add(section);
    }
  }
  const duplicateAcrossSections = Array.from(sentenceSectionMap.values())
    .filter((set) => set.size > 1)
    .reduce((sum, set) => sum + (set.size - 1), 0);
  if (duplicateAcrossSections >= DUPLICATE_SENTENCE_REUSE_THRESHOLD) {
    issues.push({
      code: 'DUPLICATE_SENTENCES_ACROSS_SECTIONS',
      detail: `count=${duplicateAcrossSections}`,
    });
  }

  for (const step of gate2ScopeSteps) {
    const section = normalizeWhitespace(step.name);
    const bullets = sectionMap.get(section)?.looseBullets || [];
    const boilerplateCount = bullets
      .map((line) => (line.match(BOILERPLATE_TAIL_PATTERN) || []).length)
      .reduce((sum, count) => sum + count, 0);
    if (boilerplateCount >= 2) {
      issues.push({
        code: 'BOILERPLATE_REPEATED',
        section,
        detail: `count=${boilerplateCount}`,
      });
    }
  }

  const minSpecificityBySection = new Map<string, number>([
    ['Takeaways', 1],
    ['Deep Dive', 2],
    ['Tradeoffs', 1],
    ['Practical Rules', 1],
  ]);
  for (const [section, minCount] of minSpecificityBySection.entries()) {
    const payload = sectionMap.get(section);
    if (!payload) continue;
    const tokens = tokenizeWords(payload.text);
    const mechanismHits = tokens.filter((token) => MECHANISM_TERMS.has(token)).length;
    const contextHits = tokens.filter((token) => CONTEXT_TERMS.has(token)).length;
    const entityHits = tokens.filter((token) => context.domainEntities.has(token)).length;
    const score = mechanismHits + contextHits + entityHits;
    if (score < minCount) {
      issues.push({
        code: 'SPECIFICITY_LOW',
        section,
        detail: `score=${score},min=${minCount}`,
      });
    }
  }

  for (const step of steps) {
    const section = normalizeWhitespace(step.name);
    const bullets = sectionMap.get(section)?.looseBullets || [];
    bullets.forEach((bullet, idx) => {
      if (isGenericBulletWithoutContext(bullet, context)) {
        issues.push({
          code: 'GENERIC_BULLET_NO_CONTEXT',
          section,
          detail: `bullet_index=${idx + 1}`,
        });
      }
    });
  }

  const uniqueKey = (issue: GoldenQualityGateIssue) => `${issue.code}::${issue.section || ''}::${issue.detail || ''}`;
  const deduped: GoldenQualityGateIssue[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const key = uniqueKey(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }

  return {
    ok: deduped.length === 0,
    issues: deduped.map((issue) => issue.code),
    detail: deduped,
  };
}

export function validateGoldenStructure(steps: YouTubeDraftStep[]): GoldenStructureGateResult {
  const issues: string[] = [];
  const titles = (steps || []).map((step) => normalizeWhitespace(step?.name || ''));
  const expected = [...REQUIRED_GOLDEN_SECTION_ORDER];
  if (titles.length !== expected.length || titles.some((title, idx) => title !== expected[idx])) {
    issues.push('SECTION_ORDER_MISMATCH');
  }

  const byName = new Map((steps || []).map((step) => [normalizeWhitespace(step?.name || ''), step]));
  const summary = normalizeWhitespace(byName.get('Summary')?.notes || '');
  if (!summary) issues.push('SUMMARY_EMPTY');

  const bleup = normalizeWhitespace(byName.get('Bleup')?.notes || '');
  if (!bleup) issues.push('BLEUP_EMPTY');

  const takeawaysCount = parseBulletLines(byName.get('Takeaways')?.notes || '').length;
  if (takeawaysCount < MIN_TAKEAWAYS_BULLETS || takeawaysCount > MAX_TAKEAWAYS_BULLETS) {
    issues.push('TAKEAWAYS_BULLET_COUNT');
  }

  for (const sectionName of ['Deep Dive', 'Tradeoffs', 'Practical Rules', 'Open Questions']) {
    const count = parseBulletLines(byName.get(sectionName)?.notes || '').length;
    if (count < MIN_SECTION_BULLETS || count > MAX_SECTION_BULLETS) {
      issues.push(`${sectionName.toUpperCase().replace(/\s+/g, '_')}_BULLET_COUNT`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function normalizeBulletSection(
  notes: string,
  fallbackNotes: string,
  minBullets: number,
  maxBullets: number,
) {
  const existing = parseBulletLines(notes);
  const fallback = parseBulletLines(fallbackNotes);
  const merged = dedupeKeepOrder([...existing, ...fallback]).slice(0, maxBullets);
  const filled = [...merged];
  let idx = 0;
  while (filled.length < minBullets && idx < fallback.length) {
    const candidate = fallback[idx];
    idx += 1;
    if (!filled.includes(candidate)) filled.push(candidate);
  }
  return toBulletBlock(filled.slice(0, maxBullets));
}

function repairGoldenStructure(
  steps: YouTubeDraftStep[],
  input: {
    summaryFallback: string;
    takeawaysFallback: string;
    bleupFallback: string;
    deepFallbackByName: Map<string, string>;
  },
): YouTubeDraftStep[] {
  const byName = new Map((steps || []).map((step) => [normalizeWhitespace(step?.name || ''), step]));
  const summary = normalizeWhitespace(byName.get('Summary')?.notes || '') || input.summaryFallback;
  const bleup = normalizeWhitespace(byName.get('Bleup')?.notes || '') || input.bleupFallback;
  const takeaways = normalizeBulletSection(
    byName.get('Takeaways')?.notes || '',
    input.takeawaysFallback,
    MIN_TAKEAWAYS_BULLETS,
    MAX_TAKEAWAYS_BULLETS,
  );

  const fixedDeep = ['Deep Dive', 'Tradeoffs', 'Practical Rules', 'Open Questions'].map((sectionName) => {
    const normalized = normalizeBulletSection(
      byName.get(sectionName)?.notes || '',
      input.deepFallbackByName.get(sectionName) || '',
      MIN_SECTION_BULLETS,
      MAX_SECTION_BULLETS,
    );
    return {
      name: sectionName,
      notes: normalized,
      timestamp: null,
    } satisfies YouTubeDraftStep;
  });

  return [
    { name: 'Summary', notes: summary, timestamp: null },
    { name: 'Takeaways', notes: takeaways, timestamp: null },
    { name: 'Bleup', notes: bleup, timestamp: null },
    ...fixedDeep,
  ];
}

function stripBoilerplateTail(value: string) {
  return normalizeWhitespace(String(value || '').replace(BOILERPLATE_TAIL_PATTERN, ''));
}

function repairGoldenQuality(
  steps: YouTubeDraftStep[],
  input: {
    fallbackByName: Map<string, string>;
    transcript?: string;
    title?: string;
    description?: string;
    tags?: string[];
  },
): YouTubeDraftStep[] {
  const byName = new Map((steps || []).map((step) => [normalizeWhitespace(step.name), step]));
  const context = {
    domainEntities: extractDomainEntities({
      transcript: input.transcript,
      title: input.title,
      description: input.description,
      tags: input.tags,
    }),
  };

  const seenSentenceKeys = new Set<string>();
  const rememberSentence = (value: string) => {
    const key = normalizeSentenceKey(value);
    if (!key) return false;
    if (seenSentenceKeys.has(key)) return false;
    seenSentenceKeys.add(key);
    return true;
  };
  const rememberBlockSentences = (value: string) => {
    for (const sentence of toSentences(value)) {
      rememberSentence(sentence);
    }
  };

  const globalBulletSeen = new Set<string>();
  const normalizeSectionBullets = (sectionName: string, min: number, max: number) => {
    const current = parseBulletLines(byName.get(sectionName)?.notes || '');
    const fallback = parseBulletLines(input.fallbackByName.get(sectionName) || '');
    const cleanedCurrent = current
      .map((line) => stripBoilerplateTail(line))
      .map((line) => sanitizeBulletCandidate(line))
      .filter((line): line is string => Boolean(line))
      .filter((line) => !isGenericBulletWithoutContext(line, context));
    const cleanedFallback = fallback
      .map((line) => stripBoilerplateTail(line))
      .map((line) => sanitizeBulletCandidate(line))
      .filter((line): line is string => Boolean(line))
      .filter((line) => !isGenericBulletWithoutContext(line, context));
    const relaxedFallback = fallback
      .map((line) => stripBoilerplateTail(line))
      .map((line) => sanitizeBulletCandidate(line))
      .filter((line): line is string => Boolean(line));
    const merged: string[] = [];
    const pushUnique = (candidate: string) => {
      const bulletKey = normalizeSentenceKey(candidate);
      if (!bulletKey || globalBulletSeen.has(bulletKey) || seenSentenceKeys.has(bulletKey)) return false;
      globalBulletSeen.add(bulletKey);
      seenSentenceKeys.add(bulletKey);
      merged.push(candidate);
      return true;
    };
    for (const candidate of [...cleanedCurrent, ...cleanedFallback]) {
      pushUnique(candidate);
      if (merged.length >= max) break;
    }
    let idx = 0;
    while (merged.length < min && idx < cleanedFallback.length) {
      const candidate = cleanedFallback[idx];
      idx += 1;
      pushUnique(candidate);
    }
    let relaxedIdx = 0;
    while (merged.length < min && relaxedIdx < relaxedFallback.length) {
      const candidate = relaxedFallback[relaxedIdx];
      relaxedIdx += 1;
      pushUnique(candidate);
    }
    // Final fallback: keep section structurally valid even if uniqueness budget is exhausted.
    let finalIdx = 0;
    while (merged.length < min && finalIdx < relaxedFallback.length) {
      const candidate = relaxedFallback[finalIdx];
      finalIdx += 1;
      const key = normalizeSentenceKey(candidate);
      if (!key || globalBulletSeen.has(key)) continue;
      globalBulletSeen.add(key);
      merged.push(candidate);
    }
    return toBulletBlock(merged.slice(0, max));
  };

  const summaryFallback = normalizeWhitespace(input.description || input.title || '');
  const summarySource = stripBoilerplateTail(
    byName.get('Summary')?.notes || summaryFallback || '',
  );
  const summarySentences = dedupeKeepOrder(toSentences(summarySource));
  const uniqueSummary = summarySentences.filter((sentence) => rememberSentence(sentence));
  const summary = normalizeWhitespace(uniqueSummary.join(' ')) || dedupeSentencesKeepOrder(summarySource) || summaryFallback;
  rememberBlockSentences(summary);

  const bleupFallback = normalizeWhitespace(input.description || summary || '');
  const bleupSource = stripBoilerplateTail(byName.get('Bleup')?.notes || bleupFallback || '');
  const bleupCandidates = dedupeKeepOrder([
    ...toSentences(bleupSource),
    ...toSentences(bleupFallback),
  ]);
  const uniqueBleup = bleupCandidates.filter((sentence) => rememberSentence(sentence));
  const bleup = normalizeWhitespace(uniqueBleup.join(' ')) || dedupeSentencesKeepOrder(bleupSource) || bleupFallback;
  rememberBlockSentences(bleup);

  return [
    {
      name: 'Summary',
      notes: summary,
      timestamp: null,
    },
    {
      name: 'Takeaways',
      notes: normalizeSectionBullets('Takeaways', MIN_TAKEAWAYS_BULLETS, MAX_TAKEAWAYS_BULLETS),
      timestamp: null,
    },
    {
      name: 'Bleup',
      notes: bleup,
      timestamp: null,
    },
    {
      name: 'Deep Dive',
      notes: normalizeSectionBullets('Deep Dive', MIN_SECTION_BULLETS, MAX_SECTION_BULLETS),
      timestamp: null,
    },
    {
      name: 'Tradeoffs',
      notes: normalizeSectionBullets('Tradeoffs', MIN_SECTION_BULLETS, MAX_SECTION_BULLETS),
      timestamp: null,
    },
    {
      name: 'Practical Rules',
      notes: normalizeSectionBullets('Practical Rules', MIN_SECTION_BULLETS, MAX_SECTION_BULLETS),
      timestamp: null,
    },
    {
      name: 'Open Questions',
      notes: normalizeSectionBullets('Open Questions', MIN_SECTION_BULLETS, MAX_SECTION_BULLETS),
      timestamp: null,
    },
  ] satisfies YouTubeDraftStep[];
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

export function normalizeYouTubeDraftToGoldenV1(
  draft: YouTubeBlueprintResult,
  options?: {
    repairQuality?: boolean;
    transcript?: string;
  },
): GoldenBlueprintFormatResult {
  // Golden BP v1 is currently locked to the deep/research section template.
  const domain: GoldenBlueprintDomain = 'deep';
  const takeaways = selectTakeawayCandidates(draft, domain);
  const summaryParagraphs = buildSummaryParagraphs(draft, domain);
  const topSummary = buildTopSummary(summaryParagraphs);
  const tags = chooseGeneralTags(draft, domain);
  const deepSections = buildDeepSections(draft);
  const deepFallbackByName = new Map(deepSections.map((step) => [step.name, step.notes]));

  const initialSteps: YouTubeDraftStep[] = [
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
    ...deepSections,
  ];

  let steps = initialSteps;
  let structureGate = validateGoldenStructure(steps);
  if (!structureGate.ok) {
    steps = repairGoldenStructure(steps, {
      summaryFallback: topSummary || summaryParagraphs[0] || '',
      takeawaysFallback: toBulletBlock(takeaways),
      bleupFallback: summaryParagraphs.join('\n\n'),
      deepFallbackByName,
    });
    structureGate = validateGoldenStructure(steps);
  }

  let qualityGate = evaluateGoldenQuality({
    steps,
    transcript: options?.transcript,
    title: draft.title,
    description: draft.description,
    tags: draft.tags || [],
  });
  if (!qualityGate.ok && options?.repairQuality !== false) {
    steps = repairGoldenQuality(steps, {
      fallbackByName: new Map([
        ['Takeaways', toBulletBlock(takeaways)],
        ['Deep Dive', deepFallbackByName.get('Deep Dive') || ''],
        ['Tradeoffs', deepFallbackByName.get('Tradeoffs') || ''],
        ['Practical Rules', deepFallbackByName.get('Practical Rules') || ''],
        ['Open Questions', deepFallbackByName.get('Open Questions') || ''],
      ]),
      transcript: options?.transcript,
      title: draft.title,
      description: draft.description,
      tags: draft.tags || [],
    });
    structureGate = validateGoldenStructure(steps);
    qualityGate = evaluateGoldenQuality({
      steps,
      transcript: options?.transcript,
      title: draft.title,
      description: draft.description,
      tags: draft.tags || [],
    });
  }

  return {
    domain,
    steps,
    summaryWordCount: wordCount(summaryParagraphs.join(' ')),
    tags,
    structureGate,
    qualityGate,
  };
}

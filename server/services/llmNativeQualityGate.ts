import type { BlueprintSectionsV1 } from './blueprintSections';

export type LlmNativeGateResult = {
  pass: boolean;
  issues: string[];
  issueDetails: string[];
};

type LlmNativeDraft = {
  sectionsJson: BlueprintSectionsV1 | null;
};

const SOFT_LLM_NATIVE_ISSUES = new Set([
  'TAKEAWAYS_TOO_LONG',
  'OPEN_QUESTIONS_NOT_QUESTIONS',
]);

function sentenceCount(value: string) {
  const sentences = String(value || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return sentences.length === 0 && String(value || '').trim() ? 1 : sentences.length;
}

function wordCount(value: string) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeSummaryVariantText(value: unknown) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function evaluateLlmNativeGate(draft: LlmNativeDraft): LlmNativeGateResult {
  if (!draft.sectionsJson || draft.sectionsJson.schema_version !== 'blueprint_sections_v1') {
    return {
      pass: false,
      issues: ['CANONICAL_SECTIONS_MISSING'],
      issueDetails: ['CANONICAL_SECTIONS_MISSING section=sections_json'],
    };
  }

  const issues: string[] = [];
  const issueDetails: string[] = [];
  const sections = draft.sectionsJson;

  const requiredNarrativeSections: Array<{
    key: 'summary' | 'storyline';
    code: 'SUMMARY' | 'STORYLINE';
  }> = [
    { key: 'summary', code: 'SUMMARY' },
    { key: 'storyline', code: 'STORYLINE' },
  ];

  for (const target of requiredNarrativeSections) {
    const text = target.key === 'summary'
      ? String(sections.summary?.text || '').trim()
      : String(sections.storyline?.text || '').trim();
    const notes = normalizeSummaryVariantText(text);
    if (!notes) {
      issues.push(`${target.code}_EMPTY`);
      issueDetails.push(`${target.code}_EMPTY section=${target.key}`);
    }
  }

  const targetSections: Array<{ key: string; code: string }> = [
    { key: 'takeaways', code: 'TAKEAWAYS' },
    { key: 'deep_dive', code: 'DEEP_DIVE' },
    { key: 'practical_rules', code: 'PRACTICAL_RULES' },
    { key: 'open_questions', code: 'OPEN_QUESTIONS' },
  ];

  for (const target of targetSections) {
    const bullets = (() => {
      if (target.key === 'takeaways') return sections.takeaways?.bullets || [];
      if (target.key === 'deep_dive') return sections.deep_dive?.bullets || [];
      if (target.key === 'practical_rules') return sections.practical_rules?.bullets || [];
      return sections.open_questions?.bullets || [];
    })()
      .map((bullet) => String(bullet || '').trim())
      .filter(Boolean);

    if (bullets.length === 0) {
      issues.push(`${target.code}_NO_BULLETS`);
      issueDetails.push(`${target.code}_NO_BULLETS section=${target.key}`);
      continue;
    }

    if (target.key === 'takeaways') {
      if (bullets.length < 3 || bullets.length > 4) {
        issues.push('TAKEAWAYS_BULLET_COUNT');
        issueDetails.push(`TAKEAWAYS_BULLET_COUNT count=${bullets.length}`);
      }
      const totalWords = bullets.reduce((sum, bullet) => sum + wordCount(bullet), 0);
      if (totalWords > 100) {
        issues.push('TAKEAWAYS_TOO_LONG');
        issueDetails.push(`TAKEAWAYS_TOO_LONG words=${totalWords}`);
      }
    } else if (bullets.length < 3 || bullets.length > 5) {
      issues.push(`${target.code}_BULLET_COUNT`);
      issueDetails.push(`${target.code}_BULLET_COUNT count=${bullets.length}`);
    }

    bullets.forEach((bullet, index) => {
      const sentences = sentenceCount(bullet);
      if (sentences > 2) {
        issues.push(`${target.code}_BULLET_SENTENCE_LIMIT`);
        issueDetails.push(`${target.code}_BULLET_SENTENCE_LIMIT bullet=${index + 1} sentences=${sentences}`);
      }
      if (target.key === 'open_questions' && !/\?\s*$/.test(bullet)) {
        issues.push('OPEN_QUESTIONS_NOT_QUESTIONS');
        issueDetails.push(`OPEN_QUESTIONS_NOT_QUESTIONS bullet=${index + 1}`);
      }
    });
  }

  const dedupedIssues = Array.from(new Set(issues));
  const blockingIssues = dedupedIssues.filter((issue) => !SOFT_LLM_NATIVE_ISSUES.has(issue));

  return {
    pass: blockingIssues.length === 0,
    issues: dedupedIssues,
    issueDetails: Array.from(new Set(issueDetails)),
  };
}

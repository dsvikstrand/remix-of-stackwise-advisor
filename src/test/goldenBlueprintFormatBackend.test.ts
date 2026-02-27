import { describe, expect, it } from 'vitest';
import {
  evaluateGoldenQuality,
  normalizeYouTubeDraftToGoldenV1,
  validateGoldenStructure,
} from '../../server/services/goldenBlueprintFormat';
import type { YouTubeBlueprintResult } from '../../server/llm/types';

function buildDeepDraft(): YouTubeBlueprintResult {
  return {
    title: 'Leucine and Functional Muscle Outcomes',
    description:
      'This video explains why leucine outcomes should be evaluated through function and not only visible mass changes. It highlights how dosing context and baseline behavior quality shape practical outcomes.',
    notes:
      'The transcript emphasizes maintenance outcomes and tradeoffs for adults over 35. The transcript also points to timing effects and protocol quality.',
    tags: ['nutrition', 'research', 'longevity'],
    steps: [
      {
        name: 'Functional outcomes versus hypertrophy-only framing',
        notes:
          'Evidence in older populations can show better grip and gait markers even when lean mass gains are limited. This blueprint should not frame this as a magic shortcut.',
        timestamp: null,
      },
      {
        name: 'Meal-paired dosing context',
        notes:
          'Meal-paired leucine dosing can improve anabolic signaling context versus random standalone usage. This video notes that protocol context matters.',
        timestamp: null,
      },
      {
        name: 'Baseline quality determines incremental upside',
        notes:
          'When sleep, total protein, and training structure are already optimized, incremental lift can be smaller and should be interpreted cautiously.',
        timestamp: null,
      },
    ],
  };
}

function buildActionDraft(): YouTubeBlueprintResult {
  return {
    title: 'Italian Sausage Chowder Recipe',
    description:
      'This video shows a hearty chowder flow with sausage texture control and practical fallback handling.',
    notes:
      'Use a repeatable cooking sequence and adjust one variable at a time. The transcript covers practical fixes.',
    tags: ['recipe', 'cooking', 'meal'],
    steps: [
      { name: 'Brown sausage in medium chunks', notes: 'Keep chunks visible for final texture payoff.', timestamp: null },
      { name: 'Cook aromatics and layer seasoning', notes: 'Build depth before thickening liquids.', timestamp: null },
      { name: 'Add flour and liquid gradually', notes: 'Avoid clumps and monitor body development.', timestamp: null },
      { name: 'Finish with hot milk', notes: 'Stabilize texture and avoid overcooking at the finish.', timestamp: null },
    ],
  };
}

function buildNoisyDraft(): YouTubeBlueprintResult {
  return {
    title: 'CoQ10 Basics',
    description: [
      'Summary',
      '- CoQ10 supports mitochondrial ATP production.',
      '- Benefits are context-dependent and not universal.',
      '- Medication interactions require caution.',
    ].join('\n'),
    notes: [
      'Mechanism Deep Dive',
      '- Mitochondrial electron transport support appears central.',
      '- Oxidative stress load can change perceived benefit.',
    ].join('\n'),
    tags: ['supplement', 'research'],
    steps: [
      { name: 'Lightning Takeaways', notes: '- Summary\n- Tradeoffs', timestamp: null },
      { name: 'Summary', notes: 'Summary\n\n- CoQ10 may help when deficiency risk is elevated.', timestamp: null },
      { name: 'Mechanism Deep Dive', notes: 'Mechanism Deep Dive\n\n- ATP pathway relevance.', timestamp: null },
    ],
  };
}

function buildNicheTagDraft(): YouTubeBlueprintResult {
  return {
    title: 'Riemannian geometry tricks for AI agents in software workflows',
    description:
      'A practical analysis of agent architecture choices, automation boundaries, and developer workflows.',
    notes:
      'Focus on implementation tradeoffs, software quality, and product-level decision making.',
    tags: ['riemannian-geometry', 'parallel-transport', 'ai', 'developer-tools', 'ultra-niche-operator'],
    steps: [
      {
        name: 'Agent architecture choices',
        notes: 'Compare orchestration tradeoffs and implementation complexity.',
        timestamp: null,
      },
      {
        name: 'Practical automation boundaries',
        notes: 'Use clear escalation rules and fallback paths in production.',
        timestamp: null,
      },
    ],
  };
}

describe('goldenBlueprintFormat (backend)', () => {
  it('normalizes deep/research drafts to required Golden v1 section order', () => {
    const result = normalizeYouTubeDraftToGoldenV1(buildDeepDraft());
    const names = result.steps.map((step) => step.name);

    expect(result.domain).toBe('deep');
    expect(result.structureGate.ok).toBe(true);
    expect(result.structureGate.issues).toEqual([]);
    expect(result.qualityGate.ok).toBe(true);
    expect(result.qualityGate.issues).toEqual([]);
    expect(names.slice(0, 3)).toEqual(['Summary', 'Takeaways', 'Bleup']);
    expect(names).toEqual([
      'Summary',
      'Takeaways',
      'Bleup',
      'Deep Dive',
      'Practical Rules',
      'Open Questions',
    ]);

    const takeawayLines = (result.steps[1]?.notes || '').split('\n').filter((line) => line.trim().startsWith('- '));
    expect(takeawayLines.length).toBeGreaterThanOrEqual(3);
    expect(takeawayLines.length).toBeLessThanOrEqual(4);
    for (const line of takeawayLines) {
      const value = line.replace(/^- /, '').trim().toLowerCase();
      expect(value).not.toBe('lightning takeaways');
      expect(value).not.toBe('summary');
      expect(value).not.toBe('mechanism deep dive');
      expect(value).not.toBe('tradeoffs');
      expect(value).not.toBe('decision rules');
      expect(value).not.toBe('practical rules');
      expect(value).not.toBe('open questions');
      expect(value).not.toBe('bottom line');
    }
    expect((result.steps[0]?.notes || '').toLowerCase()).not.toContain('this video');
    expect((result.steps[0]?.notes || '').toLowerCase()).not.toContain('the transcript');
    expect((result.steps[0]?.notes || '')).not.toContain('\n- ');
    expect((result.steps[2]?.notes || '').toLowerCase()).not.toContain('this video');
    expect((result.steps[2]?.notes || '').toLowerCase()).not.toContain('the transcript');
    expect((result.steps[2]?.notes || '')).not.toContain('\n- ');
    const bleupParagraphs = (result.steps[2]?.notes || '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    expect(bleupParagraphs.length).toBeGreaterThanOrEqual(2);
    expect(bleupParagraphs.length).toBeLessThanOrEqual(3);
    const summaryLead = ((result.steps[0]?.notes || '').split(/\n+/)[0] || '').trim();
    expect(summaryLead.length).toBeGreaterThan(20);
    expect((result.steps[2]?.notes || '')).not.toContain(summaryLead);

    for (const stepName of ['Deep Dive', 'Practical Rules', 'Open Questions']) {
      const section = result.steps.find((step) => step.name === stepName);
      expect(section).toBeTruthy();
      const sectionBullets = (section?.notes || '').split('\n').filter((line) => line.trim().startsWith('- '));
      expect(sectionBullets.length).toBeGreaterThanOrEqual(3);
      expect(sectionBullets.length).toBeLessThanOrEqual(5);
      for (const bulletLine of sectionBullets) {
        const bulletText = bulletLine.replace(/^- /, '').trim();
        expect(bulletText.length).toBeGreaterThan(12);
        expect(bulletText).not.toMatch(/^[-.]+$/);
      }
    }
  });

  it('normalizes action/recipe drafts to the shared deep section set', () => {
    const result = normalizeYouTubeDraftToGoldenV1(buildActionDraft());
    const names = result.steps.map((step) => step.name);

    expect(result.domain).toBe('deep');
    expect(result.structureGate.ok).toBe(true);
    expect(result.structureGate.issues).toEqual([]);
    expect(result.qualityGate.ok).toBe(true);
    expect(result.qualityGate.issues).toEqual([]);
    expect(names.slice(0, 3)).toEqual(['Summary', 'Takeaways', 'Bleup']);
    expect(names).toEqual([
      'Summary',
      'Takeaways',
      'Bleup',
      'Deep Dive',
      'Practical Rules',
      'Open Questions',
    ]);
  });

  it('filters section-label artifacts from takeaways and summary sources', () => {
    const result = normalizeYouTubeDraftToGoldenV1(buildNoisyDraft());
    const takeawayLines = (result.steps[1]?.notes || '').split('\n').filter((line) => line.trim().startsWith('- '));
    const summaryText = result.steps[0]?.notes || '';
    const bleupText = result.steps[2]?.notes || '';

    for (const line of takeawayLines) {
      const value = line.replace(/^- /, '').trim().toLowerCase();
      expect(value).not.toBe('lightning takeaways');
      expect(value).not.toBe('summary');
      expect(value).not.toBe('mechanism deep dive');
      expect(value).not.toBe('tradeoffs');
    }
    expect(summaryText.toLowerCase()).not.toContain('\nsummary');
    expect(summaryText.toLowerCase()).not.toContain('mechanism deep dive');
    expect(bleupText.toLowerCase()).not.toContain('\nsummary');
    expect(bleupText.toLowerCase()).not.toContain('mechanism deep dive');
  });

  it('caps and generalizes tags to broad user-searchable slugs', () => {
    const result = normalizeYouTubeDraftToGoldenV1(buildNicheTagDraft());
    expect(result.tags.length).toBeGreaterThanOrEqual(1);
    expect(result.tags.length).toBeLessThanOrEqual(5);
    expect(result.tags).not.toContain('riemannian-geometry');
    expect(result.tags).not.toContain('parallel-transport');
    expect(result.tags).toContain('ai');
    expect(result.tags.some((tag) => ['software', 'developer-tools', 'analysis', 'automation'].includes(tag))).toBe(true);
  });

  it('detects malformed section shape in gate validator', () => {
    const malformed = [
      { name: 'Summary', notes: '', timestamp: null },
      { name: 'Takeaways', notes: '- only one bullet', timestamp: null },
      { name: 'Bleup', notes: '', timestamp: null },
      { name: 'Deep Dive', notes: '- one\n- two', timestamp: null },
      { name: 'Practical Rules', notes: '- one\n- two', timestamp: null },
      { name: 'Open Questions', notes: '- one\n- two', timestamp: null },
    ];

    const gate = validateGoldenStructure(malformed);
    expect(gate.ok).toBe(false);
    expect(gate.issues).toContain('SUMMARY_EMPTY');
    expect(gate.issues).toContain('BLEUP_EMPTY');
    expect(gate.issues).toContain('TAKEAWAYS_BULLET_COUNT');
    expect(gate.issues).toContain('DEEP_DIVE_BULLET_COUNT');
  });

  it('flags bleup paragraph count deterministically', () => {
    const malformedBleup = [
      { name: 'Summary', notes: 'Valid summary paragraph.', timestamp: null },
      { name: 'Takeaways', notes: '- One clear claim with context.\n- Second clear claim with context.\n- Third clear claim with context.', timestamp: null },
      { name: 'Bleup', notes: 'Only one paragraph should fail paragraph density check for deterministic enforcement.', timestamp: null },
      { name: 'Deep Dive', notes: '- Mechanism detail with receptor context.\n- Context and condition are explicit.\n- Practical implication is included.', timestamp: null },
      { name: 'Practical Rules', notes: '- If condition A, do action B.\n- If condition C, adjust behavior D.\n- Avoid overgeneralizing across contexts.', timestamp: null },
      { name: 'Open Questions', notes: '- Which subgroup sees strongest lift?\n- What baseline changes effect size?\n- Where does incremental value flatten?', timestamp: null },
    ];

    const gate = validateGoldenStructure(malformedBleup);
    expect(gate.ok).toBe(false);
    expect(gate.issues).toContain('BLEUP_PARAGRAPH_COUNT');
  });

  it('flags repetition and boilerplate patterns in quality gate', () => {
    const repeatedSteps = [
      { name: 'Summary', notes: 'Shared sentence one. Shared sentence two. Shared sentence one.', timestamp: null },
      { name: 'Takeaways', notes: '- Helps consistency. Why it matters: this changes how you decide when and how to apply it.\n- Helps consistency. Why it matters: this changes how you decide when and how to apply it.\n- Helps consistency. Why it matters: this changes how you decide when and how to apply it.', timestamp: null },
      { name: 'Bleup', notes: 'Shared sentence one. Shared sentence two. Shared sentence one.', timestamp: null },
      { name: 'Deep Dive', notes: '- Improves outcomes.\n- Improves outcomes.\n- Improves outcomes.', timestamp: null },
      { name: 'Practical Rules', notes: '- Improves outcomes.\n- Improves outcomes.\n- Improves outcomes.', timestamp: null },
      { name: 'Open Questions', notes: '- Improves outcomes.\n- Improves outcomes.\n- Improves outcomes.', timestamp: null },
    ];

    const gate = evaluateGoldenQuality({ steps: repeatedSteps, transcript: 'taurine taurine taurine mechanism membrane receptor context depends' });
    expect(gate.ok).toBe(false);
    expect(gate.issues).toContain('BOILERPLATE_REPEATED');
    expect(
      gate.issues.some((code) => code === 'DUPLICATE_SENTENCES_ACROSS_SECTIONS' || code.startsWith('REPETITION_TRIGRAM_')),
    ).toBe(true);
    expect(gate.issues).toContain('GENERIC_BULLET_NO_CONTEXT');
  });

  it('flags placeholder and prompt-context leakage deterministically', () => {
    const leakSteps = [
      { name: 'Summary', notes: 'Use <SOURCE_TRANSCRIPT_CONTEXT> and then continue analysis.', timestamp: null },
      { name: 'Takeaways', notes: '- Useful claim with mechanism context and implication.\n- Second useful claim with condition and implication.\n- Third useful claim with context and implication.', timestamp: null },
      { name: 'Bleup', notes: 'This paragraph mentions Oracle POS dir and should be caught. Oracle POS dir path is not allowed in output.\n\nSecond paragraph with transcript-grounded phrasing.\n\nThird paragraph for structure compliance.', timestamp: null },
      { name: 'Deep Dive', notes: '- Mechanism includes receptor and membrane context.\n- Context depends on baseline behavior quality.\n- Practical implication is explicit.', timestamp: null },
      { name: 'Practical Rules', notes: '- If baseline is low, start conservative.\n- If response is stable, scale gradually.\n- Avoid changing multiple variables at once.', timestamp: null },
      { name: 'Open Questions', notes: '- Which condition predicts strongest response?\n- Where does value flatten in advanced users?\n- Which signal predicts long-term adherence?', timestamp: null },
    ];

    const gate = evaluateGoldenQuality({
      steps: leakSteps,
      transcript: 'mechanism receptor membrane context condition practical implication baseline response adherence',
    });
    expect(gate.ok).toBe(false);
    expect(gate.issues).toContain('PLACEHOLDER_TOKEN_LEAK');
    expect(gate.issues).toContain('PROMPT_CONTEXT_LEAK');
  });

  it('supports quality-gate evaluation with repair disabled and enabled', () => {
    const noRepair = normalizeYouTubeDraftToGoldenV1(buildNoisyDraft(), { repairQuality: false });
    const withRepair = normalizeYouTubeDraftToGoldenV1(buildNoisyDraft(), { repairQuality: true });
    expect(noRepair.structureGate.ok).toBe(true);
    expect(withRepair.structureGate.ok).toBe(true);
    expect(withRepair.qualityGate.ok).toBe(true);
  });
});

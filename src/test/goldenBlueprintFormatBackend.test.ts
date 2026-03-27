import { describe, expect, it } from 'vitest';
import {
  evaluateGoldenQuality,
  normalizeYouTubeDraftToGoldenV1,
  type YouTubeBlueprintNormalizationInput,
  validateGoldenStructure,
} from '../../server/services/goldenBlueprintFormat';
function buildCanonicalInput(input: {
  title: string;
  tags: string[];
  summary: string;
  takeaways: string[];
  storyline: string;
  deepDive: string[];
  practicalRules: string[];
  openQuestions: string[];
}): YouTubeBlueprintNormalizationInput {
  return {
    title: input.title,
    tags: input.tags,
    sectionsJson: {
      schema_version: 'blueprint_sections_v1',
      tags: input.tags,
      summary: { text: input.summary },
      takeaways: { bullets: input.takeaways },
      storyline: { text: input.storyline },
      deep_dive: { bullets: input.deepDive },
      practical_rules: { bullets: input.practicalRules },
      open_questions: { bullets: input.openQuestions },
    },
  };
}

function buildDeepDraft(): YouTubeBlueprintNormalizationInput {
  return buildCanonicalInput({
    title: 'Leucine and Functional Muscle Outcomes',
    tags: ['nutrition', 'research', 'longevity'],
    summary:
      'This explains why leucine outcomes should be evaluated through function and not only visible mass changes. It highlights how dosing context and baseline behavior quality shape practical outcomes.',
    takeaways: [
      'Evaluate leucine outcomes through function, not just visible hypertrophy.',
      'Meal-paired dosing context matters more than random standalone usage.',
      'Baseline sleep, protein, and training quality determine incremental upside.',
    ],
    storyline:
      'Maintenance outcomes and tradeoffs matter, especially for adults over 35. Timing effects and protocol quality shape whether the intervention produces meaningful functional change in practice.',
    deepDive: [
      'Evidence in older populations can show better grip and gait markers even when lean mass gains are limited.',
      'Meal-paired leucine dosing can improve anabolic signaling context versus random standalone usage.',
      'Protocol quality changes whether a measured benefit is real or just noise.',
    ],
    practicalRules: [
      'Use leucine inside a broader protein and training plan rather than as a magic shortcut.',
      'Interpret incremental gains cautiously when the baseline routine is already strong.',
      'Track functional markers alongside body-composition expectations.',
    ],
    openQuestions: [
      'Which baseline profiles see the biggest functional benefit?',
      'How much of the observed lift depends on meal timing context?',
      'Where do leucine gains flatten once fundamentals are already optimized?',
    ],
  });
}

function buildActionDraft(): YouTubeBlueprintNormalizationInput {
  return buildCanonicalInput({
    title: 'Italian Sausage Chowder Recipe',
    tags: ['recipe', 'cooking', 'meal'],
    summary:
      'This shows a hearty chowder flow with sausage texture control, sequencing discipline, and practical fallback handling.',
    takeaways: [
      'Run the chowder sequence in order and keep adjustments small between attempts.',
      'Texture payoff depends on visible sausage chunks and controlled liquid thickening.',
      'Late-stage fixes work best when the earlier base was built correctly.',
    ],
    storyline:
      'Use a repeatable cooking sequence and adjust one variable at a time. The practical payoff comes from layering flavor early, then stabilizing texture near the finish.',
    deepDive: [
      'Browning sausage in medium chunks preserves visible texture in the final bowl.',
      'Aromatics and seasoning should build depth before thickening liquids.',
      'Gradual flour and liquid integration prevents clumps and keeps body development readable.',
    ],
    practicalRules: [
      'Do not stack multiple rescue moves at the finish if texture is already drifting.',
      'Check thickness before adding the final milk stage.',
      'Keep the finishing heat controlled so the chowder does not break.',
    ],
    openQuestions: [
      'Which sausage fat level gives the best texture-to-richness balance?',
      'How much liquid reduction is ideal before the final milk stage?',
      'Which early signals predict that the chowder will finish too thick?',
    ],
  });
}

function buildNoisyDraft(): YouTubeBlueprintNormalizationInput {
  return buildCanonicalInput({
    title: 'CoQ10 Basics',
    tags: ['supplement', 'research'],
    summary: [
      'Summary',
      '- CoQ10 supports mitochondrial ATP production.',
      '- Benefits are context-dependent and not universal.',
      '- Medication interactions require caution.',
    ].join('\n'),
    takeaways: ['Summary', 'Tradeoffs', 'CoQ10 may help when deficiency risk is elevated.'],
    storyline: [
      'Mechanism Deep Dive',
      '- Mitochondrial electron transport support appears central.',
      '- Oxidative stress load can change perceived benefit.',
    ].join('\n'),
    deepDive: [
      'Mechanism Deep Dive',
      'ATP pathway relevance.',
      'Medication context can alter whether the intervention feels useful.',
    ],
    practicalRules: [
      'Use CoQ10 only when the context and medication profile make sense.',
      'Review symptom goals before treating it as a universal addition.',
      'Avoid overselling benefits outside deficiency-risk contexts.',
    ],
    openQuestions: [
      'Which users actually notice a measurable lift?',
      'How much does medication context change the effect?',
      'Where does the marginal value flatten?',
    ],
  });
}

function buildNicheTagDraft(): YouTubeBlueprintNormalizationInput {
  return buildCanonicalInput({
    title: 'Riemannian geometry tricks for AI agents in software workflows',
    tags: ['riemannian-geometry', 'parallel-transport', 'ai', 'developer-tools', 'ultra-niche-operator'],
    summary:
      'A practical analysis of agent architecture choices, automation boundaries, and developer workflows.',
    takeaways: [
      'Agent architecture choices should be evaluated through implementation tradeoffs, not novelty alone.',
      'Automation boundaries matter as much as model capability in production systems.',
      'Developer workflows improve when fallback paths and escalation rules are explicit.',
    ],
    storyline:
      'Focus on implementation tradeoffs, software quality, and product-level decision making instead of ultra-niche framing.',
    deepDive: [
      'Compare orchestration tradeoffs and implementation complexity.',
      'Use explicit escalation rules when the system leaves the stable path.',
      'Treat workflow quality as part of the architecture, not as an afterthought.',
    ],
    practicalRules: [
      'Prefer broad user-searchable framing over ultra-niche specialist tags.',
      'Keep the architecture readable before optimizing for exotic abstractions.',
      'Use automation only where the operational boundary is clear.',
    ],
    openQuestions: [
      'Which workflow boundaries should stay manual even in agentic systems?',
      'Where do exotic abstractions help more than they confuse?',
      'How much architectural complexity is justified by the real productivity gain?',
    ],
  });
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
      'Caveats',
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
      expect(value).not.toBe('caveats');
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

    for (const stepName of ['Deep Dive', 'Practical Rules', 'Caveats']) {
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
      'Caveats',
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

  it('allows caveat-style bullets in the legacy Open Questions slot', () => {
    const caveatSteps = [
      { name: 'Summary', notes: 'Valid summary paragraph with enough context to stand on its own.', timestamp: null },
      { name: 'Takeaways', notes: '- One clear claim with context.\n- Second clear claim with context.\n- Third clear claim with context.', timestamp: null },
      { name: 'Bleup', notes: 'First substantial paragraph with enough detail to stand alone.\n\nSecond substantial paragraph with enough detail to stand alone.', timestamp: null },
      { name: 'Deep Dive', notes: '- Mechanism detail with receptor context.\n- Context and condition are explicit.\n- Practical implication is included.', timestamp: null },
      { name: 'Practical Rules', notes: '- If condition A, do action B.\n- If condition C, adjust behavior D.\n- Avoid overgeneralizing across contexts.', timestamp: null },
      { name: 'Open Questions', notes: '- The argument assumes ideal conditions and skips failure cases.\n- A few claims sound more certain than the evidence presented.\n- Important tradeoffs are implied but never really unpacked.', timestamp: null },
    ];

    const structureGate = validateGoldenStructure(caveatSteps);
    const qualityGate = evaluateGoldenQuality({
      steps: caveatSteps,
      transcript: 'mechanism receptor membrane context condition practical implication baseline response adherence',
    });

    expect(structureGate.ok).toBe(true);
    expect(structureGate.issues).not.toContain('OPEN_QUESTIONS_NOT_QUESTIONS');
    expect(qualityGate.issues).not.toContain('OPEN_QUESTIONS_NOT_QUESTIONS');
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

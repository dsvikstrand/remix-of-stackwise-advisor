import { describe, expect, it } from 'vitest';
import { normalizeYouTubeDraftToGoldenV1 } from '../../server/services/goldenBlueprintFormat';
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

describe('goldenBlueprintFormat (backend)', () => {
  it('normalizes deep/research drafts to required Golden v1 section order', () => {
    const result = normalizeYouTubeDraftToGoldenV1(buildDeepDraft());
    const names = result.steps.map((step) => step.name);

    expect(result.domain).toBe('deep');
    expect(names.slice(0, 2)).toEqual(['Takeaways', 'Summary']);
    expect(names).toEqual([
      'Takeaways',
      'Summary',
      'Deep Dive',
      'Tradeoffs',
      'Practical Rules',
      'Bottom Line',
    ]);

    const takeawayLines = (result.steps[0]?.notes || '').split('\n').filter((line) => line.trim().startsWith('- '));
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
    expect((result.steps[1]?.notes || '').toLowerCase()).not.toContain('this video');
    expect((result.steps[1]?.notes || '').toLowerCase()).not.toContain('the transcript');
    expect((result.steps[1]?.notes || '')).not.toContain('\n- ');
  });

  it('normalizes action/recipe drafts to action section set', () => {
    const result = normalizeYouTubeDraftToGoldenV1(buildActionDraft());
    const names = result.steps.map((step) => step.name);

    expect(result.domain).toBe('action');
    expect(names.slice(0, 2)).toEqual(['Takeaways', 'Summary']);
    expect(names).toEqual([
      'Takeaways',
      'Summary',
      'Playbook Steps',
      'Fast Fallbacks',
      'Red Flags',
      'Bottom Line',
    ]);
  });

  it('filters section-label artifacts from takeaways and summary sources', () => {
    const result = normalizeYouTubeDraftToGoldenV1(buildNoisyDraft());
    const takeawayLines = (result.steps[0]?.notes || '').split('\n').filter((line) => line.trim().startsWith('- '));
    const summaryText = result.steps[1]?.notes || '';

    for (const line of takeawayLines) {
      const value = line.replace(/^- /, '').trim().toLowerCase();
      expect(value).not.toBe('lightning takeaways');
      expect(value).not.toBe('summary');
      expect(value).not.toBe('mechanism deep dive');
      expect(value).not.toBe('tradeoffs');
    }
    expect(summaryText.toLowerCase()).not.toContain('\nsummary');
    expect(summaryText.toLowerCase()).not.toContain('mechanism deep dive');
  });
});

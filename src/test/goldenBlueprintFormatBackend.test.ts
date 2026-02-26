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

describe('goldenBlueprintFormat (backend)', () => {
  it('normalizes deep/research drafts to required Golden v1 section order', () => {
    const result = normalizeYouTubeDraftToGoldenV1(buildDeepDraft());
    const names = result.steps.map((step) => step.name);

    expect(result.domain).toBe('deep');
    expect(names.slice(0, 2)).toEqual(['Lightning Takeaways', 'Summary']);
    expect(names).toEqual([
      'Lightning Takeaways',
      'Summary',
      'Mechanism Deep Dive',
      'Tradeoffs',
      'Decision Rules',
      'Open Questions',
      'Bottom Line',
    ]);

    const takeawayLines = (result.steps[0]?.notes || '').split('\n').filter((line) => line.trim().startsWith('- '));
    expect(takeawayLines.length).toBeGreaterThanOrEqual(3);
    expect(takeawayLines.length).toBeLessThanOrEqual(4);
    expect((result.steps[1]?.notes || '').toLowerCase()).not.toContain('this video');
    expect((result.steps[1]?.notes || '').toLowerCase()).not.toContain('the transcript');
  });

  it('normalizes action/recipe drafts to action section set', () => {
    const result = normalizeYouTubeDraftToGoldenV1(buildActionDraft());
    const names = result.steps.map((step) => step.name);

    expect(result.domain).toBe('action');
    expect(names.slice(0, 2)).toEqual(['Lightning Takeaways', 'Summary']);
    expect(names).toEqual([
      'Lightning Takeaways',
      'Summary',
      'Playbook Steps',
      'Fast Fallbacks',
      'Red Flags',
      'Bottom Line',
    ]);
  });
});


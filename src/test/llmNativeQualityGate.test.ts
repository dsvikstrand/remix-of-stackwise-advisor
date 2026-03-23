import { describe, expect, it } from 'vitest';
import { evaluateLlmNativeGate } from '../../server/services/llmNativeQualityGate';

function makeDraft() {
  return {
    sectionsJson: {
      schema_version: 'blueprint_sections_v1' as const,
      tags: ['ml'],
      summary: {
        text: 'This summary explains what the topic is about and why it matters.',
      },
      takeaways: {
        bullets: [
          'This is a short useful takeaway about what changed and why it matters.',
          'This is a second short useful takeaway about how the system behaves in practice.',
          'This is a third short useful takeaway that stays easy to skim quickly.',
        ],
      },
      storyline: {
        text: 'This storyline provides the narrative context in a compact but complete paragraph.',
      },
      deep_dive: {
        bullets: [
          'Deep dive bullet one explains the mechanism in one compact sentence.',
          'Deep dive bullet two explains the boundary in one compact sentence.',
          'Deep dive bullet three explains the practical interpretation in one compact sentence.',
        ],
      },
      practical_rules: {
        bullets: [
          'Practical rule one explains what to do when the condition is true.',
          'Practical rule two explains what to avoid when the condition is false.',
          'Practical rule three explains how to interpret uncertainty in practice.',
        ],
      },
      open_questions: {
        bullets: [
          'How reliable is the method under noisy contact?',
          'What breaks first when the environment changes?',
          'Where does the approach stop generalizing cleanly?',
        ],
      },
    },
  };
}

describe('evaluateLlmNativeGate', () => {
  it('logs TAKEAWAYS_TOO_LONG without failing the gate on its own', () => {
    const draft = makeDraft();
    draft.sectionsJson.takeaways.bullets = [
      'This first takeaway is intentionally verbose so the word budget spills over while still being syntactically valid and readable for the test case, and it keeps layering extra context about system behavior, practical interpretation, and evidence framing until the section becomes too long for a quick skim.',
      'This second takeaway is also intentionally verbose so the combined total crosses the current word threshold without introducing any other structural error, and it keeps piling on extra explanatory detail about tradeoffs, mechanisms, and caveats that a skim-friendly section should not need.',
      'This third takeaway keeps adding more framing, examples, and interpretive nuance so the section clearly exceeds the current soft length check even though the bullet count and sentence count remain valid under the rest of the gate.',
    ];

    const result = evaluateLlmNativeGate(draft);

    expect(result.pass).toBe(true);
    expect(result.issues).toContain('TAKEAWAYS_TOO_LONG');
  });

  it('logs OPEN_QUESTIONS_NOT_QUESTIONS without failing the gate on its own', () => {
    const draft = makeDraft();
    draft.sectionsJson.open_questions.bullets = [
      'How reliable is the method under noisy contact',
      'What breaks first when the environment changes',
      'Where does the approach stop generalizing cleanly',
    ];

    const result = evaluateLlmNativeGate(draft);

    expect(result.pass).toBe(true);
    expect(result.issues).toContain('OPEN_QUESTIONS_NOT_QUESTIONS');
  });

  it('still fails when a blocking structural issue is present alongside soft issues', () => {
    const draft = makeDraft();
    draft.sectionsJson.open_questions.bullets = [
      'How reliable is the method under noisy contact',
      'What breaks first when the environment changes',
      'Where does the approach stop generalizing cleanly',
    ];
    draft.sectionsJson.deep_dive.bullets = [];

    const result = evaluateLlmNativeGate(draft);

    expect(result.pass).toBe(false);
    expect(result.issues).toContain('DEEP_DIVE_NO_BULLETS');
    expect(result.issues).toContain('OPEN_QUESTIONS_NOT_QUESTIONS');
  });
});

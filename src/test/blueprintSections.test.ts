import { describe, expect, it } from 'vitest';
import {
  buildBlueprintSectionsV1FromRenderSteps,
  buildRenderBlocksFromBlueprintSections,
  countBlueprintSectionsV1,
  parseBlueprintSectionsV1,
} from '@/lib/blueprintSections';

describe('blueprintSections', () => {
  const canonicalLegacyRenderBlocks = [
    {
      id: 'summary',
      title: 'Summary',
      description:
        'Current latent predictive models measure compatibility in flat Euclidean space, so multi-step predictions accumulate small errors into wildly wrong trajectories.',
      items: [],
    },
    {
      id: 'takeaways',
      title: 'Takeaways',
      description: '',
      items: [
        { name: 'Flat Euclidean latents let small prediction mistakes compound.' },
        { name: 'Hyperbolic geometry imposes hierarchical structure.' },
      ],
    },
    {
      id: 'storyline',
      title: 'Bleup',
      description:
        'Latent predictive architectures learn an energy landscape that rates how compatible a candidate sequence is with a goal.',
      items: [],
    },
    {
      id: 'deep-dive',
      title: 'Deep Dive',
      description: '',
      items: [
        { name: 'Error compounding in flat latents magnifies tiny latent misplacements.' },
        { name: 'Exponential and logarithmic maps let you adapt existing encoders.' },
      ],
    },
    {
      id: 'practical-rules',
      title: 'Practical Rules',
      description: '',
      items: [
        { name: 'Test hyperbolic lifting before retraining the encoder from scratch.' },
      ],
    },
    {
      id: 'open-questions',
      title: 'Open Questions',
      description: '',
      items: [
        { name: 'How should curvature magnitude be selected per domain?' },
      ],
    },
  ];

  it('round-trips a canonical blueprint into blueprint_sections_v1 and back into render blocks', () => {
    const sections = buildBlueprintSectionsV1FromRenderSteps({
      steps: canonicalLegacyRenderBlocks,
      tags: ['ai-tools-automation', 'machine-learning'],
    });

    expect(sections).not.toBeNull();
    expect(sections?.schema_version).toBe('blueprint_sections_v1');
    expect(sections?.tags).toEqual(['ai-tools-automation', 'machine-learning']);
    expect(sections?.summary.text).toContain('Current latent predictive models');
    expect(sections?.storyline.text).toContain('Latent predictive architectures');
    expect(sections?.takeaways.bullets).toHaveLength(2);

    const renderBlocks = buildRenderBlocksFromBlueprintSections(sections!);

    expect(renderBlocks.map((block) => block.title)).toEqual([
      'Summary',
      'Takeaways',
      'Bleup',
      'Deep Dive',
      'Practical Rules',
      'Caveats',
    ]);
    expect(renderBlocks[0]?.description).toBe(canonicalLegacyRenderBlocks[0]?.description);
    expect(renderBlocks[1]?.items.map((item) => item.name)).toEqual(
      canonicalLegacyRenderBlocks[1]?.items.map((item) => item.name),
    );
    expect(renderBlocks[2]?.description).toBe(canonicalLegacyRenderBlocks[2]?.description);
  });

  it('accepts Storyline as a valid storyline input alias', () => {
    const sections = buildBlueprintSectionsV1FromRenderSteps({
      steps: canonicalLegacyRenderBlocks.map((block) =>
        block.title === 'Bleup' ? { ...block, title: 'Storyline' } : block,
      ),
      tags: ['systems'],
    });

    expect(sections).not.toBeNull();
    expect(sections?.storyline.text).toContain('Latent predictive architectures');
  });

  it('accepts Caveats as a valid input alias for the open_questions slot', () => {
    const sections = buildBlueprintSectionsV1FromRenderSteps({
      steps: canonicalLegacyRenderBlocks.map((block) =>
        block.title === 'Open Questions' ? { ...block, title: 'Caveats' } : block,
      ),
      tags: ['systems'],
    });

    expect(sections).not.toBeNull();
    expect(sections?.open_questions.bullets).toEqual(['How should curvature magnitude be selected per domain?']);
  });

  it('returns null when a required canonical section is missing', () => {
    const sections = buildBlueprintSectionsV1FromRenderSteps({
      steps: canonicalLegacyRenderBlocks.filter((block) => block.title !== 'Open Questions'),
      tags: ['systems'],
    });

    expect(sections).toBeNull();
  });

  it('ignores extra sections while preserving canonical ordering', () => {
    const sections = buildBlueprintSectionsV1FromRenderSteps({
      steps: [
        ...canonicalLegacyRenderBlocks,
        {
          id: 'extra',
          title: 'Tradeoffs',
          description: '',
          items: [{ name: 'This should be ignored in Phase 2A.' }],
        },
      ],
      tags: ['ai-tools-automation', 'machine-learning'],
    });

    expect(sections?.tags).toEqual(['ai-tools-automation', 'machine-learning']);

    const renderBlocks = buildRenderBlocksFromBlueprintSections(sections!);
    expect(renderBlocks.map((block) => block.title)).toEqual([
      'Summary',
      'Takeaways',
      'Bleup',
      'Deep Dive',
      'Practical Rules',
      'Caveats',
    ]);
  });

  it('parses a stored blueprint_sections_v1 payload, including partial schema payloads, and rejects malformed payloads', () => {
    const valid = parseBlueprintSectionsV1({
      schema_version: 'blueprint_sections_v1',
      tags: ['ai-tools-automation'],
      summary: { text: 'Summary text' },
      takeaways: { bullets: ['One', 'Two'] },
      storyline: { text: 'Storyline text' },
      deep_dive: { bullets: ['Deep dive bullet'] },
      practical_rules: { bullets: ['Rule'] },
      open_questions: { bullets: ['Question'] },
    });
    const partial = parseBlueprintSectionsV1({
      schema_version: 'blueprint_sections_v1',
      tags: ['ai-tools-automation'],
      summary: { text: 'Summary text' },
    });
    const invalid = parseBlueprintSectionsV1({
      schema_version: 'blueprint_sections_v1',
      tags: ['ai-tools-automation'],
    });

    expect(valid?.schema_version).toBe('blueprint_sections_v1');
    expect(valid?.tags).toEqual(['ai-tools-automation']);
    expect(valid?.storyline.text).toBe('Storyline text');
    expect(partial?.summary.text).toBe('Summary text');
    expect(partial?.takeaways.bullets).toEqual([]);
    expect(partial?.storyline.text).toBe('');
    expect(invalid).toBeNull();
  });

  it('counts only canonical non-empty sections for frontend read surfaces', () => {
    const fullCount = countBlueprintSectionsV1({
      schema_version: 'blueprint_sections_v1',
      tags: ['ai-tools-automation'],
      summary: { text: 'Summary text' },
      takeaways: { bullets: ['One', 'Two'] },
      storyline: { text: 'Storyline text' },
      deep_dive: { bullets: ['Deep dive bullet'] },
      practical_rules: { bullets: ['Rule'] },
      open_questions: { bullets: ['Question'] },
    });
    const partialCount = countBlueprintSectionsV1({
      schema_version: 'blueprint_sections_v1',
      tags: [],
      summary: { text: 'Summary text' },
      takeaways: { bullets: [] },
      storyline: { text: '' },
      deep_dive: { bullets: ['Deep dive bullet'] },
      practical_rules: { bullets: [] },
      open_questions: { bullets: [] },
    });

    expect(fullCount).toBe(6);
    expect(partialCount).toBe(2);
    expect(countBlueprintSectionsV1(null)).toBe(0);
  });
});

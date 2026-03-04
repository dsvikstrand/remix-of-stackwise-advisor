import { describe, expect, it } from 'vitest';
import { buildFeedSummary } from '@/lib/feedPreview';

describe('feedPreview', () => {
  it('prefers sections_json summary text over legacy preview sources', () => {
    const summary = buildFeedSummary({
      sectionsJson: {
        schema_version: 'blueprint_sections_v1',
        tags: ['ai-tools-automation'],
        summary: { text: 'Canonical summary from sections json.' },
        takeaways: { bullets: ['Fallback bullet'] },
        storyline: { text: 'Storyline text' },
        deep_dive: { bullets: ['Deep dive bullet'] },
        practical_rules: { bullets: ['Rule'] },
        open_questions: { bullets: ['Question'] },
      },
      primary: 'Legacy llm review should not win.',
      secondary: 'Legacy mix notes should not win.',
      fallback: 'Fallback text',
    });

    expect(summary).toBe('Canonical summary from sections json.');
  });

  it('falls back to legacy sources when sections_json is missing or not a recognized schema', () => {
    const primarySummary = buildFeedSummary({
      sectionsJson: { schema_version: 'unknown_schema', summary: { text: 'Should be ignored' } },
      primary: 'Legacy llm review wins here.',
      secondary: 'Legacy mix notes.',
      fallback: 'Fallback text',
    });
    const secondarySummary = buildFeedSummary({
      sectionsJson: null,
      primary: null,
      secondary: 'Legacy mix notes wins here.',
      fallback: 'Fallback text',
    });

    expect(primarySummary).toBe('Legacy llm review wins here.');
    expect(secondarySummary).toBe('Legacy mix notes wins here.');
  });

  it('falls back to canonical takeaway content when the stored summary is empty', () => {
    const summary = buildFeedSummary({
      sectionsJson: {
        schema_version: 'blueprint_sections_v1',
        tags: [],
        summary: { text: '' },
        takeaways: { bullets: ['First takeaway bullet', 'Second takeaway bullet'] },
        storyline: { text: 'Storyline backup' },
        deep_dive: { bullets: ['Deep dive bullet'] },
        practical_rules: { bullets: ['Rule'] },
        open_questions: { bullets: ['Question'] },
      },
      primary: null,
      secondary: null,
      fallback: 'Fallback text',
    });

    expect(summary).toBe('First takeaway bullet');
  });

  it('uses the default fallback text when every upstream preview source is blank', () => {
    const summary = buildFeedSummary({
      sectionsJson: {
        schema_version: 'blueprint_sections_v1',
        tags: [],
        summary: { text: '' },
        takeaways: { bullets: [] },
        storyline: { text: '' },
        deep_dive: { bullets: [] },
        practical_rules: { bullets: [] },
        open_questions: { bullets: [] },
      },
      primary: '',
      secondary: '',
      fallback: '',
    });

    expect(summary).toBe('Open blueprint to view full details.');
  });
});

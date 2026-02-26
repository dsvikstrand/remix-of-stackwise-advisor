import { describe, expect, it } from 'vitest';
import { splitSummaryIntoSlides } from '@/lib/summarySlides';

describe('splitSummaryIntoSlides', () => {
  it('keeps explicit 3-4 paragraph summaries as-is', () => {
    const input = [
      'Paragraph one with context and framing.',
      'Paragraph two with practical evidence.',
      'Paragraph three with implications.',
      'Paragraph four with decision guidance.',
    ].join('\n\n');
    const slides = splitSummaryIntoSlides(input);
    expect(slides).toHaveLength(4);
    expect(slides[0]).toContain('Paragraph one');
    expect(slides[3]).toContain('Paragraph four');
  });

  it('splits long single-paragraph text into 3-4 slides', () => {
    const input = [
      'Sentence one establishes context and practical goals.',
      'Sentence two introduces the key mechanism and why it matters.',
      'Sentence three describes evidence quality and interpretation limits.',
      'Sentence four clarifies what to do in practice.',
      'Sentence five adds tradeoff guidance for realistic expectations.',
      'Sentence six closes with a decision-oriented takeaway.',
    ].join(' ');

    const slides = splitSummaryIntoSlides(input);
    expect(slides.length).toBeGreaterThanOrEqual(3);
    expect(slides.length).toBeLessThanOrEqual(4);
  });

  it('returns single slide for short summary text', () => {
    const slides = splitSummaryIntoSlides('Short summary with one key takeaway.');
    expect(slides).toEqual(['Short summary with one key takeaway.']);
  });
});


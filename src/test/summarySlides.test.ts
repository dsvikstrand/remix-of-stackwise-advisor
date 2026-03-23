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

  it('splits long single-paragraph text into denser slides without forcing 3-4', () => {
    const input = [
      'Sentence one establishes context and practical goals.',
      'Sentence two introduces the key mechanism and why it matters.',
      'Sentence three describes evidence quality and interpretation limits.',
      'Sentence four clarifies what to do in practice.',
      'Sentence five adds tradeoff guidance for realistic expectations.',
      'Sentence six closes with a decision-oriented takeaway.',
    ].join(' ');

    const slides = splitSummaryIntoSlides(input);
    expect(slides.length).toBeGreaterThanOrEqual(2);
    expect(slides.length).toBeLessThanOrEqual(3);
  });

  it('returns single slide for short summary text', () => {
    const slides = splitSummaryIntoSlides('Short summary with one key takeaway.');
    expect(slides).toEqual(['Short summary with one key takeaway.']);
  });

  it('keeps a medium single-paragraph storyline as one slide', () => {
    const input = [
      'The transcript then emphasizes the residual-refinement behavior: tactile correction updates the physical action based on touch, but it does not overwrite the robot’s visual and language knowledge.',
      'It is also described as contact-aware, so when the tactile sensors read zero the correction fades and the main visual controller drives normally.',
      'In the described outcome, older models struggle to maintain the delicate peel-and-rotate sequence, while the newer architecture sustains more continuous success by feeling and adjusting as it runs.',
    ].join(' ');

    const slides = splitSummaryIntoSlides(input);
    expect(slides).toEqual([input]);
  });
});

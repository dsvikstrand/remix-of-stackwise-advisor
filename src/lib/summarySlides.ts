function normalizeWhitespace(value: string) {
  return String(value || '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function splitSummaryIntoSlides(value: string) {
  const text = normalizeWhitespace(value);
  if (!text) return [] as string[];

  const byParagraph = text
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (byParagraph.length >= 3 && byParagraph.length <= 4) return byParagraph;

  if (byParagraph.length > 4) {
    return [...byParagraph.slice(0, 3), byParagraph.slice(3).join(' ')];
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (sentences.length <= 3) return [text];

  // Keep medium single-paragraph narrative blocks intact; only split once the
  // text is dense enough that multiple slides add readability instead of
  // creating thin fragments.
  if (sentences.length <= 5 && text.length < 650) return [text];

  const targetSlides = Math.min(4, Math.max(2, Math.round(text.length / 420)));
  const chunkSize = Math.ceil(sentences.length / targetSlides);
  const grouped: string[] = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    grouped.push(sentences.slice(i, i + chunkSize).join(' ').trim());
  }
  return grouped.filter(Boolean).slice(0, 4);
}

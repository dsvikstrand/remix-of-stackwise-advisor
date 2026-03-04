export function decodeHtmlEntities(input: string | null | undefined) {
  const text = String(input || '');
  if (!text) return '';

  return text
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (match, value: string) => {
      const codePoint = Number.parseInt(value, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, value: string) => {
      const codePoint = Number.parseInt(value, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    });
}

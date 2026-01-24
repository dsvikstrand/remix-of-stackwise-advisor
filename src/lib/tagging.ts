export const MAX_TAGS = 4;

export function normalizeTag(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function normalizeTags(inputs: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of inputs) {
    const slug = normalizeTag(raw);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    output.push(slug);
  }

  return output.slice(0, MAX_TAGS);
}
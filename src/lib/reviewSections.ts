export const DEFAULT_REVIEW_SECTIONS = ['Overview', 'Strengths', 'Gaps', 'Suggestions'];
export const MAX_REVIEW_SECTIONS = 4;

export function formatReviewSection(value: string) {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

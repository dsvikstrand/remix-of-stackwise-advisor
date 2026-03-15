export const VISIBLE_CHIPS_COUNT = 4;

const MARKDOWN_HEADING_RE = /^\s{0,3}#{1,6}\s+/;
const MARKDOWN_BULLET_RE = /^\s*(?:[-*+]\s+|\d+\.\s+|\d+\)\s+)/;

function stripLineMarkdown(line: string): string {
  return line
    .replace(MARKDOWN_HEADING_RE, "")
    .replace(MARKDOWN_BULLET_RE, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .trim();
}

export function cleanFeedPreview(raw: string): string {
  if (!raw) return "";
  const lines = raw.split("\n").map((line) => stripLineMarkdown(line));
  const compact = lines.filter(Boolean).join(" ");
  return compact.replace(/\s+/g, " ").trim();
}

function stripLeadingSummaryLabel(value: string): string {
  return String(value || '')
    .replace(/^summary(?:\s*[.:\-–—]\s*|\s+)/i, '')
    .trim();
}

function buildPreviewTextFromBlueprintSections(sectionsJson: unknown, maxChars: number): string | null {
  if (!sectionsJson || typeof sectionsJson !== 'object' || Array.isArray(sectionsJson)) return null;
  const raw = sectionsJson as Record<string, unknown>;
  if (String(raw.schema_version || '').trim() !== 'blueprint_sections_v1') return null;

  const summaryText = cleanFeedPreview(
    raw.summary && typeof raw.summary === 'object' && !Array.isArray(raw.summary)
      ? String((raw.summary as Record<string, unknown>).text || '')
      : '',
  );
  const takeawayText = (() => {
    const section = raw.takeaways;
    if (!section || typeof section !== 'object' || Array.isArray(section)) return '';
    const bullets = Array.isArray((section as Record<string, unknown>).bullets)
      ? ((section as Record<string, unknown>).bullets as unknown[])
          .map((bullet) => cleanFeedPreview(String(bullet || '')))
          .filter(Boolean)
      : [];
    return bullets[0] || '';
  })();
  const storylineText = cleanFeedPreview(
    raw.storyline && typeof raw.storyline === 'object' && !Array.isArray(raw.storyline)
      ? String((raw.storyline as Record<string, unknown>).text || '')
      : '',
  );

  const text = summaryText || takeawayText || storylineText;
  if (!text) return null;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}...`;
}

interface BuildFeedSummaryOptions {
  sectionsJson?: unknown;
  primary?: string | null;
  secondary?: string | null;
  fallback: string;
  maxChars?: number;
}

export function buildFeedSummary({
  sectionsJson,
  primary,
  secondary,
  fallback,
  maxChars = 240,
}: BuildFeedSummaryOptions): string {
  const safeFallback = cleanFeedPreview(fallback || '') || 'Open blueprint to view full details.';
  const source = buildPreviewTextFromBlueprintSections(sectionsJson, maxChars)
    || cleanFeedPreview(primary || "")
    || cleanFeedPreview(secondary || "")
    || safeFallback;
  const text = stripLeadingSummaryLabel(source).trim() || source.trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}...`;
}

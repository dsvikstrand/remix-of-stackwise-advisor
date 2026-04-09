import type { Database } from '@/integrations/supabase/types';
import type { LandingBlueprintPreview } from '@/lib/landingStory';
import { buildStoredPreviewSummary, cleanFeedPreview } from '@/lib/feedPreview';

type BlueprintRow = Pick<
  Database['public']['Tables']['blueprints']['Row'],
  'id' | 'title' | 'banner_url' | 'preview_summary' | 'sections_json'
>;

const DEFAULT_CREATOR_LABEL = 'Bleup community';
const DEFAULT_CHANNEL_LABEL = 'Live public sample';
const DEFAULT_STATS_LABEL = 'Live sample';
const SUMMARY_MAX_CHARS = 220;
const TAKEAWAY_MAX_CHARS = 90;
const MAX_TAKEAWAYS = 3;

function clampText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trim()}...`;
}

function stripTakeawayLabel(value: string) {
  return String(value || '')
    .replace(/^takeaways?(?:\s*[.:\-–—]\s*|\s+)/i, '')
    .trim();
}

function extractLandingPreviewSummary(sectionsJson: unknown, maxChars = SUMMARY_MAX_CHARS) {
  if (!sectionsJson || typeof sectionsJson !== 'object' || Array.isArray(sectionsJson)) return null;
  const raw = sectionsJson as Record<string, unknown>;
  const summarySection = raw.summary;
  if (!summarySection || typeof summarySection !== 'object' || Array.isArray(summarySection)) return null;

  const summary = cleanFeedPreview(String((summarySection as Record<string, unknown>).text || ''));
  if (!summary) return null;
  return clampText(summary, maxChars);
}

export function extractLandingPreviewTakeaways(
  sectionsJson: unknown,
  maxChars = TAKEAWAY_MAX_CHARS,
  maxCount = MAX_TAKEAWAYS,
) {
  if (!sectionsJson || typeof sectionsJson !== 'object' || Array.isArray(sectionsJson)) return [];
  const raw = sectionsJson as Record<string, unknown>;
  const takeaways = raw.takeaways;
  if (!takeaways || typeof takeaways !== 'object' || Array.isArray(takeaways)) return [];

  const bullets = Array.isArray((takeaways as Record<string, unknown>).bullets)
    ? ((takeaways as Record<string, unknown>).bullets as unknown[])
    : [];

  const cleaned = bullets
    .map((bullet) => stripTakeawayLabel(cleanFeedPreview(String(bullet || ''))))
    .filter(Boolean)
    .map((bullet) => clampText(bullet, maxChars));

  return cleaned.slice(0, maxCount);
}

export function buildLandingPreviewFromBlueprint(
  row: BlueprintRow,
  fallback: LandingBlueprintPreview,
): LandingBlueprintPreview | null {
  const summary = extractLandingPreviewSummary(row.sections_json)
    || buildStoredPreviewSummary({
      primary: row.preview_summary,
      fallback: fallback.summary,
      maxChars: SUMMARY_MAX_CHARS,
    });
  const takeaways = extractLandingPreviewTakeaways(row.sections_json);

  if (!summary || takeaways.length === 0) return null;

  return {
    id: row.id,
    title: cleanFeedPreview(row.title) || fallback.title,
    creator: DEFAULT_CREATOR_LABEL,
    channel: DEFAULT_CHANNEL_LABEL,
    thumbnailUrl: row.banner_url || fallback.thumbnailUrl,
    summary,
    takeaways,
    statsLabel: DEFAULT_STATS_LABEL,
  };
}

export function pickStableItem<T>(items: T[], seed: number): T | null {
  if (!items.length) return null;
  const index = Math.abs(seed) % items.length;
  return items[index] ?? null;
}

export function pickStableItems<T>(items: T[], seed: number, count: number): T[] {
  if (!items.length || count <= 0) return [];

  const picked: T[] = [];
  const usedIndexes = new Set<number>();
  const startIndex = Math.abs(seed) % items.length;

  for (let offset = 0; offset < items.length && picked.length < count; offset += 1) {
    const index = (startIndex + offset) % items.length;
    if (usedIndexes.has(index)) continue;
    const item = items[index];
    if (!item) continue;
    usedIndexes.add(index);
    picked.push(item);
  }

  return picked;
}

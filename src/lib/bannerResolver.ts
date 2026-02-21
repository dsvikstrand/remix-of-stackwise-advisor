type ResolveEffectiveBannerInput = {
  bannerUrl?: string | null;
  sourceThumbnailUrl?: string | null;
};

function normalizeUrl(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export function resolveEffectiveBanner(input: ResolveEffectiveBannerInput) {
  const sourceThumbnailUrl = normalizeUrl(input.sourceThumbnailUrl);
  if (sourceThumbnailUrl) return sourceThumbnailUrl;
  return normalizeUrl(input.bannerUrl);
}

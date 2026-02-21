-- bleuV1 thumbnail-first banners for YouTube source blueprints

WITH latest_youtube_source AS (
  SELECT
    ufi.blueprint_id,
    si.thumbnail_url,
    row_number() OVER (
      PARTITION BY ufi.blueprint_id
      ORDER BY ufi.created_at DESC, ufi.id DESC
    ) AS rn
  FROM public.user_feed_items ufi
  JOIN public.source_items si
    ON si.id = ufi.source_item_id
  WHERE
    ufi.blueprint_id IS NOT NULL
    AND si.source_type = 'youtube'
    AND nullif(trim(coalesce(si.thumbnail_url, '')), '') IS NOT NULL
),
resolved AS (
  SELECT
    blueprint_id,
    nullif(trim(thumbnail_url), '') AS thumbnail_url
  FROM latest_youtube_source
  WHERE rn = 1
)
UPDATE public.blueprints b
SET
  banner_url = r.thumbnail_url,
  banner_generated_url = null,
  banner_effective_source = 'none',
  banner_policy_updated_at = now()
FROM resolved r
WHERE
  b.id = r.blueprint_id
  AND r.thumbnail_url IS NOT NULL;

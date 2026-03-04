CREATE TABLE IF NOT EXISTS public.blueprint_youtube_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
  youtube_video_id text NOT NULL,
  sort_mode text NOT NULL CHECK (sort_mode IN ('top', 'new')),
  source_comment_id text NOT NULL,
  display_order integer NOT NULL,
  author_name text NULL,
  author_avatar_url text NULL,
  content text NOT NULL,
  published_at timestamptz NULL,
  like_count integer NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blueprint_youtube_comments ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_blueprint_youtube_comments_unique
  ON public.blueprint_youtube_comments (blueprint_id, sort_mode, source_comment_id);

CREATE INDEX IF NOT EXISTS idx_blueprint_youtube_comments_lookup
  ON public.blueprint_youtube_comments (blueprint_id, sort_mode, display_order);

DROP POLICY IF EXISTS "Anyone can view blueprint YouTube comments" ON public.blueprint_youtube_comments;
CREATE POLICY "Anyone can view blueprint YouTube comments"
  ON public.blueprint_youtube_comments FOR SELECT
  USING (true);

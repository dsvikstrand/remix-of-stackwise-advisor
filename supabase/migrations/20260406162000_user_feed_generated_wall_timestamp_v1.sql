ALTER TABLE public.user_feed_items
  ADD COLUMN IF NOT EXISTS generated_at_on_wall timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_user_feed_items_user_generated_wall
  ON public.user_feed_items(user_id, generated_at_on_wall DESC, created_at DESC);

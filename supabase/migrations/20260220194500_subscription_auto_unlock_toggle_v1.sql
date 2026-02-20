-- bleuV1 auto-unlock toggle on subscriptions

ALTER TABLE public.user_source_subscriptions
  ADD COLUMN IF NOT EXISTS auto_unlock_enabled boolean NOT NULL DEFAULT true;

UPDATE public.user_source_subscriptions
SET auto_unlock_enabled = true
WHERE auto_unlock_enabled IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_source_subscriptions_page_active_auto_unlock
  ON public.user_source_subscriptions(source_page_id, is_active, auto_unlock_enabled);

CREATE INDEX IF NOT EXISTS idx_user_source_subscriptions_channel_active_auto_unlock
  ON public.user_source_subscriptions(source_channel_id, is_active, auto_unlock_enabled);

-- Add iPhone quiet-notification delivery mode to per-device push subscriptions.

ALTER TABLE public.notification_push_subscriptions
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'normal'
  CHECK (delivery_mode IN ('normal', 'quiet_ios'));

UPDATE public.notification_push_subscriptions
SET delivery_mode = 'normal'
WHERE delivery_mode IS NULL;

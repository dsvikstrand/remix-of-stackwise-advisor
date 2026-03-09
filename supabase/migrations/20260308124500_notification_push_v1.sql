-- Installed-PWA web push foundation derived from the existing notifications table.

CREATE TABLE IF NOT EXISTS public.notification_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  expiration_time timestamp with time zone,
  platform text,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_push_subscriptions_endpoint
  ON public.notification_push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS idx_notification_push_subscriptions_user_active
  ON public.notification_push_subscriptions (user_id, is_active, updated_at DESC);

ALTER TABLE public.notification_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their push subscriptions" ON public.notification_push_subscriptions;
DROP POLICY IF EXISTS "Users can create their push subscriptions" ON public.notification_push_subscriptions;
DROP POLICY IF EXISTS "Users can update their push subscriptions" ON public.notification_push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their push subscriptions" ON public.notification_push_subscriptions;

CREATE POLICY "Users can view their push subscriptions"
  ON public.notification_push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their push subscriptions"
  ON public.notification_push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their push subscriptions"
  ON public.notification_push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their push subscriptions"
  ON public.notification_push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_notification_push_subscriptions_updated_at ON public.notification_push_subscriptions;
CREATE TRIGGER update_notification_push_subscriptions_updated_at
  BEFORE UPDATE ON public.notification_push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.notification_push_dispatch_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  last_error text,
  delivered_subscription_count integer NOT NULL DEFAULT 0 CHECK (delivered_subscription_count >= 0),
  last_attempt_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_push_dispatch_queue_notification_id
  ON public.notification_push_dispatch_queue (notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_push_dispatch_queue_status_next_attempt
  ON public.notification_push_dispatch_queue (status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_notification_push_dispatch_queue_user_created
  ON public.notification_push_dispatch_queue (user_id, created_at DESC);

ALTER TABLE public.notification_push_dispatch_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their push dispatch queue" ON public.notification_push_dispatch_queue;

CREATE POLICY "Users can view their push dispatch queue"
  ON public.notification_push_dispatch_queue FOR SELECT
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_notification_push_dispatch_queue_updated_at ON public.notification_push_dispatch_queue;
CREATE TRIGGER update_notification_push_dispatch_queue_updated_at
  BEFORE UPDATE ON public.notification_push_dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enqueue_notification_push_dispatch()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type NOT IN ('comment_reply', 'generation_succeeded', 'generation_failed') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notification_push_dispatch_queue (
    notification_id,
    user_id,
    status,
    next_attempt_at
  )
  VALUES (
    NEW.id,
    NEW.user_id,
    'queued',
    now()
  )
  ON CONFLICT (notification_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_notification_enqueue_push_dispatch ON public.notifications;
CREATE TRIGGER on_notification_enqueue_push_dispatch
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_push_dispatch();

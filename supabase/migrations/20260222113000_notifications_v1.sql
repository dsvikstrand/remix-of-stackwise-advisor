-- Notifications foundation (reply + generation terminal events)

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamp with time zone,
  dedupe_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_desc
  ON public.notifications (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created_desc
  ON public.notifications (user_id, is_read, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe_key
  ON public.notifications (user_id, dedupe_key);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;

CREATE POLICY "Users can view their notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_notifications_updated_at ON public.notifications;
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_comment_reply_notification()
RETURNS TRIGGER AS $$
DECLARE
  parent_comment record;
  snippet text;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.id, c.user_id, c.post_id
    INTO parent_comment
    FROM public.wall_comments c
   WHERE c.id = NEW.parent_id
   LIMIT 1;

  IF parent_comment.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF parent_comment.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  snippet := trim(coalesce(NEW.body, ''));
  IF length(snippet) > 140 THEN
    snippet := left(snippet, 137) || '...';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    link_path,
    metadata,
    dedupe_key
  )
  VALUES (
    parent_comment.user_id,
    'comment_reply',
    'Someone replied to your comment',
    CASE WHEN snippet = '' THEN 'Open to view the reply.' ELSE snippet END,
    '/wall/' || parent_comment.post_id::text,
    jsonb_build_object(
      'post_id', parent_comment.post_id,
      'parent_comment_id', parent_comment.id,
      'reply_comment_id', NEW.id,
      'reply_user_id', NEW.user_id
    ),
    'comment_reply:' || NEW.id::text
  )
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_wall_comment_reply_notification ON public.wall_comments;
CREATE TRIGGER on_wall_comment_reply_notification
  AFTER INSERT ON public.wall_comments
  FOR EACH ROW EXECUTE FUNCTION public.create_comment_reply_notification();

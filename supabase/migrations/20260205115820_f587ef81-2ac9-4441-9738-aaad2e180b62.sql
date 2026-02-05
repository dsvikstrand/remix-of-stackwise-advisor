-- Create mvp_events table for lightweight analytics logging
CREATE TABLE public.mvp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  user_id UUID NULL,
  blueprint_id UUID NULL,
  path TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS (but allow service role to bypass)
ALTER TABLE public.mvp_events ENABLE ROW LEVEL SECURITY;

-- Create index on event_name and created_at for common queries
CREATE INDEX idx_mvp_events_event_name ON public.mvp_events(event_name);
CREATE INDEX idx_mvp_events_created_at ON public.mvp_events(created_at DESC);

-- Policy: Only admins can read events (for dashboard purposes later)
CREATE POLICY "Admins can view events"
ON public.mvp_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'));
-- bleuV1 durable generation traceability (runs + events)

CREATE TABLE IF NOT EXISTS public.generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blueprint_id uuid REFERENCES public.blueprints(id) ON DELETE SET NULL,
  source_scope text,
  source_tag text,
  video_id text,
  video_url text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  model_primary text,
  model_used text,
  fallback_used boolean,
  fallback_model text,
  reasoning_effort text,
  quality_ok boolean,
  quality_issues text[] NOT NULL DEFAULT '{}'::text[],
  quality_retries_used integer,
  quality_final_mode text,
  trace_version text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.generation_run_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id text NOT NULL REFERENCES public.generation_runs(run_id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq > 0),
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_run_events_run_seq
  ON public.generation_run_events (run_id, seq);

CREATE INDEX IF NOT EXISTS idx_generation_runs_user_created_desc
  ON public.generation_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_runs_blueprint_created_desc
  ON public.generation_runs (blueprint_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_runs_status_created_desc
  ON public.generation_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_run_events_run_id_id_desc
  ON public.generation_run_events (run_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_generation_run_events_created_desc
  ON public.generation_run_events (created_at DESC);

ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own generation runs" ON public.generation_runs;
DROP POLICY IF EXISTS "Service role can manage generation runs" ON public.generation_runs;
DROP POLICY IF EXISTS "Users can view own generation run events" ON public.generation_run_events;
DROP POLICY IF EXISTS "Service role can manage generation run events" ON public.generation_run_events;

CREATE POLICY "Users can view own generation runs"
  ON public.generation_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage generation runs"
  ON public.generation_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can view own generation run events"
  ON public.generation_run_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.generation_runs r
      WHERE r.run_id = generation_run_events.run_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage generation run events"
  ON public.generation_run_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_generation_runs_updated_at ON public.generation_runs;
CREATE TRIGGER update_generation_runs_updated_at
  BEFORE UPDATE ON public.generation_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.purge_generation_run_events_older_than(p_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 3650));
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.generation_run_events
  WHERE created_at < now() - make_interval(days => v_days);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_generation_run_events_older_than(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_generation_run_events_older_than(integer) TO service_role;

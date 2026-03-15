-- Oracle/Paperspace transcript bridge request model

CREATE TABLE IF NOT EXISTS public.transcript_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_number integer NOT NULL DEFAULT 1,
  requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_item_unlock_id uuid REFERENCES public.source_item_unlocks(id) ON DELETE SET NULL,
  source_item_id uuid REFERENCES public.source_items(id) ON DELETE SET NULL,
  ingestion_job_id uuid REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL,
  oracle_job_id text NOT NULL,
  manifest_filename text NOT NULL,
  video_id text NOT NULL,
  source_url text NOT NULL,
  request_source text NOT NULL,
  priority integer NOT NULL DEFAULT 1,
  trace_id text,
  transport_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_error text,
  submitted_at timestamp with time zone,
  completed_at timestamp with time zone,
  failed_at timestamp with time zone,
  ingested_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'submitted', 'completed', 'failed')),
  CHECK (attempt_number >= 1),
  CHECK (priority >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transcript_requests_oracle_job_id
  ON public.transcript_requests(oracle_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transcript_requests_manifest_filename
  ON public.transcript_requests(manifest_filename);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transcript_requests_unlock_attempt
  ON public.transcript_requests(source_item_unlock_id, attempt_number)
  WHERE source_item_unlock_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transcript_requests_unlock_open
  ON public.transcript_requests(source_item_unlock_id)
  WHERE source_item_unlock_id IS NOT NULL
    AND status IN ('pending', 'submitted');
ALTER TABLE public.transcript_requests ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS update_transcript_requests_updated_at ON public.transcript_requests;
CREATE TRIGGER update_transcript_requests_updated_at
  BEFORE UPDATE ON public.transcript_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

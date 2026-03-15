ALTER TABLE public.transcript_requests
  ADD COLUMN IF NOT EXISTS result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result_job_dir text,
  ADD COLUMN IF NOT EXISTS result_transcript_path text,
  ADD COLUMN IF NOT EXISTS result_segments_path text,
  ADD COLUMN IF NOT EXISTS result_language text,
  ADD COLUMN IF NOT EXISTS result_audio_duration_sec double precision,
  ADD COLUMN IF NOT EXISTS result_transcribe_elapsed_sec double precision,
  ADD COLUMN IF NOT EXISTS result_model text,
  ADD COLUMN IF NOT EXISTS result_compute_type text,
  ADD COLUMN IF NOT EXISTS result_beam_size integer,
  ADD COLUMN IF NOT EXISTS result_reused_warm_model boolean,
  ADD COLUMN IF NOT EXISTS result_segments_count integer,
  ADD COLUMN IF NOT EXISTS ingest_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ingest_error text;
CREATE INDEX IF NOT EXISTS idx_transcript_requests_submitted_ingest
  ON public.transcript_requests(status, ingested_at, updated_at)
  WHERE status = 'submitted';

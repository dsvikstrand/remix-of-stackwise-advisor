-- bleuV1 transcript truth model for source unlocks

ALTER TABLE public.source_item_unlocks
  ADD COLUMN IF NOT EXISTS transcript_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS transcript_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcript_no_caption_hits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcript_last_probe_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS transcript_retry_after timestamp with time zone,
  ADD COLUMN IF NOT EXISTS transcript_probe_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'source_item_unlocks_transcript_status_check'
  ) THEN
    ALTER TABLE public.source_item_unlocks
      ADD CONSTRAINT source_item_unlocks_transcript_status_check
      CHECK (transcript_status IN ('unknown', 'retrying', 'confirmed_no_speech', 'transient_error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_source_item_unlocks_transcript_retry_after
  ON public.source_item_unlocks(transcript_retry_after);

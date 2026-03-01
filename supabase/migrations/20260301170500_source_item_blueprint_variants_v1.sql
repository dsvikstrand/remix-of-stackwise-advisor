-- Bleu MVP tiered blueprint variants (test mode)

CREATE TABLE IF NOT EXISTS public.source_item_blueprint_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id uuid NOT NULL REFERENCES public.source_items(id) ON DELETE CASCADE,
  generation_tier text NOT NULL,
  status text NOT NULL DEFAULT 'available',
  blueprint_id uuid REFERENCES public.blueprints(id) ON DELETE SET NULL,
  active_job_id uuid REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL,
  last_error_code text,
  last_error_message text,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT source_item_blueprint_variants_tier_check CHECK (generation_tier IN ('free', 'tier')),
  CONSTRAINT source_item_blueprint_variants_status_check CHECK (status IN ('available', 'queued', 'running', 'ready', 'failed')),
  CONSTRAINT source_item_blueprint_variants_source_tier_unique UNIQUE (source_item_id, generation_tier)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_item_blueprint_variants_blueprint_unique
  ON public.source_item_blueprint_variants(blueprint_id)
  WHERE blueprint_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_source_item_blueprint_variants_status_job_updated
  ON public.source_item_blueprint_variants(status, active_job_id, updated_at DESC);

ALTER TABLE public.source_item_blueprint_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view source item blueprint variants" ON public.source_item_blueprint_variants;
CREATE POLICY "Authenticated can view source item blueprint variants"
  ON public.source_item_blueprint_variants FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS update_source_item_blueprint_variants_updated_at ON public.source_item_blueprint_variants;
CREATE TRIGGER update_source_item_blueprint_variants_updated_at
  BEFORE UPDATE ON public.source_item_blueprint_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

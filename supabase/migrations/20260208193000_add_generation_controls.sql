-- Add generation_controls JSONB to inventories + blueprints
-- Purpose: persist promptless "click/press" intent (control packs) for DAS + eval.
-- Note: in Lovable Cloud, you may need to run this manually in the SQL console.

ALTER TABLE IF EXISTS public.inventories
  ADD COLUMN IF NOT EXISTS generation_controls jsonb;

ALTER TABLE IF EXISTS public.blueprints
  ADD COLUMN IF NOT EXISTS generation_controls jsonb;


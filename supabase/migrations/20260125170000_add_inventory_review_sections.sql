ALTER TABLE public.inventories
  ADD COLUMN IF NOT EXISTS review_sections text[] NOT NULL DEFAULT '{}'::text[];

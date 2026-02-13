-- Add include_score column to inventories table
ALTER TABLE public.inventories
ADD COLUMN IF NOT EXISTS include_score boolean NOT NULL DEFAULT false;

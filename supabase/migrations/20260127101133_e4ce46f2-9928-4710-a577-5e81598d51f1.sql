-- Add steps column to blueprints table for stepwise instructions
ALTER TABLE public.blueprints
ADD COLUMN IF NOT EXISTS steps jsonb DEFAULT NULL;

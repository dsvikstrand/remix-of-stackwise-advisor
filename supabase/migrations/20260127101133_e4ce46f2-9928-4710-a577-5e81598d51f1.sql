-- Add steps column to blueprints table for stepwise instructions
ALTER TABLE public.blueprints
ADD COLUMN steps jsonb DEFAULT NULL;
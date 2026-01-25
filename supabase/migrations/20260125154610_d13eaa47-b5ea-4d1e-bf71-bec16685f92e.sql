-- Add review_sections column to inventories table
ALTER TABLE public.inventories
ADD COLUMN review_sections text[] DEFAULT ARRAY['Overview', 'Strengths', 'Gaps', 'Suggestions']::text[];
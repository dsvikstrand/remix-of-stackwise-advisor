-- Add visibility enum and column (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recipe_visibility') THEN
    CREATE TYPE public.recipe_visibility AS ENUM ('private', 'unlisted', 'public');
  END IF;
END $$;

ALTER TABLE public.user_recipes
  ADD COLUMN IF NOT EXISTS visibility public.recipe_visibility NOT NULL DEFAULT 'private';

-- Update existing data with proper casting
UPDATE public.user_recipes
SET visibility = CASE WHEN is_public THEN 'public'::recipe_visibility ELSE 'private'::recipe_visibility END;

-- Trigger to sync visibility and is_public
CREATE OR REPLACE FUNCTION public.sync_user_recipes_visibility()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.visibility = 'public' THEN
    NEW.is_public = true;
  ELSE
    NEW.is_public = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sync_user_recipes_visibility ON public.user_recipes;
CREATE TRIGGER sync_user_recipes_visibility
  BEFORE INSERT OR UPDATE ON public.user_recipes
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_recipes_visibility();

-- Post bookmarks
CREATE TABLE IF NOT EXISTS public.post_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  post_id uuid REFERENCES public.wall_posts(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, post_id)
);

ALTER TABLE public.post_bookmarks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own bookmarks' AND tablename = 'post_bookmarks') THEN
    CREATE POLICY "Users can view their own bookmarks"
      ON public.post_bookmarks FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create their own bookmarks' AND tablename = 'post_bookmarks') THEN
    CREATE POLICY "Users can create their own bookmarks"
      ON public.post_bookmarks FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own bookmarks' AND tablename = 'post_bookmarks') THEN
    CREATE POLICY "Users can delete their own bookmarks"
      ON public.post_bookmarks FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_post_bookmarks_user_id ON public.post_bookmarks (user_id);
CREATE INDEX IF NOT EXISTS idx_post_bookmarks_post_id ON public.post_bookmarks (post_id);
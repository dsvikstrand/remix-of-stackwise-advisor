-- Social tags, comments, and visibility

-- Add visibility enum and column for recipes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recipe_visibility') THEN
    CREATE TYPE public.recipe_visibility AS ENUM ('private', 'unlisted', 'public');
  END IF;
END $$;

ALTER TABLE public.user_recipes
  ADD COLUMN IF NOT EXISTS visibility public.recipe_visibility NOT NULL DEFAULT 'private';

UPDATE public.user_recipes
SET visibility = CASE
  WHEN is_public THEN 'public'::recipe_visibility
  ELSE 'private'::recipe_visibility
END
WHERE visibility IS NULL OR visibility = 'private';

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

-- Tags
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  follower_count integer DEFAULT 0 NOT NULL,
  CONSTRAINT tags_slug_lowercase CHECK (slug = lower(slug))
);

CREATE TABLE IF NOT EXISTS public.recipe_tags (
  recipe_id uuid REFERENCES public.user_recipes(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.tag_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.tag_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, tag_id)
);

-- Comments
CREATE TABLE IF NOT EXISTS public.wall_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.wall_posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  parent_id uuid REFERENCES public.wall_comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  likes_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.comment_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  comment_id uuid REFERENCES public.wall_comments(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, comment_id)
);

-- Enable RLS
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wall_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- Idempotency guard for repeated pushes.
DROP POLICY IF EXISTS "Anyone can view tags" ON public.tags;
DROP POLICY IF EXISTS "Users can create tags" ON public.tags;
DROP POLICY IF EXISTS "Users can view tags for public recipes" ON public.recipe_tags;
DROP POLICY IF EXISTS "Users can tag their public recipes" ON public.recipe_tags;
DROP POLICY IF EXISTS "Users can remove tags from their recipes" ON public.recipe_tags;
DROP POLICY IF EXISTS "Users can view their tag follows" ON public.tag_follows;
DROP POLICY IF EXISTS "Users can follow tags" ON public.tag_follows;
DROP POLICY IF EXISTS "Users can unfollow tags" ON public.tag_follows;
DROP POLICY IF EXISTS "Users can view their muted tags" ON public.tag_mutes;
DROP POLICY IF EXISTS "Users can mute tags" ON public.tag_mutes;
DROP POLICY IF EXISTS "Users can unmute tags" ON public.tag_mutes;
DROP POLICY IF EXISTS "Anyone can view wall comments" ON public.wall_comments;
DROP POLICY IF EXISTS "Users can create their own comments" ON public.wall_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.wall_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.wall_comments;
DROP POLICY IF EXISTS "Anyone can view comment likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Users can create their own comment likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Users can delete their own comment likes" ON public.comment_likes;

-- RLS Policies: tags
CREATE POLICY "Anyone can view tags"
  ON public.tags FOR SELECT
  USING (true);

CREATE POLICY "Users can create tags"
  ON public.tags FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- RLS Policies: recipe_tags
CREATE POLICY "Users can view tags for public recipes"
  ON public.recipe_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_recipes r
      WHERE r.id = recipe_id
        AND (r.user_id = auth.uid() OR r.visibility = 'public')
    )
  );

CREATE POLICY "Users can tag their public recipes"
  ON public.recipe_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_recipes r
      WHERE r.id = recipe_id
        AND r.user_id = auth.uid()
        AND r.visibility = 'public'
    )
  );

CREATE POLICY "Users can remove tags from their recipes"
  ON public.recipe_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_recipes r
      WHERE r.id = recipe_id
        AND r.user_id = auth.uid()
    )
  );

-- RLS Policies: tag_follows
CREATE POLICY "Users can view their tag follows"
  ON public.tag_follows FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can follow tags"
  ON public.tag_follows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unfollow tags"
  ON public.tag_follows FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies: tag_mutes
CREATE POLICY "Users can view their muted tags"
  ON public.tag_mutes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mute tags"
  ON public.tag_mutes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unmute tags"
  ON public.tag_mutes FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies: wall_comments
CREATE POLICY "Anyone can view wall comments"
  ON public.wall_comments FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own comments"
  ON public.wall_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments"
  ON public.wall_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON public.wall_comments FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies: comment_likes
CREATE POLICY "Anyone can view comment likes"
  ON public.comment_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own comment likes"
  ON public.comment_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comment likes"
  ON public.comment_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Triggers
DROP TRIGGER IF EXISTS update_wall_comments_updated_at ON public.wall_comments;
CREATE TRIGGER update_wall_comments_updated_at
  BEFORE UPDATE ON public.wall_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.increment_tag_followers()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tags
  SET follower_count = follower_count + 1
  WHERE id = NEW.tag_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.decrement_tag_followers()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tags
  SET follower_count = GREATEST(0, follower_count - 1)
  WHERE id = OLD.tag_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_tag_follow_created ON public.tag_follows;
CREATE TRIGGER on_tag_follow_created
  AFTER INSERT ON public.tag_follows
  FOR EACH ROW EXECUTE FUNCTION public.increment_tag_followers();

DROP TRIGGER IF EXISTS on_tag_follow_deleted ON public.tag_follows;
CREATE TRIGGER on_tag_follow_deleted
  AFTER DELETE ON public.tag_follows
  FOR EACH ROW EXECUTE FUNCTION public.decrement_tag_followers();

CREATE OR REPLACE FUNCTION public.increment_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.wall_comments
  SET likes_count = likes_count + 1
  WHERE id = NEW.comment_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.decrement_comment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.wall_comments
  SET likes_count = GREATEST(0, likes_count - 1)
  WHERE id = OLD.comment_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_comment_like_created ON public.comment_likes;
CREATE TRIGGER on_comment_like_created
  AFTER INSERT ON public.comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.increment_comment_likes_count();

DROP TRIGGER IF EXISTS on_comment_like_deleted ON public.comment_likes;
CREATE TRIGGER on_comment_like_deleted
  AFTER DELETE ON public.comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.decrement_comment_likes_count();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tags_slug ON public.tags (slug);
CREATE INDEX IF NOT EXISTS idx_recipe_tags_tag_id ON public.recipe_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_recipe_tags_recipe_id ON public.recipe_tags (recipe_id);
CREATE INDEX IF NOT EXISTS idx_tag_follows_tag_id ON public.tag_follows (tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_mutes_tag_id ON public.tag_mutes (tag_id);
CREATE INDEX IF NOT EXISTS idx_wall_comments_post_id ON public.wall_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_wall_comments_parent_id ON public.wall_comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON public.comment_likes (comment_id);

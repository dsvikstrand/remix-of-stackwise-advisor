-- Inventories + Blueprints (v0_6)

-- Inventories
CREATE TABLE IF NOT EXISTS public.inventories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  prompt_inventory text NOT NULL,
  prompt_categories text NOT NULL,
  generated_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  creator_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_public boolean DEFAULT true NOT NULL,
  likes_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_tags (
  inventory_id uuid REFERENCES public.inventories(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (inventory_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid REFERENCES public.inventories(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, inventory_id)
);

CREATE TABLE IF NOT EXISTS public.inventory_remixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid REFERENCES public.inventories(id) ON DELETE CASCADE NOT NULL,
  source_inventory_id uuid REFERENCES public.inventories(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Blueprints
CREATE TABLE IF NOT EXISTS public.blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid REFERENCES public.inventories(id) ON DELETE SET NULL,
  creator_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  selected_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  mix_notes text,
  review_prompt text,
  llm_review text,
  is_public boolean DEFAULT true NOT NULL,
  likes_count integer DEFAULT 0 NOT NULL,
  source_blueprint_id uuid REFERENCES public.blueprints(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.blueprint_tags (
  blueprint_id uuid REFERENCES public.blueprints(id) ON DELETE CASCADE NOT NULL,
  tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (blueprint_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.blueprint_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid REFERENCES public.blueprints(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, blueprint_id)
);

CREATE TABLE IF NOT EXISTS public.blueprint_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid REFERENCES public.blueprints(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_remixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blueprint_comments ENABLE ROW LEVEL SECURITY;

-- Idempotency guards for repeated pushes.
DROP POLICY IF EXISTS "Anyone can view public inventories" ON public.inventories;
DROP POLICY IF EXISTS "Users can create inventories" ON public.inventories;
DROP POLICY IF EXISTS "Users can update their inventories" ON public.inventories;
DROP POLICY IF EXISTS "Users can delete their inventories" ON public.inventories;
DROP POLICY IF EXISTS "Users can view inventory tags" ON public.inventory_tags;
DROP POLICY IF EXISTS "Users can tag their inventories" ON public.inventory_tags;
DROP POLICY IF EXISTS "Users can remove tags from their inventories" ON public.inventory_tags;
DROP POLICY IF EXISTS "Anyone can view inventory likes" ON public.inventory_likes;
DROP POLICY IF EXISTS "Users can create inventory likes" ON public.inventory_likes;
DROP POLICY IF EXISTS "Users can delete inventory likes" ON public.inventory_likes;
DROP POLICY IF EXISTS "Anyone can view inventory remixes" ON public.inventory_remixes;
DROP POLICY IF EXISTS "Users can create inventory remixes" ON public.inventory_remixes;
DROP POLICY IF EXISTS "Anyone can view public blueprints" ON public.blueprints;
DROP POLICY IF EXISTS "Users can create blueprints" ON public.blueprints;
DROP POLICY IF EXISTS "Users can update their blueprints" ON public.blueprints;
DROP POLICY IF EXISTS "Users can delete their blueprints" ON public.blueprints;
DROP POLICY IF EXISTS "Users can view blueprint tags" ON public.blueprint_tags;
DROP POLICY IF EXISTS "Users can tag their blueprints" ON public.blueprint_tags;
DROP POLICY IF EXISTS "Users can remove tags from their blueprints" ON public.blueprint_tags;
DROP POLICY IF EXISTS "Anyone can view blueprint likes" ON public.blueprint_likes;
DROP POLICY IF EXISTS "Users can create blueprint likes" ON public.blueprint_likes;
DROP POLICY IF EXISTS "Users can delete blueprint likes" ON public.blueprint_likes;
DROP POLICY IF EXISTS "Anyone can view blueprint comments" ON public.blueprint_comments;
DROP POLICY IF EXISTS "Users can create blueprint comments" ON public.blueprint_comments;
DROP POLICY IF EXISTS "Users can update their blueprint comments" ON public.blueprint_comments;
DROP POLICY IF EXISTS "Users can delete their blueprint comments" ON public.blueprint_comments;

-- RLS Policies: inventories
CREATE POLICY "Anyone can view public inventories"
  ON public.inventories FOR SELECT
  USING (is_public = true OR creator_user_id = auth.uid());

CREATE POLICY "Users can create inventories"
  ON public.inventories FOR INSERT
  WITH CHECK (auth.uid() = creator_user_id);

CREATE POLICY "Users can update their inventories"
  ON public.inventories FOR UPDATE
  USING (auth.uid() = creator_user_id);

CREATE POLICY "Users can delete their inventories"
  ON public.inventories FOR DELETE
  USING (auth.uid() = creator_user_id);

-- RLS Policies: inventory_tags
CREATE POLICY "Users can view inventory tags"
  ON public.inventory_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inventories i
      WHERE i.id = inventory_id
        AND (i.is_public = true OR i.creator_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can tag their inventories"
  ON public.inventory_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inventories i
      WHERE i.id = inventory_id
        AND i.creator_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove tags from their inventories"
  ON public.inventory_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.inventories i
      WHERE i.id = inventory_id
        AND i.creator_user_id = auth.uid()
    )
  );

-- RLS Policies: inventory_likes
CREATE POLICY "Anyone can view inventory likes"
  ON public.inventory_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can create inventory likes"
  ON public.inventory_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete inventory likes"
  ON public.inventory_likes FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies: inventory_remixes
CREATE POLICY "Anyone can view inventory remixes"
  ON public.inventory_remixes FOR SELECT
  USING (true);

CREATE POLICY "Users can create inventory remixes"
  ON public.inventory_remixes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies: blueprints
CREATE POLICY "Anyone can view public blueprints"
  ON public.blueprints FOR SELECT
  USING (is_public = true OR creator_user_id = auth.uid());

CREATE POLICY "Users can create blueprints"
  ON public.blueprints FOR INSERT
  WITH CHECK (auth.uid() = creator_user_id);

CREATE POLICY "Users can update their blueprints"
  ON public.blueprints FOR UPDATE
  USING (auth.uid() = creator_user_id);

CREATE POLICY "Users can delete their blueprints"
  ON public.blueprints FOR DELETE
  USING (auth.uid() = creator_user_id);

-- RLS Policies: blueprint_tags
CREATE POLICY "Users can view blueprint tags"
  ON public.blueprint_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.blueprints b
      WHERE b.id = blueprint_id
        AND (b.is_public = true OR b.creator_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can tag their blueprints"
  ON public.blueprint_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.blueprints b
      WHERE b.id = blueprint_id
        AND b.creator_user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove tags from their blueprints"
  ON public.blueprint_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.blueprints b
      WHERE b.id = blueprint_id
        AND b.creator_user_id = auth.uid()
    )
  );

-- RLS Policies: blueprint_likes
CREATE POLICY "Anyone can view blueprint likes"
  ON public.blueprint_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can create blueprint likes"
  ON public.blueprint_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete blueprint likes"
  ON public.blueprint_likes FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies: blueprint_comments
CREATE POLICY "Anyone can view blueprint comments"
  ON public.blueprint_comments FOR SELECT
  USING (true);

CREATE POLICY "Users can create blueprint comments"
  ON public.blueprint_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their blueprint comments"
  ON public.blueprint_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their blueprint comments"
  ON public.blueprint_comments FOR DELETE
  USING (auth.uid() = user_id);

-- Triggers
DROP TRIGGER IF EXISTS update_inventories_updated_at ON public.inventories;
CREATE TRIGGER update_inventories_updated_at
  BEFORE UPDATE ON public.inventories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_blueprints_updated_at ON public.blueprints;
CREATE TRIGGER update_blueprints_updated_at
  BEFORE UPDATE ON public.blueprints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_blueprint_comments_updated_at ON public.blueprint_comments;
CREATE TRIGGER update_blueprint_comments_updated_at
  BEFORE UPDATE ON public.blueprint_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.increment_inventory_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.inventories
  SET likes_count = likes_count + 1
  WHERE id = NEW.inventory_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.decrement_inventory_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.inventories
  SET likes_count = GREATEST(0, likes_count - 1)
  WHERE id = OLD.inventory_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_inventory_like_created ON public.inventory_likes;
CREATE TRIGGER on_inventory_like_created
  AFTER INSERT ON public.inventory_likes
  FOR EACH ROW EXECUTE FUNCTION public.increment_inventory_likes_count();

DROP TRIGGER IF EXISTS on_inventory_like_deleted ON public.inventory_likes;
CREATE TRIGGER on_inventory_like_deleted
  AFTER DELETE ON public.inventory_likes
  FOR EACH ROW EXECUTE FUNCTION public.decrement_inventory_likes_count();

CREATE OR REPLACE FUNCTION public.increment_blueprint_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.blueprints
  SET likes_count = likes_count + 1
  WHERE id = NEW.blueprint_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.decrement_blueprint_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.blueprints
  SET likes_count = GREATEST(0, likes_count - 1)
  WHERE id = OLD.blueprint_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_blueprint_like_created ON public.blueprint_likes;
CREATE TRIGGER on_blueprint_like_created
  AFTER INSERT ON public.blueprint_likes
  FOR EACH ROW EXECUTE FUNCTION public.increment_blueprint_likes_count();

DROP TRIGGER IF EXISTS on_blueprint_like_deleted ON public.blueprint_likes;
CREATE TRIGGER on_blueprint_like_deleted
  AFTER DELETE ON public.blueprint_likes
  FOR EACH ROW EXECUTE FUNCTION public.decrement_blueprint_likes_count();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventories_creator ON public.inventories (creator_user_id);
CREATE INDEX IF NOT EXISTS idx_inventories_public ON public.inventories (is_public);
CREATE INDEX IF NOT EXISTS idx_inventories_created_at ON public.inventories (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tags_inventory ON public.inventory_tags (inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tags_tag ON public.inventory_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_inventory_likes_inventory ON public.inventory_likes (inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_likes_user ON public.inventory_likes (user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_remixes_source ON public.inventory_remixes (source_inventory_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_creator ON public.blueprints (creator_user_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_public ON public.blueprints (is_public);
CREATE INDEX IF NOT EXISTS idx_blueprints_created_at ON public.blueprints (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blueprint_tags_blueprint ON public.blueprint_tags (blueprint_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_tags_tag ON public.blueprint_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_likes_blueprint ON public.blueprint_likes (blueprint_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_comments_blueprint ON public.blueprint_comments (blueprint_id);

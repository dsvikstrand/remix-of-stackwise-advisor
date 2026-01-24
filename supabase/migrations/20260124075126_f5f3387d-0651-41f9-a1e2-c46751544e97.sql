-- Create recipe_type enum for unified recipe storage
CREATE TYPE public.recipe_type AS ENUM ('blend', 'protein', 'stack');

-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  bio text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Create user_roles table for role-based access
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Create user_recipes table for storing all recipe types
CREATE TABLE public.user_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipe_type recipe_type NOT NULL,
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  analysis jsonb,
  is_public boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Create wall_posts table for social sharing
CREATE TABLE public.wall_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recipe_id uuid REFERENCES public.user_recipes(id) ON DELETE CASCADE NOT NULL,
  caption text,
  likes_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Create post_likes table for tracking likes
CREATE TABLE public.post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  post_id uuid REFERENCES public.wall_posts(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(user_id, post_id)
);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wall_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user');
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-create profile and role on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_recipes_updated_at
  BEFORE UPDATE ON public.user_recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for profiles
CREATE POLICY "Anyone can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for user_roles (read-only for users, managed by admins)
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_recipes
CREATE POLICY "Users can view their own recipes"
  ON public.user_recipes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view public recipes"
  ON public.user_recipes FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can create their own recipes"
  ON public.user_recipes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recipes"
  ON public.user_recipes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recipes"
  ON public.user_recipes FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for wall_posts
CREATE POLICY "Anyone can view wall posts"
  ON public.wall_posts FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own posts"
  ON public.wall_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
  ON public.wall_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
  ON public.wall_posts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for post_likes
CREATE POLICY "Anyone can view likes"
  ON public.post_likes FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own likes"
  ON public.post_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own likes"
  ON public.post_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to increment likes count
CREATE OR REPLACE FUNCTION public.increment_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.wall_posts
  SET likes_count = likes_count + 1
  WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to decrement likes count
CREATE OR REPLACE FUNCTION public.decrement_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.wall_posts
  SET likes_count = GREATEST(0, likes_count - 1)
  WHERE id = OLD.post_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers for likes count
CREATE TRIGGER on_like_created
  AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.increment_likes_count();

CREATE TRIGGER on_like_deleted
  AFTER DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.decrement_likes_count();

-- Create indexes for better query performance
CREATE INDEX idx_user_recipes_user_id ON public.user_recipes(user_id);
CREATE INDEX idx_user_recipes_recipe_type ON public.user_recipes(recipe_type);
CREATE INDEX idx_user_recipes_is_public ON public.user_recipes(is_public);
CREATE INDEX idx_wall_posts_user_id ON public.wall_posts(user_id);
CREATE INDEX idx_wall_posts_created_at ON public.wall_posts(created_at DESC);
CREATE INDEX idx_post_likes_post_id ON public.post_likes(post_id);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
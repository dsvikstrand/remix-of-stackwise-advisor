import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppNavigation } from '@/components/shared/AppNavigation';
import { UserMenu } from '@/components/shared/UserMenu';
import { ThemeToggle } from '@/components/blend/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart, MessageCircle, Share2, FlaskConical, Dumbbell, Beaker } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface WallPost {
  id: string;
  user_id: string;
  recipe_id: string;
  caption: string | null;
  likes_count: number;
  created_at: string;
  recipe: {
    id: string;
    name: string;
    recipe_type: 'blend' | 'protein' | 'stack';
    items: unknown[];
    analysis: unknown | null;
  };
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  };
  user_liked: boolean;
}

const RECIPE_ICONS = {
  blend: FlaskConical,
  protein: Dumbbell,
  stack: Beaker,
};

const RECIPE_COLORS = {
  blend: 'bg-purple-500/10 text-purple-500',
  protein: 'bg-green-500/10 text-green-500',
  stack: 'bg-blue-500/10 text-blue-500',
};

export default function Wall() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch wall posts
  const { data: posts, isLoading } = useQuery({
    queryKey: ['wall-posts'],
    queryFn: async () => {
      const { data: postsData, error: postsError } = await supabase
        .from('wall_posts')
        .select(`
          id,
          user_id,
          recipe_id,
          caption,
          likes_count,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (postsError) throw postsError;
      if (!postsData || postsData.length === 0) return [];

      // Fetch related data
      const recipeIds = postsData.map((p) => p.recipe_id);
      const userIds = [...new Set(postsData.map((p) => p.user_id))];

      const [recipesRes, profilesRes, likesRes] = await Promise.all([
        supabase.from('user_recipes').select('id, name, recipe_type, items, analysis').in('id', recipeIds),
        supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds),
        user
          ? supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', postsData.map((p) => p.id))
          : Promise.resolve({ data: [] }),
      ]);

      const recipesMap = new Map((recipesRes.data || []).map((r) => [r.id, r]));
      const profilesMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
      const likedPostIds = new Set((likesRes.data || []).map((l) => l.post_id));

      return postsData.map((post) => ({
        ...post,
        recipe: recipesMap.get(post.recipe_id) || { id: '', name: 'Unknown', recipe_type: 'blend', items: [], analysis: null },
        profile: profilesMap.get(post.user_id) || { display_name: null, avatar_url: null },
        user_liked: likedPostIds.has(post.id),
      })) as WallPost[];
    },
  });

  // Like mutation
  const likeMutation = useMutation({
    mutationFn: async ({ postId, liked }: { postId: string; liked: boolean }) => {
      if (!user) throw new Error('Must be logged in');

      if (liked) {
        await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
      } else {
        await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
      }
    },
    onMutate: async ({ postId, liked }) => {
      await queryClient.cancelQueries({ queryKey: ['wall-posts'] });
      const previousPosts = queryClient.getQueryData(['wall-posts']);

      queryClient.setQueryData(['wall-posts'], (old: WallPost[] | undefined) =>
        old?.map((post) =>
          post.id === postId
            ? {
                ...post,
                user_liked: !liked,
                likes_count: liked ? post.likes_count - 1 : post.likes_count + 1,
              }
            : post
        )
      );

      return { previousPosts };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['wall-posts'], context?.previousPosts);
      toast({
        title: 'Error',
        description: 'Failed to update like. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleLike = (postId: string, currentlyLiked: boolean) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to like posts.',
      });
      return;
    }
    likeMutation.mutate({ postId, liked: currentlyLiked });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Ambient background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-glass border-b border-border/50 bg-background/80">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <Beaker className="h-6 w-6 text-primary" />
              <span className="font-semibold">Wall</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        <AppNavigation />
      </div>

      {/* Feed */}
      <main className="max-w-2xl mx-auto px-4 pb-24">
        <div className="space-y-4">
          {isLoading ? (
            // Loading skeletons
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))
          ) : posts && posts.length > 0 ? (
            posts.map((post) => {
              const Icon = RECIPE_ICONS[post.recipe.recipe_type];
              const colorClass = RECIPE_COLORS[post.recipe.recipe_type];
              const displayName = post.profile.display_name || 'Anonymous';
              const initials = displayName.slice(0, 2).toUpperCase();
              const itemCount = Array.isArray(post.recipe.items) ? post.recipe.items.length : 0;

              return (
                <Card key={post.id} className="overflow-hidden">
                  <CardHeader className="flex flex-row items-center gap-3 pb-2">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={post.profile.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant="secondary" className={colorClass}>
                      <Icon className="h-3 w-3 mr-1" />
                      {post.recipe.recipe_type}
                    </Badge>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <h3 className="font-semibold">{post.recipe.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {itemCount} ingredient{itemCount !== 1 ? 's' : ''}
                      </p>
                      {post.caption && (
                        <p className="text-sm pt-2 border-t border-border/50">{post.caption}</p>
                      )}
                    </div>
                  </CardContent>

                  <CardFooter className="pt-0">
                    <div className="flex items-center gap-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={post.user_liked ? 'text-red-500' : ''}
                        onClick={() => handleLike(post.id, post.user_liked)}
                      >
                        <Heart
                          className={`h-4 w-4 mr-1 ${post.user_liked ? 'fill-current' : ''}`}
                        />
                        {post.likes_count}
                      </Button>
                      <Button variant="ghost" size="sm" disabled>
                        <MessageCircle className="h-4 w-4 mr-1" />
                        0
                      </Button>
                      <Button variant="ghost" size="sm" disabled>
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })
          ) : (
            <Card className="text-center py-12">
              <CardContent>
                <div className="flex flex-col items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                    <Beaker className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">No posts yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Be the first to share your blend with the community!
                    </p>
                  </div>
                  <Link to="/blend">
                    <Button>Create a Blend</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Floating nav */}
      <AppNavigation variant="floating" />
    </div>
  );
}

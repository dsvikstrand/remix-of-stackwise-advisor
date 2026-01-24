import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/shared/AppHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, Bookmark, FlaskConical, Dumbbell, Beaker } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useBookmarks } from '@/hooks/useBookmarks';
import { CommentsThread } from '@/components/wall/CommentsThread';

interface WallPostDetail {
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
    visibility: 'private' | 'unlisted' | 'public';
  };
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  };
  tags: { id: string; slug: string }[];
  user_liked: boolean;
  user_bookmarked: boolean;
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

export default function PostDetail() {
  const { postId } = useParams();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { bookmarks, isLoading: bookmarksLoading, toggleBookmark, isUpdating: isBookmarking } = useBookmarks();

  const bookmarkIds = useMemo(() => bookmarks.map((bookmark) => bookmark.post_id), [bookmarks]);
  const bookmarkSet = useMemo(() => new Set(bookmarkIds), [bookmarkIds]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!postId) {
    return <Navigate to="/wall" replace />;
  }

  const postQueryKey = ['wall-post', postId, user?.id, bookmarkIds] as const;

  const { data: post, isLoading } = useQuery({
    queryKey: postQueryKey,
    enabled: !!postId && !!user && !bookmarksLoading,
    queryFn: async () => {
      const { data: postData, error: postError } = await supabase
        .from('wall_posts')
        .select('id, user_id, recipe_id, caption, likes_count, created_at')
        .eq('id', postId)
        .single();

      if (postError) throw postError;

      const [recipeRes, profileRes, likesRes, recipeTagsRes] = await Promise.all([
        supabase
          .from('user_recipes')
          .select('id, name, recipe_type, items, analysis, visibility')
          .eq('id', postData.recipe_id)
          .single(),
        supabase.from('profiles').select('user_id, display_name, avatar_url').eq('user_id', postData.user_id).single(),
        supabase.from('post_likes').select('post_id').eq('post_id', postId).eq('user_id', user.id),
        supabase.from('recipe_tags').select('recipe_id, tag_id').eq('recipe_id', postData.recipe_id),
      ]);

      const recipeTags = recipeTagsRes.data || [];
      const tagIds = [...new Set(recipeTags.map((row) => row.tag_id))];
      const { data: tagsRes } = tagIds.length > 0
        ? await supabase.from('tags').select('id, slug').in('id', tagIds)
        : { data: [] as { id: string; slug: string }[] };

      return {
        ...postData,
        recipe: recipeRes.data || {
          id: '',
          name: 'Unknown',
          recipe_type: 'blend',
          items: [],
          analysis: null,
          visibility: 'public',
        },
        profile: profileRes.data || { display_name: null, avatar_url: null },
        tags: tagsRes || [],
        user_liked: (likesRes.data || []).length > 0,
        user_bookmarked: bookmarkSet.has(postData.id),
      } as WallPostDetail;
    },
  });

  const likeMutation = useMutation({
    mutationFn: async ({ liked }: { liked: boolean }) => {
      if (!user) throw new Error('Must be logged in');

      if (liked) {
        await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id);
      } else {
        await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id });
      }
    },
    onMutate: async ({ liked }) => {
      await queryClient.cancelQueries({ queryKey: postQueryKey });
      const previousPost = queryClient.getQueryData(postQueryKey) as WallPostDetail | undefined;

      if (previousPost) {
        queryClient.setQueryData(postQueryKey, {
          ...previousPost,
          user_liked: !liked,
          likes_count: liked ? previousPost.likes_count - 1 : previousPost.likes_count + 1,
        });
      }

      return { previousPost };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(postQueryKey, context?.previousPost);
      toast({
        title: 'Error',
        description: 'Failed to update like. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleBookmark = async (bookmarked: boolean) => {
    try {
      await toggleBookmark({ postId, bookmarked });
      queryClient.invalidateQueries({ queryKey: postQueryKey });
    } catch (error) {
      toast({
        title: 'Failed to update bookmark',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <AppHeader />

      <main className="max-w-3xl mx-auto px-4 py-8">

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">Loading post...</CardContent>
          </Card>
        ) : !post ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">Post not found.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Avatar className="h-10 w-10">
                <AvatarImage src={post.profile.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {(post.profile.display_name || 'Anonymous').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium text-sm">{post.profile.display_name || 'Anonymous'}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                </p>
              </div>
              <Badge variant="secondary" className={RECIPE_COLORS[post.recipe.recipe_type]}>
                {(() => {
                  const Icon = RECIPE_ICONS[post.recipe.recipe_type];
                  return <Icon className="h-3 w-3 mr-1" />;
                })()}
                {post.recipe.recipe_type}
              </Badge>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold">{post.recipe.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {Array.isArray(post.recipe.items) ? post.recipe.items.length : 0} ingredient
                  {Array.isArray(post.recipe.items) && post.recipe.items.length !== 1 ? 's' : ''}
                </p>
                {post.caption && (
                  <p className="text-sm pt-2 border-t border-border/50">{post.caption}</p>
                )}
              </div>

              {post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Link key={tag.id} to={`/tags?q=${tag.slug}`}>
                      <Badge variant="outline" className="text-xs hover:border-primary hover:text-primary">
                        #{tag.slug}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <div className="flex items-center gap-4 w-full">
                <Button
                  variant="ghost"
                  size="sm"
                  className={post.user_liked ? 'text-red-500' : ''}
                  onClick={() => likeMutation.mutate({ liked: post.user_liked })}
                >
                  <Heart className={`h-4 w-4 mr-1 ${post.user_liked ? 'fill-current' : ''}`} />
                  {post.likes_count}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={post.user_bookmarked ? 'text-primary' : ''}
                  onClick={() => handleBookmark(post.user_bookmarked)}
                  disabled={isBookmarking}
                >
                  <Bookmark className={`h-4 w-4 mr-1 ${post.user_bookmarked ? 'fill-current' : ''}`} />
                  Save
                </Button>
              </div>

              <CommentsThread postId={post.id} />
            </CardFooter>
          </Card>
        )}
      </main>
    </div>
  );
}

import { useMemo, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, MessageCircle, Share2, FlaskConical, Dumbbell, Beaker, Tag, Bookmark } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { CommentsThread } from '@/components/wall/CommentsThread';
import { useBookmarks } from '@/hooks/useBookmarks';

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

const FEED_TABS = [
  { value: 'for-you', label: 'For You' },
  { value: 'latest', label: 'Latest' },
  { value: 'trending', label: 'Trending' },
  { value: 'saved', label: 'Saved' },
] as const;

type FeedTab = (typeof FEED_TABS)[number]['value'];

export default function Wall() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FeedTab>('for-you');
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const { bookmarks, isLoading: bookmarksLoading, toggleBookmark, isUpdating: isBookmarking } = useBookmarks();

  const bookmarkIds = useMemo(() => bookmarks.map((bookmark) => bookmark.post_id), [bookmarks]);
  const bookmarkSet = useMemo(() => new Set(bookmarkIds), [bookmarkIds]);
  const bookmarkOrder = useMemo(
    () => new Map(bookmarks.map((bookmark) => [bookmark.post_id, new Date(bookmark.created_at).getTime()])),
    [bookmarks]
  );

  const { data: posts, isLoading } = useQuery({
    queryKey: ['wall-posts', activeTab, user?.id, bookmarkIds],
    enabled: activeTab !== 'saved' || (!!user && !bookmarksLoading),
    queryFn: async () => {
      if (activeTab === 'saved') {
        if (!user) return [] as WallPost[];
        if (bookmarkIds.length === 0) return [] as WallPost[];
      }
      const limit = activeTab === 'for-you' ? 120 : 80;
      let query = supabase
        .from('wall_posts')
        .select('id, user_id, recipe_id, caption, likes_count, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (activeTab === 'trending') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 3);
        query = query
          .gte('created_at', cutoff.toISOString())
          .order('likes_count', { ascending: false })
          .order('created_at', { ascending: false });
      }

      if (activeTab === 'saved') {
        query = query.in('id', bookmarkIds);
      }

      const { data: postsData, error: postsError } = await query;

      if (postsError) throw postsError;
      if (!postsData || postsData.length === 0) return [] as WallPost[];

      const recipeIds = postsData.map((p) => p.recipe_id);
      const userIds = [...new Set(postsData.map((p) => p.user_id))];
      const postIds = postsData.map((p) => p.id);

      const [recipesRes, profilesRes, likesRes, recipeTagsRes] = await Promise.all([
        supabase
          .from('user_recipes')
          .select('id, name, recipe_type, items, analysis, visibility')
          .in('id', recipeIds),
        supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds),
        user
          ? supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds)
          : Promise.resolve({ data: [] }),
        supabase.from('recipe_tags').select('recipe_id, tag_id').in('recipe_id', recipeIds),
      ]);

      const recipeTags = recipeTagsRes.data || [];
      const tagIds = [...new Set(recipeTags.map((row) => row.tag_id))];
      const { data: tagsRes } = tagIds.length > 0
        ? await supabase.from('tags').select('id, slug').in('id', tagIds)
        : { data: [] as { id: string; slug: string }[] };

      const recipesMap = new Map((recipesRes.data || []).map((r) => [r.id, r]));
      const profilesMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
      const likedPostIds = new Set((likesRes.data || []).map((l) => l.post_id));
      const tagsMap = new Map((tagsRes || []).map((t) => [t.id, t]));

      const recipeTagsMap = new Map<string, { id: string; slug: string }[]>();
      recipeTags.forEach((row) => {
        const tag = tagsMap.get(row.tag_id);
        if (!tag) return;
        const list = recipeTagsMap.get(row.recipe_id) || [];
        list.push(tag);
        recipeTagsMap.set(row.recipe_id, list);
      });

      let followTagIds = new Set<string>();
      let mutedTagIds = new Set<string>();

      if (activeTab === 'for-you' && user) {
        const [followsRes, mutesRes] = await Promise.all([
          supabase.from('tag_follows').select('tag_id').eq('user_id', user.id),
          supabase.from('tag_mutes').select('tag_id').eq('user_id', user.id),
        ]);
        followTagIds = new Set((followsRes.data || []).map((row) => row.tag_id));
        mutedTagIds = new Set((mutesRes.data || []).map((row) => row.tag_id));
      }

      const hydrated = postsData.map((post) => ({
        ...post,
        recipe:
          recipesMap.get(post.recipe_id) ||
          ({
            id: '',
            name: 'Unknown',
            recipe_type: 'blend',
            items: [],
            analysis: null,
            visibility: 'public',
          } as WallPost['recipe']),
        profile: profilesMap.get(post.user_id) || { display_name: null, avatar_url: null },
        tags: recipeTagsMap.get(post.recipe_id) || [],
        user_liked: likedPostIds.has(post.id),
        user_bookmarked: bookmarkSet.has(post.id),
      })) as WallPost[];

      if (activeTab === 'for-you') {
        if (!user || followTagIds.size === 0) return [] as WallPost[];

        return hydrated.filter((post) => {
          const postTagIds = (recipeTagsMap.get(post.recipe_id) || []).map((tag) => tag.id);
          if (postTagIds.some((tagId) => mutedTagIds.has(tagId))) return false;
          return postTagIds.some((tagId) => followTagIds.has(tagId));
        });
      }

      if (activeTab === 'saved') {
        return hydrated.sort((a, b) => {
          const aTime = bookmarkOrder.get(a.id) ?? 0;
          const bTime = bookmarkOrder.get(b.id) ?? 0;
          return bTime - aTime;
        });
      }

      return hydrated;
    },
  });

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
      const previousPosts = queryClient.getQueryData(['wall-posts', activeTab, user?.id]);

      queryClient.setQueryData(['wall-posts', activeTab, user?.id], (old: WallPost[] | undefined) =>
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
      queryClient.setQueryData(['wall-posts', activeTab, user?.id], context?.previousPosts);
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

  const handleBookmark = async (postId: string, bookmarked: boolean) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to save posts.',
      });
      return;
    }
    try {
      await toggleBookmark({ postId, bookmarked });
    } catch (error) {
      toast({
        title: 'Failed to update bookmark',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const toggleComments = (postId: string) => {
    setOpenComments((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

  const showLoading = isLoading || (activeTab === 'saved' && bookmarksLoading);

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <header className="sticky top-0 z-30 backdrop-blur-glass border-b border-border/50 bg-background/80">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <Beaker className="h-6 w-6 text-primary" />
              <span className="font-semibold">Wall</span>
            </Link>
            <Link to="/tags" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Tag className="h-4 w-4" /> Tags
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-4">
        <AppNavigation />
      </div>

      <main className="max-w-3xl mx-auto px-4 pb-24">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FeedTab)}>
          <TabsList className="mb-4">
            {FEED_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-0">
            {showLoading ? (
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
              <div className="space-y-4">
                {posts.map((post) => {
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

                      <CardContent className="pt-0 space-y-3">
                        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                          <h3 className="font-semibold">{post.recipe.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {itemCount} ingredient{itemCount !== 1 ? 's' : ''}
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

                      <CardFooter className="pt-0 flex flex-col gap-4">
                        <div className="flex items-center gap-4 w-full">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={post.user_liked ? 'text-red-500' : ''}
                            onClick={() => handleLike(post.id, post.user_liked)}
                          >
                            <Heart className={`h-4 w-4 mr-1 ${post.user_liked ? 'fill-current' : ''}`} />
                            {post.likes_count}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleComments(post.id)}>
                            <MessageCircle className="h-4 w-4 mr-1" />
                            {openComments[post.id] ? 'Hide' : 'Comments'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={post.user_bookmarked ? 'text-primary' : ''}
                            onClick={() => handleBookmark(post.id, post.user_bookmarked)}
                            disabled={isBookmarking}
                          >
                            <Bookmark className={`h-4 w-4 mr-1 ${post.user_bookmarked ? 'fill-current' : ''}`} />
                            Save
                          </Button>
                          <Button variant="ghost" size="sm" disabled>
                            <Share2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {openComments[post.id] && (
                          <div className="w-full">
                            <CommentsThread postId={post.id} />
                          </div>
                        )}
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
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
                        {activeTab === 'saved'
                          ? user
                            ? 'No saved posts yet.'
                            : 'Sign in to view your saved posts.'
                          : activeTab === 'for-you'
                            ? user
                              ? 'Follow tags to personalize your feed.'
                              : 'Sign in to follow tags and personalize your feed.'
                            : 'Be the first to share your blend with the community!'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link to="/blend">
                        <Button>Create a Blend</Button>
                      </Link>
                      <Link to="/tags">
                        <Button variant="outline">Explore Tags</Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <AppNavigation variant="floating" />
    </div>
  );
}

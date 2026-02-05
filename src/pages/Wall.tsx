import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/shared/AppHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, Share2, Layers, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePopularInventoryTags } from '@/hooks/usePopularInventoryTags';
import { useTagFollows } from '@/hooks/useTagFollows';
import type { Json } from '@/integrations/supabase/types';

interface BlueprintPost {
  id: string;
  creator_user_id: string;
  title: string;
  selected_items: Json;
  llm_review: string | null;
  likes_count: number;
  created_at: string;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  };
  tags: { id: string; slug: string }[];
  user_liked: boolean;
}

const FEED_TABS = [
  { value: 'for-you', label: 'For You' },
  { value: 'latest', label: 'Latest' },
  { value: 'trending', label: 'Trending' },
] as const;

type FeedTab = (typeof FEED_TABS)[number]['value'];

function countSelectedItems(selected: Json) {
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) return 0;
  return Object.values(selected as Record<string, string[]>).reduce(
    (sum, items) => sum + (Array.isArray(items) ? items.length : 0),
    0
  );
}

export default function Wall() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FeedTab>('for-you');
  
  // Popular tags for empty state
  const { data: popularTags = [] } = usePopularInventoryTags(6);
  const { followedIds, toggleFollow } = useTagFollows();
  
  const handleTagToggle = async (tag: { id: string; slug: string }) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to follow tags.',
      });
      return;
    }
    try {
      await toggleFollow(tag);
      queryClient.invalidateQueries({ queryKey: ['wall-blueprints'] });
    } catch (error) {
      toast({
        title: 'Tag update failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const wallQueryKey = ['wall-blueprints', activeTab, user?.id] as const;

  const { data: posts, isLoading } = useQuery({
    queryKey: wallQueryKey,
    queryFn: async () => {
      const isForYou = activeTab === 'for-you' && !!user;

      const limit = activeTab === 'for-you' ? 120 : 80;
      let query = supabase
        .from('blueprints')
        .select('id, creator_user_id, title, selected_items, llm_review, likes_count, created_at')
        .eq('is_public', true)
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

      const { data: blueprints, error } = await query;
      if (error) throw error;
      if (!blueprints || blueprints.length === 0) return [] as BlueprintPost[];

      const blueprintIds = blueprints.map((row) => row.id);
      const userIds = [...new Set(blueprints.map((row) => row.creator_user_id))];

      const [tagsRes, likesRes, profilesRes] = await Promise.all([
        supabase.from('blueprint_tags').select('blueprint_id, tag_id').in('blueprint_id', blueprintIds),
        user
          ? supabase.from('blueprint_likes').select('blueprint_id').eq('user_id', user.id).in('blueprint_id', blueprintIds)
          : Promise.resolve({ data: [] as { blueprint_id: string }[] }),
        supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds),
      ]);

      const tagRows = tagsRes.data || [];
      const tagIds = [...new Set(tagRows.map((row) => row.tag_id))];
      const { data: tagsData } = tagIds.length > 0
        ? await supabase.from('tags').select('id, slug').in('id', tagIds)
        : { data: [] as { id: string; slug: string }[] };

      const tagsMap = new Map((tagsData || []).map((tag) => [tag.id, tag]));
      const blueprintTags = new Map<string, { id: string; slug: string }[]>();

      tagRows.forEach((row) => {
        const tag = tagsMap.get(row.tag_id);
        if (!tag) return;
        const list = blueprintTags.get(row.blueprint_id) || [];
        list.push(tag);
        blueprintTags.set(row.blueprint_id, list);
      });

      const likedIds = new Set((likesRes.data || []).map((row) => row.blueprint_id));
      const profilesMap = new Map((profilesRes.data || []).map((profile) => [profile.user_id, profile]));

      let followTagIds = new Set<string>();
      if (isForYou) {
        const followsRes = await supabase.from('tag_follows').select('tag_id').eq('user_id', user.id);
        followTagIds = new Set((followsRes.data || []).map((row) => row.tag_id));
      }

      const hydrated = blueprints.map((blueprint) => ({
        ...blueprint,
        profile: profilesMap.get(blueprint.creator_user_id) || { display_name: null, avatar_url: null },
        tags: blueprintTags.get(blueprint.id) || [],
        user_liked: likedIds.has(blueprint.id),
      })) as BlueprintPost[];

      if (isForYou) {
        if (followTagIds.size === 0) return [] as BlueprintPost[];
        return hydrated.filter((post) => post.tags.some((tag) => followTagIds.has(tag.id)));
      }

      return hydrated;
    },
  });

  const likeMutation = useMutation({
    mutationFn: async ({ blueprintId, liked }: { blueprintId: string; liked: boolean }) => {
      if (!user) throw new Error('Must be logged in');

      if (liked) {
        await supabase.from('blueprint_likes').delete().eq('blueprint_id', blueprintId).eq('user_id', user.id);
      } else {
        await supabase.from('blueprint_likes').insert({ blueprint_id: blueprintId, user_id: user.id });
      }
    },
    onMutate: async ({ blueprintId, liked }) => {
      await queryClient.cancelQueries({ queryKey: wallQueryKey });
      const previousPosts = queryClient.getQueryData(wallQueryKey);

      queryClient.setQueryData(wallQueryKey, (old: BlueprintPost[] | undefined) =>
        old?.map((post) =>
          post.id === blueprintId
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
    onError: (_err, _variables, context) => {
      queryClient.setQueryData(wallQueryKey, context?.previousPosts);
      toast({
        title: 'Error',
        description: 'Failed to update like. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleLike = (blueprintId: string, currentlyLiked: boolean) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to like blueprints.',
      });
      return;
    }
    likeMutation.mutate({ blueprintId, liked: currentlyLiked });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <AppHeader />

      <main className="max-w-3xl mx-auto px-4 pb-24">
        <Card className="mb-6 border-border/50 bg-card/60 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-primary uppercase tracking-wide">Community Wall</p>
              <h1 className="text-2xl font-semibold">See what the community is building</h1>
              <p className="text-sm text-muted-foreground">
                Browse public blueprints, follow tags you love, and save ideas for your next routine.
              </p>
            </div>
          </CardContent>
        </Card>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FeedTab)}>
          <TabsList className="mb-4">
            {FEED_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab} className="mt-0">
            {isLoading ? (
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
                  const displayName = post.profile.display_name || 'Anonymous';
                  const initials = displayName.slice(0, 2).toUpperCase();
                  const itemCount = countSelectedItems(post.selected_items);
                  const preview = post.llm_review ? post.llm_review.slice(0, 160) : '';

                  return (
                    <Link key={post.id} to={`/blueprint/${post.id}`} className="block">
                      <Card className="overflow-hidden transition hover:border-primary/40 hover:shadow-md">
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                          <Link 
                            to={`/u/${post.creator_user_id}`} 
                            onClick={(event) => event.stopPropagation()}
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={post.profile.avatar_url || undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{displayName}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                              </p>
                            </div>
                          </Link>
                          <div className="flex-1" />
                          <Badge variant="secondary" className="bg-primary/10 text-primary">
                            <Layers className="h-3 w-3 mr-1" />
                            Blueprint
                          </Badge>
                        </CardHeader>

                        <CardContent className="pt-0 space-y-3">
                          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                            <h3 className="font-semibold">{post.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {itemCount} item{itemCount !== 1 ? 's' : ''}
                            </p>
                            {preview && (
                              <p className="text-sm pt-2 border-t border-border/50 text-muted-foreground">
                                {preview}...
                              </p>
                            )}
                          </div>
                          {post.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                          {post.tags.map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="outline"
                              className={`text-xs cursor-pointer transition-colors border ${
                                followedIds.has(tag.id)
                                  ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/20'
                                  : 'bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/60'
                              }`}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                handleTagToggle(tag);
                              }}
                            >
                              #{tag.slug}
                            </Badge>
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
                              onClick={(event) => {
                                event.preventDefault();
                                handleLike(post.id, post.user_liked);
                              }}
                            >
                              <Heart className={`h-4 w-4 mr-1 ${post.user_liked ? 'fill-current' : ''}`} />
                              {post.likes_count}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              onClick={(event) => event.preventDefault()}
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardFooter>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Card className="text-center py-12">
                <CardContent>
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                      {activeTab === 'for-you' ? (
                        <Tag className="h-8 w-8 text-muted-foreground" />
                      ) : (
                        <Layers className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {activeTab === 'for-you' ? 'Personalize your feed' : 'No blueprints yet'}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {activeTab === 'for-you'
                          ? 'Follow tags to see related blueprints here.'
                          : 'Be the first to share a blueprint.'}
                      </p>
                    </div>
                    
                    {/* Inline tag suggestions for "For You" tab */}
                    {activeTab === 'for-you' && popularTags.length > 0 && (
                      <div className="space-y-3 w-full max-w-md">
                        {!user && (
                          <div className="flex flex-col items-center gap-2">
                            <p className="text-xs text-muted-foreground">
                              Sign in to follow tags and personalize this feed.
                            </p>
                            <Link to="/auth">
                              <Button size="sm">Sign in</Button>
                            </Link>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">Popular tags to follow:</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {popularTags.map((tag) => (
                            <Button
                              key={tag.id}
                              variant="outline"
                              size="sm"
                              className={`gap-1.5 ${
                                followedIds.has(tag.id)
                                  ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/20'
                                  : 'text-muted-foreground'
                              }`}
                              onClick={() => handleTagToggle(tag)}
                            >
                              #{tag.slug}
                            </Button>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => setActiveTab('latest')}
                        >
                          Or browse Latest instead →
                        </Button>
                      </div>
                    )}
                    
                    {activeTab !== 'for-you' && (
                      <div className="flex gap-2">
                        <Link to="/inventory">
                          <Button>Create Blueprint</Button>
                        </Link>
                        <Link to="/tags">
                          <Button variant="outline">Explore Tags</Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

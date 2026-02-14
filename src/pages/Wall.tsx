import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Heart, Share2, Tag, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePopularInventoryTags } from '@/hooks/usePopularInventoryTags';
import { useTagFollows } from '@/hooks/useTagFollows';
import type { Json } from '@/integrations/supabase/types';
import { buildFeedSummary } from '@/lib/feedPreview';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { formatRelativeShort } from '@/lib/timeFormat';
import { resolveChannelLabelForBlueprint } from '@/lib/channelMapping';
import { normalizeTag } from '@/lib/tagging';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { logOncePerSession, logP3Event } from '@/lib/telemetry';

interface BlueprintPost {
  id: string;
  creator_user_id: string;
  title: string;
  selected_items: Json;
  llm_review: string | null;
  banner_url: string | null;
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

export default function Wall() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<FeedTab>('for-you');
  const [selectedTagSlug, setSelectedTagSlug] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user && activeTab === 'for-you') {
      setActiveTab('trending');
    }
  }, [authLoading, user, activeTab]);
  
  // Popular channels (tag-backed) for empty state
  const { data: popularTags = [] } = usePopularInventoryTags(6);
  const { followedTags } = useTagFollows();

  const curatedJoinableSlugs = useMemo(
    () =>
      new Set(
        CHANNELS_CATALOG
          .filter((channel) => channel.isJoinEnabled && channel.status === 'active')
          .map((channel) => channel.tagSlug),
      ),
    [],
  );

  const joinedCuratedCount = useMemo(() => {
    return followedTags.filter((tag) => curatedJoinableSlugs.has(normalizeTag(tag.slug))).length;
  }, [curatedJoinableSlugs, followedTags]);

  const handleTagFilter = (tagSlug: string) => {
    setSelectedTagSlug((current) => {
      const next = current === tagSlug ? null : tagSlug;
      if (next) {
        logP3Event({
          eventName: 'wall_tag_filter_used',
          surface: 'wall',
          user,
          metadata: {
            tab: activeTab,
            tag_slug: normalizeTag(next),
          },
        });
      }
      return next;
    });
  };

  const wallQueryKey = ['wall-blueprints', activeTab, user?.id] as const;

  const { data: posts, isLoading } = useQuery({
    queryKey: wallQueryKey,
    queryFn: async () => {
      const isForYou = activeTab === 'for-you' && !!user;

      const limit = activeTab === 'for-you' ? 120 : 80;
      let query = supabase
        .from('blueprints')
        .select('id, creator_user_id, title, selected_items, llm_review, banner_url, likes_count, created_at')
        .eq('is_public', true)
        .limit(limit);

      if (activeTab === 'trending') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 3);
        query = query
          .gte('created_at', cutoff.toISOString())
          .order('likes_count', { ascending: false })
          .order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
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
        if (followTagIds.size === 0) return hydrated;

        const joinedChannelPosts: BlueprintPost[] = [];
        const globalFillPosts: BlueprintPost[] = [];

        hydrated.forEach((post) => {
          if (post.tags.some((tag) => followTagIds.has(tag.id))) {
            joinedChannelPosts.push(post);
          } else {
            globalFillPosts.push(post);
          }
        });

        return [...joinedChannelPosts, ...globalFillPosts];
      }

      return hydrated;
    },
  });

  const postIds = useMemo(() => (posts || []).map((post) => post.id), [posts]);

  const { data: commentCountsByBlueprintId = {} } = useQuery({
    queryKey: ['wall-blueprint-comment-counts', postIds],
    enabled: postIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blueprint_comments')
        .select('blueprint_id')
        .in('blueprint_id', postIds);

      if (error) throw error;

      return (data || []).reduce<Record<string, number>>((acc, row) => {
        acc[row.blueprint_id] = (acc[row.blueprint_id] || 0) + 1;
        return acc;
      }, {});
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

  const showZeroJoinForYouCta = !!user && activeTab === 'for-you' && joinedCuratedCount === 0;

  useEffect(() => {
    if (!showZeroJoinForYouCta) return;
    logOncePerSession('p3_wall_zero_join_cta_impression', () => {
      logP3Event({
        eventName: 'wall_zero_join_cta_impression',
        surface: 'wall',
        user,
        metadata: {
          tab: activeTab,
          joined_channels_count: 0,
        },
      });
    });
  }, [activeTab, showZeroJoinForYouCta, user]);
  const visiblePosts = useMemo(() => {
    if (!posts) return [];
    if (!selectedTagSlug) return posts;
    return posts.filter((post) => post.tags.some((tag) => tag.slug === selectedTagSlug));
  }, [posts, selectedTagSlug]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">

      <AppHeader />

      <main className="max-w-3xl mx-auto px-0 pb-24">
        <section className="mb-6 px-3 sm:px-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Community Feed</p>
            <h1 className="text-2xl font-semibold">See what the community is building</h1>
            <p className="text-sm text-muted-foreground">
              Browse public blueprints, join channels you care about, and save ideas for your next routine.
            </p>
          </div>
        </section>

        {!user && (
          <div className="mb-6 mx-3 sm:mx-4 border border-border/40 px-3 py-4">
            <div className="flex flex-col gap-2 text-center">
              <p className="text-sm font-semibold">Sign in to personalize</p>
              <p className="text-sm text-muted-foreground">
                Join channels to shape your feed, then follow creators you trust.
              </p>
              <div className="flex justify-center">
                <Link to="/auth">
                  <Button size="sm">Sign in</Button>
                </Link>
              </div>
            </div>
          </div>
        )}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FeedTab)}>
          <div className="mb-3 flex justify-center">
            <TabsList className="h-9 w-fit rounded-md bg-muted/40 p-0.5">
              {FEED_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="mt-0">
            {selectedTagSlug && (
              <div className="mb-3 mx-3 sm:mx-4 border border-border/40 px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Filtered by <span className="font-semibold text-foreground">{selectedTagSlug}</span>
                </p>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedTagSlug(null)}>
                  Clear
                </Button>
              </div>
            )}
            {showZeroJoinForYouCta && (
              <div className="mb-3 mx-3 sm:mx-4 border border-border/40 px-3 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Join channels to shape your feed</p>
                  <p className="text-xs text-muted-foreground">
                    Start with a few channels and your For You feed will prioritize those lanes.
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link
                    to="/channels"
                    onClick={() => {
                      logP3Event({
                        eventName: 'wall_zero_join_cta_click',
                        surface: 'wall',
                        user,
                        metadata: {
                          tab: activeTab,
                        },
                      });
                    }}
                  >
                    Explore Channels
                  </Link>
                </Button>
              </div>
            )}
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-3 sm:px-4 py-4 border-t border-border/40 first:border-t-0">
                  <div className="flex flex-row items-center gap-3 mb-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-20 w-full" />
                </div>
              ))
            ) : visiblePosts.length > 0 ? (
              <div className="divide-y divide-border/40">
                {visiblePosts.map((post) => {
                  const preview = buildFeedSummary({
                    primary: post.llm_review,
                    fallback: 'Open to view the full step-by-step guide.',
                    maxChars: 220,
                  });
                  const channelLabel = resolveChannelLabelForBlueprint(post.tags.map((tag) => tag.slug));
                  const createdLabel = formatRelativeShort(post.created_at);
                  const commentsCount = commentCountsByBlueprintId[post.id] || 0;

                  return (
                    <Link
                      key={post.id}
                      to={`/blueprint/${post.id}`}
                      className="block px-3 py-2.5 transition-colors hover:bg-muted/20"
                    >
                      <div className="relative overflow-hidden">
                        {!!post.banner_url && (
                          <>
                            <img
                              src={post.banner_url}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover opacity-35"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-b from-background/35 via-background/60 to-background/80" />
                          </>
                        )}
                        <div className="relative space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold tracking-wide text-foreground/75">{channelLabel}</p>
                            <span className="text-[11px] text-muted-foreground">{createdLabel}</span>
                          </div>
                          <h3 className="text-base font-semibold leading-tight">{post.title}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-3">{preview}</p>

                          {post.tags.length > 0 && (
                            <OneRowTagChips
                              className="flex flex-nowrap gap-1.5 overflow-hidden"
                              items={post.tags.map((tag) => ({
                                key: tag.id,
                                label: tag.slug,
                                variant: 'outline',
                                className:
                                  'text-xs transition-colors border bg-muted/40 text-muted-foreground border-border/60',
                              }))}
                            />
                          )}

                          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 px-2 ${post.user_liked ? 'text-red-500' : ''}`}
                              onClick={(event) => {
                                event.preventDefault();
                                handleLike(post.id, post.user_liked);
                              }}
                            >
                              <Heart className={`h-4 w-4 mr-1 ${post.user_liked ? 'fill-current' : ''}`} />
                              {post.likes_count}
                            </Button>
                            <span className="inline-flex h-7 items-center gap-1 px-2">
                              <MessageCircle className="h-4 w-4" />
                              {commentsCount}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              disabled
                              onClick={(event) => event.preventDefault()}
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
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
                          ? 'Join channels to see related blueprints here.'
                          : 'Be the first to share a blueprint.'}
                      </p>
                    </div>
                    
                    {/* Inline topic suggestions for "For You" tab */}
                    {activeTab === 'for-you' && popularTags.length > 0 && (
                      <div className="space-y-3 w-full max-w-md">
                        {!user && (
                          <div className="flex flex-col items-center gap-2">
                            <p className="text-xs text-muted-foreground">
                              Sign in to join channels and personalize this feed.
                            </p>
                            <Link to="/auth">
                              <Button size="sm">Sign in</Button>
                            </Link>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">Popular topics:</p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {popularTags.map((tag) => (
                            <Badge
                              key={tag.id}
                              variant="secondary"
                              className="gap-1.5 bg-muted/40 text-muted-foreground border border-border/60 cursor-pointer hover:bg-muted/60"
                              onClick={() => handleTagFilter(tag.slug)}
                            >
                              {tag.slug}
                            </Badge>
                          ))}
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link to="/channels">Join Channels</Link>
                        </Button>
                      </div>
                    )}
                    
                    {activeTab !== 'for-you' && (
                      <div className="flex gap-2">
                        <Link to="/inventory">
                          <Button>Create Blueprint</Button>
                        </Link>
                        <Link to="/channels">
                          <Button variant="outline">Explore Channels</Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
        <AppFooter />
      </main>
    </div>
  );
}

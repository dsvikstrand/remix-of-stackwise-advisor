import { Link, useParams } from 'react-router-dom';
import { Heart, Loader2, MessageCircle, Plus, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useTagFollows } from '@/hooks/useTagFollows';
import { useTagsBySlugs } from '@/hooks/useTags';
import { getChannelBySlug } from '@/lib/channelsCatalog';
import { getChannelIcon } from '@/lib/channelIcons';
import { useChannelFeed, type ChannelFeedTab } from '@/hooks/useChannelFeed';
import { buildFeedSummary } from '@/lib/feedPreview';
import { formatRelativeShort } from '@/lib/timeFormat';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { bucketJoinError, logP3Event } from '@/lib/telemetry';
import { CreateBlueprintFlowModal } from '@/components/create/CreateBlueprintFlowModal';
import { isPostableChannelSlug } from '@/lib/channelPostContext';

export default function ChannelPage() {
  const { channelSlug } = useParams<{ channelSlug: string }>();
  const slug = channelSlug || '';
  const channel = getChannelBySlug(slug);
  const { user } = useAuth();
  const { toast } = useToast();
  const tagSlug = channel?.tagSlug ?? '';
  const { data: tags = [], isLoading: tagsLoading } = useTagsBySlugs(tagSlug ? [tagSlug] : []);
  const { getFollowState, joinChannel, leaveChannel } = useTagFollows();
  const [showSigninPrompt, setShowSigninPrompt] = useState(false);
  const [tab, setTab] = useState<ChannelFeedTab>('top');
  const [showCreate, setShowCreate] = useState(false);
  const hasLoggedViewRef = useRef(false);

  if (!channel) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Channel not found</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This channel slug is not part of the curated MVP channel list.
              </p>
              <div className="flex gap-2">
                <Button asChild>
                  <Link to="/channels">Back to Channels</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/wall">Go to Feed</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const tagRow = tags.find((tag) => tag.slug === channel.tagSlug);
  const joinAvailable = channel.isJoinEnabled && channel.status === 'active' && !!tagRow?.id;
  const ChannelIcon = getChannelIcon(channel.icon);

  useEffect(() => {
    if (hasLoggedViewRef.current) return;
    hasLoggedViewRef.current = true;
    logP3Event({
      eventName: 'channel_page_view',
      surface: 'channel_page',
      user,
      metadata: {
        channel_slug: channel.slug,
        tab,
      },
    });
  }, [channel.slug, tab, user]);

  const handleJoinLeave = async () => {
    const state = tagRow?.id ? getFollowState({ id: tagRow.id }) : 'not_joined';
    const isJoinIntent = state !== 'joined' && state !== 'leaving';

    if (!user) {
      if (isJoinIntent) {
        logP3Event({
          eventName: 'channel_join_click',
          surface: 'channel_page',
          user,
          metadata: {
            channel_slug: channel.slug,
            join_available: joinAvailable,
            source: 'channel_page',
          },
        });
        logP3Event({
          eventName: 'channel_join_fail',
          surface: 'channel_page',
          user,
          metadata: {
            channel_slug: channel.slug,
            source: 'channel_page',
            error_bucket: 'auth_required',
          },
        });
      }
      setShowSigninPrompt(true);
      toast({
        title: 'Sign in required',
        description: 'Please sign in to join channels.',
      });
      return;
    }
    if (tagsLoading) return;
    if (!tagRow?.id || !joinAvailable) return;
    if (state === 'joining' || state === 'leaving') return;

    try {
      if (state === 'joined') {
        await leaveChannel({ id: tagRow.id, slug: channel.slug });
        logP3Event({
          eventName: 'channel_leave_success',
          surface: 'channel_page',
          user,
          metadata: {
            channel_slug: channel.slug,
            source: 'channel_page',
          },
        });
      } else {
        logP3Event({
          eventName: 'channel_join_click',
          surface: 'channel_page',
          user,
          metadata: {
            channel_slug: channel.slug,
            join_available: joinAvailable,
            source: 'channel_page',
          },
        });
        await joinChannel({ id: tagRow.id, slug: channel.slug });
        logP3Event({
          eventName: 'channel_join_success',
          surface: 'channel_page',
          user,
          metadata: {
            channel_slug: channel.slug,
            source: 'channel_page',
          },
        });
      }
    } catch (error) {
      if (isJoinIntent) {
        logP3Event({
          eventName: 'channel_join_fail',
          surface: 'channel_page',
          user,
          metadata: {
            channel_slug: channel.slug,
            source: 'channel_page',
            error_bucket: bucketJoinError(error),
          },
        });
      }
      toast({
        title: 'Channel update failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const state = tagRow?.id ? getFollowState({ id: tagRow.id }) : 'not_joined';
  const isPending = state === 'joining' || state === 'leaving';
  const isJoined = state === 'joined' || state === 'leaving';
  const joinLabel = state === 'joining'
    ? 'Joining...'
    : state === 'leaving'
      ? 'Leaving...'
      : state === 'joined'
        ? 'Joined'
        : 'Join';

  const {
    posts,
    totalCount,
    hasMore,
    loadMore,
    commentCountsByBlueprintId,
    isLoading,
    isError,
  } = useChannelFeed({ channelSlug: channel.slug, tab, pageSize: 20 });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-6 space-y-6 pb-24">
        <section className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <ChannelIcon className="h-5 w-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-semibold text-primary">b/{channel.slug}</p>
                <h1 className="text-2xl font-semibold leading-tight">{channel.name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={!isPostableChannelSlug(channel.slug) || (!!user && !isJoined)}
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-4 w-4" />
                + Create
              </Button>
              {channel.isJoinEnabled && (
                <Button
                  size="sm"
                  variant={isJoined ? 'outline' : 'default'}
                  disabled={tagsLoading || isPending || !joinAvailable}
                  onClick={handleJoinLeave}
                >
                  {tagsLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  {!tagsLoading && isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  {joinLabel}
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-3">{channel.description}</p>
          {!channel.isJoinEnabled && (
            <p className="text-xs text-muted-foreground">General lane is read-only.</p>
          )}
          {channel.isJoinEnabled && !tagsLoading && !joinAvailable && (
            <p className="text-xs text-muted-foreground">Channel activation pending.</p>
          )}
          {isPostableChannelSlug(channel.slug) && user && !isJoined && (
            <p className="text-xs text-muted-foreground">Join this channel to post here.</p>
          )}
        </section>

        {!user && showSigninPrompt && (
          <Card className="border-border/60 bg-card/60">
            <CardContent className="pt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Sign in to join channels</p>
                <p className="text-xs text-muted-foreground">Join channels to personalize your feed experience.</p>
              </div>
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <section className="space-y-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as ChannelFeedTab)}>
            <TabsList className="h-9 rounded-md bg-muted/40 p-0.5">
              <TabsTrigger value="top">Top</TabsTrigger>
              <TabsTrigger value="recent">Recent</TabsTrigger>
            </TabsList>

            <TabsContent value={tab} className="mt-3">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} className="p-3 space-y-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-5 w-2/3" />
                      <Skeleton className="h-12 w-full" />
                    </Card>
                  ))}
                </div>
              ) : isError ? (
                <Card>
                  <CardContent className="py-6 text-sm text-muted-foreground">
                    Failed to load channel feed. Please refresh and try again.
                  </CardContent>
                </Card>
              ) : posts.length === 0 ? (
                <Card>
                  <CardContent className="py-6 text-sm text-muted-foreground">
                    No blueprints found for this channel yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="divide-y divide-border/40 border-y border-border/40">
                  {posts.map((post) => {
                    const preview = buildFeedSummary({
                      primary: post.llmReview,
                      secondary: post.mixNotes,
                      fallback: 'Open to view the full step-by-step guide.',
                      maxChars: 220,
                    });
                    const createdLabel = formatRelativeShort(post.createdAt);
                    const commentsCount = commentCountsByBlueprintId[post.id] || 0;

                    return (
                      <Link
                        key={post.id}
                        to={`/blueprint/${post.id}`}
                        className="block px-0 sm:px-1 py-2.5 transition-colors hover:bg-muted/20"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold tracking-wide text-foreground/75">b/{post.primaryChannelSlug}</p>
                            <span className="text-[11px] text-muted-foreground">{createdLabel}</span>
                          </div>
                          <h3 className="text-base font-semibold leading-tight">{post.title}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-3">{preview}</p>

                          {post.tags.length > 0 && (
                            <OneRowTagChips
                              className="flex flex-nowrap gap-1.5 overflow-hidden"
                              items={post.tags.map((tag) => ({
                                key: tag,
                                label: `#${tag}`,
                                variant: 'outline',
                                className: 'text-xs border bg-muted/40 text-muted-foreground border-border/60',
                              }))}
                            />
                          )}

                          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                            <span className="inline-flex h-7 items-center gap-1 px-2">
                              <Heart className="h-4 w-4" />
                              {post.likesCount}
                            </span>
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
                      </Link>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {!isLoading && !isError && posts.length > 0 && (
            <div className="flex flex-col items-center gap-2 pt-2">
              {hasMore ? (
                <Button variant="outline" size="sm" onClick={loadMore}>
                  Load more
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">No more posts</p>
              )}
              <p className="text-xs text-muted-foreground">Showing {posts.length} of {totalCount}</p>
            </div>
          )}
        </section>
        <AppFooter />
      </main>
      <CreateBlueprintFlowModal
        open={showCreate}
        onOpenChange={setShowCreate}
        presetChannelSlug={channel.slug}
      />
    </div>
  );
}

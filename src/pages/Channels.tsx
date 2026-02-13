import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useTagFollows } from '@/hooks/useTagFollows';
import { useTagsBySlugs } from '@/hooks/useTags';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { getChannelIcon } from '@/lib/channelIcons';
import { resolvePrimaryChannelFromTags } from '@/lib/channelMapping';
import { supabase } from '@/integrations/supabase/client';
import { bucketJoinError, logOncePerSession, logP3Event } from '@/lib/telemetry';

const MAX_JOINED_CHANNELS_DISPLAY = 6;
const SUGGESTED_CHANNELS_COUNT = 4;

interface ChannelViewModel {
  slug: string;
  tagSlug: string;
  name: string;
  description: string;
  icon: string;
  priority: number;
  isJoinEnabled: boolean;
  tagId: string | null;
  followerCount: number;
  joinAvailable: boolean;
}

export default function Channels() {
  const { user } = useAuth();
  const { toast } = useToast();
  const catalogTagSlugs = useMemo(
    () => Array.from(new Set(CHANNELS_CATALOG.map((channel) => channel.tagSlug))),
    [],
  );
  const { data: tags = [], isLoading: tagsLoading } = useTagsBySlugs(catalogTagSlugs);
  const {
    followedTags,
    getFollowState,
    joinChannel,
    leaveChannel,
    removeNonCuratedFollows,
    isLoading: followsLoading,
  } = useTagFollows();
  const [showSigninPrompt, setShowSigninPrompt] = useState(false);
  const [showAllJoined, setShowAllJoined] = useState(false);
  const hasRunCleanupRef = useRef(false);
  const hasLoggedViewRef = useRef(false);

  useEffect(() => {
    if (!user || followsLoading || hasRunCleanupRef.current) return;
    hasRunCleanupRef.current = true;
    void removeNonCuratedFollows().catch(() => {
      toast({
        title: 'Follow cleanup failed',
        description: 'Could not clean legacy follows. Please refresh and try again.',
        variant: 'destructive',
      });
    });
  }, [followsLoading, removeNonCuratedFollows, toast, user]);

  const channelModels = useMemo<ChannelViewModel[]>(() => {
    const bySlug = new Map(tags.map((tag) => [tag.slug, tag]));

    return CHANNELS_CATALOG
      .map((channel) => {
        const tag = bySlug.get(channel.tagSlug) || null;
        return {
          slug: channel.slug,
          tagSlug: channel.tagSlug,
          name: channel.name,
          description: channel.description,
          icon: channel.icon,
          priority: channel.priority,
          isJoinEnabled: channel.isJoinEnabled,
          tagId: tag?.id || null,
          followerCount: tag?.follower_count || 0,
          joinAvailable: channel.isJoinEnabled && channel.status === 'active' && !!tag?.id,
        };
      })
      .sort((a, b) => a.priority - b.priority);
  }, [tags]);

  const followedChannelSlugSet = useMemo(() => {
    const set = new Set<string>();
    followedTags.forEach((tag) => {
      const slug = resolvePrimaryChannelFromTags([tag.slug]);
      if (slug !== 'general') set.add(slug);
    });
    return set;
  }, [followedTags]);

  const joinedChannels = channelModels.filter((channel) => followedChannelSlugSet.has(channel.slug));
  const nonJoinedChannels = channelModels.filter((channel) => !followedChannelSlugSet.has(channel.slug));

  const suggestedChannels = nonJoinedChannels
    .filter((channel) => channel.isJoinEnabled)
    .sort((a, b) => {
      if (b.followerCount !== a.followerCount) return b.followerCount - a.followerCount;
      return a.priority - b.priority;
    })
    .slice(0, SUGGESTED_CHANNELS_COUNT);

  const suggestedSlugSet = new Set(suggestedChannels.map((channel) => channel.slug));

  const moreChannels = nonJoinedChannels.filter((channel) => !suggestedSlugSet.has(channel.slug));

  const visibleJoinedChannels = showAllJoined
    ? joinedChannels
    : joinedChannels.slice(0, MAX_JOINED_CHANNELS_DISPLAY);

  const { data: suggestedPreviewsByChannel = {} } = useQuery({
    queryKey: ['channels-suggested-previews', suggestedChannels.map((channel) => channel.slug)],
    enabled: suggestedChannels.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: blueprints, error } = await supabase
        .from('blueprints')
        .select('id, title, created_at')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      if (!blueprints || blueprints.length === 0) return {} as Record<string, { id: string; title: string }[]>;

      const blueprintIds = blueprints.map((row) => row.id);

      const { data: tagRows, error: tagsError } = await supabase
        .from('blueprint_tags')
        .select('blueprint_id, tags(slug)')
        .in('blueprint_id', blueprintIds);

      if (tagsError) throw tagsError;

      const tagsByBlueprintId = new Map<string, string[]>();
      (tagRows || []).forEach((row) => {
        const list = tagsByBlueprintId.get(row.blueprint_id) || [];
        if (row.tags && typeof row.tags === 'object' && 'slug' in row.tags) {
          list.push((row.tags as { slug: string }).slug);
        }
        tagsByBlueprintId.set(row.blueprint_id, list);
      });

      const output: Record<string, { id: string; title: string }[]> = {};

      blueprints.forEach((row) => {
        const tagsForRow = tagsByBlueprintId.get(row.id) || [];
        const channelSlug = resolvePrimaryChannelFromTags(tagsForRow);
        if (!suggestedSlugSet.has(channelSlug)) return;

        const current = output[channelSlug] || [];
        if (current.length >= 3) return;

        current.push({ id: row.id, title: row.title });
        output[channelSlug] = current;
      });

      return output;
    },
  });

  useEffect(() => {
    if (tagsLoading || followsLoading) return;
    if (hasLoggedViewRef.current) return;
    hasLoggedViewRef.current = true;
    logP3Event({
      eventName: 'channels_index_view',
      surface: 'channels_index',
      user,
      metadata: {
        joined_channels_count: joinedChannels.length,
        suggested_channels_count: suggestedChannels.length,
      },
    });
  }, [followsLoading, joinedChannels.length, suggestedChannels.length, tagsLoading, user]);

  useEffect(() => {
    if (tagsLoading || followsLoading) return;
    if (suggestedChannels.length === 0) return;
    logOncePerSession('p3_channel_suggested_impression', () => {
      logP3Event({
        eventName: 'channel_suggested_impression',
        surface: 'channels_index',
        user,
        metadata: {
          suggested_slugs: suggestedChannels.map((c) => c.slug).slice(0, 4),
        },
      });
    });
  }, [followsLoading, suggestedChannels, tagsLoading, user]);

  const handleJoinLeave = async (channel: ChannelViewModel) => {
    const state = channel.tagId ? getFollowState({ id: channel.tagId }) : 'not_joined';
    const isJoinIntent = state !== 'joined' && state !== 'leaving';

    if (!user) {
      if (isJoinIntent) {
        logP3Event({
          eventName: 'channel_join_click',
          surface: 'channels_index',
          user,
          metadata: {
            channel_slug: channel.slug,
            join_available: channel.joinAvailable,
            source: 'channels_index',
          },
        });
        logP3Event({
          eventName: 'channel_join_fail',
          surface: 'channels_index',
          user,
          metadata: {
            channel_slug: channel.slug,
            source: 'channels_index',
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
    if (!channel.joinAvailable || !channel.tagId) return;
    if (state === 'joining' || state === 'leaving') return;

    try {
      if (state === 'joined') {
        await leaveChannel({ id: channel.tagId, slug: channel.tagSlug });
        logP3Event({
          eventName: 'channel_leave_success',
          surface: 'channels_index',
          user,
          metadata: {
            channel_slug: channel.slug,
            source: 'channels_index',
          },
        });
      } else {
        logP3Event({
          eventName: 'channel_join_click',
          surface: 'channels_index',
          user,
          metadata: {
            channel_slug: channel.slug,
            join_available: channel.joinAvailable,
            source: 'channels_index',
          },
        });
        await joinChannel({ id: channel.tagId, slug: channel.tagSlug });
        logP3Event({
          eventName: 'channel_join_success',
          surface: 'channels_index',
          user,
          metadata: {
            channel_slug: channel.slug,
            source: 'channels_index',
          },
        });
      }
    } catch (error) {
      if (isJoinIntent) {
        logP3Event({
          eventName: 'channel_join_fail',
          surface: 'channels_index',
          user,
          metadata: {
            channel_slug: channel.slug,
            source: 'channels_index',
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

  const renderJoinButton = (channel: ChannelViewModel) => {
    if (tagsLoading) {
      return (
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" variant="outline" disabled className="h-8 px-2 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading...
            </span>
          </Button>
        </div>
      );
    }

    if (!channel.isJoinEnabled) {
      return (
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" variant="outline" disabled className="h-8 px-2 text-xs">
            Read only
          </Button>
          <span className="text-[11px] text-muted-foreground">General lane is read-only</span>
        </div>
      );
    }

    if (!channel.joinAvailable) {
      return (
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" variant="outline" disabled className="h-8 px-2 text-xs">
            Join
          </Button>
          <span className="text-[11px] text-muted-foreground">Channel activation pending</span>
        </div>
      );
    }

    const state = getFollowState({ id: channel.tagId! });
    const isPending = state === 'joining' || state === 'leaving';
    const isJoined = state === 'joined' || state === 'leaving';
    const label = state === 'joining'
      ? 'Joining...'
      : state === 'leaving'
        ? 'Leaving...'
        : state === 'joined'
          ? 'Joined'
          : 'Join';

    return (
      <Button
        size="sm"
        variant={isJoined ? 'outline' : 'default'}
        disabled={isPending}
        className="h-8 px-2 text-xs"
        onClick={() => handleJoinLeave(channel)}
      >
        {isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
        {label}
      </Button>
    );
  };

  const renderChannelRow = (channel: ChannelViewModel, options?: { showSlug?: boolean }) => {
    const ChannelIcon = getChannelIcon(channel.icon);
    const showSlug = options?.showSlug ?? false;

    return (
      <Link key={channel.slug} to={`/b/${channel.slug}`} className="block">
        <div className="py-3.5 px-1 flex items-center justify-between gap-4 hover:bg-muted/20 transition-colors">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <ChannelIcon className="h-4 w-4" />
            </div>
            <div className="space-y-1 min-w-0">
              {showSlug && <p className="text-sm font-semibold text-primary">b/{channel.slug}</p>}
              <p className="text-sm font-medium">{channel.name}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{channel.description}</p>
            </div>
          </div>
          <div
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {renderJoinButton(channel)}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <section className="space-y-2">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">Channels</p>
          <h1 className="text-2xl font-semibold tracking-tight">Browse curated channels</h1>
          <p className="text-sm text-muted-foreground">
            Channels are curated lanes for blueprint discovery. Join channels to shape your feed.
          </p>
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
          <h2 className="text-lg font-semibold">Channels</h2>
          {joinedChannels.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                You have not joined any channels yet.
              </CardContent>
            </Card>
          ) : (
            <div className="divide-y divide-border/40 border-y border-border/40">
              {visibleJoinedChannels.map((channel) => renderChannelRow(channel, { showSlug: true }))}
              {joinedChannels.length > MAX_JOINED_CHANNELS_DISPLAY && (
                <div className="flex items-center justify-between px-1 py-2">
                  <p className="text-xs text-muted-foreground">
                    Showing {visibleJoinedChannels.length} of {joinedChannels.length}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowAllJoined((prev) => !prev)}
                  >
                    {showAllJoined ? 'Show less' : 'View all'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Suggested Channels</h2>
          {tagsLoading || followsLoading ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">Loading suggestions...</CardContent>
            </Card>
          ) : suggestedChannels.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No suggested channels right now.
              </CardContent>
            </Card>
          ) : (
            <div className="divide-y divide-border/40 border-y border-border/40">
              {suggestedChannels.map((channel) => {
                const previews = suggestedPreviewsByChannel[channel.slug] || [];
                const ChannelIcon = getChannelIcon(channel.icon);

                return (
                  <Link key={channel.slug} to={`/b/${channel.slug}`} className="block">
                    <div className="py-3.5 px-1 space-y-3 hover:bg-muted/20 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                            <ChannelIcon className="h-4 w-4" />
                          </div>
                          <div className="space-y-1 min-w-0">
                            <p className="text-sm font-medium">{channel.name}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{channel.description}</p>
                          </div>
                        </div>
                        <div
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        >
                          {renderJoinButton(channel)}
                        </div>
                      </div>

                      {previews.length > 0 && (
                        <div className="pl-11 space-y-1">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Explore</p>
                          <ul className="space-y-1">
                            {previews.slice(0, 3).map((preview, index) => (
                              <li key={preview.id}>
                                <Link
                                  to={`/blueprint/${preview.id}`}
                                  className="text-xs text-foreground/85 hover:text-primary line-clamp-1"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    logP3Event({
                                      eventName: 'channel_suggested_preview_click',
                                      surface: 'channels_index',
                                      user,
                                      blueprintId: preview.id,
                                      metadata: {
                                        channel_slug: channel.slug,
                                        position: index,
                                      },
                                    });
                                  }}
                                >
                                  {preview.title}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">More Channels</h2>
          {tagsLoading || followsLoading ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">Loading channels...</CardContent>
            </Card>
          ) : moreChannels.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">No more channels to show.</CardContent>
            </Card>
          ) : (
            <div className="divide-y divide-border/40 border-y border-border/40">
              {moreChannels.map((channel) => renderChannelRow(channel, { showSlug: false }))}
            </div>
          )}
        </section>
        <AppFooter />
      </main>
    </div>
  );
}

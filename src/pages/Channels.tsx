import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useTagFollows } from '@/hooks/useTagFollows';
import { useTagsDirectory } from '@/hooks/useTags';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { getChannelIcon } from '@/lib/channelIcons';

interface ChannelViewModel {
  slug: string;
  name: string;
  description: string;
  icon: string;
  isJoinEnabled: boolean;
  tagId: string | null;
  joinAvailable: boolean;
}

export default function Channels() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { tags, isLoading: tagsLoading } = useTagsDirectory();
  const { followedSlugs, getFollowState, joinChannel, leaveChannel } = useTagFollows();
  const [showSigninPrompt, setShowSigninPrompt] = useState(false);

  const channelModels = useMemo<ChannelViewModel[]>(() => {
    const bySlug = new Map(tags.map((tag) => [tag.slug, tag.id]));
    return CHANNELS_CATALOG.map((channel) => {
      const tagId = bySlug.get(channel.tagSlug) || null;
      return {
        slug: channel.slug,
        name: channel.name,
        description: channel.description,
        icon: channel.icon,
        isJoinEnabled: channel.isJoinEnabled,
        tagId,
        joinAvailable: channel.isJoinEnabled && channel.status === 'active' && !!tagId,
      };
    });
  }, [tags]);

  const yourChannels = channelModels.filter((channel) => followedSlugs.has(channel.slug));
  const otherChannels = channelModels.filter((channel) => !followedSlugs.has(channel.slug));

  const handleJoinLeave = async (channel: ChannelViewModel) => {
    if (!user) {
      setShowSigninPrompt(true);
      toast({
        title: 'Sign in required',
        description: 'Please sign in to join channels.',
      });
      return;
    }
    if (!channel.joinAvailable || !channel.tagId) return;

    const state = getFollowState({ id: channel.tagId });
    if (state === 'joining' || state === 'leaving') return;

    try {
      if (state === 'joined') {
        await leaveChannel({ id: channel.tagId, slug: channel.slug });
      } else {
        await joinChannel({ id: channel.tagId, slug: channel.slug });
      }
    } catch (error) {
      toast({
        title: 'Channel update failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const renderJoinButton = (channel: ChannelViewModel) => {
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
          <h2 className="text-lg font-semibold">Your Channels</h2>
          {yourChannels.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                You have not joined any channels yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {yourChannels.map((channel) => (
                <Card key={channel.slug}>
                  <Link to={`/b/${channel.slug}`} className="block">
                    <CardContent className="py-4 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        {(() => {
                          const ChannelIcon = getChannelIcon(channel.icon);
                          return (
                            <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                              <ChannelIcon className="h-4 w-4" />
                            </div>
                          );
                        })()}
                        <div className="space-y-1 min-w-0">
                          <p className="text-sm font-semibold text-primary">b/{channel.slug}</p>
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
                    </CardContent>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">All Channels</h2>
          {tagsLoading ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">Loading channels...</CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {otherChannels.map((channel) => (
                <Card key={channel.slug}>
                  <Link to={`/b/${channel.slug}`} className="block">
                    <CardContent className="py-4 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        {(() => {
                          const ChannelIcon = getChannelIcon(channel.icon);
                          return (
                            <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                              <ChannelIcon className="h-4 w-4" />
                            </div>
                          );
                        })()}
                        <div className="space-y-1 min-w-0">
                          <p className="text-sm font-semibold text-primary">b/{channel.slug}</p>
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
                    </CardContent>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </section>
        <AppFooter />
      </main>
    </div>
  );
}

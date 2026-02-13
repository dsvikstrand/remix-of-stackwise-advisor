import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTagsDirectory } from '@/hooks/useTags';
import { useSuggestedTags } from '@/hooks/useSuggestedTags';
import { useTagFollows } from '@/hooks/useTagFollows';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { normalizeTag } from '@/lib/tagging';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Hash, Plus, Search, Sparkles, TrendingUp, Users, Check, Loader2 } from 'lucide-react';

export default function Tags() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { tags, isLoading, createTag, isUpdating } = useTagsDirectory();
  const { getFollowState, joinChannel, leaveChannel } = useTagFollows();
  const { data: suggestedTags, isLoading: suggestionsLoading } = useSuggestedTags(12);

  const [search, setSearch] = useState('');
  const [newTag, setNewTag] = useState('');
  const [showSigninPrompt, setShowSigninPrompt] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setSearch(q);
    }
  }, [searchParams]);

  // Separate followed and unfollowed tags
  const { followedTags, allTags } = useMemo(() => {
    const query = normalizeTag(search);
    const filtered = query ? tags.filter((tag) => tag.slug.includes(query)) : tags;
    return {
      followedTags: filtered.filter((t) => t.is_following),
      allTags: filtered,
    };
  }, [search, tags]);

  const handleCreate = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to create or join channels.',
      });
      return;
    }

    const slug = normalizeTag(newTag);
    if (!slug) {
      toast({
        title: 'Invalid channel topic',
        description: 'Use letters, numbers, and dashes only.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createTag(slug);
      setNewTag('');
      toast({
        title: 'Channel topic created',
        description: `#${slug} is ready to join.`,
      });
    } catch (error) {
      toast({
        title: 'Failed to create channel topic',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleToggleFollow = async (tagId: string, isFollowing: boolean) => {
    if (!user) {
      setShowSigninPrompt(true);
      toast({
        title: 'Sign in required',
        description: 'Please sign in to manage channels.',
      });
      return;
    }

    try {
      if (isFollowing) {
        await leaveChannel({ id: tagId });
      } else {
        await joinChannel({ id: tagId });
      }
    } catch (error) {
      toast({
        title: isFollowing ? 'Failed to leave channel' : 'Failed to join channel',
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

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Channels</h1>
          <p className="text-muted-foreground">
            Join channels to personalize your feed. Create channel topics to organize your work.
          </p>
        </div>

        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Discover Channels</p>
            <h2 className="text-xl font-semibold">Find your community signals</h2>
            <p className="text-sm text-muted-foreground">
              Join channels to shape your Wall, or create new topics as you publish.
            </p>
          </CardContent>
        </Card>

        {!user && showSigninPrompt && (
          <Card className="border-border/60 bg-card/60">
            <CardContent className="pt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Sign in to join channels</p>
                <p className="text-xs text-muted-foreground">Join channels to shape your feed and recommendations.</p>
              </div>
              <Button asChild size="sm">
                <a href="/auth">Sign in</a>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Search & Create */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search channels..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {search && (
                <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
                  Clear
                </Button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Create a new channel topic..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  disabled={isUpdating}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleCreate} disabled={isUpdating || !newTag.trim()} className="gap-2">
                <Plus className="h-4 w-4" />
                Create
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Your Channels (if logged in and joined any) */}
        {user && followedTags.length > 0 && !search && (
          <section className="space-y-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Your Channels</h2>
              <span className="text-sm text-muted-foreground">({followedTags.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {followedTags.map((tag) => (
                (() => {
                  const state = getFollowState({ id: tag.id });
                  const isFollowing = state === 'joined' || state === 'leaving';
                  const isPending = state === 'joining' || state === 'leaving';
                  return (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      isFollowing={isFollowing}
                      onToggle={() => handleToggleFollow(tag.id, isFollowing)}
                      disabled={isPending}
                    />
                  );
                })()
              ))}
            </div>
          </section>
        )}

        {/* Suggested for You */}
        {user && !search && suggestedTags && suggestedTags.length > 0 && (
          <section className="space-y-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">Suggested for You</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedTags.map((tag) => {
                const existingTag = tags.find((t) => t.id === tag.id);
                const state = getFollowState({ id: tag.id });
                const isFollowing = state === 'joined' || state === 'leaving' || existingTag?.is_following === true;
                const isPending = state === 'joining' || state === 'leaving';
                return (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    isFollowing={isFollowing}
                    onToggle={() => handleToggleFollow(tag.id, isFollowing)}
                    disabled={isPending}
                    badge={tag.reason === 'related' ? 'related' : undefined}
                  />
                );
              })}
            </div>
            {suggestionsLoading && (
              <div className="flex gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-8 w-20 rounded-full bg-muted animate-pulse" />
                ))}
              </div>
            )}
          </section>
        )}

        {/* All Channels */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{search ? 'Search Results' : 'All Channels'}</h2>
            <span className="text-sm text-muted-foreground">({allTags.length})</span>
          </div>

          {isLoading ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-9 w-24 rounded-full bg-muted animate-pulse" />
              ))}
            </div>
          ) : allTags.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-muted-foreground">
                  {search ? 'No channels match your search.' : 'No channels yet. Create the first one!'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                (() => {
                  const state = getFollowState({ id: tag.id });
                  const isFollowing = state === 'joined' || state === 'leaving' || tag.is_following === true;
                  const isPending = state === 'joining' || state === 'leaving';
                  return (
                    <TagChip
                      key={tag.id}
                      tag={tag}
                      isFollowing={isFollowing}
                      onToggle={() => handleToggleFollow(tag.id, isFollowing)}
                      disabled={isPending}
                    />
                  );
                })()
              ))}
            </div>
          )}
        </section>
        <AppFooter />
      </main>
    </div>
  );
}

interface TagChipProps {
  tag: { id: string; slug: string; follower_count: number };
  isFollowing: boolean;
  onToggle: () => void;
  disabled?: boolean;
  badge?: 'related';
}

function TagChip({ tag, isFollowing, onToggle, disabled, badge }: TagChipProps) {
  const label = disabled
    ? (isFollowing ? 'Leaving...' : 'Joining...')
    : (isFollowing ? 'Joined' : 'Join');

  return (
    <div className="inline-flex items-center gap-2">
      <Badge
        variant={isFollowing ? 'default' : 'outline'}
        className={`
          gap-1.5 px-3 py-2 text-sm transition-all border
          ${isFollowing
            ? 'bg-primary/15 text-primary border-primary/30'
            : 'bg-muted/40 text-muted-foreground border-border/60'
          }
        `}
      >
        <Hash className="h-3 w-3" />
        {tag.slug}
        {tag.follower_count > 0 && (
          <span className="flex items-center gap-0.5 text-xs opacity-70 ml-1">
            <Users className="h-3 w-3" />
            {tag.follower_count}
          </span>
        )}
        {badge === 'related' && (
          <span className="text-[10px] uppercase tracking-wider opacity-60 ml-1">
            related
          </span>
        )}
      </Badge>
      <Button
        type="button"
        variant={isFollowing ? 'outline' : 'default'}
        size="sm"
        className="h-8 px-2 text-xs"
        onClick={onToggle}
        disabled={disabled}
        title={isFollowing ? 'Leave Channel' : 'Join Channel'}
      >
        {disabled && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}

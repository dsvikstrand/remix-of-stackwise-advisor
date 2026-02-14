import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBlueprintSearch, type BlueprintSort } from '@/hooks/useBlueprintSearch';
import { usePopularBlueprintTags } from '@/hooks/usePopularBlueprintTags';
import { useSuggestedBlueprints } from '@/hooks/useSuggestedBlueprints';
import { useToggleBlueprintLike } from '@/hooks/useBlueprints';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { BlueprintCard } from '@/components/blueprint/BlueprintCard';
import { TagFilterChips } from '@/components/inventory/TagFilterChips';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Filter, Plus, Search } from 'lucide-react';
import { PageDivider, PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { WallToWallGrid } from '@/components/layout/WallToWallGrid';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { resolvePrimaryChannelFromTags } from '@/lib/channelMapping';
import { supabase } from '@/integrations/supabase/client';

export default function Blueprints() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<string>('any');
  const [sort, setSort] = useState<BlueprintSort>('popular');
  const [showBlueprintInfo, setShowBlueprintInfo] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const effectiveQuery = selectedTag || query;

  const { data: blueprints, isLoading } = useBlueprintSearch(effectiveQuery, sort);
  const { data: popularTags = [], isLoading: tagsLoading } = usePopularBlueprintTags(12);
  const { data: suggestedBlueprints = [], isLoading: suggestedLoading } = useSuggestedBlueprints(6);
  const toggleLike = useToggleBlueprintLike();

  const suggestedIds = new Set(suggestedBlueprints.map((bp) => bp.id));
  const mainBlueprints = useMemo(() => {
    if (!blueprints) return [];
    if (effectiveQuery) return blueprints;
    const shouldExcludeSuggested = !!user && sort === 'popular';
    if (!shouldExcludeSuggested) return blueprints;
    return blueprints.filter((bp) => !suggestedIds.has(bp.id));
  }, [blueprints, suggestedIds, effectiveQuery, user, sort]);

  const handleLike = async (blueprintId: string, liked: boolean) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to like blueprints.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await toggleLike.mutateAsync({ blueprintId, liked });
    } catch (error) {
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleTagSelect = (slug: string | null) => {
    setSelectedTag(slug);
    if (slug) setQuery('');
  };

  // Keep newest sorting strict: suggestions should not preempt latest ordering.
  const showSuggestions = !effectiveQuery && user && sort === 'popular';

  const displayBlueprints = useMemo(() => {
    if (!showSuggestions) return mainBlueprints;
    if (!suggestedBlueprints || suggestedBlueprints.length === 0) return mainBlueprints;
    if (suggestedLoading) return mainBlueprints;
    return [...suggestedBlueprints, ...mainBlueprints];
  }, [showSuggestions, suggestedBlueprints, suggestedLoading, mainBlueprints]);

  const filteredBlueprints = useMemo(() => {
    if (selectedChannel === 'any') return displayBlueprints;
    return displayBlueprints.filter((blueprint) => {
      const channelSlug = resolvePrimaryChannelFromTags(blueprint.tags.map((tag) => tag.slug));
      return channelSlug === selectedChannel;
    });
  }, [displayBlueprints, selectedChannel]);

  const blueprintIds = useMemo(() => filteredBlueprints.map((bp) => bp.id), [filteredBlueprints]);
  const { data: commentCountsByBlueprintId = {} } = useQuery({
    queryKey: ['blueprints-comment-counts', blueprintIds],
    enabled: blueprintIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blueprint_comments')
        .select('blueprint_id')
        .in('blueprint_id', blueprintIds);

      if (error) throw error;

      return (data || []).reduce<Record<string, number>>((acc, row) => {
        acc[row.blueprint_id] = (acc[row.blueprint_id] || 0) + 1;
        return acc;
      }, {});
    },
  });

  const channelOptions = useMemo(() => {
    const sorted = [...CHANNELS_CATALOG].sort((a, b) => a.priority - b.priority);
    return [{ slug: 'any', name: 'Any channel' }, ...sorted.map((channel) => ({ slug: channel.slug, name: channel.name }))];
  }, []);

  return (
    <PageRoot>
      <AppHeader />

      <PageMain>
        <PageSection className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-primary uppercase tracking-wide">Blueprints</p>
              <h1 className="text-xl font-semibold tracking-tight">Search and explore blueprints</h1>
            </div>
            <div className="flex items-center gap-2">
              {!user && (
                <Link to="/auth">
                  <Button variant="outline" size="sm">Sign in</Button>
                </Link>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBlueprintInfo((prev) => !prev)}
              >
                What is a Blueprint?
              </Button>
              <Link to={`${location.pathname}?create=1`}>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create
                </Button>
              </Link>
            </div>
          </div>

          {showBlueprintInfo && (
            <div className="border border-border/40 px-3 py-3 text-sm text-muted-foreground leading-relaxed">
              <p>
                A Blueprint is a step-by-step routine built from a library.
                It turns a list of items into an ordered plan.
                Each step can include multiple items and short context.
                Blueprints are meant to be practical and repeatable.
                You can follow a blueprint as-is or edit it to fit your style.
                The review helps you check gaps or risks before you publish.
                Banners and tags help others discover your blueprint.
                Public blueprints appear on the community wall.
                Saving a blueprint lets you return and improve it later.
                Think of it as a recipe for a routine you can share.
              </p>
            </div>
          )}
        </PageSection>

        <div className="border border-transparent px-3 py-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) setSelectedTag(null);
              }}
              placeholder="Search blueprints by title or tag..."
              className="border-none shadow-none focus-visible:ring-0 bg-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>Filter by channel or tag to narrow results.</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Channel</p>
                    <Select value={selectedChannel} onValueChange={(value) => setSelectedChannel(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Any channel" />
                      </SelectTrigger>
                      <SelectContent>
                        {channelOptions.map((option) => (
                          <SelectItem key={option.slug} value={option.slug}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!tagsLoading && popularTags.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Popular tags</p>
                      <TagFilterChips
                        tags={popularTags}
                        selectedTag={selectedTag}
                        onSelectTag={handleTagSelect}
                        variant="wrap"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Loading tags…</p>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <div className="w-full sm:w-56">
              <Select value={sort} onValueChange={(value) => setSort(value as BlueprintSort)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">Most liked</SelectItem>
                  <SelectItem value="latest">Newest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <PageDivider />

        <PageSection className="space-y-4">
          {effectiveQuery ? (
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Results for <span className="text-foreground">"{effectiveQuery}"</span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  setQuery('');
                  setSelectedTag(null);
                }}
              >
                Clear
              </Button>
            </div>
          ) : (
            <div />
          )}

          {isLoading ? (
            <WallToWallGrid
              variant="tiles"
              items={Array.from({ length: 6 })}
              renderItem={(_, { index }) => (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-10 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                </div>
              )}
            />
          ) : filteredBlueprints.length > 0 ? (
            <WallToWallGrid
              variant="tiles"
              items={filteredBlueprints}
              renderItem={(blueprint) => (
                <BlueprintCard
                  blueprint={blueprint}
                  onLike={handleLike}
                  onTagClick={(tagSlug) => navigate(`/explore?q=${encodeURIComponent(tagSlug)}`)}
                  commentCount={commentCountsByBlueprintId[blueprint.id] || 0}
                  variant="grid_flat"
                />
              )}
            />
          ) : (
            <div className="border border-border/40 py-12 text-center space-y-4">
              <h3 className="text-lg font-semibold">No blueprints found</h3>
              <p className="text-sm text-muted-foreground">
                {effectiveQuery ? 'Try a different search or clear filters.' : 'Be the first to publish a blueprint!'}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {effectiveQuery ? (
                  <Button variant="outline" onClick={() => { setQuery(''); setSelectedTag(null); }}>
                    Clear search
                  </Button>
                ) : (
                  <Link to={`${location.pathname}?create=1`}>
                    <Button>Create</Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </PageSection>
        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}

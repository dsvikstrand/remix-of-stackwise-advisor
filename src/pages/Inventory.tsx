import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Filter, Plus, Search } from 'lucide-react';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { InventoryCard } from '@/components/inventory/InventoryCard';
import { TagFilterChips } from '@/components/inventory/TagFilterChips';
import { PageDivider, PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { WallToWallGrid } from '@/components/layout/WallToWallGrid';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useInventorySearch, useToggleInventoryLike, type InventorySort } from '@/hooks/useInventories';
import { usePopularInventoryTags } from '@/hooks/usePopularInventoryTags';
import { useSuggestedInventories } from '@/hooks/useSuggestedInventories';
import { buildUrlWithChannel, getPostableChannel } from '@/lib/channelPostContext';
import { logMvpEvent } from '@/lib/logEvent';

export default function Inventory() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const postChannelSlug = (searchParams.get('channel') || '').trim();
  const postChannel = postChannelSlug ? getPostableChannel(postChannelSlug) : null;

  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sort, setSort] = useState<InventorySort>('popular');
  const [showLibraryInfo, setShowLibraryInfo] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const hasLoggedView = useRef(false);

  const effectiveQuery = selectedTag || query;

  useEffect(() => {
    if (hasLoggedView.current) return;
    hasLoggedView.current = true;
    void logMvpEvent({
      eventName: 'view_library',
      userId: user?.id,
      path: window.location.pathname,
    });
  }, [user?.id]);

  const { data: inventories, isLoading } = useInventorySearch(effectiveQuery, sort);
  const { data: popularTags = [], isLoading: tagsLoading } = usePopularInventoryTags(12);
  const { data: suggestedInventories = [], isLoading: suggestedLoading } = useSuggestedInventories(6);
  const toggleLike = useToggleInventoryLike();

  const suggestedIds = new Set(suggestedInventories.map((inv) => inv.id));
  const mainInventories = useMemo(() => {
    if (!inventories) return [];
    if (effectiveQuery) return inventories;
    return inventories.filter((inv) => !suggestedIds.has(inv.id));
  }, [effectiveQuery, inventories, suggestedIds]);

  const showSuggestions = !effectiveQuery && user && sort === 'popular';
  const displayInventories = useMemo(() => {
    if (!showSuggestions) return mainInventories;
    if (!suggestedInventories || suggestedInventories.length === 0) return mainInventories;
    if (suggestedLoading) return mainInventories;
    return [...suggestedInventories, ...mainInventories];
  }, [mainInventories, showSuggestions, suggestedInventories, suggestedLoading]);

  const handleLike = async (inventoryId: string, liked: boolean) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to like inventories.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await toggleLike.mutateAsync({ inventoryId, liked });
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

  return (
    <PageRoot>
      <AppHeader />

      <PageMain className="space-y-6">
        <PageSection>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-primary uppercase tracking-wide">Library</p>
              <h1 className="text-2xl font-semibold tracking-tight">Pick a library, then build your blueprint</h1>
              <p className="text-sm text-muted-foreground">
                Browse collections of items, open one, then start shaping your routine step by step.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowLibraryInfo((prev) => !prev)}>
                What is a Library?
              </Button>
              <Link
                to={postChannel ? buildUrlWithChannel('/inventory/create', postChannel.slug, { intent: 'post' }) : '/inventory/create'}
              >
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create
                </Button>
              </Link>
            </div>
          </div>

          {postChannel && (
            <div className="border border-border/40 p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Posting to b/{postChannel.slug}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  Choose a library, then publish your blueprint into this channel.
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to={`/b/${postChannel.slug}`}>View</Link>
              </Button>
            </div>
          )}

          {showLibraryInfo && (
            <div className="border border-border/40 p-4 text-sm text-muted-foreground leading-relaxed">
              <p>
                Think of a Library as a curated list of items you can use to build a routine. It is the ingredient shelf
                for a blueprint. Each library is organized into categories so you can scan quickly. You do not have to
                use everything; it is a toolbox, not a checklist.
              </p>
            </div>
          )}
        </PageSection>

        <PageDivider />

        <div className="border border-transparent px-3 py-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 flex-1">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) setSelectedTag(null);
              }}
              placeholder="Search libraries by title or tag..."
              className="border-none shadow-none focus-visible:ring-0 bg-transparent"
            />
          </div>

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
                <SheetDescription>Filter by tag to narrow down libraries.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                {!tagsLoading && popularTags.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Popular tags</p>
                    <TagFilterChips tags={popularTags} selectedTag={selectedTag} onSelectTag={handleTagSelect} variant="wrap" />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading tags…</p>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <div className="w-full sm:w-56">
            <Select value={sort} onValueChange={(value) => setSort(value as InventorySort)}>
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

        <section className="space-y-4">
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
            <h2 className="text-sm font-semibold text-muted-foreground">
              {sort === 'latest' ? 'Newest libraries' : 'Popular libraries'}
            </h2>
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
          ) : displayInventories.length > 0 ? (
            <WallToWallGrid
              variant="tiles"
              items={displayInventories}
              renderItem={(inventory) => (
                <InventoryCard
                  inventory={inventory}
                  onLike={handleLike}
                  linkSearch={postChannel ? location.search : ''}
                  variant="grid_flat"
                />
              )}
            />
          ) : (
            <Card className="bg-transparent border border-border/40">
              <CardContent className="py-12 text-center space-y-4">
                <h3 className="text-lg font-semibold">No libraries found</h3>
                <p className="text-sm text-muted-foreground">
                  {effectiveQuery ? 'Try a different search or clear filters.' : 'Be the first to create a library!'}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {effectiveQuery ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuery('');
                        setSelectedTag(null);
                      }}
                    >
                      Clear search
                    </Button>
                  ) : (
                    <Link to="/inventory/create">
                      <Button>Create Library</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}

import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInventorySearch, useToggleInventoryLike } from '@/hooks/useInventories';
import { usePopularInventoryTags } from '@/hooks/usePopularInventoryTags';
import { useSuggestedInventories } from '@/hooks/useSuggestedInventories';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { InventoryCard } from '@/components/inventory/InventoryCard';
import { TagFilterChips } from '@/components/inventory/TagFilterChips';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Filter, Search, Plus } from 'lucide-react';
import { logMvpEvent } from '@/lib/logEvent';

export default function Inventory() {
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showLibraryInfo, setShowLibraryInfo] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const hasLoggedView = useRef(false);

  // Combine search query with selected tag
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

  const { data: inventories, isLoading } = useInventorySearch(effectiveQuery);
  const { data: popularTags = [], isLoading: tagsLoading } = usePopularInventoryTags(12);
  const { data: suggestedInventories = [], isLoading: suggestedLoading } = useSuggestedInventories(6);
  const toggleLike = useToggleInventoryLike();

  // Filter out suggested inventories from the main list to avoid duplicates
  const suggestedIds = new Set(suggestedInventories.map((inv) => inv.id));
  const mainInventories = useMemo(() => {
    if (!inventories) return [];
    // Only filter if showing suggestions (no search/filter active)
    if (effectiveQuery) return inventories;
    return inventories.filter((inv) => !suggestedIds.has(inv.id));
  }, [inventories, suggestedIds, effectiveQuery]);

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
    if (slug) setQuery(''); // Clear text search when tag selected
  };

  const showSuggestions = !effectiveQuery && user;

  const displayInventories = useMemo(() => {
    if (!showSuggestions) return mainInventories;
    if (!suggestedInventories || suggestedInventories.length === 0) return mainInventories;
    if (suggestedLoading) return mainInventories;
    return [...suggestedInventories, ...mainInventories];
  }, [showSuggestions, suggestedInventories, suggestedLoading, mainInventories]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-60 h-60 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-1/4 w-40 h-40 bg-primary/3 rounded-full blur-2xl" />
      </div>

      <AppHeader />

      <main className="relative max-w-4xl mx-auto px-4 py-8 space-y-6">
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-primary uppercase tracking-wide">Library</p>
              <h1 className="text-2xl font-semibold tracking-tight">Pick a library, then build your blueprint</h1>
              <p className="text-sm text-muted-foreground">
                Browse collections of items, open one, then start shaping your routine step by step.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLibraryInfo((prev) => !prev)}
              >
                What is a Library?
              </Button>
              <Link to="/inventory/create">
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create
                </Button>
              </Link>
            </div>
          </div>

          {showLibraryInfo && (
            <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 text-sm text-muted-foreground leading-relaxed">
              <p>
                Think of a Library as a curated list of items you can use to build a routine.
                It is the ingredient shelf for a blueprint.
                Each library is organized into categories so you can scan quickly.
                You do not have to use everything; it is a toolbox, not a checklist.
                Good libraries save time by gathering the best options in one place.
                When you open a library, you can pick items that fit your goal.
                As you select items, you start shaping a blueprint.
                Libraries can be public so others can learn from them.
                You can also create your own library if something is missing.
                Start simple, then refine as you learn what works for you.
              </p>
            </div>
          )}
        </section>

        <Card className="bg-card/60 backdrop-blur-sm border-border/50">
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
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
          </CardContent>
        </Card>

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
            <h2 className="text-sm font-semibold text-muted-foreground">Popular libraries</h2>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="bg-card/60 backdrop-blur-sm border-border/50">
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-10 w-full" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : displayInventories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayInventories.map((inventory) => (
                <InventoryCard
                  key={inventory.id}
                  inventory={inventory}
                  onLike={handleLike}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-card/60 backdrop-blur-sm">
              <CardContent className="py-12 text-center space-y-4">
                <h3 className="text-lg font-semibold">No libraries found</h3>
                <p className="text-sm text-muted-foreground">
                  {effectiveQuery
                    ? 'Try a different search or clear filters.'
                    : 'Be the first to create a library!'}
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
      </main>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBlueprintSearch, type BlueprintSort } from '@/hooks/useBlueprintSearch';
import { usePopularBlueprintTags } from '@/hooks/usePopularBlueprintTags';
import { useSuggestedBlueprints } from '@/hooks/useSuggestedBlueprints';
import { useToggleBlueprintLike } from '@/hooks/useBlueprints';
import { useTagFollows } from '@/hooks/useTagFollows';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { BlueprintCard } from '@/components/blueprint/BlueprintCard';
import { TagFilterChips } from '@/components/inventory/TagFilterChips';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Filter, Plus, Search } from 'lucide-react';

export default function Blueprints() {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sort, setSort] = useState<BlueprintSort>('popular');
  const [showBlueprintInfo, setShowBlueprintInfo] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const effectiveQuery = selectedTag || query;

  const { data: blueprints, isLoading } = useBlueprintSearch(effectiveQuery, sort);
  const { data: popularTags = [], isLoading: tagsLoading } = usePopularBlueprintTags(12);
  const { data: suggestedBlueprints = [], isLoading: suggestedLoading } = useSuggestedBlueprints(6);
  const toggleLike = useToggleBlueprintLike();
  const { followedIds, toggleFollow } = useTagFollows();

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

  const handleTagToggle = async (tag: { id: string; slug: string }) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to join channels.',
      });
      return;
    }
    try {
      await toggleFollow(tag);
    } catch (error) {
      toast({
        title: 'Channel update failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Keep newest sorting strict: suggestions should not preempt latest ordering.
  const showSuggestions = !effectiveQuery && user && sort === 'popular';

  const displayBlueprints = useMemo(() => {
    if (!showSuggestions) return mainBlueprints;
    if (!suggestedBlueprints || suggestedBlueprints.length === 0) return mainBlueprints;
    if (suggestedLoading) return mainBlueprints;
    return [...suggestedBlueprints, ...mainBlueprints];
  }, [showSuggestions, suggestedBlueprints, suggestedLoading, mainBlueprints]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
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
              <p className="text-sm font-semibold text-primary uppercase tracking-wide">Blueprints</p>
              <h1 className="text-2xl font-semibold tracking-tight">Search and explore community blueprints</h1>
              <p className="text-sm text-muted-foreground">
                Start with a keyword, then narrow by tag or sort by what’s popular.
              </p>
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
                  + Create
                </Button>
              </Link>
            </div>
          </div>

          {showBlueprintInfo && (
            <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4 text-sm text-muted-foreground leading-relaxed">
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
                    <SheetDescription>Filter by tag to narrow results.</SheetDescription>
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
            <h2 className="text-sm font-semibold text-muted-foreground">Popular blueprints</h2>
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
          ) : displayBlueprints.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayBlueprints.map((blueprint) => (
                <BlueprintCard
                  key={blueprint.id}
                  blueprint={blueprint}
                  onLike={handleLike}
                  followedTagIds={followedIds}
                  onToggleTag={handleTagToggle}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-card/60 backdrop-blur-sm">
              <CardContent className="py-12 text-center space-y-4">
                <h3 className="text-lg font-semibold">No blueprints found</h3>
                <p className="text-sm text-muted-foreground">
                  {effectiveQuery
                    ? 'Try a different search or clear filters.'
                    : 'Be the first to publish a blueprint!'}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {effectiveQuery ? (
                    <Button variant="outline" onClick={() => { setQuery(''); setSelectedTag(null); }}>
                      Clear search
                    </Button>
                  ) : (
                    <Link to={`${location.pathname}?create=1`}>
                      <Button>+ Create</Button>
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

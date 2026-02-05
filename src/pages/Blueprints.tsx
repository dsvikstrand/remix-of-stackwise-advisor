import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
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
import { SuggestedBlueprints } from '@/components/blueprint/SuggestedBlueprints';
import { Layers, Search } from 'lucide-react';

export default function Blueprints() {
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sort, setSort] = useState<BlueprintSort>('popular');
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
    return blueprints.filter((bp) => !suggestedIds.has(bp.id));
  }, [blueprints, suggestedIds, effectiveQuery]);

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
        description: 'Please sign in to follow tags.',
      });
      return;
    }
    try {
      await toggleFollow(tag);
    } catch (error) {
      toast({
        title: 'Tag update failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const showSuggestions = !effectiveQuery && user;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-60 h-60 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-1/4 w-40 h-40 bg-primary/3 rounded-full blur-2xl" />
      </div>

      <AppHeader />

      <main className="relative max-w-6xl mx-auto px-4 py-8 space-y-8">
        <Card className="border-border/50 bg-card/60 backdrop-blur-sm">
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Blueprint Library</p>
            <h2 className="text-xl font-semibold">Pick a collection, then build your blueprint</h2>
            <p className="text-sm text-muted-foreground">
              Browse blueprints, open one, and start shaping your routine.
            </p>
          </CardContent>
        </Card>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold">Blueprint Library</h1>
            <Link to="/inventory">
              <Button size="sm" className="gap-2">
                <Layers className="h-4 w-4" />
                Build from Library
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground">
            Search, sort, and explore the best blueprints from the community.
          </p>
        </section>

        <Card className="bg-card/60 backdrop-blur-sm">
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
          </CardContent>
        </Card>

        {!tagsLoading && popularTags.length > 0 && (
          <TagFilterChips
            tags={popularTags}
            selectedTag={selectedTag}
            onSelectTag={handleTagSelect}
            followedTagIds={followedIds}
            onToggleFollow={handleTagToggle}
          />
        )}

        {!user && (
          <Card className="bg-card/60 backdrop-blur-sm">
            <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Sign in to personalize</p>
                <p className="text-xs text-muted-foreground">
                  Follow tags and like blueprints to shape what you see.
                </p>
              </div>
              <Link to="/auth">
                <Button size="sm">Sign in</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {showSuggestions && (
          <SuggestedBlueprints
            blueprints={suggestedBlueprints}
            isLoading={suggestedLoading}
            onLike={handleLike}
            followedTagIds={followedIds}
            onToggleTag={handleTagToggle}
          />
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            {effectiveQuery ? `Results for "${effectiveQuery}"` : 'All Blueprints'}
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
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
          ) : mainBlueprints.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mainBlueprints.map((blueprint) => (
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
                    <Link to="/inventory">
                      <Button>Build from Library</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}

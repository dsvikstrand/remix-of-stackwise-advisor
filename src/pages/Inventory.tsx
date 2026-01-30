import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { IntroCallout } from '@/components/shared/IntroCallout';
import { useInventorySearch, useToggleInventoryLike } from '@/hooks/useInventories';
import { usePopularInventoryTags } from '@/hooks/usePopularInventoryTags';
import { useSuggestedInventories } from '@/hooks/useSuggestedInventories';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { InventoryCard } from '@/components/inventory/InventoryCard';
import { TagFilterChips } from '@/components/inventory/TagFilterChips';
import { SuggestedInventories } from '@/components/inventory/SuggestedInventories';
import { Search, Plus } from 'lucide-react';

export default function Inventory() {
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // Combine search query with selected tag
  const effectiveQuery = selectedTag || query;

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

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-60 h-60 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-1/4 w-40 h-40 bg-primary/3 rounded-full blur-2xl" />
      </div>

      <AppHeader
        actions={(
          <Link to="/inventory/create">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </Link>
        )}
      />

      <main className="relative max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Intro Callout for first-time visitors */}
        <IntroCallout
          storageKey="blueprints_inventory_intro_dismissed"
          title="Welcome to Inventories!"
          description="Inventories are collections of items—like ingredient lists. Pick one and start building your Blueprint!"
        />

        {/* Hero Section */}
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold">Inventory Library</h1>
          <p className="text-muted-foreground">
            Discover recipe inventories to build your perfect blueprint.
          </p>
        </section>

        {/* Search Bar */}
        <Card className="bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) setSelectedTag(null); // Clear tag filter when typing
              }}
              placeholder="Search inventories by title or tag..."
              className="border-none shadow-none focus-visible:ring-0 bg-transparent"
            />
          </CardContent>
        </Card>

        {/* Tag Filter Chips */}
        {!tagsLoading && popularTags.length > 0 && (
          <TagFilterChips
            tags={popularTags}
            selectedTag={selectedTag}
            onSelectTag={handleTagSelect}
          />
        )}

        {/* Suggested Section (only for logged-in users without active search) */}
        {showSuggestions && (
          <SuggestedInventories
            inventories={suggestedInventories}
            isLoading={suggestedLoading}
            onLike={handleLike}
          />
        )}

        {/* All Inventories Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            {effectiveQuery ? `Results for "${effectiveQuery}"` : 'All Inventories'}
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
          ) : mainInventories.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mainInventories.map((inventory) => (
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
                <h3 className="text-lg font-semibold">No inventories found</h3>
                <p className="text-sm text-muted-foreground">
                  {effectiveQuery
                    ? 'Try a different search or clear filters.'
                    : 'Be the first to create an inventory!'}
                </p>
                {!effectiveQuery && (
                  <Link to="/inventory/create">
                    <Button>Create Inventory</Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}

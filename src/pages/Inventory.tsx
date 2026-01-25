import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useInventorySearch, useToggleInventoryLike } from '@/hooks/useInventories';
import { useToast } from '@/hooks/use-toast';
import { Heart, Search, Plus } from 'lucide-react';

export default function Inventory() {
  const [query, setQuery] = useState('');
  const { data: inventories, isLoading } = useInventorySearch(query);
  const toggleLike = useToggleInventoryLike();
  const { toast } = useToast();

  const handleLike = async (inventoryId: string, liked: boolean) => {
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        actions={(
          <Link to="/inventory/create">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Inventory
            </Button>
          </Link>
        )}
      />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold">Inventory Library</h1>
          <p className="text-muted-foreground">
            Search by tag or title to start a blueprint.
          </p>
        </section>

        <Card>
          <CardContent className="p-4 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by tag or title"
              className="border-none shadow-none focus-visible:ring-0"
            />
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index}>
                <CardHeader>
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : inventories && inventories.length > 0 ? (
          <div className="space-y-4">
            {inventories.map((inventory) => (
              <Card key={inventory.id}>
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle>{inventory.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {inventory.prompt_inventory}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={inventory.user_liked ? 'text-red-500' : 'text-muted-foreground'}
                      onClick={() => handleLike(inventory.id, inventory.user_liked)}
                    >
                      <Heart className={`h-4 w-4 ${inventory.user_liked ? 'fill-current' : ''}`} />
                      <span className="ml-1 text-xs">{inventory.likes_count}</span>
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {inventory.tags.map((tag) => (
                      <Badge key={tag.id} variant="outline">#{tag.slug}</Badge>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Link to={`/inventory/${inventory.id}/build`}>
                    <Button>Open Inventory</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <h3 className="text-lg font-semibold">No inventories yet</h3>
              <p className="text-sm text-muted-foreground">
                Create the first inventory or refine your search.
              </p>
              <Link to="/inventory/create">
                <Button>Create Inventory</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

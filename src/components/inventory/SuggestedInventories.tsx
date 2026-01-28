import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { InventoryCard } from './InventoryCard';
import type { InventoryListItem } from '@/hooks/useInventories';

interface SuggestedInventoriesProps {
  inventories: InventoryListItem[];
  isLoading: boolean;
  onLike: (inventoryId: string, liked: boolean) => void;
}

export function SuggestedInventories({ inventories, isLoading, onLike }: SuggestedInventoriesProps) {
  if (isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Suggested for You</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
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
      </section>
    );
  }

  if (inventories.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Suggested for You</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {inventories.slice(0, 3).map((inventory) => (
          <InventoryCard key={inventory.id} inventory={inventory} onLike={onLike} />
        ))}
      </div>
    </section>
  );
}

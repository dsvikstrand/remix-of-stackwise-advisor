import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { BlueprintCard } from './BlueprintCard';
import type { BlueprintListItem } from '@/hooks/useBlueprintSearch';

interface SuggestedBlueprintsProps {
  blueprints: BlueprintListItem[];
  isLoading: boolean;
  onLike: (blueprintId: string, liked: boolean) => void;
}

export function SuggestedBlueprints({ blueprints, isLoading, onLike }: SuggestedBlueprintsProps) {
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

  if (blueprints.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Suggested for You</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {blueprints.slice(0, 3).map((blueprint) => (
          <BlueprintCard key={blueprint.id} blueprint={blueprint} onLike={onLike} />
        ))}
      </div>
    </section>
  );
}

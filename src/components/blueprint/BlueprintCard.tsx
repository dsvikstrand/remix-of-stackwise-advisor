import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Heart, Layers } from 'lucide-react';
import type { BlueprintListItem } from '@/hooks/useBlueprintSearch';
import type { Json } from '@/integrations/supabase/types';

interface BlueprintCardProps {
  blueprint: BlueprintListItem;
  onLike: (blueprintId: string, liked: boolean) => void;
}

function countSelectedItems(selected: Json) {
  if (!selected || typeof selected !== 'object' || Array.isArray(selected)) return 0;
  return Object.values(selected as Record<string, string[]>).reduce(
    (sum, items) => sum + (Array.isArray(items) ? items.length : 0),
    0
  );
}

export function BlueprintCard({ blueprint, onLike }: BlueprintCardProps) {
  const displayTags = blueprint.tags.slice(0, 3);
  const extraTagCount = blueprint.tags.length - 3;
  const itemCount = countSelectedItems(blueprint.selected_items);

  return (
    <Link to={`/blueprint/${blueprint.id}`} className="block group">
      <Card className="h-full transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 group-focus-visible:ring-2 group-focus-visible:ring-primary">
        <CardContent className="p-5 flex flex-col h-full">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-semibold text-lg line-clamp-1">{blueprint.title}</h3>
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-grow">
            {blueprint.inventory_title ? `From ${blueprint.inventory_title}` : 'Community blueprint'}
          </p>

          {blueprint.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {displayTags.map((tag) => (
                <Badge key={tag.id} variant="secondary" className="text-xs">
                  #{tag.slug}
                </Badge>
              ))}
              {extraTagCount > 0 && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  +{extraTagCount} more
                </Badge>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1" title="Items in this blueprint">
                <Layers className="h-3.5 w-3.5" />
                <span>{itemCount}</span>
              </span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-2 ${blueprint.user_liked ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onLike(blueprint.id, blueprint.user_liked);
              }}
              aria-label={blueprint.user_liked ? 'Unlike blueprint' : 'Like blueprint'}
            >
              <Heart className={`h-4 w-4 ${blueprint.user_liked ? 'fill-current' : ''}`} />
              <span className="ml-1 text-xs">{blueprint.likes_count}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart, FileStack } from 'lucide-react';
import type { InventoryListItem } from '@/hooks/useInventories';

interface InventoryCardProps {
  inventory: InventoryListItem;
  onLike: (inventoryId: string, liked: boolean) => void;
  linkSearch?: string;
}

export function InventoryCard({ inventory, onLike, linkSearch }: InventoryCardProps) {
  const displayTags = inventory.tags.slice(0, 3);
  const extraTagCount = inventory.tags.length - 3;

  return (
    <Link to={`/inventory/${inventory.id}/build${linkSearch || ''}`} className="block group">
      <Card className="h-full bg-card/60 backdrop-blur-sm border-border/50 transition-all duration-300 hover:border-border/80 hover:shadow-md hover:shadow-black/5 group-focus-visible:ring-2 group-focus-visible:ring-primary">
        <CardContent className="p-5 flex flex-col h-full">
          {/* Title */}
          <h3 className="font-semibold text-lg line-clamp-1 mb-1">{inventory.title}</h3>
          
          {/* Description */}
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-grow">
            {inventory.prompt_inventory}
          </p>

          {/* Tags */}
          {inventory.tags.length > 0 && (
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

          {/* Stats Row */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {/* Blueprint Count */}
              <span className="flex items-center gap-1" title="Blueprints using this library">
                <FileStack className="h-3.5 w-3.5" />
                <span>{inventory.blueprint_count}</span>
              </span>
            </div>

            {/* Like Button */}
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-2 ${inventory.user_liked ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onLike(inventory.id, inventory.user_liked);
              }}
              aria-label={inventory.user_liked ? 'Unlike library' : 'Like library'}
            >
              <Heart className={`h-4 w-4 ${inventory.user_liked ? 'fill-current' : ''}`} />
              <span className="ml-1 text-xs">{inventory.likes_count}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

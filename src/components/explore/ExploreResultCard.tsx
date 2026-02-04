import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, Layers, FileText } from 'lucide-react';
import { UserMiniCard } from './UserMiniCard';
import type { BlueprintResult, InventoryResult, UserResult, ExploreResult } from '@/hooks/useExploreSearch';

interface ExploreResultCardProps {
  result: ExploreResult;
  onTagClick?: (tag: string) => void;
}

function BlueprintCard({ result, onTagClick }: { result: BlueprintResult; onTagClick?: (tag: string) => void }) {
  const itemCount = Array.isArray(result.selectedItems) ? result.selectedItems.length : 0;

  return (
    <Link to={`/blueprint/${result.id}`}>
      <Card className="p-4 hover:shadow-soft-md transition-all h-full">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-medium text-sm line-clamp-2">{result.title}</h3>
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
        
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {itemCount} items
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" />
            {result.likesCount}
          </span>
        </div>

        {result.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.tags.slice(0, 3).map(tag => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-secondary/80"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTagClick?.(`#${tag}`);
                }}
              >
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}

function InventoryCard({ result, onTagClick }: { result: InventoryResult; onTagClick?: (tag: string) => void }) {
  return (
    <Link to={`/inventory/${result.id}`}>
      <Card className="p-4 hover:shadow-soft-md transition-all h-full">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-medium text-sm line-clamp-2">{result.title}</h3>
          <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {result.promptCategories}
        </p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" />
            {result.likesCount}
          </span>
        </div>

        {result.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.tags.slice(0, 3).map(tag => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-secondary/80"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTagClick?.(`#${tag}`);
                }}
              >
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}

function UserCard({ result }: { result: UserResult }) {
  return (
    <UserMiniCard
      userId={result.userId}
      displayName={result.displayName}
      avatarUrl={result.avatarUrl}
      followerCount={result.followerCount}
    />
  );
}

export function ExploreResultCard({ result, onTagClick }: ExploreResultCardProps) {
  switch (result.type) {
    case 'blueprint':
      return <BlueprintCard result={result} onTagClick={onTagClick} />;
    case 'inventory':
      return <InventoryCard result={result} onTagClick={onTagClick} />;
    case 'user':
      return <UserCard result={result} />;
    default:
      return null;
  }
}

import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Heart, Layers, FileText } from 'lucide-react';
import { UserMiniCard } from './UserMiniCard';
import type { BlueprintResult, InventoryResult, UserResult, ExploreResult } from '@/hooks/useExploreSearch';
import { buildFeedSummary } from '@/lib/feedPreview';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';

interface ExploreResultCardProps {
  result: ExploreResult;
  onTagClick?: (tag: string) => void;
  followedTagSlugs?: Set<string>;
}

function BlueprintCard({
  result,
  onTagClick,
  followedTagSlugs,
}: {
  result: BlueprintResult;
  onTagClick?: (tag: string) => void;
  followedTagSlugs?: Set<string>;
}) {
  const itemCount = Array.isArray(result.selectedItems) ? result.selectedItems.length : 0;
  const summary = buildFeedSummary({
    primary: result.llmReview,
    secondary: result.mixNotes,
    fallback: 'Open to view the full step-by-step guide.',
    maxChars: 190,
  });

  return (
    <Link to={`/blueprint/${result.id}`}>
      <Card className="p-3 border-border/50 bg-card/40 rounded-md hover:bg-muted/10 transition-colors h-full">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground mb-1">b/channels</p>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-base leading-tight line-clamp-2">{result.title}</h3>
          <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
          {summary}
        </p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
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
          <OneRowTagChips
            className="flex flex-nowrap gap-1 overflow-hidden"
            items={result.tags.map((tag) => ({
              key: tag,
              label: `#${tag}`,
              variant: 'secondary',
              className: `text-xs cursor-pointer transition-colors border ${
                followedTagSlugs?.has(tag)
                  ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/20'
                  : 'bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/60'
              }`,
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                onTagClick?.(`#${tag}`);
              },
            }))}
          />
        )}
      </Card>
    </Link>
  );
}

function InventoryCard({
  result,
  onTagClick,
  followedTagSlugs,
}: {
  result: InventoryResult;
  onTagClick?: (tag: string) => void;
  followedTagSlugs?: Set<string>;
}) {
  const summary = buildFeedSummary({
    primary: result.promptCategories,
    fallback: 'Open to view the full step-by-step guide.',
    maxChars: 190,
  });

  return (
    <Link to={`/inventory/${result.id}`}>
      <Card className="p-3 border-border/50 bg-card/40 rounded-md hover:bg-muted/10 transition-colors h-full">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground mb-1">b/channels</p>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-base leading-tight line-clamp-2">{result.title}</h3>
          <Layers className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>

        <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
          {summary}
        </p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" />
            {result.likesCount}
          </span>
        </div>

        {result.tags.length > 0 && (
          <OneRowTagChips
            className="flex flex-nowrap gap-1 overflow-hidden"
            items={result.tags.map((tag) => ({
              key: tag,
              label: `#${tag}`,
              variant: 'secondary',
              className: `text-xs cursor-pointer transition-colors border ${
                followedTagSlugs?.has(tag)
                  ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/20'
                  : 'bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/60'
              }`,
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                onTagClick?.(`#${tag}`);
              },
            }))}
          />
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

export function ExploreResultCard({ result, onTagClick, followedTagSlugs }: ExploreResultCardProps) {
  switch (result.type) {
    case 'blueprint':
      return <BlueprintCard result={result} onTagClick={onTagClick} followedTagSlugs={followedTagSlugs} />;
    case 'inventory':
      return <InventoryCard result={result} onTagClick={onTagClick} followedTagSlugs={followedTagSlugs} />;
    case 'user':
      return <UserCard result={result} />;
    default:
      return null;
  }
}

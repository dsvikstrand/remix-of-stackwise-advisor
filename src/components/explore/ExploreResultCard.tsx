import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Heart, Layers, MessageCircle, Share2 } from 'lucide-react';
import { UserMiniCard } from './UserMiniCard';
import type { BlueprintResult, InventoryResult, UserResult, ExploreResult } from '@/hooks/useExploreSearch';
import { buildFeedSummary } from '@/lib/feedPreview';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { formatRelativeShort } from '@/lib/timeFormat';
import { Button } from '@/components/ui/button';

interface ExploreResultCardProps {
  result: ExploreResult;
  onTagClick?: (tag: string) => void;
  followedTagSlugs?: Set<string>;
  commentCountByBlueprintId?: Record<string, number>;
}

function BlueprintCard({
  result,
  onTagClick,
  followedTagSlugs,
  commentCountByBlueprintId,
}: {
  result: BlueprintResult;
  onTagClick?: (tag: string) => void;
  followedTagSlugs?: Set<string>;
  commentCountByBlueprintId?: Record<string, number>;
}) {
  const summary = buildFeedSummary({
    primary: result.llmReview,
    secondary: result.mixNotes,
    fallback: 'Open to view the full step-by-step guide.',
    maxChars: 190,
  });
  const createdLabel = formatRelativeShort(result.createdAt);
  const commentsCount = commentCountByBlueprintId?.[result.id] || 0;

  return (
    <Link to={`/blueprint/${result.id}`}>
      <Card className="p-3 border-border/40 bg-transparent rounded-sm hover:bg-muted/10 transition-colors h-full shadow-none">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[11px] font-semibold tracking-wide text-foreground/75">b/channels</p>
          <span className="text-[11px] text-muted-foreground">{createdLabel}</span>
        </div>
        <h3 className="font-semibold text-base leading-tight line-clamp-2 mb-1">{result.title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
          {summary}
        </p>

        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <span className="inline-flex h-7 items-center gap-1 px-2">
            <Heart className="h-3.5 w-3.5" />
            {result.likesCount}
          </span>
          <span className="inline-flex h-7 items-center gap-1 px-2">
            <MessageCircle className="h-3.5 w-3.5" />
            {commentsCount}
          </span>
          <Button variant="ghost" size="sm" className="h-7 px-2" disabled>
            <Share2 className="h-3.5 w-3.5" />
          </Button>
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
  const createdLabel = formatRelativeShort(result.createdAt);

  return (
    <Link to={`/inventory/${result.id}`}>
      <Card className="p-3 border-border/40 bg-transparent rounded-sm hover:bg-muted/10 transition-colors h-full shadow-none">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[11px] font-semibold tracking-wide text-foreground/75">b/channels</p>
          <span className="text-[11px] text-muted-foreground">{createdLabel}</span>
        </div>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-base leading-tight line-clamp-2">{result.title}</h3>
          <Layers className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>

        <p className="text-xs text-muted-foreground line-clamp-3 mb-2">
          {summary}
        </p>

        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <span className="inline-flex h-7 items-center gap-1 px-2">
            <Heart className="h-3.5 w-3.5" />
            {result.likesCount}
          </span>
          <Button variant="ghost" size="sm" className="h-7 px-2" disabled>
            <Share2 className="h-3.5 w-3.5" />
          </Button>
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

export function ExploreResultCard({ result, onTagClick, followedTagSlugs, commentCountByBlueprintId }: ExploreResultCardProps) {
  switch (result.type) {
    case 'blueprint':
      return (
        <BlueprintCard
          result={result}
          onTagClick={onTagClick}
          followedTagSlugs={followedTagSlugs}
          commentCountByBlueprintId={commentCountByBlueprintId}
        />
      );
    case 'inventory':
      return <InventoryCard result={result} onTagClick={onTagClick} followedTagSlugs={followedTagSlugs} />;
    case 'user':
      return <UserCard result={result} />;
    default:
      return null;
  }
}

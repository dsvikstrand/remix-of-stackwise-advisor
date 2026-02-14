import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Heart, Layers, MessageCircle, Share2 } from 'lucide-react';
import { UserMiniCard } from './UserMiniCard';
import type { BlueprintResult, InventoryResult, UserResult, ExploreResult } from '@/hooks/useExploreSearch';
import { buildFeedSummary } from '@/lib/feedPreview';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { formatRelativeShort } from '@/lib/timeFormat';
import { Button } from '@/components/ui/button';
import { resolveChannelLabelForBlueprint } from '@/lib/channelMapping';
import { getCatalogChannelTagSlugs } from '@/lib/channelPostContext';
import { normalizeTag } from '@/lib/tagging';

interface ExploreResultCardProps {
  result: ExploreResult;
  commentCountByBlueprintId?: Record<string, number>;
}

function BlueprintCard({
  result,
  commentCountByBlueprintId,
}: {
  result: BlueprintResult;
  commentCountByBlueprintId?: Record<string, number>;
}) {
  const summary = buildFeedSummary({
    primary: result.llmReview,
    secondary: result.mixNotes,
    fallback: 'Open to view the full step-by-step guide.',
    maxChars: 190,
  });
  const channelLabel = resolveChannelLabelForBlueprint(result.tags);
  const channelTagSlugs = new Set(getCatalogChannelTagSlugs().map(normalizeTag));
  const displayTags = result.tags.filter((tag) => !channelTagSlugs.has(normalizeTag(tag)));
  const createdLabel = formatRelativeShort(result.createdAt);
  const commentsCount = commentCountByBlueprintId?.[result.id] || 0;
  const hasBanner = !!result.bannerUrl;

  return (
    <Link to={`/blueprint/${result.id}`}>
      <Card className="p-3 border-border/40 bg-transparent rounded-sm hover:bg-muted/10 transition-colors shadow-none">
        <div className="relative">
          {hasBanner && (
            <>
              <img
                src={result.bannerUrl!}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-35"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/35 via-background/60 to-background/80" />
            </>
          )}
          <div className="relative">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[11px] font-semibold tracking-wide text-foreground/75">{channelLabel}</p>
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

            {displayTags.length > 0 && (
              <OneRowTagChips
                className="flex flex-nowrap gap-1 overflow-hidden"
                items={displayTags.map((tag) => ({
                  key: tag,
                  label: tag,
                  variant: 'secondary',
                  className: 'text-xs transition-colors border bg-muted/40 text-muted-foreground border-border/60',
                }))}
              />
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

function InventoryCard({
  result,
}: {
  result: InventoryResult;
}) {
  const summary = buildFeedSummary({
    primary: result.promptCategories,
    fallback: 'Open to view the full step-by-step guide.',
    maxChars: 190,
  });
  const channelLabel = resolveChannelLabelForBlueprint(result.tags);
  const channelTagSlugs = new Set(getCatalogChannelTagSlugs().map(normalizeTag));
  const displayTags = result.tags.filter((tag) => !channelTagSlugs.has(normalizeTag(tag)));
  const createdLabel = formatRelativeShort(result.createdAt);

  return (
    <Link to={`/inventory/${result.id}`}>
      <Card className="p-3 border-border/40 bg-transparent rounded-sm hover:bg-muted/10 transition-colors shadow-none">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[11px] font-semibold tracking-wide text-foreground/75">{channelLabel}</p>
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

        {displayTags.length > 0 && (
          <OneRowTagChips
            className="flex flex-nowrap gap-1 overflow-hidden"
            items={displayTags.map((tag) => ({
              key: tag,
              label: tag,
              variant: 'secondary',
              className: 'text-xs transition-colors border bg-muted/40 text-muted-foreground border-border/60',
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

export function ExploreResultCard({ result, commentCountByBlueprintId }: ExploreResultCardProps) {
  switch (result.type) {
    case 'blueprint':
      return (
        <BlueprintCard
          result={result}
          commentCountByBlueprintId={commentCountByBlueprintId}
        />
      );
    case 'inventory':
      return <InventoryCard result={result} />;
    case 'user':
      return <UserCard result={result} />;
    default:
      return null;
  }
}

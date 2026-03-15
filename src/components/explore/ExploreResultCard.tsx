import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Heart, MessageCircle } from 'lucide-react';
import { UserMiniCard } from './UserMiniCard';
import type { BlueprintResult, UserResult, SourceResult, ExploreResult } from '@/hooks/useExploreSearch';
import { buildFeedSummary } from '@/lib/feedPreview';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { formatRelativeShort } from '@/lib/timeFormat';
import { resolveChannelLabelForBlueprint } from '@/lib/channelMapping';
import { getCatalogChannelTagSlugs } from '@/lib/channelPostContext';
import { normalizeTag } from '@/lib/tagging';
import { buildSourcePagePath } from '@/lib/sourcePagesApi';
import { Badge } from '@/components/ui/badge';
import { resolveEffectiveBanner } from '@/lib/bannerResolver';

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
    sectionsJson: result.sectionsJson,
    primary: result.llmReview,
    secondary: result.mixNotes,
    fallback: 'Open blueprint to view full details.',
    maxChars: 190,
  });
  const channelLabel = resolveChannelLabelForBlueprint(result.tags);
  const channelTagSlugs = new Set(getCatalogChannelTagSlugs().map(normalizeTag));
  const displayTags = result.tags.filter((tag) => !channelTagSlugs.has(normalizeTag(tag)));
  const createdLabel = formatRelativeShort(result.createdAt);
  const commentsCount = commentCountByBlueprintId?.[result.id] || 0;
  const effectiveBannerUrl = resolveEffectiveBanner({
    bannerUrl: result.bannerUrl,
    sourceThumbnailUrl: result.sourceThumbnailUrl,
  });
  const hasBanner = !!effectiveBannerUrl;

  return (
    <Link to={`/blueprint/${result.id}`}>
      <Card className="p-3 border-border/40 bg-transparent rounded-sm hover:bg-muted/10 transition-colors shadow-none">
        <div className="relative">
          {hasBanner && (
            <>
              <img
                src={effectiveBannerUrl || ''}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-25"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/15 via-background/35 to-background/55" />
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
              <span className="inline-flex h-7 items-center gap-1 px-2" aria-label={`${result.likesCount} likes`}>
                <Heart className="h-3.5 w-3.5" />
                {result.likesCount}
                <span>likes</span>
              </span>
              <span className="inline-flex h-7 items-center gap-1 px-2" aria-label={`${commentsCount} comments`}>
                <MessageCircle className="h-3.5 w-3.5" />
                {commentsCount}
                <span>comments</span>
              </span>
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

function getSourceInitials(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return 'SP';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function SourceCard({ result }: { result: SourceResult }) {
  const path = result.path || buildSourcePagePath(result.platform, result.externalId);
  const initials = getSourceInitials(result.title || result.externalId);

  return (
    <Link to={path}>
      <Card className="p-3 border-border/40 bg-transparent rounded-sm hover:bg-muted/10 transition-colors shadow-none">
        <div className="flex items-start gap-3">
          {result.avatarUrl ? (
            <img
              src={result.avatarUrl}
              alt={result.title || result.externalId}
              className="h-10 w-10 rounded-full border border-border/50 object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-10 w-10 rounded-full border border-border/50 bg-muted text-xs font-semibold flex items-center justify-center text-muted-foreground">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                {result.platform}
              </Badge>
            </div>
            <h3 className="font-semibold text-base leading-tight line-clamp-2">{result.title || result.externalId}</h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{result.externalId}</p>
          </div>
        </div>
      </Card>
    </Link>
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
    case 'user':
      return <UserCard result={result} />;
    case 'source':
      return <SourceCard result={result} />;
    default:
      return null;
  }
}

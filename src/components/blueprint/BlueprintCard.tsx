import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, RefreshCw } from 'lucide-react';
import type { BlueprintListItem } from '@/hooks/useBlueprintSearch';
import { cn } from '@/lib/utils';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { getCatalogChannelTagSlugs } from '@/lib/channelPostContext';
import { normalizeTag } from '@/lib/tagging';
import { resolveEffectiveBanner } from '@/lib/bannerResolver';
import { getHotnessView } from '@/lib/hotness';
import { useAuth } from '@/contexts/AuthContext';
import { useBlueprintYoutubeRefreshMutation } from '@/hooks/useBlueprintYoutubeComments';

interface BlueprintCardProps {
  blueprint: BlueprintListItem;
  onLike: (blueprintId: string, liked: boolean) => void;
  onTagClick?: (tagSlug: string) => void;
  commentCount?: number;
  variant?: 'grid_flat' | 'list_row';
  sourceThumbnailUrl?: string | null;
}

export function BlueprintCard({
  blueprint,
  onLike,
  onTagClick,
  commentCount = 0,
  variant = 'grid_flat',
  sourceThumbnailUrl = null,
}: BlueprintCardProps) {
  const { user } = useAuth();
  const canRefresh = Boolean(user?.id && blueprint.creator_user_id === user.id);
  const refreshMutation = useBlueprintYoutubeRefreshMutation(canRefresh ? blueprint.id : undefined);
  const effectiveBannerUrl = resolveEffectiveBanner({
    bannerUrl: blueprint.banner_url,
    sourceThumbnailUrl,
  });
  const hasBanner = !!effectiveBannerUrl;
  const curatedChannelTagSlugs = useMemo(() => new Set(getCatalogChannelTagSlugs().map(normalizeTag)), []);
  const displayTags = useMemo(
    () => blueprint.tags.filter((tag) => !curatedChannelTagSlugs.has(normalizeTag(tag.slug))),
    [blueprint.tags, curatedChannelTagSlugs],
  );
  const hotness = getHotnessView({
    likes: Number(blueprint.likes_count || 0),
    comments: Number(commentCount || 0),
  });

  return (
    <Link
      to={`/blueprint/${blueprint.id}`}
      className="block group"
    >
      <div
        className={cn(
          'bg-transparent',
          'group-focus-visible:ring-2 group-focus-visible:ring-primary',
        )}
      >
        <div
          className={cn(
            'relative flex flex-col',
            variant === 'grid_flat' && hasBanner && '-m-3 p-3',
          )}
        >
          {hasBanner && (
            <>
              <img
                src={effectiveBannerUrl || ''}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-24"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/18 via-background/38 to-background/58" />
            </>
          )}

          <div className="relative flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-base leading-tight line-clamp-2">{blueprint.title}</h3>
            </div>

            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {blueprint.preview_summary}
            </p>

            <div className="flex items-center justify-between gap-2">
              {displayTags.length > 0 ? (
                <div className="min-w-0 flex-1">
                  <OneRowTagChips
                    className="flex flex-nowrap gap-1.5 overflow-hidden min-w-0"
                    items={displayTags.map((tag) => ({
                      key: tag.id,
                      label: tag.slug,
                      variant: 'secondary',
                      className:
                        'text-xs transition-colors border bg-muted/40 text-muted-foreground border-border/60 cursor-pointer hover:bg-muted/60',
                      onClick: (event) => {
                        if (!onTagClick) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onTagClick(tag.slug);
                      },
                    }))}
                  />
                </div>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <span
                  className={`inline-flex h-7 items-center rounded-full border px-2 text-[11px] font-medium tracking-wide ${hotness.badgeClassName}`}
                  aria-label={`Hotness tier ${hotness.tierName}`}
                >
                  {hotness.label}
                </span>
                <div className="flex items-center gap-1.5">
                  {canRefresh ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 w-7 rounded-full border p-0 ${hotness.surfaceClassName} text-foreground/70 hover:text-foreground`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        refreshMutation.mutate();
                      }}
                      disabled={refreshMutation.isPending}
                      aria-label={refreshMutation.isPending ? 'Refreshing YouTube data' : 'Refresh YouTube data'}
                      title={refreshMutation.isPending ? 'Refreshing YouTube data' : 'Refresh YouTube data'}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                      <span className="sr-only">Refresh</span>
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 w-7 rounded-full border p-0 ${hotness.surfaceClassName} ${
                      blueprint.user_liked
                        ? 'text-red-500 hover:text-red-600'
                        : 'text-foreground/80 hover:text-foreground'
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onLike(blueprint.id, blueprint.user_liked);
                    }}
                    aria-label={blueprint.user_liked ? 'Unlike blueprint' : 'Like blueprint'}
                  >
                    <Heart className={`h-3.5 w-3.5 ${blueprint.user_liked ? 'fill-current' : ''}`} />
                    <span className="sr-only">Like</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

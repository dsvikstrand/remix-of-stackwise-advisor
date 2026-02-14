import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, MessageCircle } from 'lucide-react';
import type { BlueprintListItem } from '@/hooks/useBlueprintSearch';
import { cn } from '@/lib/utils';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { buildFeedSummary } from '@/lib/feedPreview';
import { getCatalogChannelTagSlugs } from '@/lib/channelPostContext';
import { normalizeTag } from '@/lib/tagging';

interface BlueprintCardProps {
  blueprint: BlueprintListItem;
  onLike: (blueprintId: string, liked: boolean) => void;
  onTagClick?: (tagSlug: string) => void;
  commentCount?: number;
  variant?: 'grid_flat' | 'list_row';
}

export function BlueprintCard({
  blueprint,
  onLike,
  onTagClick,
  commentCount = 0,
  variant = 'grid_flat',
}: BlueprintCardProps) {
  const hasBanner = !!blueprint.banner_url;
  const curatedChannelTagSlugs = useMemo(() => new Set(getCatalogChannelTagSlugs().map(normalizeTag)), []);
  const displayTags = useMemo(
    () => blueprint.tags.filter((tag) => !curatedChannelTagSlugs.has(normalizeTag(tag.slug))),
    [blueprint.tags, curatedChannelTagSlugs],
  );
  const summary = buildFeedSummary({
    primary: blueprint.mix_notes,
    secondary: blueprint.inventory_title ? `From ${blueprint.inventory_title}` : null,
    fallback: blueprint.inventory_title ? `From ${blueprint.inventory_title}` : 'Community blueprint',
    maxChars: 170,
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
                src={blueprint.banner_url!}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-40"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/45 via-background/70 to-background/90" />
            </>
          )}

          <div className="relative flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-base leading-tight line-clamp-2">{blueprint.title}</h3>
            </div>

            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {summary}
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
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 ${
                    blueprint.user_liked
                      ? 'text-red-500 hover:text-red-600'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onLike(blueprint.id, blueprint.user_liked);
                  }}
                  aria-label={blueprint.user_liked ? 'Unlike blueprint' : 'Like blueprint'}
                >
                  <Heart className={`h-3.5 w-3.5 ${blueprint.user_liked ? 'fill-current' : ''}`} />
                  <span className="ml-1">{blueprint.likes_count}</span>
                </Button>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {commentCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

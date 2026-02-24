import { Link, useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { getChannelIcon } from '@/lib/channelIcons';
import { resolveEffectiveBanner } from '@/lib/bannerResolver';
import { getHotnessView } from '@/lib/hotness';
import { getChannelColorView } from '@/lib/channelColors';

type WallBlueprintCardTag = {
  key: string;
  label: string;
};

type WallBlueprintCardProps = {
  to: string;
  title: string;
  summary: string;
  sourceName?: string | null;
  sourceAvatarUrl?: string | null;
  bannerUrl?: string | null;
  sourceThumbnailUrl?: string | null;
  createdLabel: string;
  channelSlug: string;
  likesCount: number;
  userLiked: boolean;
  commentsCount: number;
  tags: WallBlueprintCardTag[];
  onLike: (event: MouseEvent<HTMLButtonElement>) => void;
};

export function WallBlueprintCard({
  to,
  title,
  summary,
  sourceName,
  sourceAvatarUrl,
  bannerUrl,
  sourceThumbnailUrl,
  createdLabel,
  channelSlug,
  likesCount,
  userLiked,
  commentsCount,
  tags,
  onLike,
}: WallBlueprintCardProps) {
  const navigate = useNavigate();
  const channelLabel = `b/${channelSlug}`;
  const channelConfig = CHANNELS_CATALOG.find((channel) => channel.slug === channelSlug);
  const ChannelIcon = getChannelIcon(channelConfig?.icon || 'sparkles');
  const sourceLabel = sourceName || 'Source';
  const sourceInitials = sourceLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'S';
  const effectiveBannerUrl = resolveEffectiveBanner({
    bannerUrl,
    sourceThumbnailUrl,
  });
  const hotness = getHotnessView({
    likes: likesCount,
    comments: commentsCount,
  });
  const channelColors = getChannelColorView(channelSlug);

  return (
    <div
      className="block cursor-pointer px-3 py-2.5 transition-colors hover:bg-muted/20"
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a')) return;
        navigate(to);
      }}
    >
      <div className="relative overflow-hidden">
        {!!effectiveBannerUrl && (
          <>
            <img
              src={effectiveBannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full scale-105 object-cover opacity-[0.10] blur-sm"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/[0.22] via-background/[0.45] to-background/[0.72]" />
          </>
        )}

        <div className="relative space-y-2">
          {sourceName ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Avatar className="h-4 w-4 shrink-0 border border-border/60">
                  <AvatarImage src={sourceAvatarUrl || undefined} alt={sourceLabel} />
                  <AvatarFallback className="text-[8px]">{sourceInitials}</AvatarFallback>
                </Avatar>
                <p className="text-xs text-muted-foreground line-clamp-1">{sourceName}</p>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">{createdLabel}</span>
            </div>
          ) : (
            <div className="flex items-center justify-end">
              <span className="text-[11px] text-muted-foreground">{createdLabel}</span>
            </div>
          )}

          <h3 className="text-base font-semibold leading-tight">{title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-3">{summary}</p>

          {tags.length > 0 && (
            <OneRowTagChips
              className="flex flex-nowrap gap-1.5 overflow-hidden"
              items={tags.map((tag) => ({
                key: tag.key,
                label: tag.label,
                variant: 'outline',
                className: 'text-xs transition-colors border bg-muted/40 text-muted-foreground border-border/60',
              }))}
            />
          )}

          <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex h-7 items-center rounded-full border px-2 text-[11px] font-medium tracking-wide ${channelColors.badgeClassName}`}
                aria-label={`Hotness tier ${hotness.tierName}`}
              >
                {hotness.label}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 rounded-full border p-0 ${channelColors.surfaceClassName} ${userLiked ? 'text-red-500 hover:text-red-600' : 'text-foreground/80 hover:text-foreground'}`}
                onClick={onLike}
              >
                <Heart className={`h-4 w-4 ${userLiked ? 'fill-current' : ''}`} />
              </Button>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-foreground/75 shrink-0">
              <Link
                to={`/b/${channelSlug}`}
                onClick={(event) => event.stopPropagation()}
                className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2 text-[11px] font-semibold tracking-wide ${channelColors.surfaceClassName} text-foreground/80 hover:text-foreground`}
              >
                <ChannelIcon className="h-3.5 w-3.5" />
                {channelLabel}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

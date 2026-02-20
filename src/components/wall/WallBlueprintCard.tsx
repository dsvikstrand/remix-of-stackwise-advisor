import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { OneRowTagChips } from '@/components/shared/OneRowTagChips';
import { CHANNELS_CATALOG } from '@/lib/channelsCatalog';
import { getChannelIcon } from '@/lib/channelIcons';

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
  createdLabel,
  channelSlug,
  likesCount,
  userLiked,
  commentsCount,
  tags,
  onLike,
}: WallBlueprintCardProps) {
  const channelLabel = `b/${channelSlug}`;
  const channelConfig = CHANNELS_CATALOG.find((channel) => channel.slug === channelSlug);
  const ChannelIcon = getChannelIcon(channelConfig?.icon || 'sparkles');

  return (
    <Link to={to} className="block px-3 py-2.5 transition-colors hover:bg-muted/20">
      <div className="relative overflow-hidden">
        {!!bannerUrl && (
          <>
            <img
              src={bannerUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-35"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/35 via-background/60 to-background/80" />
          </>
        )}

        <div className="relative space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-foreground/75">
              <ChannelIcon className="h-3.5 w-3.5" />
              {channelLabel}
            </p>
            <span className="text-[11px] text-muted-foreground">{createdLabel}</span>
          </div>

          {sourceName ? (
            <div className="flex items-center gap-1.5 min-w-0">
              {sourceAvatarUrl ? (
                <img
                  src={sourceAvatarUrl}
                  alt={sourceName}
                  className="h-4 w-4 rounded-full object-cover border border-border/50 shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="h-4 w-4 rounded-full border border-border/60 bg-muted/50 shrink-0" aria-hidden />
              )}
              <p className="text-xs text-muted-foreground line-clamp-1">{sourceName}</p>
            </div>
          ) : null}

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

          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-2 ${userLiked ? 'text-red-500' : ''}`}
              onClick={onLike}
            >
              <Heart className={`h-4 w-4 mr-1 ${userLiked ? 'fill-current' : ''}`} />
              {likesCount}
            </Button>
            <span className="inline-flex h-7 items-center gap-1 px-2">
              <MessageCircle className="h-4 w-4" />
              {commentsCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled
              onClick={(event) => event.preventDefault()}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}

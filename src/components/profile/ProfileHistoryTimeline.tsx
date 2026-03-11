import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProfileHistoryItem } from '@/lib/profileHistoryApi';
import { formatRelativeShort } from '@/lib/timeFormat';

type ProfileHistoryTimelineProps = {
  items: ProfileHistoryItem[] | undefined;
  isLoading: boolean;
  emptyMessage?: string;
  initialVisibleCount?: number;
  loadMoreStep?: number;
};

export function ProfileHistoryTimeline({
  items,
  isLoading,
  emptyMessage = 'No history yet.',
  initialVisibleCount = 20,
  loadMoreStep = 20,
}: ProfileHistoryTimelineProps) {
  const allItems = items || [];
  const chunkSize = initialVisibleCount > 0 ? initialVisibleCount : null;
  const incrementSize = loadMoreStep > 0 ? loadMoreStep : chunkSize;
  const [visibleCount, setVisibleCount] = useState(chunkSize ?? allItems.length);

  useEffect(() => {
    setVisibleCount(chunkSize ?? allItems.length);
  }, [allItems.length, allItems[0]?.id, chunkSize]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!allItems.length) {
    return (
      <Card className="border-border/40">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  const visibleItems = chunkSize ? allItems.slice(0, visibleCount) : allItems;
  const hasMoreItems = chunkSize ? visibleCount < allItems.length : false;

  return (
    <div className="space-y-4">
      {visibleItems.map((item) => {
        const isBlueprint = item.kind === 'blueprint';
        return (
          <Link key={item.id} to={item.href} className="block">
            <Card className={`border-border/50 transition-colors hover:border-border ${isBlueprint && item.bannerUrl ? 'relative overflow-hidden' : ''}`}>
              {isBlueprint && item.bannerUrl ? (
                <>
                  <img
                    src={item.bannerUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full scale-105 object-cover opacity-[0.10] blur-sm"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-background/[0.22] via-background/[0.45] to-background/[0.72]" />
                </>
              ) : null}
              <CardContent className={`p-4 ${isBlueprint && item.bannerUrl ? 'relative' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    {item.avatarUrl ? (
                      <img
                        src={item.avatarUrl}
                        alt={item.subtitle || item.title}
                        className="h-10 w-10 rounded-full border border-border/40 object-cover shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full border border-border/40 bg-muted shrink-0" />
                    )}
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium leading-tight">{item.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.subtitle}</p>
                      {item.statusText ? (
                        <p className="text-xs text-muted-foreground">{item.statusText}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-[11px] text-muted-foreground">{formatRelativeShort(item.createdAt)}</span>
                    <Badge variant="secondary">{item.badge}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}

      {hasMoreItems ? (
        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVisibleCount((current) => current + (incrementSize ?? 0))}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useTopBlueprints } from '@/hooks/useCommunityStats';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function TopBlueprints() {
  const { data: blueprints, isLoading } = useTopBlueprints(4);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Top Blueprints</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse bg-card/50">
              <CardContent className="p-4 h-28" />
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (!blueprints || blueprints.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Top Blueprints</h2>
        <p className="text-sm text-muted-foreground">No blueprints yet. Be the first to share!</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">Top Blueprints</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {blueprints.map((bp) => (
          <Link key={bp.id} to={`/blueprint/${bp.id}`}>
            <Card className="group h-full bg-card/60 hover:bg-card/80 transition-colors cursor-pointer">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                    {bp.title}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0 text-muted-foreground text-sm">
                    <Heart className="h-3.5 w-3.5" />
                    <span className="tabular-nums">{bp.likes_count}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {bp.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag.slug} variant="secondary" className="text-xs">
                      #{tag.slug}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  by {bp.creator_profile?.display_name || 'Anonymous'} ·{' '}
                  {formatDistanceToNow(new Date(bp.created_at), { addSuffix: true })}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

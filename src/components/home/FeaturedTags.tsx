import { Link } from 'react-router-dom';
import { useFeaturedTags } from '@/hooks/useCommunityStats';
import { Badge } from '@/components/ui/badge';
import { Hash, Users } from 'lucide-react';

export function FeaturedTags() {
  const { data: tags, isLoading } = useFeaturedTags(8);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Trending Topics</h2>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!tags || tags.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Trending Topics</h2>
        <Link to="/tags" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          View all →
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Link key={tag.id} to={`/wall?tag=${tag.slug}`}>
            <Badge
              variant="outline"
              className="gap-1.5 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
            >
              <Hash className="h-3 w-3" />
              {tag.slug}
              {tag.follower_count > 0 && (
                <span className="flex items-center gap-0.5 text-muted-foreground ml-1">
                  <Users className="h-3 w-3" />
                  <span className="text-xs tabular-nums">{tag.follower_count}</span>
                </span>
              )}
            </Badge>
          </Link>
        ))}
      </div>
    </section>
  );
}

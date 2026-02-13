import { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { ExploreResultCard } from '@/components/explore/ExploreResultCard';
import { useExploreSearch, useTrendingTags, type ExploreFilter, type ExploreResult } from '@/hooks/useExploreSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { useTagFollows } from '@/hooks/useTagFollows';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const FILTER_OPTIONS: { value: ExploreFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'blueprints', label: 'Blueprints' },
  { value: 'inventories', label: 'Libraries' },
  { value: 'users', label: 'Users' },
];

export default function Explore() {
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState<ExploreFilter>('all');
  const trendingSectionRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const debouncedQuery = useDebounce(searchInput, 300);
  const { data: results, isLoading } = useExploreSearch({
    query: debouncedQuery,
    filter,
  });
  const { data: trendingTags } = useTrendingTags();
  const { followedSlugs } = useTagFollows();

  const hasQuery = debouncedQuery.trim().length > 0;
  const showNoFollowOnboarding = !!user && followedSlugs.size === 0 && !hasQuery;

  const followedTrendingChannels = useMemo(() => {
    if (!trendingTags || !user || followedSlugs.size === 0) return [];
    return trendingTags.filter((tag) => followedSlugs.has(tag.slug));
  }, [trendingTags, followedSlugs, user]);

  const handleTagClick = (tag: string) => {
    const normalizedTag = tag.replace(/^#/, '');
    setSearchInput(`#${normalizedTag}`);
    setFilter('all');
  };

  const scrollToTrendingChannels = () => {
    trendingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const groupedResults = useMemo(() => {
    if (!results || filter !== 'all') return null;

    const groups: Record<string, ExploreResult[]> = {
      blueprints: [],
      inventories: [],
      users: [],
    };

    results.forEach((r) => {
      if (r.type === 'blueprint') groups.blueprints.push(r);
      else if (r.type === 'inventory') groups.inventories.push(r);
      else if (r.type === 'user') groups.users.push(r);
    });

    return groups;
  }, [results, filter]);

  const visibleBlueprintIds = useMemo(() => {
    if (!results) return [] as string[];
    return results
      .filter((row): row is Extract<ExploreResult, { type: 'blueprint' }> => row.type === 'blueprint')
      .map((row) => row.id);
  }, [results]);

  const { data: commentCountByBlueprintId = {} } = useQuery({
    queryKey: ['explore-blueprint-comment-counts', visibleBlueprintIds],
    enabled: visibleBlueprintIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blueprint_comments')
        .select('blueprint_id')
        .in('blueprint_id', visibleBlueprintIds);

      if (error) throw error;

      return (data || []).reduce<Record<string, number>>((acc, row) => {
        acc[row.blueprint_id] = (acc[row.blueprint_id] || 0) + 1;
        return acc;
      }, {});
    },
  });

  return (
    <div className="min-h-screen bg-gradient-soft">
      <AppHeader />

      <main className="container max-w-4xl mx-auto px-4 py-8">
        <section className="mb-6">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">Explore</p>
          <h1 className="text-2xl font-semibold mt-1">Search blueprints, inventories, and creators</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Start with a keyword, then narrow by type or jump into trending channels below.
          </p>
        </section>

        {!user && (
          <div className="mb-6 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Sign in to personalize</p>
              <p className="text-xs text-muted-foreground">Join channels to shape your feed from the Channels page.</p>
            </div>
            <Link to="/auth">
              <Button size="sm">Sign in</Button>
            </Link>
          </div>
        )}

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search blueprints, inventories, users..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-12 h-12 text-base bg-card/60 backdrop-blur-sm border-border/50"
          />
        </div>

        {hasQuery && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {FILTER_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={filter === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}

        {!hasQuery && (
          <div className="space-y-8">
            <div className="text-center py-8">
              <h2 className="text-2xl font-semibold mb-2">Discover what works</h2>
              <p className="text-muted-foreground">
                Search blueprints, inventories, and creators - or explore trending topics below.
              </p>
            </div>

            {!!user && followedSlugs.size > 0 && (
              <section>
                <p className="text-sm font-medium text-muted-foreground mb-3">Your Channels</p>
                {followedTrendingChannels.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {followedTrendingChannels.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="secondary"
                        className="cursor-pointer transition-colors px-3 py-1 border bg-primary/15 text-primary border-primary/30 hover:bg-primary/20"
                        onClick={() => handleTagClick(`#${tag.slug}`)}
                      >
                        #{tag.slug}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Your channels will appear here as activity updates.</p>
                )}
              </section>
            )}

            {showNoFollowOnboarding && (
              <section className="rounded-xl border border-border/50 bg-card/60 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold">Join channels to shape your feed</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start with a few channels and Explore will adapt to what you care about.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={scrollToTrendingChannels}>
                    Explore Topics
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/channels">Manage Channels</Link>
                  </Button>
                </div>
              </section>
            )}

            {trendingTags && trendingTags.length > 0 && (
              <section ref={trendingSectionRef}>
                <p className="text-sm font-medium text-muted-foreground mb-3">Trending Topics</p>
                <div className="flex flex-wrap gap-2">
                  {trendingTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="secondary"
                      className={`cursor-pointer transition-colors px-3 py-1 border ${
                        followedSlugs.has(tag.slug)
                          ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/20'
                          : 'bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted/60'
                      }`}
                      onClick={() => handleTagClick(`#${tag.slug}`)}
                    >
                      #{tag.slug}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/channels">Join Channels</Link>
                  </Button>
                </div>
              </section>
            )}

            <section>
              <p className="text-sm font-medium text-muted-foreground mb-3">Topic Search</p>
              <div className="flex flex-wrap gap-2">
                {['skincare', 'nutrition', 'fitness', 'wellness', 'sleep'].map((cat) => (
                  <Button
                    key={cat}
                    variant="outline"
                    size="sm"
                    onClick={() => handleTagClick(cat)}
                    className="capitalize"
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </section>
          </div>
        )}

        {hasQuery && isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        )}

        {hasQuery && !isLoading && groupedResults && (
          <div className="space-y-8">
            {groupedResults.blueprints.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">Blueprints</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groupedResults.blueprints.map((r) => (
                    <ExploreResultCard
                      key={r.type === 'blueprint' ? r.id : ''}
                      result={r}
                      onTagClick={handleTagClick}
                      followedTagSlugs={followedSlugs}
                      commentCountByBlueprintId={commentCountByBlueprintId}
                    />
                  ))}
                </div>
              </section>
            )}

            {groupedResults.inventories.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">Libraries</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groupedResults.inventories.map((r) => (
                    <ExploreResultCard
                      key={r.type === 'inventory' ? r.id : ''}
                      result={r}
                      onTagClick={handleTagClick}
                      followedTagSlugs={followedSlugs}
                      commentCountByBlueprintId={commentCountByBlueprintId}
                    />
                  ))}
                </div>
              </section>
            )}

            {groupedResults.users.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">Users</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groupedResults.users.map((r) => (
                    <ExploreResultCard key={r.type === 'user' ? r.userId : ''} result={r} />
                  ))}
                </div>
              </section>
            )}

            {results?.length === 0 && (
              <div className="text-center text-muted-foreground py-8 space-y-3">
                <p>No results found for "{debouncedQuery}"</p>
                <Button variant="outline" size="sm" onClick={() => setSearchInput('')}>
                  Clear search
                </Button>
              </div>
            )}
          </div>
        )}

        {hasQuery && !isLoading && !groupedResults && results && (
          <div>
            {results.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((r) => (
                  <ExploreResultCard
                    key={r.type === 'user' ? r.userId : r.id}
                    result={r}
                    onTagClick={handleTagClick}
                    followedTagSlugs={followedSlugs}
                    commentCountByBlueprintId={commentCountByBlueprintId}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8 space-y-3">
                <p>No results found for "{debouncedQuery}"</p>
                <Button variant="outline" size="sm" onClick={() => setSearchInput('')}>
                  Clear search
                </Button>
              </div>
            )}
          </div>
        )}
        <AppFooter />
      </main>
    </div>
  );
}

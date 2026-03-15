import { useEffect, useState, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
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
import { PageDivider, PageMain, PageRoot, PageSection } from '@/components/layout/Page';

const FILTER_OPTIONS: { value: ExploreFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'blueprints', label: 'Blueprints' },
  { value: 'sources', label: 'Creators' },
  { value: 'users', label: 'Users' },
];

const EXPLORE_TAG_BADGE_CLASS =
  'cursor-pointer border border-border/60 bg-muted/40 px-3 py-1 text-muted-foreground transition-colors hover:bg-muted/60';

export default function Explore() {
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState<ExploreFilter>('all');
  const trendingSectionRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const hasPrefilledRef = useRef(false);
  const qParam = (searchParams.get('q') || '').trim();

  useEffect(() => {
    if (hasPrefilledRef.current) return;
    if (!qParam) return;
    hasPrefilledRef.current = true;
    setSearchInput(qParam);
    setFilter('all');
  }, [qParam]);

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
      sources: [],
      users: [],
    };

    results.forEach((r) => {
      if (r.type === 'blueprint') groups.blueprints.push(r);
      else if (r.type === 'source') groups.sources.push(r);
      else if (r.type === 'user') groups.users.push(r);
    });

    return groups;
  }, [results, filter]);

  return (
    <PageRoot>
      <AppHeader />

      <PageMain>
        <PageSection className="mb-6">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">Explore</p>
          <h1 className="text-2xl font-semibold mt-1">Search blueprints, creators, and users</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Start with a keyword, then narrow by type or jump into trending channels and creators.
          </p>
        </PageSection>

        {!user && (
          <div className="mb-6 border border-border/40 px-3 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search blueprints, creators, users..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10 h-11 text-base border-border/50"
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
                Search blueprints, creators, and users, or explore trending channels below.
              </p>
            </div>

            {!!user && followedSlugs.size > 0 && (
              <section>
                <p className="text-sm font-medium text-muted-foreground mb-3">Joined Channels</p>
                {followedTrendingChannels.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {followedTrendingChannels.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="secondary"
                        className={EXPLORE_TAG_BADGE_CLASS}
                        onClick={() => handleTagClick(`#${tag.slug}`)}
                      >
                        #{tag.slug}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Joined channels will appear here as activity updates.</p>
                )}
              </section>
            )}

            {showNoFollowOnboarding && (
              <section className="border border-border/40 px-3 py-3 space-y-3">
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
                      className={EXPLORE_TAG_BADGE_CLASS}
                      onClick={() => handleTagClick(`#${tag.slug}`)}
                    >
                      #{tag.slug}
                    </Badge>
                    ))}
                </div>
              </section>
            )}

            <PageDivider />

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
                    <ExploreResultCard key={r.type === 'blueprint' ? r.id : ''} result={r} />
                  ))}
                </div>
              </section>
            )}

            {groupedResults.sources.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">Creators</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groupedResults.sources.map((r) => (
                    <ExploreResultCard key={r.type === 'source' ? r.id : ''} result={r} />
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
                  <ExploreResultCard key={r.type === 'user' ? r.userId : r.id} result={r} />
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
      </PageMain>
    </PageRoot>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useMyFeed } from '@/hooks/useMyFeed';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { config } from '@/config/runtime';
import { MyFeedTimeline } from '@/components/feed/MyFeedTimeline';

export default function MyFeed() {
  const { user } = useAuth();
  const { data: items, isLoading } = useMyFeed();
  const autoChannelPipelineEnabled = config.features.autoChannelPipelineV1;

  const pendingCount = useMemo(
    () => (items || []).filter((item) => item.state === 'candidate_pending_manual_review').length,
    [items],
  );

  const pendingAcceptCount = useMemo(
    () => (items || []).filter((item) => item.state === 'my_feed_pending_accept').length,
    [items],
  );

  return (
    <PageRoot>
      <AppHeader />
      <PageMain className="space-y-6">
        <PageSection>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary uppercase tracking-wide">My Feed</p>
              <h1 className="text-2xl font-semibold mt-1">Your personal content lane</h1>
              <p className="text-sm text-muted-foreground mt-2">
                {autoChannelPipelineEnabled
                  ? 'New items appear here first. Channel publishing runs automatically in the background.'
                  : 'New items appear here first. You can post selected blueprints to channels after review.'}
              </p>
              {pendingCount > 0 && <p className="text-xs text-amber-600">{pendingCount} item(s) need manual review.</p>}
              {pendingAcceptCount > 0 && <p className="text-xs text-sky-600">{pendingAcceptCount} pending item(s) waiting for Accept.</p>}
            </div>

            {user ? (
              <div className="flex items-center gap-2">
                <Button asChild size="sm" className="h-8 px-2">
                  <Link to="/subscriptions?add=1">Add Subscription</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="h-8 px-2">
                  <Link to="/subscriptions">Manage subscriptions</Link>
                </Button>
              </div>
            ) : null}
          </div>
        </PageSection>

        {!user ? (
          <Card className="border-border/40">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Sign in to access your personal feed.</p>
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <MyFeedTimeline
            items={items}
            isLoading={isLoading}
            isOwnerView={true}
            showUnlockActivityPanel={false}
            emptyMessage="No pulled content yet. Start with a YouTube URL."
            emptyActionHref="/youtube"
            emptyActionLabel="Pull from YouTube"
          />
        )}
        <AppFooter />
      </PageMain>
    </PageRoot>
  );
}

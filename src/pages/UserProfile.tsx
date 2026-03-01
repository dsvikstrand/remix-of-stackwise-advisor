import { useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { FollowersList } from '@/components/profile/FollowersList';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useGenerationTierAccess } from '@/hooks/useGenerationTierAccess';
import { useToast } from '@/hooks/use-toast';
import {
  ApiRequestError,
  generateSubscriptionRefreshBlueprints,
  scanSubscriptionRefreshCandidates,
} from '@/lib/subscriptionsApi';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/config/runtime';
import { Lock } from 'lucide-react';

export default function UserProfile() {
  const { userId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: profile, isLoading, error } = useUserProfile(userId);
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);

  // If viewing /u without a userId, redirect to auth
  if (!userId) {
    return <Navigate to="/auth" replace />;
  }

  const isOwnProfile = user?.id === userId;
  const canViewProfile = profile?.is_public || isOwnProfile;
  const generationTierAccessQuery = useGenerationTierAccess(Boolean(user && isOwnProfile));
  const hasTierAccess = Boolean(generationTierAccessQuery.data?.allowedTiers.includes('tier'));
  const generationTierLoading = generationTierAccessQuery.isLoading && !generationTierAccessQuery.data;
  const generationTierLabel = generationTierLoading ? 'Loading' : hasTierAccess ? 'Tier + Free' : 'Free only';
  const generationTierBadgeLabel = generationTierLoading ? '...' : hasTierAccess ? 'Tier' : 'Free';
  const generationTierBadgeVariant = generationTierLoading ? 'outline' : hasTierAccess ? 'default' : 'secondary';
  const subscriptionsEnabled = Boolean(config.agenticBackendUrl);
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const scanned = await scanSubscriptionRefreshCandidates();
      const allCandidates = scanned.candidates || [];
      if (allCandidates.length === 0) {
        return { queuedCount: 0, scannedCount: 0 };
      }
      const maxItems = 20;
      const items = allCandidates.slice(0, maxItems);
      const queued = await generateSubscriptionRefreshBlueprints({ items });
      return {
        queuedCount: queued.queued_count,
        scannedCount: allCandidates.length,
      };
    },
    onSuccess: ({ queuedCount, scannedCount }) => {
      if (queuedCount > 0) {
        toast({
          title: 'Refresh started',
          description: scannedCount > queuedCount
            ? `Queued ${queuedCount} videos (first batch).`
            : `Queued ${queuedCount} videos for background generation.`,
        });
        return;
      }
      toast({
        title: 'No new videos found',
        description: 'Your subscriptions are already up to date.',
      });
    },
    onError: (error) => {
      const fallback = error instanceof Error ? error.message : 'Could not refresh subscriptions.';
      if (error instanceof ApiRequestError && error.errorCode === 'JOB_ALREADY_RUNNING') {
        toast({
          title: 'Refresh already running',
          description: 'A background refresh is already in progress.',
        });
        return;
      }
      toast({
        title: 'Refresh failed',
        description: fallback,
        variant: 'destructive',
      });
    },
  });

  const handleRefresh = () => {
    if (!isOwnProfile || !subscriptionsEnabled || refreshMutation.isPending) return;
    refreshMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-8 pb-24 space-y-8">
        {isLoading ? (
          <>
            <div className="flex items-center gap-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="space-y-3 flex-1">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          </>
        ) : error ? (
          <div className="border border-border/40 px-3 py-10 text-center">
            <p className="text-muted-foreground">Failed to load profile. Please try again.</p>
          </div>
        ) : !profile ? (
          <div className="border border-border/40 px-3 py-10 text-center">
            <p className="text-muted-foreground">Profile not found.</p>
          </div>
        ) : !canViewProfile ? (
          <div className="border border-border/40 px-3 py-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Lock className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">This profile is private</h2>
                <p className="text-muted-foreground mt-1">
                  This user has chosen to keep their profile private.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <ProfileHeader
              profile={profile}
              onFollowersClick={() => setFollowersOpen(true)}
              onFollowingClick={() => setFollowingOpen(true)}
              onRefreshClick={subscriptionsEnabled ? handleRefresh : undefined}
              refreshPending={refreshMutation.isPending}
            />

            {isOwnProfile && (
              <Card className="border-border/50">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Generation Tier</p>
                      <p className="text-xs text-muted-foreground">
                        {generationTierLabel}
                        {generationTierAccessQuery.data?.testModeEnabled ? ' (test mode)' : ''}
                      </p>
                    </div>
                    <Badge variant={generationTierBadgeVariant} className="uppercase tracking-wide">
                      {generationTierBadgeLabel}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {!profile.is_public && isOwnProfile && (
              <Card className="border-dashed">
                <CardContent className="py-4 text-center text-sm text-muted-foreground">
                  Your profile is currently <strong>private</strong>. Only you can see this page.{' '}
                  <Link to="/settings" className="text-primary hover:underline">
                    Make it public
                  </Link>{' '}
                  to let others discover you.
                </CardContent>
              </Card>
            )}

            <ProfileTabs userId={userId} isOwnerView={isOwnProfile} profileIsPublic={!!profile.is_public} />

            <FollowersList
              userId={userId}
              type="followers"
              open={followersOpen}
              onOpenChange={setFollowersOpen}
            />
            <FollowersList
              userId={userId}
              type="following"
              open={followingOpen}
              onOpenChange={setFollowingOpen}
            />
          </>
        )}
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, Navigate, Link, useSearchParams } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { FollowersList } from '@/components/profile/FollowersList';
import { RefreshSubscriptionsDialog } from '@/components/subscriptions/RefreshSubscriptionsDialog';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/config/runtime';
import { Lock } from 'lucide-react';

export default function UserProfile() {
  const { userId } = useParams();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: profile, isLoading, error } = useUserProfile(userId);
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);
  const [isRefreshDialogOpen, setIsRefreshDialogOpen] = useState(false);

  // If viewing /u without a userId, redirect to auth
  if (!userId) {
    return <Navigate to="/auth" replace />;
  }

  const isOwnProfile = user?.id === userId;
  const canViewProfile = profile?.is_public || isOwnProfile;
  const subscriptionsEnabled = Boolean(config.agenticBackendUrl);

  useEffect(() => {
    if (searchParams.get('refresh') !== '1') return;
    const next = new URLSearchParams(searchParams);
    next.delete('refresh');
    setSearchParams(next, { replace: true });
    if (isOwnProfile) {
      setIsRefreshDialogOpen(true);
    }
  }, [isOwnProfile, searchParams, setSearchParams]);

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
            />

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
            <RefreshSubscriptionsDialog
              open={isRefreshDialogOpen}
              onOpenChange={setIsRefreshDialogOpen}
              subscriptionsEnabled={subscriptionsEnabled}
              userId={user?.id}
            />
          </>
        )}
      </main>
    </div>
  );
}

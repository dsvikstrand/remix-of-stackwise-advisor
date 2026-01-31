import { useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { FollowersList } from '@/components/profile/FollowersList';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuth } from '@/contexts/AuthContext';
import { Lock } from 'lucide-react';

export default function UserProfile() {
  const { userId } = useParams();
  const { user } = useAuth();
  const { data: profile, isLoading, error } = useUserProfile(userId);
  const [followersOpen, setFollowersOpen] = useState(false);
  const [followingOpen, setFollowingOpen] = useState(false);

  // If viewing /u without a userId, redirect to auth
  if (!userId) {
    return <Navigate to="/auth" replace />;
  }

  const isOwnProfile = user?.id === userId;
  const canViewProfile = profile?.is_public || isOwnProfile;

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <AppHeader />

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
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
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Failed to load profile. Please try again.</p>
            </CardContent>
          </Card>
        ) : !profile ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Profile not found.</p>
            </CardContent>
          </Card>
        ) : !canViewProfile ? (
          <Card>
            <CardContent className="py-16 text-center">
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
            </CardContent>
          </Card>
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
                  <a href="/settings" className="text-primary hover:underline">
                    Make it public
                  </a>{' '}
                  to let others discover you.
                </CardContent>
              </Card>
            )}

            <ProfileTabs userId={userId} />

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

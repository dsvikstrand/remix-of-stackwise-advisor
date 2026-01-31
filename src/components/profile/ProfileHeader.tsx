import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FollowButton } from './FollowButton';
import { useAuth } from '@/contexts/AuthContext';
import { Settings, Calendar } from 'lucide-react';
import type { PublicProfile } from '@/hooks/useUserProfile';

interface ProfileHeaderProps {
  profile: PublicProfile;
  onFollowersClick?: () => void;
  onFollowingClick?: () => void;
}

export function ProfileHeader({ profile, onFollowersClick, onFollowingClick }: ProfileHeaderProps) {
  const { user } = useAuth();
  const isOwnProfile = user?.id === profile.user_id;

  const displayName = profile.display_name || 'Anonymous';
  const initials = displayName.slice(0, 2).toUpperCase();
  const joinDate = format(new Date(profile.created_at), 'MMMM yyyy');

  return (
    <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
      <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
        <AvatarImage src={profile.avatar_url || undefined} alt={displayName} />
        <AvatarFallback className="bg-primary/10 text-primary text-2xl">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{displayName}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <Calendar className="h-4 w-4" />
              <span>Joined {joinDate}</span>
            </div>
          </div>

          <div className="flex gap-2">
            {isOwnProfile ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings">
                  <Settings className="h-4 w-4 mr-1" />
                  Edit Profile
                </Link>
              </Button>
            ) : (
              <FollowButton targetUserId={profile.user_id} />
            )}
          </div>
        </div>

        {profile.bio && (
          <p className="text-muted-foreground max-w-lg">{profile.bio}</p>
        )}

        <div className="flex gap-4 text-sm">
          <button
            onClick={onFollowersClick}
            className="hover:underline focus:outline-none"
          >
            <span className="font-semibold">{profile.follower_count}</span>{' '}
            <span className="text-muted-foreground">Followers</span>
          </button>
          <button
            onClick={onFollowingClick}
            className="hover:underline focus:outline-none"
          >
            <span className="font-semibold">{profile.following_count}</span>{' '}
            <span className="text-muted-foreground">Following</span>
          </button>
        </div>
      </div>
    </div>
  );
}

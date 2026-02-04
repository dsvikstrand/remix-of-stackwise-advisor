import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useIsFollowing, useFollowUser, useUnfollowUser } from '@/hooks/useUserFollows';
import { User } from 'lucide-react';

interface UserMiniCardProps {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number;
}

export function UserMiniCard({ userId, displayName, avatarUrl, followerCount }: UserMiniCardProps) {
  const { user } = useAuth();
  const { data: isFollowing, isLoading: isCheckingFollow } = useIsFollowing(userId);
  const followMutation = useFollowUser();
  const unfollowMutation = useUnfollowUser();

  const isOwnProfile = user?.id === userId;
  const isPending = followMutation.isPending || unfollowMutation.isPending;

  const handleFollowClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!user) return;
    
    if (isFollowing) {
      unfollowMutation.mutate(userId);
    } else {
      followMutation.mutate(userId);
    }
  };

  return (
    <Card className="p-3 hover:shadow-soft-md transition-all">
      <Link to={`/u/${userId}`} className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={avatarUrl || undefined} alt={displayName || 'User'} />
          <AvatarFallback className="bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {displayName || 'Anonymous'}
          </p>
          <p className="text-xs text-muted-foreground">
            {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
          </p>
        </div>

        {user && !isOwnProfile && (
          <Button
            variant={isFollowing ? 'outline' : 'default'}
            size="sm"
            onClick={handleFollowClick}
            disabled={isPending || isCheckingFollow}
            className="shrink-0"
          >
            {isFollowing ? 'Unfollow' : 'Follow'}
          </Button>
        )}
      </Link>
    </Card>
  );
}

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useIsFollowing, useFollowUser, useUnfollowUser } from '@/hooks/useUserFollows';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, UserCheck } from 'lucide-react';

interface FollowButtonProps {
  targetUserId: string;
}

export function FollowButton({ targetUserId }: FollowButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: isFollowing, isLoading } = useIsFollowing(targetUserId);
  const followMutation = useFollowUser();
  const unfollowMutation = useUnfollowUser();
  const [isHovering, setIsHovering] = useState(false);

  // Don't show for own profile or if not logged in
  if (!user || user.id === targetUserId) {
    return null;
  }

  const handleClick = async () => {
    try {
      if (isFollowing) {
        await unfollowMutation.mutateAsync(targetUserId);
        toast({ title: 'Unfollowed', description: 'You are no longer following this user.' });
      } else {
        await followMutation.mutateAsync(targetUserId);
        toast({ title: 'Following!', description: 'You are now following this user.' });
      }
    } catch (error) {
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const isPending = followMutation.isPending || unfollowMutation.isPending;

  if (isFollowing) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending || isLoading}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        className={isHovering ? 'border-destructive text-destructive hover:bg-destructive/10' : ''}
      >
        {isHovering ? (
          'Unfollow'
        ) : (
          <>
            <UserCheck className="h-4 w-4 mr-1" />
            Following
          </>
        )}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={isPending || isLoading}
    >
      <UserPlus className="h-4 w-4 mr-1" />
      Follow
    </Button>
  );
}

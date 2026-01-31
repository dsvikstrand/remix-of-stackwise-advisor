import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserFollowers, useUserFollowing, type FollowUser } from '@/hooks/useUserFollows';

interface FollowersListProps {
  userId: string;
  type: 'followers' | 'following';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FollowersList({ userId, type, open, onOpenChange }: FollowersListProps) {
  const { data: followers, isLoading: followersLoading } = useUserFollowers(
    type === 'followers' ? userId : undefined
  );
  const { data: following, isLoading: followingLoading } = useUserFollowing(
    type === 'following' ? userId : undefined
  );

  const isLoading = type === 'followers' ? followersLoading : followingLoading;
  const users = type === 'followers' ? followers : following;
  const title = type === 'followers' ? 'Followers' : 'Following';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : users && users.length > 0 ? (
            <div className="space-y-2">
              {users.map((user) => (
                <UserRow key={user.user_id} user={user} onClose={() => onOpenChange(false)} />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({ user, onClose }: { user: FollowUser; onClose: () => void }) {
  const displayName = user.display_name || 'Anonymous';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <Link
      to={`/u/${user.user_id}`}
      onClick={onClose}
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={user.avatar_url || undefined} alt={displayName} />
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium">{displayName}</span>
    </Link>
  );
}

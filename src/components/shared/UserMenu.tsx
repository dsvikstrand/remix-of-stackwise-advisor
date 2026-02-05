import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, LogOut, Settings } from 'lucide-react';
import { useAiCredits } from '@/hooks/useAiCredits';

export function UserMenu() {
  const { user, profile, signOut, isLoading } = useAuth();
  const creditsQuery = useAiCredits(!!user);

  if (isLoading) {
    return (
      <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
    );
  }

  if (!user) {
    return (
      <Link to="/auth">
        <Button variant="outline" size="sm" className="gap-2">
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">Sign In</span>
        </Button>
      </Link>
    );
  }

  const displayName = profile?.display_name || user.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();
  const credits = creditsQuery.data;
  const creditsPercent = credits?.bypass
    ? 100
    : credits
    ? Math.min(100, Math.max(0, (credits.remaining / Math.max(1, credits.limit)) * 100))
    : 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.avatar_url || undefined} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-3 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>AI credits</span>
            <span>
              {credits
                ? credits.bypass
                  ? 'Unlimited'
                  : `${credits.remaining}/${credits.limit}`
                : '—'}
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${creditsPercent}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {creditsQuery.isLoading
              ? 'Loading credits…'
              : creditsQuery.isError
              ? 'Credits unavailable'
              : 'Resets daily'}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={`/u/${user.id}`} className="flex items-center cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            My Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="flex items-center cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut()}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

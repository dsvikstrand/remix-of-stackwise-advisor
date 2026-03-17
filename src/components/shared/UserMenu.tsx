import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, LogOut, Settings, LifeBuoy, HelpCircle, Moon, Sun, Compass } from 'lucide-react';
import { useAiCredits } from '@/hooks/useAiCredits';

interface UserMenuProps {
  onOpenHelp?: () => void;
}

type ThemeMode = 'light' | 'dark';

export function UserMenu({ onOpenHelp }: UserMenuProps) {
  const { user, profile, signOut, isLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const creditsQuery = useAiCredits({
    enabled: Boolean(user && menuOpen),
    refetchIntervalMs: false,
  });
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('blend-theme');
    const normalizedTheme: ThemeMode =
      savedTheme === 'dark' || savedTheme === 'light'
        ? (savedTheme as ThemeMode)
        : savedTheme === 'dark-aqua' || savedTheme === 'dark-orange'
          ? 'dark'
          : 'light';

    setTheme(normalizedTheme);
  }, []);

  const applyTheme = (newTheme: ThemeMode) => {
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-orange');
    if (newTheme === 'dark') {
      root.classList.add('dark', 'theme-orange');
    }
  };

  const handleThemeToggle = () => {
    const nextTheme: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
    localStorage.setItem('blend-theme', nextTheme);
  };

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
    ? Math.min(100, Math.max(0, (credits.displayBalance / Math.max(1, credits.displayCapacity)) * 100))
    : 0;
  const planLabel = credits?.plan === 'plus'
    ? 'Plus'
    : credits?.plan === 'admin'
      ? 'Admin'
      : 'Free';
  const planBadgeVariant = 'outline' as const;
  const hasDailyCredits = Number.isFinite(Number(credits?.daily_grant))
    && Number(credits?.daily_grant) > 0;
  const dailyCreditsUsed = Math.max(0, Number(credits?.generation_daily_used || 0));
  const dailyCreditsGrant = Math.max(0, Number(credits?.daily_grant || credits?.generation_daily_limit || 0));

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
            <div className="pt-1 flex items-center gap-2">
              <span className="text-[11px] leading-none text-muted-foreground">Plan</span>
              <Badge variant={planBadgeVariant} className="h-5 px-2 text-[10px] uppercase tracking-wide">
                {planLabel}
              </Badge>
            </div>
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
                  : `${credits.displayBalance.toFixed(1)}/${credits.displayCapacity.toFixed(1)}`
                : '—'}
            </span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${creditsPercent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Plan</span>
            <span>{planLabel}</span>
          </div>
          {hasDailyCredits ? (
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Used today</span>
              <span>{dailyCreditsUsed.toFixed(2)}/{dailyCreditsGrant.toFixed(2)}</span>
            </div>
          ) : null}
          {credits && !credits.bypass ? (
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Reset</span>
              <span>{credits.nextRefillLabel}</span>
            </div>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={`/u/${user.id}`} className="flex items-center cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            My Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/explore" className="flex items-center cursor-pointer">
            <Compass className="mr-2 h-4 w-4" />
            Explore
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings" className="flex items-center cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={handleThemeToggle}
        >
          {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          Toggle theme
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => onOpenHelp?.()}
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          Help
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="mailto:hi@bleup.app" className="flex items-center cursor-pointer">
            <LifeBuoy className="mr-2 h-4 w-4" />
            Support
          </a>
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

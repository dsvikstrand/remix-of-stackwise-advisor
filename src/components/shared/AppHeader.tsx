import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Beaker } from 'lucide-react';
import { AppNavigation } from '@/components/shared/AppNavigation';
import { ThemeToggle } from '@/components/blend/ThemeToggle';
import { UserMenu } from '@/components/shared/UserMenu';
import { useAuth } from '@/contexts/AuthContext';

interface AppHeaderProps {
  actions?: ReactNode;
  showFloatingNav?: boolean;
}

export function AppHeader({ actions, showFloatingNav = true }: AppHeaderProps) {
  const { user } = useAuth();
  const navMode = user ? 'all' : 'public';
  const debugTag = 'dbg7f2c';

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/70 backdrop-blur-glass">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-glow-aqua">
                <Beaker className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold tracking-tight">StackLab</span>
              <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                DEBUG: {debugTag}
              </span>
            </Link>
            <div className="hidden sm:block ml-3">
              <AppNavigation variant="header" mode={navMode} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      {showFloatingNav && (
        <div className="sm:hidden">
          <AppNavigation variant="floating" mode={navMode} />
        </div>
      )}
    </>
  );
}

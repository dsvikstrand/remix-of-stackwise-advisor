import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Beaker, Shuffle } from 'lucide-react';
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
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isAgentic = pathname.startsWith('/remix-of-stackwise-advisor/agentic-backend');
  const switchTarget = isAgentic
    ? 'https://dsvikstrand.github.io/remix-of-stackwise-advisor/'
    : 'https://dsvikstrand.github.io/remix-of-stackwise-advisor/agentic-backend/';
  const switchLabel = isAgentic ? 'Switch to Main' : 'Switch to Agentic';
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/70 backdrop-blur-glass">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center glow-primary">
                <Beaker className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold tracking-tight">Blueprints</span>
              <span className="ml-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                V_1
              </span>
            </Link>
            <a
              href={switchTarget}
              className="ml-1 inline-flex items-center justify-center rounded-full border border-border/60 bg-background/60 p-1 text-muted-foreground transition hover:text-foreground"
              aria-label={switchLabel}
              title={switchLabel}
            >
              <Shuffle className="h-3.5 w-3.5" />
            </a>
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

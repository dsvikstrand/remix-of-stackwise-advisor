import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { Beaker, HelpCircle } from 'lucide-react';
import { AppNavigation } from '@/components/shared/AppNavigation';
import { ThemeToggle } from '@/components/blend/ThemeToggle';
import { UserMenu } from '@/components/shared/UserMenu';
import { useAuth } from '@/contexts/AuthContext';
import { HelpOverlay } from '@/components/shared/HelpOverlay';
import { Button } from '@/components/ui/button';

interface AppHeaderProps {
  actions?: ReactNode;
  showFloatingNav?: boolean;
}

export function AppHeader({ actions, showFloatingNav = true }: AppHeaderProps) {
  const { user } = useAuth();
  const [showHelp, setShowHelp] = useState(false);
  const navMode = user ? 'all' : 'public';
  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/70 backdrop-blur-glass">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between relative">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center glow-primary">
                <Beaker className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold tracking-tight">Blueprints</span>
            </Link>
          </div>
          <div className="hidden sm:block absolute left-1/2 -translate-x-1/2">
            <AppNavigation variant="header" mode={navMode} />
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowHelp(true)}
              className="h-9 w-9 rounded-full border border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
              aria-label="Open help"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
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
      <HelpOverlay open={showHelp} onOpenChange={setShowHelp} />
    </>
  );
}

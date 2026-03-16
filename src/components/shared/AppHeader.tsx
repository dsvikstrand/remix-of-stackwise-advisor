import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { AppNavigation } from '@/components/shared/AppNavigation';
import { NotificationsBell } from '@/components/shared/NotificationsBell';
import { BlueprintFreeBadge } from '@/components/shared/BlueprintFreeBadge';
import { UserMenu } from '@/components/shared/UserMenu';
import { useAuth } from '@/contexts/AuthContext';
import { HelpOverlay } from '@/components/shared/HelpOverlay';

interface AppHeaderProps {
  actions?: ReactNode;
  showFloatingNav?: boolean;
}

export function AppHeader({ actions, showFloatingNav = true }: AppHeaderProps) {
  const { user } = useAuth();
  const [showHelp, setShowHelp] = useState(false);
  const [hideFloatingNav, setHideFloatingNav] = useState(false);

  const navMode = user ? 'all' : 'public';
  const brandTarget = user ? '/wall' : '/';

  useEffect(() => {
    if (!showFloatingNav) return;
    let lastY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      const y = window.scrollY;
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const delta = y - lastY;
        const shouldHide = y > 48 && delta > 6;
        const shouldShow = delta < -6 || y < 32;
        if (shouldHide) setHideFloatingNav(true);
        else if (shouldShow) setHideFloatingNav(false);
        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [showFloatingNav]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background pt-[var(--bleup-app-safe-top)]">
        <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-3 py-3 pl-[calc(0.75rem+var(--bleup-app-safe-left))] pr-[calc(0.75rem+var(--bleup-app-safe-right))] sm:pl-[calc(1rem+var(--bleup-app-safe-left))] sm:pr-[calc(1rem+var(--bleup-app-safe-right))]">
          <div className="flex items-center gap-3 min-w-0">
            <Link to={brandTarget} className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/90 to-primary/60 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold tracking-tight">Bleup</span>
            </Link>
          </div>
          <div className="hidden sm:flex justify-center min-w-0">
            <AppNavigation variant="header" mode={navMode} />
          </div>
          <div className="flex items-center gap-2 justify-end">
            {actions}
            {user ? <BlueprintFreeBadge enabled /> : null}
            {user ? <NotificationsBell /> : null}
            <UserMenu onOpenHelp={() => setShowHelp(true)} />
          </div>
        </div>
      </header>
      {showFloatingNav && (
        <div className="sm:hidden">
          <AppNavigation
            variant="floating"
            mode={navMode}
            className={hideFloatingNav ? 'translate-y-24 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}
          />
        </div>
      )}
      <HelpOverlay open={showHelp} onOpenChange={setShowHelp} />
    </>
  );
}

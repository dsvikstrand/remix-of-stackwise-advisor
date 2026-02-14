import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Beaker, HelpCircle, Plus } from 'lucide-react';
import { AppNavigation } from '@/components/shared/AppNavigation';
import { ThemeToggle } from '@/components/blend/ThemeToggle';
import { UserMenu } from '@/components/shared/UserMenu';
import { useAuth } from '@/contexts/AuthContext';
import { HelpOverlay } from '@/components/shared/HelpOverlay';
import { Button } from '@/components/ui/button';
import { CreateBlueprintFlowModal } from '@/components/create/CreateBlueprintFlowModal';

interface AppHeaderProps {
  actions?: ReactNode;
  showFloatingNav?: boolean;
}

export function AppHeader({ actions, showFloatingNav = true }: AppHeaderProps) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const createParam = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('create');
  }, [location.search]);

  useEffect(() => {
    if (!user) return;
    if (createParam !== '1') return;
    setShowCreate(true);
  }, [createParam, user]);

  const handleCreateOpenChange = (open: boolean) => {
    setShowCreate(open);
    if (!open && createParam === '1') {
      const params = new URLSearchParams(location.search);
      params.delete('create');
      const next = params.toString();
      navigate({ pathname: location.pathname, search: next ? `?${next}` : '' }, { replace: true });
    }
  };

  const navMode = user ? 'all' : 'public';
  const hideCreate = location.pathname.startsWith('/auth');

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 grid grid-cols-[auto,1fr,auto] items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center glow-primary">
                <Beaker className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold tracking-tight">Blueprints</span>
            </Link>
          </div>
          <div className="hidden sm:flex justify-center min-w-0">
            <AppNavigation variant="header" mode={navMode} />
          </div>
          <div className="flex items-center gap-2 justify-end">
            {actions}
            {user && !hideCreate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-4 w-4" />
                Create
              </Button>
            )}
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
      <CreateBlueprintFlowModal open={showCreate} onOpenChange={handleCreateOpenChange} presetChannelSlug={null} />
    </>
  );
}

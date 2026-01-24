import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Beaker, FlaskConical, Dumbbell, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppNavigationProps {
  variant?: 'header' | 'floating';
}

export function AppNavigation({ variant = 'header' }: AppNavigationProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { path: '/', label: 'StackLab', icon: Beaker },
    { path: '/blend', label: 'Blend', icon: FlaskConical },
    { path: '/protein', label: 'Protein', icon: Dumbbell },
    { path: '/wall', label: 'Wall', icon: Users },
  ];

  if (variant === 'floating') {
    return (
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 p-1 bg-card/80 backdrop-blur-glass rounded-full border border-border/50 shadow-soft-lg">
        {navItems.map((item) => {
          const isActive = currentPath === item.path;
          const Icon = item.icon;
          return (
            <Link key={item.path} to={item.path}>
              <Button
                variant={isActive ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'gap-2 rounded-full',
                  isActive && 'bg-primary text-primary-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Button>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-1 p-1 bg-card/50 backdrop-blur-sm rounded-xl border border-border/30">
      {navItems.map((item) => {
        const isActive = currentPath === item.path;
        const Icon = item.icon;
        return (
          <Link key={item.path} to={item.path}>
            <Button
              variant={isActive ? 'glass' : 'ghost'}
              size="sm"
              className={cn(
                'gap-2',
                isActive && 'bg-accent/50 pointer-events-none'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Button>
          </Link>
        );
      })}
    </nav>
  );
}

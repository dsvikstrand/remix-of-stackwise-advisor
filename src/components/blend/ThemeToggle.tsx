import { Moon, Sun, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark-aqua' | 'dark-orange';

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    // Load saved theme on mount
    const savedTheme = localStorage.getItem('blend-theme') as ThemeMode | null;
    if (savedTheme) {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    }
  }, []);

  const applyTheme = (newTheme: ThemeMode) => {
    const root = document.documentElement;
    
    // Remove all theme classes
    root.classList.remove('dark', 'theme-orange');
    
    if (newTheme === 'dark-aqua') {
      root.classList.add('dark');
    } else if (newTheme === 'dark-orange') {
      root.classList.add('dark', 'theme-orange');
    }
    // 'light' = no classes needed
  };

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('blend-theme', newTheme);
  };

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="h-5 w-5" />;
      case 'dark-aqua':
        return <Moon className="h-5 w-5" />;
      case 'dark-orange':
        return <Palette className="h-5 w-5" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="rounded-full bg-card/60 backdrop-blur-sm border border-border/50 hover:bg-card"
        >
          {getIcon()}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuItem 
          onClick={() => handleThemeChange('light')}
          className={theme === 'light' ? 'bg-accent' : ''}
        >
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleThemeChange('dark-aqua')}
          className={theme === 'dark-aqua' ? 'bg-accent' : ''}
        >
          <Moon className="mr-2 h-4 w-4" />
          Dark Aqua
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleThemeChange('dark-orange')}
          className={theme === 'dark-orange' ? 'bg-accent' : ''}
        >
          <Palette className="mr-2 h-4 w-4" />
          Dark Orange
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

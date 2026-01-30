import { useState, useEffect } from 'react';
import { X, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IntroCalloutProps {
  storageKey: string;
  title: string;
  description: string;
  className?: string;
}

export function IntroCallout({ storageKey, title, description, className }: IntroCalloutProps) {
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    const isDismissed = localStorage.getItem(storageKey) === 'true';
    setDismissed(isDismissed);
  }, [storageKey]);

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'true');
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div
      className={cn(
        'relative rounded-xl border border-primary/30 bg-primary/5 p-4 pr-10 animate-fade-in',
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Lightbulb className="h-4 w-4 text-primary" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-sm">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

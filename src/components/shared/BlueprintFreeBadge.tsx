import { Star, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAiCredits } from '@/hooks/useAiCredits';

interface BlueprintFreeBadgeProps {
  enabled: boolean;
}

export function BlueprintFreeBadge({ enabled }: BlueprintFreeBadgeProps) {
  const { data: credits } = useAiCredits({
    enabled,
    refetchIntervalMs: 600_000,
  });

  if (!enabled || !credits?.openai_daily_free_window_open) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full text-amber-500 transition-transform hover:scale-105 hover:text-amber-600"
          aria-label="Free blueprint generation active"
          title="Free blueprint generation active"
        >
          <Star className="h-4 w-4 fill-current animate-pulse" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 border-amber-200/70 bg-gradient-to-br from-amber-50 via-background to-background p-0">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-amber-600">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100/80">
              <Sparkles className="h-4 w-4 animate-pulse" />
            </div>
            <p className="text-sm font-semibold">Congratulations</p>
          </div>
          <p className="text-sm leading-6 text-foreground">
            All blueprints are currently free to generate.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

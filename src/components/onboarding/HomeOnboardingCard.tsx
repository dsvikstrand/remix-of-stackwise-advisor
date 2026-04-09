import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home, Rss, Sparkles, SquarePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HomeOnboardingCardProps {
  onDismiss: () => void;
  className?: string;
}

const STEPS = [
  {
    title: 'Home is where things land, the main flow of the app.',
    description: '\'For You\' shows your YouTube subscriptions content. \'Channels\' shows blueprints from the channels you follow. All shows every public blueprint.',
    icon: Home,
  },
  {
    title: 'Subscriptions follow creators',
    description: 'When a new video is uploaded, you can turn it into a blueprint by unlocking it from the \'For You\' feed.',
    icon: Rss,
  },
  {
    title: 'Channels organize discovery',
    description: 'Channels group blueprints by topic, so your \'Channels\' feed stays focused on the subjects you want to explore.',
    icon: Sparkles,
  },
  {
    title: 'Add is for manual generation',
    description: 'Use Add when you want to turn a specific video into a blueprint right away.',
    icon: SquarePlus,
  },
];

export function HomeOnboardingCard({ onDismiss, className }: HomeOnboardingCardProps) {
  return (
    <Card className={cn("mx-3 sm:mx-4 border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5", className)}>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Badge variant="secondary" className="w-fit">Getting started</Badge>
            <div className="space-y-1">
              <h2 className="text-base font-semibold">A quick guide to how Bleup works</h2>
              <p className="text-sm text-muted-foreground">
                Learn the difference between creators, channels, and your three Home streams before you dive in.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="self-start" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="rounded-xl border border-border/60 bg-background/80 p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

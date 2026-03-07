import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LandingDemoVariant } from '@/lib/landingStory';
import { ArrowRight, Lock, PlayCircle, Sparkles, TrendingUp } from 'lucide-react';

interface LandingDemoSceneProps {
  variant: LandingDemoVariant;
  onOpenDemo: (variant: LandingDemoVariant) => void;
}

function DeviceFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-[30rem] rounded-[2rem] border border-border/50 bg-card/70 p-2 shadow-soft-xl backdrop-blur', className)}>
      <div className="overflow-hidden rounded-[1.5rem] border border-border/50 bg-background/95">
        {children}
      </div>
    </div>
  );
}

function SignalScene({ onOpenDemo }: { onOpenDemo: (variant: LandingDemoVariant) => void }) {
  return (
    <DeviceFrame>
      <div className="space-y-4 bg-gradient-to-b from-background to-accent/30 p-4">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="bg-primary/10 text-primary">Too much to watch</Badge>
          <span className="text-xs text-muted-foreground">12 new videos</span>
        </div>
        <div className="space-y-3">
          {[
            ['New longevity routine', '42 min'],
            ['Top AI stack for creators', '31 min'],
            ['What I eat in a week', '27 min'],
          ].map(([title, duration], index) => (
            <div key={title} className={cn('rounded-2xl border p-3', index === 0 ? 'border-primary/30 bg-primary/5' : 'border-border/40 bg-card/70')}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">Useful, but hard to fit into the day.</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{duration}</Badge>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Bleu pulls out the useful version.
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Instead of watching all twelve, open the ones worth turning into blueprints.
          </p>
        </div>
        <Button size="sm" variant="chrome" className="w-full" onClick={() => onOpenDemo('signal')}>
          Try a video
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </DeviceFrame>
  );
}

function BlueprintScene({ onOpenDemo }: { onOpenDemo: (variant: LandingDemoVariant) => void }) {
  return (
    <DeviceFrame>
      <div className="space-y-4 bg-gradient-to-b from-background via-background to-accent/20 p-4">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="bg-primary/10 text-primary">Blueprint</Badge>
          <span className="text-xs text-muted-foreground">Ready in seconds</span>
        </div>
        <Card className="rounded-2xl border-primary/20 bg-card/80 shadow-soft">
          <CardContent className="space-y-4 p-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">2g Rebuilds the Gut Barrier Faster than Anything I&apos;ve Seen</p>
              <p className="text-xs text-muted-foreground">Summary, takeaways, practical rules, and open questions.</p>
            </div>
            <div className="space-y-2">
              <div className="rounded-xl bg-accent/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Summary</p>
                <p className="mt-1 text-sm text-foreground">Short explanation of the core claim and what actually matters.</p>
              </div>
              <div className="rounded-xl bg-accent/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Takeaways</p>
                <ul className="mt-1 space-y-1 text-sm text-foreground">
                  <li>• What to do</li>
                  <li>• What to avoid</li>
                  <li>• What to revisit later</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
        <Button size="sm" variant="chrome" className="w-full" onClick={() => onOpenDemo('blueprint')}>
          Open a blueprint
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </DeviceFrame>
  );
}

function LanesScene({ onOpenDemo }: { onOpenDemo: (variant: LandingDemoVariant) => void }) {
  return (
    <DeviceFrame className="max-w-[34rem]">
      <div className="space-y-4 bg-gradient-to-b from-background to-accent/20 p-4">
        <div className="flex gap-2">
          <Badge className="bg-primary text-primary-foreground">For You</Badge>
          <Badge variant="outline">Joined</Badge>
          <Badge variant="outline">All</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border/50 bg-card/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">For You</p>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Lock className="h-4 w-4 text-primary" />
                  Unlock available
                </div>
                <p className="mt-1 text-xs text-muted-foreground">New video from a creator you follow.</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <PlayCircle className="h-4 w-4 text-primary" />
                  Ready blueprint
                </div>
                <p className="mt-1 text-xs text-muted-foreground">The useful version appears once it is generated.</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border/50 bg-card/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Joined</p>
            <div className="mt-3 space-y-2">
              {['b/fitness-training', 'b/nutrition-meal-planning'].map((tag) => (
                <div key={tag} className="rounded-xl border border-border/40 bg-background p-3">
                  <p className="text-sm font-semibold text-foreground">{tag}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Published blueprints from the topics you joined.</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Button size="sm" variant="chrome" className="w-full" onClick={() => onOpenDemo('lanes')}>
          See how it works
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </DeviceFrame>
  );
}

function CommunityScene({ onOpenDemo }: { onOpenDemo: (variant: LandingDemoVariant) => void }) {
  return (
    <DeviceFrame className="max-w-[34rem]">
      <div className="space-y-4 bg-gradient-to-b from-background to-accent/20 p-4">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="bg-primary/10 text-primary">Published today</Badge>
          <span className="text-xs text-muted-foreground">What is actually worth opening?</span>
        </div>
        <div className="space-y-3">
          {[
            ['Best new recovery workflow', 'fitness-training', '124 likes'],
            ['How to eat for steady energy', 'nutrition-meal-planning', '86 likes'],
            ['AI stack for solo creators', 'ai-tools-automation', '74 likes'],
          ].map(([title, channel, meta], index) => (
            <div key={title} className={cn('rounded-2xl border p-3', index === 0 ? 'border-primary/25 bg-primary/5' : 'border-border/40 bg-card/70')}>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">{channel}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-primary">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {meta}
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="chrome" className="w-full" onClick={() => onOpenDemo('community')}>
          Browse Home
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </DeviceFrame>
  );
}

export function LandingDemoScene({ variant, onOpenDemo }: LandingDemoSceneProps) {
  if (variant === 'signal') return <SignalScene onOpenDemo={onOpenDemo} />;
  if (variant === 'blueprint') return <BlueprintScene onOpenDemo={onOpenDemo} />;
  if (variant === 'lanes') return <LanesScene onOpenDemo={onOpenDemo} />;
  return <CommunityScene onOpenDemo={onOpenDemo} />;
}

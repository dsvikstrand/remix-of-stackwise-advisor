import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Compass, Layers, Sparkles, Tag, Users } from 'lucide-react';

interface HelpOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FLOW_STEPS = [
  { label: 'Pull From YouTube', hint: 'Use a single video URL to generate a blueprint draft.' },
  { label: 'Save To My Feed', hint: 'Each item lands in your personal timeline first.' },
  { label: 'Unlock Source Videos', hint: 'Use credits to unlock locked source cards when generation is needed.' },
  { label: 'Auto Channel Publish', hint: 'Generated blueprints are auto-routed to channels after checks.' },
  { label: 'Community Feedback', hint: 'Votes and comments keep Home relevant.' },
];

const FEATURE_CARDS = [
  {
    title: 'My Feed',
    description: 'My Feed is your personal pulled-content lane. Everything lands here first.',
    icon: Sparkles,
    bullets: ['Personal source intake', 'Unlock and open source cards', 'Keeps rejected items accessible'],
  },
  {
    title: 'Blueprints',
    description: 'Blueprints are step-by-step summaries from source content, with optional user remix.',
    icon: Layers,
    bullets: ['Generated from media sources', 'Attach insight/remix', 'Auto-routed to channels when eligible'],
  },
  {
    title: 'Tags',
    description: 'Tags connect the community. Follow them to tailor what you see.',
    icon: Tag,
    bullets: ['Join channels you like', 'Shape the Joined feed', 'Stay focused on your goals'],
  },
  {
    title: 'Community',
    description: 'Home has three lanes: For You, Joined, and All.',
    icon: Users,
    bullets: ['For You = source-driven stream', 'Joined = joined-channel discovery', 'All = global published blueprint feed'],
  },
];

export function HelpOverlay({ open, onOpenChange }: HelpOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[85vh] overflow-y-auto border border-border/60 bg-background/95 p-0">
        <div className="relative w-full">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
          <div className="relative w-full">
            <div className="px-8 pt-8 pb-4 border-b border-border/60 bg-background/60 backdrop-blur sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
                  <Compass className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold">Welcome to Blueprints</h2>
                  <p className="text-sm text-muted-foreground">
                    A friendly guide to the flow, concepts, and how to get started.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">My Feed</Badge>
                <Badge variant="secondary">Blueprints</Badge>
                <Badge variant="secondary">Channels</Badge>
                <Badge variant="secondary">Community</Badge>
              </div>
            </div>

            <div className="px-8 py-6">
              <div className="space-y-8">
                <Card className="border border-border/60 bg-background/80">
                  <CardContent className="p-6 space-y-2">
                    <p className="text-sm font-semibold">Let’s get oriented</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Here’s the goal: turn source content into actionable blueprints you can consume
                      in bite-sized form. My Feed is your personal intake lane, and Home gives you
                      For You (locked + unlocked source-driven items), Joined (published blueprints from channels you joined), and All (the global published blueprint stream) after quality checks.
                      You can remix insights, auto-publish keeps useful items moving,
                      and community feedback helps surface the best content.
                    </p>
                  </CardContent>
                </Card>

                <Card className="border border-border/60 bg-background/70">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div>
                      <p className="text-sm font-semibold">The Flow</p>
                        <p className="text-xs text-muted-foreground">Source pull → My Feed → unlock/generate → Home lanes</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {FLOW_STEPS.map((step) => (
                        <div key={step.label} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                          <p className="text-sm font-medium">{step.label}</p>
                          <p className="text-xs text-muted-foreground mt-1">{step.hint}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  {FEATURE_CARDS.map((card) => {
                    const Icon = card.icon;
                    return (
                      <Card key={card.title} className="border border-border/60 bg-background/80">
                        <CardContent className="p-6 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-semibold">{card.title}</p>
                              <p className="text-xs text-muted-foreground">{card.description}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {card.bullets.map((item) => (
                              <div key={item} className="text-xs text-muted-foreground">
                                • {item}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <Card className="border border-border/60 bg-background/80">
                  <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Tip for first‑time users</p>
                      <p className="text-xs text-muted-foreground">
                        Start with subscribed sources in For You, unlock one item, then open the generated blueprint in Home.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenChange(false)}
                    >
                      Let’s go
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

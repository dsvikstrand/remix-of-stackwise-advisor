import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Compass, Layers, Sparkles, Tag, Users } from 'lucide-react';

interface HelpOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FLOW_STEPS = [
  { label: 'Generate an Inventory', hint: 'Describe what you need in a few words.' },
  { label: 'Build Your Blueprint', hint: 'Pick items, add steps, and add context.' },
  { label: 'Review + Publish', hint: 'Get an AI review, then share with the community.' },
  { label: 'Follow Tags', hint: 'Shape your feed and discover similar routines.' },
  { label: 'Explore the Wall', hint: 'Browse and save blueprints from others.' },
];

const FEATURE_CARDS = [
  {
    title: 'Inventories',
    description: 'Inventories are smart ingredient lists. Generate one, then use it to build a Blueprint.',
    icon: Sparkles,
    bullets: ['Generate from a short prompt', 'Customize categories and items', 'Reuse across blueprints'],
  },
  {
    title: 'Blueprints',
    description: 'Blueprints are step-by-step routines. Combine items into steps and publish when ready.',
    icon: Layers,
    bullets: ['Organize steps visually', 'Add context for each item', 'Publish or keep private'],
  },
  {
    title: 'Tags',
    description: 'Tags connect the community. Follow them to tailor what you see.',
    icon: Tag,
    bullets: ['Follow tags you like', 'See trends on the wall', 'Stay focused on your goals'],
  },
  {
    title: 'Community',
    description: 'Explore, like, and learn from other people’s blueprints.',
    icon: Users,
    bullets: ['Discover new routines', 'Save favorites', 'Share your own'],
  },
];

export function HelpOverlay({ open, onOpenChange }: HelpOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[88vh] overflow-hidden border border-border/60 bg-background/95 p-0">
        <div className="relative h-full w-full">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
          <div className="relative h-full w-full flex flex-col">
            <div className="px-8 pt-8 pb-4 border-b border-border/60 bg-background/60 backdrop-blur">
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
                <Badge variant="secondary">Inventories</Badge>
                <Badge variant="secondary">Blueprints</Badge>
                <Badge variant="secondary">Tags</Badge>
                <Badge variant="secondary">Community</Badge>
              </div>
            </div>

            <ScrollArea className="flex-1 px-8 py-6">
              <div className="space-y-8">
                <Card className="border border-border/60 bg-background/80">
                  <CardContent className="p-6 space-y-2">
                    <p className="text-sm font-semibold">Let’s get oriented</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Here’s the goal: take a simple idea, break it into parts, and turn it into a
                      step‑by‑step routine you can actually follow. Inventories are your ingredients,
                      Blueprints are your instructions, and the community is your feedback loop. As we
                      go, you’ll refine your routine, learn from others, and end up with something you
                      can reuse anytime.
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
                        <p className="text-xs text-muted-foreground">From idea → inventory → blueprint → community</p>
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
                        Start with “Generate Inventory,” then build a blueprint you can refine later.
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
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

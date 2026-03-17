import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Compass, Home, Rss, Sparkles, SquarePlus } from 'lucide-react';

interface HelpOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FLOW_STEPS = [
  { label: 'Follow creators in Subscriptions', hint: 'Subscriptions follow creators you trust and shape My Feed.' },
  { label: 'Join topics in Channels', hint: 'Channels follow topics you care about and shape Joined.' },
  { label: 'Check My Feed for ready and locked items', hint: 'Manual only subscriptions can send new videos to My Feed as locked items before you choose to generate them.' },
  { label: 'Use Add to generate on purpose', hint: 'Paste a video, use a video id, or search when you want a blueprint right away.' },
];

const FEATURE_CARDS = [
  {
    title: 'Subscriptions',
    description: 'Subscriptions follow creators you trust.',
    icon: Rss,
    bullets: [
      'Follows creators, not topics',
      'Shapes My Feed',
      'Auto generate can spend credits automatically',
      'Manual only sends new videos to My Feed first',
      'Locked My Feed items cost 1 credit to generate',
    ],
  },
  {
    title: 'Channels',
    description: 'Channels follow topics you care about.',
    icon: Sparkles,
    bullets: ['Follows topics, not creators', 'Shapes Joined', 'Helps you stay focused on what matters to you'],
  },
  {
    title: 'Home',
    description: 'Home gives you three different streams.',
    icon: Home,
    bullets: [
      'My Feed = creators you subscribe to',
      'Can contain ready blueprints and locked items',
      'Joined = channels you follow',
      'All = every public blueprint on Bleup',
    ],
  },
  {
    title: 'Add',
    description: 'Add is where you generate a blueprint on purpose.',
    icon: SquarePlus,
    bullets: ['Paste a YouTube link or video id', 'Search for a specific video', 'Turn useful content into a blueprint right away'],
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
                  <h2 className="text-2xl font-semibold">How Bleup works</h2>
                  <p className="text-sm text-muted-foreground">
                    A quick guide to creators, topics, and your three Home streams.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">Subscriptions</Badge>
                <Badge variant="secondary">Channels</Badge>
                <Badge variant="secondary">Home</Badge>
                <Badge variant="secondary">Add</Badge>
              </div>
            </div>

            <div className="px-8 py-6">
              <div className="space-y-8">
                <Card className="border border-border/60 bg-background/80">
                  <CardContent className="p-6 space-y-2">
                    <p className="text-sm font-semibold">Let’s get oriented</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Bleup helps you turn useful creator content into blueprints you can actually use.
                      Subscriptions follow creators you trust. Channels follow topics you care about.
                      Home then brings those together through three streams: My Feed from your subscriptions,
                      Joined from the channels you follow, and All for every public blueprint on Bleup.
                      Credits are used when Bleup generates a blueprint. If a subscription is Manual only,
                      new videos can land in My Feed as locked items and cost 1 credit when you choose to turn one into a blueprint.
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
                        <p className="text-xs text-muted-foreground">Creators and topics in → Home streams out</p>
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
                        Start by subscribing to one creator or joining one channel, then generate one blueprint from Add or open one from Home. If a creator is set to Manual only, look for locked items in My Feed.
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

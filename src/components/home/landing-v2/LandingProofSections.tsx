import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenText, Layers3, Search, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LANDING_HOW_IT_WORKS, LANDING_LANE_CARDS, LANDING_VALUE_POINTS } from '@/lib/landingStory';

interface LandingProofSectionsProps {
  isSignedIn: boolean;
  onFinalCtaClick: (slot: 'primary' | 'secondary') => void;
}

const STEP_ICONS = [Search, BookOpenText, Layers3];
const VALUE_ICONS = [Sparkles, Search, Users];

export function LandingProofSections({ isSignedIn, onFinalCtaClick }: LandingProofSectionsProps) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-20 px-4 py-20 md:px-6 lg:px-10">
      <section id="how-it-works" className="space-y-6">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">How Bleu works</p>
          <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            A better way to keep up with valuable YouTube.
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Bleu is built around a simple loop: follow strong sources, generate the useful version, and browse by topic when you want wider discovery.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {LANDING_HOW_IT_WORKS.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? Sparkles;
            return (
              <Card key={step.id} className="rounded-3xl border-border/50 bg-card/70 shadow-soft">
                <CardContent className="space-y-4 p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-semibold text-foreground">{step.title}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-6">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">The three lanes</p>
          <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            One app, three ways to keep up.
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            For You is personal. Joined is interest-driven. All is the full published blueprint stream.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {LANDING_LANE_CARDS.map((lane) => (
            <Card key={lane.id} className="rounded-3xl border-border/50 bg-card/70 shadow-soft">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <p className="text-xl font-semibold text-foreground">{lane.title}</p>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {lane.stateLabel}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{lane.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Why it is useful</p>
          <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Better discovery. Better consumption. Less wasted attention.
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Bleu is not just about summaries. It is about turning YouTube into something easier to follow, easier to discover, and easier to return to later.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {LANDING_VALUE_POINTS.map((point, index) => {
            const Icon = VALUE_ICONS[index] ?? Sparkles;
            return (
              <Card key={point.id} className="rounded-3xl border-border/50 bg-gradient-to-br from-card to-accent/20 shadow-soft">
                <CardContent className="space-y-4 p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-semibold text-foreground">{point.title}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{point.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-border/50 bg-gradient-to-br from-card via-card to-accent/25 shadow-soft-xl">
        <div className="grid gap-8 px-6 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:px-10 md:py-12">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Ready to try it?</p>
            <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Stop losing the good parts to endless watch time.
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
              Try one video, see one blueprint, and then decide how you want Bleu to fit into your feed.
            </p>
          </div>
          <div className="flex flex-col items-start justify-center gap-3">
            {isSignedIn ? (
              <>
                <Button asChild size="lg" className="gap-2" onClick={() => onFinalCtaClick('primary')}>
                  <Link to="/search">
                    Open Create
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" onClick={() => onFinalCtaClick('secondary')}>
                  <Link to="/wall">Browse Home</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg" className="gap-2" onClick={() => onFinalCtaClick('primary')}>
                  <Link to="/youtube">
                    Try a video
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" onClick={() => onFinalCtaClick('secondary')}>
                  <Link to="/auth">Sign in to save your feed</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenText, PlaySquare, Search, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { LANDING_BLUEPRINT_PREVIEWS, LANDING_HOW_IT_WORKS, LANDING_VALUE_POINTS } from '@/lib/landingStory';
import { buildLandingPreviewFromBlueprint, pickStableItem } from '@/lib/landingPreview';

interface LandingProofSectionsProps {
  isSignedIn: boolean;
  onFinalCtaClick: (slot: 'primary' | 'secondary') => void;
}

const STEP_ICONS = [Search, BookOpenText, PlaySquare];
const VALUE_ICONS = [Sparkles, Search, Users];

export function LandingProofSections({ isSignedIn, onFinalCtaClick }: LandingProofSectionsProps) {
  const [previewSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const landingPreviewQuery = useQuery({
    queryKey: ['landing-preview-blueprint'],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blueprints')
        .select('id, title, banner_url, preview_summary, sections_json')
        .eq('is_public', true)
        .not('sections_json', 'is', null)
        .not('banner_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(18);

      if (error) throw error;
      return data || [];
    },
  });
  const fallbackPreview = useMemo(
    () => pickStableItem(LANDING_BLUEPRINT_PREVIEWS, previewSeed) ?? LANDING_BLUEPRINT_PREVIEWS[0],
    [previewSeed],
  );
  const activeBlueprint = useMemo(() => {
    const sampled = pickStableItem(landingPreviewQuery.data || [], previewSeed);
    if (!sampled) return fallbackPreview;
    return buildLandingPreviewFromBlueprint(sampled, fallbackPreview) || fallbackPreview;
  }, [fallbackPreview, landingPreviewQuery.data, previewSeed]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-20 px-4 py-20 md:px-6 lg:px-10">
      <section id="how-it-works" className="space-y-6">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">How Bleup works</p>
          <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            A better way to keep up with valuable YouTube.
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Bleup is built around a simple loop: follow YouTube creators you like, generate blueprint versions of their videos, and browse by topic when you want wider discovery.
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

      <section className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center">
        <div className="max-w-xl space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Blueprint preview</p>
          <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Preview what a blueprint can look like.
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            These are compact examples to give you the idea, not the full blueprint experience.
          </p>
          {landingPreviewQuery.isError ? (
            <p className="text-xs text-muted-foreground">Showing a fallback preview while the live sample is unavailable.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Showing one live public blueprint sample.</p>
          )}
        </div>
        <div className="relative rounded-[2rem] border border-border/50 bg-gradient-to-br from-card via-card to-accent/20 p-3 shadow-soft-xl">
          <Card className="rounded-[1.75rem] border-border/50 bg-background/90 shadow-none">
            <CardContent className="space-y-6 p-6">
              <div className="overflow-hidden rounded-[1.35rem] border border-border/50 bg-muted/20">
                  <img
                    src={activeBlueprint.thumbnailUrl}
                    alt={activeBlueprint.title}
                    className="aspect-[7/2] w-full object-cover"
                    loading="lazy"
                  />
                </div>

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                      {activeBlueprint.channel}
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold tracking-tight text-foreground">{activeBlueprint.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">From {activeBlueprint.creator}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  {activeBlueprint.statsLabel}
                </span>
              </div>

              <div className="rounded-2xl border border-border/50 bg-accent/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Summary</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/90">{activeBlueprint.summary}</p>
              </div>

              <div className="rounded-2xl border border-border/50 bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Takeaways</p>
                <div className="mt-3 space-y-2">
                  {activeBlueprint.takeaways.map((takeaway) => (
                    <div key={takeaway} className="flex items-start gap-3 text-sm text-foreground/90">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                      <span>{takeaway}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-6">
        <div className="max-w-2xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Why it is useful</p>
          <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Better discovery. Better consumption. Less wasted attention.
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Bleup is not just about summaries. It is about turning YouTube into something easier to follow, easier to discover, and easier to return to later.
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

      <section className="grid gap-6 rounded-[2rem] border border-border/50 bg-gradient-to-br from-background via-card/70 to-accent/15 px-6 py-8 shadow-soft lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:px-8">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Import creators</p>
          <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Import creators from your public YouTube subscriptions.
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            If you want a quick start, make your YouTube subscriptions public and Bleup can import the creators you already follow.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-border/50 bg-background/85 p-5 shadow-soft">
          <div className="space-y-4">
            <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Public-subscriptions path
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>1. Make your YouTube subscription list public temporarily.</p>
              <p>2. Paste your channel URL or <span className="font-medium text-foreground/90">@handle</span>.</p>
              <p>3. Bleup imports the visible creators you already follow.</p>
              <p>4. You can switch subscriptions back to private afterward.</p>
              <p className="text-xs">This works only if your YouTube subscription list is public.</p>
            </div>
          </div>
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
              Start right now and generate your blueprints without any cost.
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
                  <Link to="/auth">
                    Create a free account
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { LazyMotion, domAnimation, AnimatePresence, m } from 'framer-motion';
import { ArrowRight, Compass, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LANDING_STORY_SCENES } from '@/lib/landingStory';
import { LandingDemoScene } from '@/components/home/landing-v2/LandingDemoScene';

interface LandingHeroStoryProps {
  containerRef: RefObject<HTMLDivElement>;
  activeSceneIndex: number;
  isSignedIn: boolean;
  onHeroCtaClick: (slot: 'primary' | 'secondary' | 'tertiary') => void;
  onDemoCtaClick: (variant: 'signal' | 'blueprint' | 'lanes' | 'community') => void;
  prefersReducedMotion: boolean;
}

function BackgroundArt({ sceneIndex, reducedMotion }: { sceneIndex: number; reducedMotion: boolean }) {
  const orbs = [
    { className: 'left-[6%] top-[16%] h-40 w-40 md:h-64 md:w-64 bg-primary/18', x: ['0%', '4%', '-2%', '0%'], y: ['0%', '-4%', '3%', '0%'] },
    { className: 'right-[10%] top-[18%] h-48 w-48 md:h-72 md:w-72 bg-amber-200/35', x: ['0%', '-3%', '3%', '0%'], y: ['0%', '3%', '-2%', '0%'] },
    { className: 'left-[22%] bottom-[12%] h-44 w-44 md:h-64 md:w-64 bg-orange-200/30', x: ['0%', '2%', '-3%', '0%'], y: ['0%', '-2%', '2%', '0%'] },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.10),transparent_42%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(35_50%_95%)_40%,hsl(var(--background))_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle,hsl(var(--primary)/0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />
      {orbs.map((orb, index) => (
        <m.div
          key={index}
          aria-hidden="true"
          className={cn('absolute rounded-full blur-3xl', orb.className)}
          animate={
            reducedMotion
              ? { opacity: 0.85 - sceneIndex * 0.1 }
              : { x: orb.x[sceneIndex] ?? '0%', y: orb.y[sceneIndex] ?? '0%', opacity: 0.65 + sceneIndex * 0.05, scale: 1 + sceneIndex * 0.03 }
          }
          transition={{ duration: 0.9, ease: 'easeInOut' }}
        />
      ))}
      <m.div
        aria-hidden="true"
        className="absolute inset-x-[14%] top-[36%] h-52 rounded-full bg-white/40 blur-[120px]"
        animate={reducedMotion ? undefined : { opacity: [0.28, 0.45, 0.3], scale: [1, 1.05, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

export function LandingHeroStory({
  containerRef,
  activeSceneIndex,
  isSignedIn,
  onHeroCtaClick,
  onDemoCtaClick,
  prefersReducedMotion,
}: LandingHeroStoryProps) {
  const scene = LANDING_STORY_SCENES[activeSceneIndex] ?? LANDING_STORY_SCENES[0];

  return (
    <LazyMotion features={domAnimation}>
      <section ref={containerRef} className="relative h-[320svh] md:h-[360svh]">
        <div className="sticky top-16 flex min-h-[calc(100svh-4rem)] items-center overflow-hidden border-b border-border/40">
          <BackgroundArt sceneIndex={activeSceneIndex} reducedMotion={prefersReducedMotion} />
          <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-10 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:px-6 lg:px-10">
            <div className="flex min-h-[28rem] flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-primary backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Better than watching everything
              </div>
              <AnimatePresence mode="wait">
                <m.div
                  key={scene.id}
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -18 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className="mt-6 space-y-5"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary/80">{scene.eyebrow}</p>
                  <h1 className="max-w-3xl text-4xl font-black tracking-tight text-balance text-foreground sm:text-5xl md:text-6xl xl:text-7xl">
                    {scene.headline}
                  </h1>
                  <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    {scene.subheadline}
                  </p>
                </m.div>
              </AnimatePresence>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {isSignedIn ? (
                  <>
                    <Button asChild size="lg" className="gap-2" onClick={() => onHeroCtaClick('primary')}>
                      <Link to="/search">
                        Open Create
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="gap-2" onClick={() => onHeroCtaClick('secondary')}>
                      <Link to="/wall">
                        Open Home
                        <Compass className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="ghost" onClick={() => onHeroCtaClick('tertiary')}>
                      <a href="#how-it-works">See how it works</a>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild size="lg" className="gap-2" onClick={() => onHeroCtaClick('primary')}>
                      <Link to="/youtube">
                        Try a video
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" onClick={() => onHeroCtaClick('secondary')}>
                      <a href="#how-it-works">See how it works</a>
                    </Button>
                    <Button asChild size="lg" variant="ghost" onClick={() => onHeroCtaClick('tertiary')}>
                      <Link to="/auth">Sign in to save your feed</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center">
              <AnimatePresence mode="wait">
                <m.div
                  key={scene.id}
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20, scale: prefersReducedMotion ? 1 : 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -20, scale: prefersReducedMotion ? 1 : 1.02 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className={cn('w-full rounded-[2rem] border border-white/50 bg-white/35 p-2 shadow-soft-xl backdrop-blur-sm', scene.accentClass)}
                >
                  <LandingDemoScene variant={scene.demoVariant} onOpenDemo={onDemoCtaClick} />
                </m.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>
    </LazyMotion>
  );
}

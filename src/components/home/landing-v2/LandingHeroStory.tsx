import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { LazyMotion, domAnimation, AnimatePresence, m, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, Compass, Sparkles, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LANDING_BACKGROUND_GLYPHS, LANDING_STORY_SCENES, type LandingBackgroundGlyph } from '@/lib/landingStory';
import { LandingDemoScene } from '@/components/home/landing-v2/LandingDemoScene';

interface LandingHeroStoryProps {
  containerRef: RefObject<HTMLDivElement>;
  activeSceneIndex: number;
  scrollProgress: number;
  isSignedIn: boolean;
  onHeroCtaClick: (slot: 'primary' | 'secondary' | 'tertiary') => void;
  onDemoCtaClick: (variant: 'signal' | 'blueprint' | 'lanes' | 'community') => void;
  prefersReducedMotion: boolean;
}

function BackgroundGlyph({
  glyph,
  progress,
  reducedMotion,
}: {
  glyph: LandingBackgroundGlyph;
  progress: ReturnType<typeof useSpring>;
  reducedMotion: boolean;
}) {
  const x = useTransform(progress, [0, 1], glyph.xRange);
  const y = useTransform(progress, [0, 1], glyph.yRange);
  const rotate = useTransform(progress, [0, 1], glyph.rotateRange ?? [0, 0]);
  const scale = useTransform(progress, [0, 1], glyph.scaleRange ?? [1, 1]);
  const opacity = useTransform(progress, [0, 1], glyph.opacityRange ?? [0.18, 0.3]);

  const sizeClassName = glyph.mobileSize === 0
    ? 'hidden md:flex'
    : glyph.desktopOnly
      ? 'hidden md:flex'
      : 'flex';

  const mobileSize = glyph.mobileSize && glyph.mobileSize > 0 ? glyph.mobileSize : glyph.size;
  const sharedClasses = cn(
    'absolute items-center justify-center will-change-transform pointer-events-none',
    sizeClassName,
    glyph.depth === 'near' ? 'z-[1]' : glyph.depth === 'mid' ? 'z-0' : 'z-0',
  );

  const style = reducedMotion
    ? {
        left: glyph.left,
        top: glyph.top,
        width: mobileSize,
        height: mobileSize,
        opacity: glyph.opacityRange?.[0] ?? 0.22,
      }
    : {
        left: glyph.left,
        top: glyph.top,
        width: mobileSize,
        height: mobileSize,
        x,
        y,
        rotate,
        scale,
        opacity,
      };

  const desktopStyle = glyph.mobileSize && glyph.mobileSize > 0 && glyph.mobileSize !== glyph.size
    ? { width: glyph.size, height: glyph.size }
    : undefined;

  if (glyph.shape === 'circle') {
    return (
      <m.div
        aria-hidden="true"
        className={cn(sharedClasses, 'rounded-full blur-[1px]', glyph.toneClassName)}
        style={style}
      />
    );
  }

  if (glyph.shape === 'diamond') {
    return (
      <m.div aria-hidden="true" className={sharedClasses} style={style}>
        <div
          className={cn('h-full w-full rotate-45 rounded-[1.15rem] blur-[0.2px]', glyph.toneClassName)}
          style={desktopStyle}
        />
      </m.div>
    );
  }

  if (glyph.shape === 'capsule') {
    return (
      <m.div
        aria-hidden="true"
        className={cn(sharedClasses, 'rounded-full blur-[0.4px]', glyph.toneClassName)}
        style={{
          ...style,
          height: Math.max(18, Math.round(mobileSize * 0.28)),
          width: mobileSize,
        }}
      />
    );
  }

  if (glyph.shape === 'ring') {
    return (
      <m.div
        aria-hidden="true"
        className={cn(sharedClasses, 'rounded-full bg-transparent', glyph.toneClassName)}
        style={style}
      />
    );
  }

  return (
    <m.div aria-hidden="true" className={sharedClasses} style={style}>
      <Plus className={cn('h-full w-full', glyph.toneClassName)} strokeWidth={1.5} />
    </m.div>
  );
}

function BackgroundArt({
  sceneIndex,
  scrollProgress,
  reducedMotion,
}: {
  sceneIndex: number;
  scrollProgress: number;
  reducedMotion: boolean;
}) {
  const progressValue = useMotionValue(scrollProgress);
  const smoothProgress = useSpring(progressValue, {
    stiffness: 140,
    damping: 28,
    mass: 0.32,
  });

  useEffect(() => {
    progressValue.set(scrollProgress);
  }, [progressValue, scrollProgress]);

  const haloOpacity = useTransform(smoothProgress, [0, 0.4, 1], [0.22, 0.38, 0.28]);
  const haloScale = useTransform(smoothProgress, [0, 0.5, 1], [1, 1.08, 0.98]);
  const gridOpacity = useTransform(smoothProgress, [0, 0.5, 1], [0.42, 0.52, 0.45]);
  const backdropShift = useTransform(smoothProgress, [0, 1], ['0%', '2.5%']);

  const orbs = [
    {
      className: 'left-[4%] top-[14%] h-44 w-44 md:h-72 md:w-72 bg-primary/16',
      x: useTransform(smoothProgress, [0, 1], [-14, 36]),
      y: useTransform(smoothProgress, [0, 1], [0, -30]),
      scale: useTransform(smoothProgress, [0, 1], [1, 1.08]),
      opacity: useTransform(smoothProgress, [0, 1], [0.58, 0.72]),
    },
    {
      className: 'right-[8%] top-[18%] h-52 w-52 md:h-80 md:w-80 bg-amber-200/32',
      x: useTransform(smoothProgress, [0, 1], [22, -18]),
      y: useTransform(smoothProgress, [0, 1], [-6, 20]),
      scale: useTransform(smoothProgress, [0, 1], [1.02, 1.12]),
      opacity: useTransform(smoothProgress, [0, 1], [0.42, 0.56]),
    },
    {
      className: 'left-[18%] bottom-[10%] h-44 w-44 md:h-64 md:w-64 bg-orange-200/24',
      x: useTransform(smoothProgress, [0, 1], [-18, 12]),
      y: useTransform(smoothProgress, [0, 1], [18, -24]),
      scale: useTransform(smoothProgress, [0, 1], [0.96, 1.04]),
      opacity: useTransform(smoothProgress, [0, 1], [0.22, 0.36]),
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <m.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.10),transparent_42%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(35_50%_95%)_40%,hsl(var(--background))_100%)]"
        style={reducedMotion ? undefined : { y: backdropShift }}
      />
      <m.div
        className="absolute inset-0 bg-[radial-gradient(circle,hsl(var(--primary)/0.09)_1px,transparent_1px)] [background-size:22px_22px]"
        style={reducedMotion ? { opacity: 0.42 } : { opacity: gridOpacity }}
      />
      {LANDING_BACKGROUND_GLYPHS.map((glyph) => (
        <BackgroundGlyph
          key={glyph.id}
          glyph={glyph}
          progress={smoothProgress}
          reducedMotion={reducedMotion}
        />
      ))}
      {orbs.map((orb, index) => (
        <m.div
          key={index}
          aria-hidden="true"
          className={cn('absolute rounded-full blur-3xl', orb.className)}
          style={
            reducedMotion
              ? { opacity: 0.7 - sceneIndex * 0.08 }
              : { x: orb.x, y: orb.y, scale: orb.scale, opacity: orb.opacity }
          }
        />
      ))}
      <m.div
        aria-hidden="true"
        className="absolute inset-x-[14%] top-[36%] h-52 rounded-full bg-white/40 blur-[120px]"
        style={
          reducedMotion
            ? { opacity: 0.28 + sceneIndex * 0.02 }
            : { opacity: haloOpacity, scale: haloScale }
        }
      />
    </div>
  );
}

export function LandingHeroStory({
  containerRef,
  activeSceneIndex,
  scrollProgress,
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
          <BackgroundArt
            sceneIndex={activeSceneIndex}
            scrollProgress={scrollProgress}
            reducedMotion={prefersReducedMotion}
          />
          <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-10 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:px-6 lg:px-10">
            <div className="flex min-h-[28rem] flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-white/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-primary backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                Better than watching everything
              </div>
              <div className="relative mt-6 min-h-[18rem] sm:min-h-[19rem] md:min-h-[21rem]">
                <AnimatePresence initial={false}>
                  <m.div
                    key={scene.id}
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -18 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className="absolute inset-0 space-y-5"
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
              </div>
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
              <div className="relative w-full min-h-[31rem] md:min-h-[35rem]">
                <AnimatePresence initial={false}>
                  <m.div
                    key={scene.id}
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20, scale: prefersReducedMotion ? 1 : 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -20, scale: prefersReducedMotion ? 1 : 1.02 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    className={cn('absolute inset-0 w-full rounded-[2rem] border border-white/50 bg-white/35 p-2 shadow-soft-xl backdrop-blur-sm', scene.accentClass)}
                  >
                    <LandingDemoScene variant={scene.demoVariant} onOpenDemo={onDemoCtaClick} />
                  </m.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </section>
    </LazyMotion>
  );
}

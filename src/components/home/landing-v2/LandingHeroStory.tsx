import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { LazyMotion, domAnimation, AnimatePresence, m, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowRight, Compass, Sparkles, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LANDING_BACKGROUND_GLYPHS, LANDING_STORY_SCENES, type LandingBackgroundGlyph } from '@/lib/landingStory';
import { LandingDemoScene } from '@/components/home/landing-v2/LandingDemoScene';
import { useLandingHeroGlyphMotion } from '@/hooks/useLandingHeroGlyphMotion';

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
  reducedMotion,
  setGlyphRef,
}: {
  glyph: LandingBackgroundGlyph;
  reducedMotion: boolean;
  setGlyphRef: ReturnType<typeof useLandingHeroGlyphMotion>['setGlyphRef'];
}) {
  const sizeClassName = glyph.mobileSize === 0
    ? 'hidden md:flex'
    : glyph.desktopOnly
      ? 'hidden md:flex'
      : 'flex';

  const sharedClasses = cn(
    'absolute items-center justify-center will-change-transform pointer-events-none',
    sizeClassName,
    glyph.depth === 'near' ? 'z-[1]' : glyph.depth === 'mid' ? 'z-0' : 'z-0',
    'w-[var(--glyph-w-mobile)] h-[var(--glyph-h-mobile)] md:w-[var(--glyph-w)] md:h-[var(--glyph-h)]',
  );

  const mobileWidth = glyph.mobileSize && glyph.mobileSize > 0 ? glyph.mobileSize : glyph.size;
  const mobileHeight = glyph.shape === 'capsule' ? Math.max(16, Math.round(mobileWidth * 0.3)) : mobileWidth;
  const desktopHeight = glyph.shape === 'capsule' ? Math.max(20, Math.round(glyph.size * 0.3)) : glyph.size;

  const style = reducedMotion
    ? {
        left: glyph.left,
        top: glyph.top,
        '--glyph-w-mobile': `${mobileWidth}px`,
        '--glyph-h-mobile': `${mobileHeight}px`,
        '--glyph-w': `${glyph.size}px`,
        '--glyph-h': `${desktopHeight}px`,
        opacity: glyph.startOpacity ?? 0.22,
        transform: `rotate(${glyph.startRotate ?? 0}deg) scale(${glyph.startScale ?? 1})`,
      }
    : {
        left: 0,
        top: 0,
        '--glyph-w-mobile': `${mobileWidth}px`,
        '--glyph-h-mobile': `${mobileHeight}px`,
        '--glyph-w': `${glyph.size}px`,
        '--glyph-h': `${desktopHeight}px`,
        opacity: glyph.startOpacity ?? 0.22,
      };

  if (glyph.shape === 'circle') {
    return (
      <div
        aria-hidden="true"
        ref={setGlyphRef(glyph.id)}
        className={cn(sharedClasses, 'rounded-full blur-[1px]', glyph.toneClassName)}
        style={style}
      />
    );
  }

  if (glyph.shape === 'diamond') {
    return (
      <div aria-hidden="true" ref={setGlyphRef(glyph.id)} className={sharedClasses} style={style}>
        <div className={cn('h-full w-full rotate-45 rounded-[1.15rem] blur-[0.2px]', glyph.toneClassName)} />
      </div>
    );
  }

  if (glyph.shape === 'capsule') {
    return (
      <div
        aria-hidden="true"
        ref={setGlyphRef(glyph.id)}
        className={cn(sharedClasses, 'rounded-full blur-[0.4px]', glyph.toneClassName)}
        style={style}
      />
    );
  }

  if (glyph.shape === 'ring') {
    return (
      <div
        aria-hidden="true"
        ref={setGlyphRef(glyph.id)}
        className={cn(sharedClasses, 'rounded-full bg-transparent', glyph.toneClassName)}
        style={style}
      />
    );
  }

  if (glyph.shape === 'cross') {
    return (
      <div aria-hidden="true" ref={setGlyphRef(glyph.id)} className={sharedClasses} style={style}>
        <Plus className={cn('h-full w-full', glyph.toneClassName)} strokeWidth={1.55} />
      </div>
    );
  }

  return (
    <div aria-hidden="true" ref={setGlyphRef(glyph.id)} className={sharedClasses} style={style}>
      <Sparkles className={cn('h-full w-full', glyph.toneClassName)} strokeWidth={1.4} />
    </div>
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
  const { setGlyphRef, setDesktopPathRef, setMobilePathRef } = useLandingHeroGlyphMotion({
    glyphs: LANDING_BACKGROUND_GLYPHS,
    progress: scrollProgress,
    reducedMotion,
  });

  useEffect(() => {
    progressValue.set(scrollProgress);
  }, [progressValue, scrollProgress]);

  const haloOpacity = useTransform(smoothProgress, [0, 0.4, 1], [0.18, 0.3, 0.22]);
  const haloScale = useTransform(smoothProgress, [0, 0.5, 1], [1, 1.1, 1]);
  const gridOpacity = useTransform(smoothProgress, [0, 0.5, 1], [0.42, 0.52, 0.45]);
  const backdropShift = useTransform(smoothProgress, [0, 1], ['0%', '2.5%']);

  const orbs = [
    {
      className: 'left-[-6%] top-[10%] h-52 w-52 md:h-80 md:w-80 bg-primary/18',
      x: useTransform(smoothProgress, [0, 1], [-36, 56]),
      y: useTransform(smoothProgress, [0, 1], [10, -44]),
      scale: useTransform(smoothProgress, [0, 1], [1, 1.12]),
      opacity: useTransform(smoothProgress, [0, 1], [0.54, 0.72]),
    },
    {
      className: 'right-[4%] top-[12%] h-56 w-56 md:h-84 md:w-84 bg-amber-200/34',
      x: useTransform(smoothProgress, [0, 1], [46, -42]),
      y: useTransform(smoothProgress, [0, 1], [-12, 34]),
      scale: useTransform(smoothProgress, [0, 1], [1.04, 1.14]),
      opacity: useTransform(smoothProgress, [0, 1], [0.38, 0.56]),
    },
    {
      className: 'left-[10%] bottom-[8%] h-48 w-48 md:h-72 md:w-72 bg-orange-200/26',
      x: useTransform(smoothProgress, [0, 1], [-24, 30]),
      y: useTransform(smoothProgress, [0, 1], [28, -34]),
      scale: useTransform(smoothProgress, [0, 1], [0.98, 1.08]),
      opacity: useTransform(smoothProgress, [0, 1], [0.18, 0.34]),
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <g opacity="0" pointerEvents="none">
          {LANDING_BACKGROUND_GLYPHS.map((glyph) => (
            <path
              key={`${glyph.id}-desktop`}
              ref={setDesktopPathRef(glyph.id)}
              d={glyph.desktopPath}
              fill="none"
              stroke="none"
            />
          ))}
          {LANDING_BACKGROUND_GLYPHS.map((glyph) =>
            glyph.mobilePath ? (
              <path
                key={`${glyph.id}-mobile`}
                ref={setMobilePathRef(glyph.id)}
                d={glyph.mobilePath}
                fill="none"
                stroke="none"
              />
            ) : null,
          )}
        </g>
      </svg>
      <m.div
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.10),transparent_42%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(35_50%_95%)_40%,hsl(var(--background))_100%)]"
        style={reducedMotion ? undefined : { y: backdropShift }}
      />
      <m.div
        className="absolute inset-0 bg-[radial-gradient(circle,hsl(var(--primary)/0.09)_1px,transparent_1px)] [background-size:22px_22px]"
        style={reducedMotion ? { opacity: 0.42 } : { opacity: gridOpacity }}
      />
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
        className="absolute inset-x-[18%] top-[40%] h-44 rounded-full bg-white/26 blur-[110px]"
        style={
          reducedMotion
            ? { opacity: 0.18 + sceneIndex * 0.02 }
            : { opacity: haloOpacity, scale: haloScale }
        }
      />
      {LANDING_BACKGROUND_GLYPHS.map((glyph) => (
        <BackgroundGlyph
          key={glyph.id}
          glyph={glyph}
          reducedMotion={reducedMotion}
          setGlyphRef={setGlyphRef}
        />
      ))}
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
              <div className="relative mt-6 min-h-[27rem] sm:min-h-[31rem] md:min-h-[38rem] lg:min-h-[42rem]">
                <AnimatePresence initial={false}>
                  <m.div
                    key={scene.id}
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -18 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
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
              <div className="relative w-full min-h-[31rem] md:min-h-[35rem] lg:min-h-[38rem]">
                <AnimatePresence initial={false}>
                  <m.div
                    key={scene.id}
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20, scale: prefersReducedMotion ? 1 : 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -20, scale: prefersReducedMotion ? 1 : 1.02 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
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

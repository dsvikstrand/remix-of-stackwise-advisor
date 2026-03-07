import { useCallback, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import type { LandingBackgroundGlyph } from '@/lib/landingStory';

let motionPathRegistered = false;

function ensureMotionPathPlugin() {
  if (motionPathRegistered) {
    return;
  }

  gsap.registerPlugin(MotionPathPlugin);
  motionPathRegistered = true;
}

function getStoryFadeMultiplier(progress: number) {
  if (progress <= 0.6) {
    return 1;
  }

  if (progress <= 0.85) {
    return 1 - ((progress - 0.6) / 0.25) * 0.7;
  }

  return Math.max(0.08, 0.3 - ((progress - 0.85) / 0.15) * 0.22);
}

interface LandingHeroGlyphMotionOptions {
  glyphs: LandingBackgroundGlyph[];
  progress: number;
  reducedMotion: boolean;
}

export function useLandingHeroGlyphMotion({
  glyphs,
  progress,
  reducedMotion,
}: LandingHeroGlyphMotionOptions) {
  const glyphRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const desktopPathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const mobilePathRefs = useRef<Record<string, SVGPathElement | null>>({});

  const setGlyphRef = useCallback(
    (id: string) => (node: HTMLDivElement | null) => {
      glyphRefs.current[id] = node;
    },
    [],
  );

  const setDesktopPathRef = useCallback(
    (id: string) => (node: SVGPathElement | null) => {
      desktopPathRefs.current[id] = node;
    },
    [],
  );

  const setMobilePathRef = useCallback(
    (id: string) => (node: SVGPathElement | null) => {
      mobilePathRefs.current[id] = node;
    },
    [],
  );

  useLayoutEffect(() => {
    if (reducedMotion) {
      return;
    }

    ensureMotionPathPlugin();

    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    const boundedProgress = Math.min(Math.max(progress, 0), 1);
    const storyFadeMultiplier = getStoryFadeMultiplier(boundedProgress);

    for (const glyph of glyphs) {
      const node = glyphRefs.current[glyph.id];
      const pathNode = isDesktop
        ? desktopPathRefs.current[glyph.id]
        : mobilePathRefs.current[glyph.id] ?? desktopPathRefs.current[glyph.id];

      if (!node || !pathNode) {
        continue;
      }

      const start = glyph.startProgress ?? 0;
      const end = glyph.endProgress ?? 1;
      const pathProgress = start + (end - start) * boundedProgress;
      const rotation = (glyph.startRotate ?? 0) + ((glyph.endRotate ?? glyph.startRotate ?? 0) - (glyph.startRotate ?? 0)) * boundedProgress;
      const scale = (glyph.startScale ?? 1) + ((glyph.endScale ?? glyph.startScale ?? 1) - (glyph.startScale ?? 1)) * boundedProgress;
      const baseOpacity = (glyph.startOpacity ?? 0.5) + ((glyph.endOpacity ?? glyph.startOpacity ?? 0.5) - (glyph.startOpacity ?? 0.5)) * boundedProgress;
      const opacity = baseOpacity * storyFadeMultiplier;

      gsap.to(node, {
        duration: 0.16,
        ease: 'power2.out',
        overwrite: 'auto',
        motionPath: {
          path: pathNode,
          align: pathNode,
          alignOrigin: [0.5, 0.5],
          autoRotate: false,
          start: pathProgress,
          end: pathProgress,
        },
        rotation,
        scale,
        opacity,
      });
    }
  }, [glyphs, progress, reducedMotion]);

  return {
    setGlyphRef,
    setDesktopPathRef,
    setMobilePathRef,
  };
}

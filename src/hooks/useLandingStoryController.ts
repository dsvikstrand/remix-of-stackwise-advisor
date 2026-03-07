import { useEffect, useMemo, useRef, useState } from 'react';
import { useScroll, useMotionValueEvent, useReducedMotion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { logMvpEvent } from '@/lib/logEvent';
import { LANDING_STORY_SCENES } from '@/lib/landingStory';

function clampSceneIndex(progress: number) {
  const count = LANDING_STORY_SCENES.length;
  const raw = Math.floor(progress * count);
  return Math.max(0, Math.min(count - 1, raw >= count ? count - 1 : raw));
}

export function useLandingStoryController() {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewedScenesRef = useRef(new Set<string>());
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion() ?? false;

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    setScrollProgress(latest);
    setActiveSceneIndex(clampSceneIndex(latest));
  });

  useEffect(() => {
    void logMvpEvent({
      eventName: 'landing_view_v2',
      userId: user?.id,
      path: window.location.pathname,
      metadata: {
        audience: user ? 'signed_in' : 'signed_out',
      },
    });
  }, [user?.id, user]);

  const activeScene = useMemo(
    () => LANDING_STORY_SCENES[activeSceneIndex] ?? LANDING_STORY_SCENES[0],
    [activeSceneIndex],
  );

  useEffect(() => {
    if (!activeScene) return;
    if (viewedScenesRef.current.has(activeScene.id)) return;
    viewedScenesRef.current.add(activeScene.id);
    void logMvpEvent({
      eventName: 'landing_story_step_view',
      userId: user?.id,
      path: window.location.pathname,
      metadata: {
        step_id: activeScene.id,
        step_index: activeSceneIndex,
      },
    });
  }, [activeScene, activeSceneIndex, user?.id]);

  const logHeroCta = (slot: 'primary' | 'secondary' | 'tertiary') => {
    void logMvpEvent({
      eventName: 'landing_hero_cta_click',
      userId: user?.id,
      path: window.location.pathname,
      metadata: {
        slot,
        audience: user ? 'signed_in' : 'signed_out',
        scene_id: activeScene.id,
      },
    });
  };

  const logFinalCta = (slot: 'primary' | 'secondary') => {
    void logMvpEvent({
      eventName: 'landing_final_cta_click',
      userId: user?.id,
      path: window.location.pathname,
      metadata: {
        slot,
        audience: user ? 'signed_in' : 'signed_out',
      },
    });
  };

  const logDemoCta = (demoVariant: string) => {
    void logMvpEvent({
      eventName: 'landing_demo_cta_click',
      userId: user?.id,
      path: window.location.pathname,
      metadata: {
        audience: user ? 'signed_in' : 'signed_out',
        demo_variant: demoVariant,
      },
    });
  };

  return {
    containerRef,
    scrollProgress,
    activeSceneIndex,
    activeScene,
    prefersReducedMotion,
    isSignedIn: Boolean(user),
    logHeroCta,
    logFinalCta,
    logDemoCta,
  };
}

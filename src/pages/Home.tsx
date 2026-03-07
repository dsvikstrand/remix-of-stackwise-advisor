import { useMemo } from 'react';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { useAuth } from '@/contexts/AuthContext';
import { LandingHeroStory } from '@/components/home/landing-v2/LandingHeroStory';
import { LandingProofSections } from '@/components/home/landing-v2/LandingProofSections';
import { useLandingStoryController } from '@/hooks/useLandingStoryController';

export default function Home() {
  const { user } = useAuth();
  const {
    containerRef,
    activeSceneIndex,
    prefersReducedMotion,
    isSignedIn,
    logHeroCta,
    logFinalCta,
    logDemoCta,
  } = useLandingStoryController();

  const bodyClassName = useMemo(
    () =>
      'min-h-screen bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(35_45%_97%)_16%,hsl(var(--background))_100%)]',
    [],
  );

  return (
    <div className={bodyClassName}>
      <AppHeader showFloatingNav={false} />
      <main>
        <LandingHeroStory
          containerRef={containerRef}
          activeSceneIndex={activeSceneIndex}
          isSignedIn={isSignedIn}
          onHeroCtaClick={logHeroCta}
          onDemoCtaClick={logDemoCta}
          prefersReducedMotion={prefersReducedMotion}
        />
        <LandingProofSections
          isSignedIn={Boolean(user)}
          onFinalCtaClick={logFinalCta}
        />
        <div className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-6 lg:px-10">
          <AppFooter />
        </div>
      </main>
    </div>
  );
}

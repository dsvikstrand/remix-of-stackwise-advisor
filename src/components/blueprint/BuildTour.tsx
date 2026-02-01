import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, X, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

const TOUR_STORAGE_KEY = 'blueprint_build_tour_completed';

interface TourStep {
  targetId: string;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: 'picker',
    title: 'Browse Your Inventory',
    description: 'Click on categories to explore items. Select the ones you want to include in your blueprint.',
  },
  {
    targetId: 'add-step',
    title: 'Organize Into Steps',
    description: 'Create steps to organize your routine. Items you select flow into the active step.',
  },
  {
    targetId: 'steps',
    title: 'Manage Your Steps',
    description: 'Click a step to make it active. Add context like dosage or timing to each item.',
  },
  {
    targetId: 'mix',
    title: 'Generate AI Analysis',
    description: 'When you\'re ready, hit Mix to get an AI-powered review of your blueprint!',
  },
];

interface BuildTourProps {
  isActive: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function BuildTour({ isActive, onComplete, onSkip }: BuildTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const step = TOUR_STEPS[currentStep];

  const updateTargetRect = useCallback(() => {
    if (!step) return;
    const element = document.querySelector(`[data-help-id="${step.targetId}"]`);
    if (element) {
      setTargetRect(element.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (!isActive) return;

    updateTargetRect();
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect);

    return () => {
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect);
    };
  }, [isActive, updateTargetRect, currentStep]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, currentStep, onSkip]);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      onComplete();
    }
  }, [currentStep, onComplete]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    onSkip();
  }, [onSkip]);

  if (!isActive || !step) return null;

  const cardPosition = (() => {
    if (!targetRect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const cardWidth = 320;
    const cardHeight = 180;
    const offset = 16;

    // Try positioning below the target
    let top = targetRect.bottom + offset;
    let left = targetRect.left + targetRect.width / 2 - cardWidth / 2;

    // Adjust if card goes off-screen
    if (top + cardHeight > viewportHeight - 20) {
      // Position above instead
      top = targetRect.top - cardHeight - offset;
    }

    if (left < 20) left = 20;
    if (left + cardWidth > viewportWidth - 20) left = viewportWidth - cardWidth - 20;

    return { top: `${top}px`, left: `${left}px` };
  })();

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Dark overlay with spotlight cutout */}
      <div className="absolute inset-0">
        <svg className="w-full h-full">
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - 8}
                  y={targetRect.top - 8}
                  width={targetRect.width + 16}
                  height={targetRect.height + 16}
                  rx="12"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="hsl(var(--background) / 0.8)"
            mask="url(#spotlight-mask)"
            className="animate-in fade-in duration-300"
          />
        </svg>
      </div>

      {/* Spotlight border */}
      {targetRect && (
        <div
          className="absolute rounded-xl border-2 border-primary shadow-glow-aqua pointer-events-none animate-pulse"
          style={{
            left: targetRect.left - 8,
            top: targetRect.top - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}

      {/* Tour card */}
      <Card
        className="fixed w-80 bg-card border-border shadow-lg animate-in slide-in-from-bottom-2 duration-300 z-10"
        style={cardPosition}
      >
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleSkip}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between">
            {/* Progress dots */}
            <div className="flex gap-1.5">
              {TOUR_STEPS.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    'h-1.5 w-1.5 rounded-full transition-colors',
                    index === currentStep ? 'bg-primary' : 'bg-muted-foreground/30'
                  )}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                Skip
              </Button>
              <Button size="sm" onClick={handleNext} className="gap-1">
                {currentStep === TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
                {currentStep < TOUR_STEPS.length - 1 && <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>,
    document.body
  );
}

// First-time tour banner
interface TourBannerProps {
  onStartTour: () => void;
  onDismiss: () => void;
}

export function TourBanner({ onStartTour, onDismiss }: TourBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
  });

  if (dismissed) return null;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Compass className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-medium">New here?</p>
          <p className="text-sm text-muted-foreground">Take a quick tour to learn how to build blueprints.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDismissed(true);
            localStorage.setItem(TOUR_STORAGE_KEY, 'true');
            onDismiss();
          }}
        >
          Maybe later
        </Button>
        <Button size="sm" onClick={onStartTour} className="gap-2">
          <Compass className="h-4 w-4" />
          Take Tour
        </Button>
      </div>
    </div>
  );
}

// Utility to check if tour was completed
export function isTourCompleted(): boolean {
  return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
}

export function resetTour(): void {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}

import { useState, useEffect } from 'react';

const PHASES = [
  { id: 'pour', label: 'Pouring ingredients...', duration: 2000 },
  { id: 'blend', label: 'Blending your shake...', duration: 3000 },
  { id: 'analyze', label: 'Analyzing amino profile...', duration: 2000 },
  { id: 'serve', label: 'Almost ready...', duration: 1500 },
];

export function BlenderLoadingAnimation() {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    const phase = PHASES[phaseIndex];
    if (!phase) return;

    const timer = setTimeout(() => {
      if (phaseIndex < PHASES.length - 1) {
        setPhaseIndex(phaseIndex + 1);
      }
    }, phase.duration);

    return () => clearTimeout(timer);
  }, [phaseIndex]);

  const currentPhase = PHASES[phaseIndex];

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      {/* Blender Container */}
      <div className="relative w-32 h-48 mb-8">
        {/* Blender Jar */}
        <div className="absolute inset-0 bottom-8">
          <svg viewBox="0 0 100 120" className="w-full h-full">
            {/* Jar outline */}
            <path
              d="M20 10 L25 100 L75 100 L80 10 Q80 5 75 5 L25 5 Q20 5 20 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-border"
            />
            {/* Glass effect */}
            <path
              d="M22 12 L26 98 L74 98 L78 12"
              fill="hsl(var(--card))"
              opacity="0.5"
            />
            {/* Liquid fill animation */}
            <rect
              x="26"
              y="98"
              width="48"
              height="0"
              fill="url(#proteinGradient)"
              className={currentPhase.id === 'pour' ? 'animate-protein-fill' : ''}
              style={{
                transform: currentPhase.id !== 'pour' ? 'translateY(-70px)' : undefined,
                height: currentPhase.id !== 'pour' ? '70px' : undefined,
              }}
            />
            {/* Blend vortex */}
            {currentPhase.id === 'blend' && (
              <ellipse
                cx="50"
                cy="60"
                rx="20"
                ry="8"
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                className="animate-spin"
                style={{ transformOrigin: '50px 60px' }}
              />
            )}
            {/* Bubbles */}
            {(currentPhase.id === 'blend' || currentPhase.id === 'analyze') && (
              <>
                <circle cx="35" cy="70" r="3" fill="hsl(var(--primary) / 0.3)" className="animate-bubble-rise" />
                <circle cx="50" cy="80" r="2" fill="hsl(var(--primary) / 0.4)" className="animate-bubble-rise" style={{ animationDelay: '0.3s' }} />
                <circle cx="65" cy="75" r="2.5" fill="hsl(var(--primary) / 0.3)" className="animate-bubble-rise" style={{ animationDelay: '0.6s' }} />
              </>
            )}
            {/* Gradient definition */}
            <defs>
              <linearGradient id="proteinGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--primary) / 0.9)" />
                <stop offset="50%" stopColor="hsl(var(--accent) / 0.7)" />
                <stop offset="100%" stopColor="hsl(var(--primary) / 0.8)" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Blender Base */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-28 h-10 bg-gradient-to-b from-muted to-muted-foreground/30 rounded-lg border border-border flex items-center justify-center">
          <div className={`w-4 h-4 rounded-full ${currentPhase.id === 'blend' ? 'bg-primary animate-pulse' : 'bg-muted-foreground/30'}`} />
        </div>

        {/* Glow effect */}
        {currentPhase.id === 'blend' && (
          <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full animate-pulse" />
        )}
      </div>

      {/* Phase Text */}
      <p className="text-lg font-medium text-foreground animate-pulse">
        {currentPhase.label}
      </p>

      {/* Progress Dots */}
      <div className="flex gap-2 mt-4">
        {PHASES.map((phase, i) => (
          <div
            key={phase.id}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i <= phaseIndex ? 'bg-primary scale-110' : 'bg-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

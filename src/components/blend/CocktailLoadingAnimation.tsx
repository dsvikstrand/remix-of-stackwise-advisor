import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface CocktailLoadingAnimationProps {
  className?: string;
}

const LOADING_MESSAGES = [
  'Analyzing your blend...',
  'Checking synergies...',
  'Reviewing dosages...',
  'Checking interactions...',
  'Finding harmony...',
  'Almost ready...',
];

export function CocktailLoadingAnimation({ className }: CocktailLoadingAnimationProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [phase, setPhase] = useState<'pour' | 'shake' | 'serve'>('pour');

  useEffect(() => {
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);

    const phaseInterval = setInterval(() => {
      setPhase((prev) => {
        if (prev === 'pour') return 'shake';
        if (prev === 'shake') return 'serve';
        return 'pour';
      });
    }, 3000);

    return () => {
      clearInterval(messageInterval);
      clearInterval(phaseInterval);
    };
  }, []);

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 relative overflow-hidden', className)}>
      {/* Ambient glow background */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/10" />
      
      {/* Floating water droplets */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-primary/20 blur-sm animate-float"
            style={{
              width: `${4 + Math.random() * 8}px`,
              height: `${4 + Math.random() * 8}px`,
              left: `${10 + Math.random() * 80}%`,
              top: `${10 + Math.random() * 80}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${4 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Cocktail Animation Container */}
      <div className="relative w-48 h-48 mb-8">
        {/* Glow behind shaker */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={cn(
            'w-32 h-32 rounded-full blur-2xl transition-all duration-1000',
            phase === 'pour' && 'bg-primary/20',
            phase === 'shake' && 'bg-primary/30 scale-110',
            phase === 'serve' && 'bg-accent/25 scale-105'
          )} />
        </div>

        {/* Shaker */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-all duration-500',
            phase === 'shake' && 'animate-[shake_0.3s_ease-in-out_infinite]'
          )}
        >
          <svg viewBox="0 0 100 120" className="w-36 h-36 drop-shadow-lg">
            {/* Gradients */}
            <defs>
              {/* Chrome/metallic gradient */}
              <linearGradient id="chromeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(200, 15%, 70%)" />
                <stop offset="30%" stopColor="hsl(195, 20%, 85%)" />
                <stop offset="50%" stopColor="hsl(195, 25%, 92%)" />
                <stop offset="70%" stopColor="hsl(195, 20%, 85%)" />
                <stop offset="100%" stopColor="hsl(200, 15%, 70%)" />
              </linearGradient>
              
              {/* Aqua liquid gradient */}
              <linearGradient id="liquidGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="hsl(185, 60%, 65%)" stopOpacity="0.8" />
                <stop offset="50%" stopColor="hsl(185, 55%, 50%)" stopOpacity="0.9" />
                <stop offset="100%" stopColor="hsl(190, 50%, 45%)" stopOpacity="1" />
              </linearGradient>

              {/* Frosted glass effect */}
              <filter id="frosted">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" />
              </filter>
            </defs>

            {/* Shaker cap - chrome */}
            <path
              d="M30 15 L70 15 L65 30 L35 30 Z"
              fill="url(#chromeGradient)"
            />
            <ellipse cx="50" cy="15" rx="20" ry="5" fill="url(#chromeGradient)" />
            <ellipse cx="50" cy="15" rx="20" ry="5" fill="white" fillOpacity="0.3" />

            {/* Shaker body - frosted silver */}
            <path
              d="M35 30 L30 100 L70 100 L65 30 Z"
              fill="url(#chromeGradient)"
            />
            
            {/* Glass highlight */}
            <path
              d="M35 30 L30 100 L40 100 L45 30 Z"
              fill="white"
              fillOpacity="0.15"
            />

            {/* Liquid inside - aqua */}
            <path
              d={
                phase === 'pour'
                  ? 'M36 85 L69 85 L68 95 L33 95 Z'
                  : phase === 'shake'
                  ? 'M34 45 L66 50 L68 95 L33 95 Z'
                  : 'M35 55 L65 55 L68 95 L33 95 Z'
              }
              fill="url(#liquidGradient)"
              className="transition-all duration-700 ease-out"
            />

            {/* Liquid surface shimmer */}
            <ellipse 
              cx="50" 
              cy={phase === 'pour' ? 85 : phase === 'shake' ? 47 : 55}
              rx="16" 
              ry="3" 
              fill="white" 
              fillOpacity="0.3"
              className="transition-all duration-700"
            />

            {/* Bubbles during shake */}
            {phase === 'shake' && (
              <>
                <circle cx="42" cy="60" r="3" fill="white" fillOpacity="0.5" className="animate-ping" />
                <circle cx="55" cy="68" r="2" fill="white" fillOpacity="0.4" className="animate-ping" style={{ animationDelay: '0.2s' }} />
                <circle cx="48" cy="78" r="2.5" fill="white" fillOpacity="0.45" className="animate-ping" style={{ animationDelay: '0.4s' }} />
                <circle cx="58" cy="85" r="2" fill="white" fillOpacity="0.35" className="animate-ping" style={{ animationDelay: '0.6s' }} />
              </>
            )}
            
            {/* Edge highlight */}
            <path
              d="M65 30 L70 100"
              stroke="white"
              strokeWidth="1"
              strokeOpacity="0.3"
            />
          </svg>
        </div>

        {/* Falling ingredients during pour phase - water droplet style */}
        {phase === 'pour' && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full bg-gradient-to-b from-primary/70 to-primary/40 backdrop-blur-sm animate-[fall_1.2s_ease-in_infinite]"
                style={{
                  width: `${6 + Math.random() * 6}px`,
                  height: `${8 + Math.random() * 8}px`,
                  left: `${35 + Math.random() * 30}%`,
                  animationDelay: `${i * 0.2}s`,
                  borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
                }}
              />
            ))}
          </div>
        )}

        {/* Sparkles during serve phase - ethereal */}
        {phase === 'serve' && (
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 rounded-full bg-primary shadow-glow-aqua animate-pulse-soft"
                style={{
                  left: `${15 + Math.random() * 70}%`,
                  top: `${15 + Math.random() * 50}%`,
                  animationDelay: `${i * 0.2}s`,
                  boxShadow: '0 0 8px hsl(185, 55%, 50%)',
                }}
              />
            ))}
          </div>
        )}

        {/* Ice cubes - frosted glass style */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-4 h-4 rounded bg-gradient-to-br from-white/70 to-secondary/50 border border-white/30 backdrop-blur-sm shadow-sm',
                phase === 'shake' && 'animate-bounce'
              )}
              style={{ 
                animationDelay: `${i * 0.1}s`,
                transform: `rotate(${i * 15 - 15}deg)`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Loading Text */}
      <div className="text-center space-y-3 relative z-10">
        <p className="text-lg font-medium text-foreground animate-pulse-soft tracking-wide">
          {LOADING_MESSAGES[messageIndex]}
        </p>
        <div className="flex items-center justify-center gap-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary/70 animate-bounce shadow-glow-aqua"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>

      {/* Custom keyframes */}
      <style>{`
        @keyframes fall {
          0% { transform: translateY(-20px) scale(0.8); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 0.6; }
          100% { transform: translateY(120px) scale(1); opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(-4px) rotate(-2deg); }
          75% { transform: translateX(4px) rotate(2deg); }
        }
      `}</style>
    </div>
  );
}
import { FlaskConical, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MixButtonProps {
  onClick: () => void;
  disabled: boolean;
  isLoading: boolean;
  itemCount: number;
}

export function MixButton({ onClick, disabled, isLoading, itemCount }: MixButtonProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={onClick}
        disabled={disabled || isLoading}
        className={cn(
          "relative w-28 h-28 rounded-full transition-all duration-500",
          "bg-gradient-to-br from-primary via-primary/90 to-primary/70",
          "border-2 border-primary/30",
          "flex items-center justify-center",
          "shadow-glow-aqua",
          "group",
          disabled && !isLoading && "opacity-40 cursor-not-allowed shadow-none",
          !disabled && !isLoading && "hover:scale-105 hover:shadow-[0_0_60px_hsl(185_55%_50%/0.5)] animate-glow-pulse",
          isLoading && "animate-pulse cursor-wait"
        )}
      >
        {/* Outer glow ring */}
        {!disabled && !isLoading && (
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-30" />
        )}
        
        {/* Inner content */}
        <div className="relative z-10 flex flex-col items-center gap-1">
          {isLoading ? (
            <Loader2 className="h-10 w-10 text-primary-foreground animate-spin" />
          ) : (
            <>
              <FlaskConical className="h-10 w-10 text-primary-foreground group-hover:rotate-12 transition-transform duration-300" />
              <span className="text-xs font-bold text-primary-foreground/90 uppercase tracking-widest">
                Mix
              </span>
            </>
          )}
        </div>

        {/* Iridescent border effect */}
        {!disabled && (
          <div className="absolute inset-0 rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-300">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary via-accent to-primary animate-iridescent" style={{ padding: '2px' }}>
              <div className="w-full h-full rounded-full bg-primary" />
            </div>
          </div>
        )}
      </button>

      {/* Status text */}
      <p className={cn(
        "text-sm font-medium transition-colors",
        disabled && !isLoading ? "text-muted-foreground" : "text-foreground"
      )}>
        {isLoading 
          ? "Analyzing your blend..." 
          : itemCount === 0 
            ? "Add ingredients to mix" 
            : `Ready to mix ${itemCount} ingredient${itemCount !== 1 ? 's' : ''}`
        }
      </p>
    </div>
  );
}

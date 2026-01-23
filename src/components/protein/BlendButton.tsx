import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BlendButtonProps {
  onClick: () => void;
  disabled: boolean;
  isLoading: boolean;
  itemCount: number;
}

export function BlendButton({ onClick, disabled, isLoading, itemCount }: BlendButtonProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Main Button */}
      <button
        onClick={onClick}
        disabled={disabled || isLoading}
        className={cn(
          'relative w-32 h-32 rounded-full transition-all duration-300 group',
          'flex flex-col items-center justify-center gap-1',
          'font-bold text-lg tracking-wide',
          disabled || isLoading
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-gradient-to-br from-primary via-primary to-accent text-primary-foreground shadow-glow-aqua hover:scale-105 hover:shadow-glow-aqua-lg active:scale-95'
        )}
      >
        {/* Outer glow ring */}
        {!disabled && !isLoading && (
          <span className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse-soft -z-10" />
        )}

        {/* Spinning border effect on hover */}
        {!disabled && !isLoading && (
          <span className="absolute inset-[-3px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 iridescent-border" />
        )}

        {/* Content */}
        {isLoading ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : (
          <>
            {/* Blender Icon */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-8 w-8"
            >
              <path d="M6 4h12l-1 14H7L6 4z" />
              <path d="M5 4h14" />
              <rect x="8" y="18" width="8" height="2" rx="1" />
              <path d="M12 8v4" />
              <path d="M10 10h4" />
            </svg>
            <span>BLEND</span>
          </>
        )}
      </button>

      {/* Status Text */}
      <p className="text-sm text-muted-foreground text-center max-w-[200px]">
        {isLoading
          ? 'Analyzing your shake...'
          : itemCount === 0
          ? 'Add protein sources to blend'
          : `Ready to blend ${itemCount} source${itemCount !== 1 ? 's' : ''}`}
      </p>
    </div>
  );
}

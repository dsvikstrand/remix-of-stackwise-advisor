import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { X, HelpCircle, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TooltipPosition {
  id: string;
  text: string;
  x: number;
  y: number;
  side: 'top' | 'bottom' | 'left' | 'right';
}

const HELP_DEFINITIONS: Array<{ id: string; text: string }> = [
  { id: 'keywords', text: 'Describe what kind of inventory you want to create' },
  { id: 'generate', text: 'AI generates categories and items for you' },
  { id: 'advanced-options', text: 'Customize how AI generates your inventory' },
  { id: 'edit-categories', text: 'Rename, add, or remove categories and items' },
  { id: 'tags', text: 'Help others discover your inventory with tags' },
  { id: 'publish', text: 'Create your inventory and start building' },
];

interface InventoryCreateHelpOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTour: () => void;
}

export function InventoryCreateHelpOverlay({ isOpen, onClose, onStartTour }: InventoryCreateHelpOverlayProps) {
  const [tooltips, setTooltips] = useState<TooltipPosition[]>([]);

  const calculatePositions = useCallback(() => {
    const positions: TooltipPosition[] = [];

    HELP_DEFINITIONS.forEach(({ id, text }) => {
      const element = document.querySelector(`[data-help-id="${id}"]`);
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Determine best side for tooltip
      let side: 'top' | 'bottom' | 'left' | 'right' = 'right';
      let x = rect.right + 12;
      let y = rect.top + rect.height / 2;

      // Check if right side has enough space
      if (rect.right + 200 > viewportWidth) {
        // Try left
        if (rect.left > 200) {
          side = 'left';
          x = rect.left - 12;
        } else {
          // Try bottom
          side = 'bottom';
          x = rect.left + rect.width / 2;
          y = rect.bottom + 12;
        }
      }

      // Adjust if too close to top/bottom
      if (side === 'left' || side === 'right') {
        if (y < 50) y = 50;
        if (y > viewportHeight - 50) y = viewportHeight - 50;
      }

      positions.push({ id, text, x, y, side });
    });

    setTooltips(positions);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(calculatePositions, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, calculatePositions]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', calculatePositions);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', calculatePositions);
    };
  }, [isOpen, onClose, calculatePositions]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Floating tooltips */}
      {tooltips.map((tooltip) => (
        <div
          key={tooltip.id}
          className={cn(
            'fixed z-50 max-w-[200px] rounded-lg bg-foreground text-background px-3 py-2 text-sm shadow-lg animate-in fade-in zoom-in-95 duration-200',
            tooltip.side === 'left' && '-translate-x-full',
            tooltip.side === 'top' && '-translate-y-full -translate-x-1/2',
            tooltip.side === 'bottom' && '-translate-x-1/2',
            (tooltip.side === 'left' || tooltip.side === 'right') && '-translate-y-1/2'
          )}
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          {tooltip.text}
          {/* Arrow */}
          <div
            className={cn(
              'absolute w-2 h-2 bg-foreground rotate-45',
              tooltip.side === 'right' && '-left-1 top-1/2 -translate-y-1/2',
              tooltip.side === 'left' && '-right-1 top-1/2 -translate-y-1/2',
              tooltip.side === 'bottom' && '-top-1 left-1/2 -translate-x-1/2',
              tooltip.side === 'top' && '-bottom-1 left-1/2 -translate-x-1/2'
            )}
          />
        </div>
      ))}

      {/* Help panel */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border border-border rounded-2xl shadow-lg p-4 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HelpCircle className="h-4 w-4" />
            <span>Hover over highlighted elements</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClose();
              onStartTour();
            }}
            className="gap-2"
          >
            <Compass className="h-4 w-4" />
            Take a tour
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Help button to trigger the overlay
interface InventoryHelpButtonProps {
  onClick: () => void;
}

export function InventoryHelpButton({ onClick }: InventoryHelpButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      className="h-9 w-9 rounded-full border-dashed"
      aria-label="Show help"
    >
      <HelpCircle className="h-4 w-4" />
    </Button>
  );
}

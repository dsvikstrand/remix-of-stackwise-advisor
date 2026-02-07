import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface DemoBlueprintPreviewProps {
  title: string;
  selectedItems: Record<string, string[]>;
  itemContexts: Record<string, string>;
  onContinue: () => void;
  isAuthenticated: boolean;
}

const TEASER_REVIEW = {
  overview:
    'Great combination! These items work well together to support your daily routine with balanced coverage across key areas.',
  strengths:
    'This selection addresses multiple pillars — consistency, timing, and synergy. Well-structured for sustainable results.',
};

export function DemoBlueprintPreview({
  title,
  selectedItems,
  itemContexts,
  onContinue,
  isAuthenticated,
}: DemoBlueprintPreviewProps) {
  const allItems = Object.entries(selectedItems).flatMap(([cat, items]) =>
    items.map((item) => ({ category: cat, item, context: itemContexts[`${cat}::${item}`] }))
  );

  if (allItems.length === 0) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5 space-y-4 animate-fade-in">
      {/* Blueprint header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Your Blueprint Preview</h3>
      </div>

      {/* Title */}
      <p className="text-lg font-bold tracking-tight">{title}</p>

      {/* Selected items as badges */}
      <div className="flex flex-wrap gap-1.5">
        {allItems.map(({ category, item, context }) => (
          <Badge
            key={`${category}::${item}`}
            variant="secondary"
            className="text-xs gap-1 animate-scale-in"
          >
            {item}
            {context && (
              <span className="text-muted-foreground font-normal">· {context}</span>
            )}
          </Badge>
        ))}
      </div>

      {/* Blurred AI review teaser */}
      <div className="relative rounded-xl border border-border/50 overflow-hidden">
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">AI Review</p>
          </div>
          <p className={cn('text-sm text-muted-foreground', allItems.length < 3 && 'blur-[3px] select-none')}>
            {TEASER_REVIEW.overview}
          </p>
          <p className="text-sm text-muted-foreground blur-[3px] select-none">
            {TEASER_REVIEW.strengths}
          </p>
        </div>
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-card/90 flex items-end justify-center pb-4">
          <Link to="/auth">
            <Button size="sm" className="gap-2 shadow-lg">
              {isAuthenticated ? (
                <>
                  Continue building
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  Sign in for full AI review
                </>
              )}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats hint */}
      <p className="text-xs text-muted-foreground/70 text-center">
        {allItems.length} item{allItems.length !== 1 ? 's' : ''} selected · {isAuthenticated ? 'Ready to analyze' : 'Sign in to unlock everything'}
      </p>
    </div>
  );
}

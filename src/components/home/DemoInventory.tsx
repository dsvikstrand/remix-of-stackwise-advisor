import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowRight, ChevronDown, Sparkles } from 'lucide-react';

// Static demo data based on the Blend inventory
const DEMO_CATEGORIES = [
  {
    name: 'Foundational',
    items: ['Vitamin D3', 'Omega-3', 'Magnesium', 'B-Complex'],
  },
  {
    name: 'Performance',
    items: ['Creatine', 'Caffeine', 'L-Theanine', 'Beta-Alanine'],
  },
  {
    name: 'Recovery',
    items: ['Ashwagandha', 'Zinc', 'Tart Cherry', 'Collagen'],
  },
];

// Static example AI review (no API calls)
const EXAMPLE_REVIEW = {
  overview: `Great foundational stack! Vitamin D3 + Omega-3 provide key anti-inflammatory and immune support. Adding Magnesium covers a common deficiency that affects sleep and muscle function.`,
  strengths: `This combination addresses multiple health pillars—energy, recovery, and cognitive function. The Caffeine + L-Theanine pairing is a well-researched synergy for focused alertness without jitters.`,
  suggestion: `Consider timing: take Vitamin D3 with a fat-containing meal for better absorption. Magnesium works best in the evening to support sleep quality.`,
};

export function DemoInventory() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);

  const toggleItem = (item: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      // Auto-expand review when items selected
      if (next.size >= 2 && !reviewOpen) {
        setReviewOpen(true);
      }
      return next;
    });
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Try It Out</h2>
        <Badge variant="secondary" className="text-xs">Demo</Badge>
      </div>
      <Card className="bg-card/60 backdrop-blur-sm border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Sample Supplement Library
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select items and see how blueprints work. Sign up to build your own!
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {DEMO_CATEGORIES.map((cat) => (
              <div key={cat.name} className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{cat.name}</h4>
                <div className="space-y-1.5">
                  {cat.items.map((item) => (
                    <label
                      key={item}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:text-primary transition-colors"
                    >
                      <Checkbox
                        checked={selected.has(item)}
                        onCheckedChange={() => toggleItem(item)}
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="pt-2 border-t border-border/50 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {[...selected].map((item) => (
                  <Badge key={item} variant="default" className="text-xs">
                    {item}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selected.size} item{selected.size !== 1 ? 's' : ''} selected
              </p>
            </div>
          )}

          {/* Static AI Review Preview */}
          {selected.size >= 2 && (
            <Collapsible open={reviewOpen} onOpenChange={setReviewOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-primary hover:text-primary/80"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Example AI Review
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${reviewOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div>
                    <h5 className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Overview</h5>
                    <p className="text-sm text-muted-foreground">{EXAMPLE_REVIEW.overview}</p>
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Strengths</h5>
                    <p className="text-sm text-muted-foreground">{EXAMPLE_REVIEW.strengths}</p>
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Suggestion</h5>
                    <p className="text-sm text-muted-foreground">{EXAMPLE_REVIEW.suggestion}</p>
                  </div>
                  <p className="text-xs text-muted-foreground/70 italic pt-2 border-t border-border/30">
                    This is a static preview. Sign up to generate personalized AI reviews!
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Link to="/auth">
              <Button size="sm" className="gap-1.5">
                Sign up to build
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link to="/inventory">
              <Button size="sm" variant="outline">
                Browse inventories
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

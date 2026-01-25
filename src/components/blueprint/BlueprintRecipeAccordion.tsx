import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BlueprintRecipeAccordionProps {
  title: string;
  selectedItems: Record<string, string[]>;
  onRemoveItem: (categoryName: string, item: string) => void;
  onClear: () => void;
}

export function BlueprintRecipeAccordion({
  title,
  selectedItems,
  onRemoveItem,
  onClear,
}: BlueprintRecipeAccordionProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Flatten items for display
  const flatItems = Object.entries(selectedItems).flatMap(([category, items]) =>
    items.map((item) => ({ category, item }))
  );

  const itemCount = flatItems.length;

  if (itemCount === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-4 rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 cursor-pointer hover:bg-card/80 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">{title || 'Your Selection'}</span>
            <Badge variant="secondary" className="text-xs">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </Badge>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2">
        <div className="bg-card/40 backdrop-blur-sm rounded-xl border border-border/30 overflow-hidden">
          <div className="divide-y divide-border/20">
            {flatItems.map(({ category, item }) => (
              <div
                key={`${category}-${item}`}
                className="flex items-center justify-between p-3 hover:bg-accent/5 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item}</p>
                  <p className="text-xs text-muted-foreground">{category}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveItem(category, item);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-border/30 flex justify-end bg-card/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-destructive hover:text-destructive gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Clear All
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

import { cn } from '@/lib/utils';

interface Category {
  name: string;
  items: string[];
}

interface DemoPillPickerProps {
  categories: Category[];
  selectedItems: Record<string, string[]>;
  onToggleItem: (categoryName: string, item: string) => void;
  animatingItems?: Set<string>;
}

export function DemoPillPicker({
  categories,
  selectedItems,
  onToggleItem,
  animatingItems,
}: DemoPillPickerProps) {
  return (
    <div className="space-y-4">
      {categories.map((cat) => (
        <div key={cat.name} className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {cat.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {cat.items.map((item) => {
              const isSelected = (selectedItems[cat.name] || []).includes(item);
              const isAnimating = animatingItems?.has(`${cat.name}::${item}`);

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onToggleItem(cat.name, item)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-300 cursor-pointer select-none',
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary shadow-md scale-105'
                      : 'bg-secondary/50 text-secondary-foreground border-border/50 hover:border-primary/50 hover:bg-secondary',
                    isAnimating && 'animate-scale-in ring-2 ring-primary/40'
                  )}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

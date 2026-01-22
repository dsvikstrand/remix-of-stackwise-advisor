import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BlendRecipe, BlendItem, DoseUnit, CATEGORY_LABELS } from '@/types/stacklab';
import { ChevronDown, Edit2, X, Trash2, Beaker } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BlendRecipeAccordionProps {
  blend: BlendRecipe | null;
  onUpdateName: (name: string) => void;
  onUpdateItem: (itemId: string, amount: number, unit: DoseUnit) => void;
  onRemoveItem: (itemId: string) => void;
  onClear: () => void;
}

const UNITS: DoseUnit[] = ['mg', 'g', 'mcg', 'IU', 'ml', 'scoop'];

export function BlendRecipeAccordion({
  blend,
  onUpdateName,
  onUpdateItem,
  onRemoveItem,
  onClear,
}: BlendRecipeAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BlendItem | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editUnit, setEditUnit] = useState<DoseUnit>('mg');

  const handleStartEdit = (item: BlendItem) => {
    setEditingItem(item);
    setEditAmount(item.amount);
    setEditUnit(item.unit);
  };

  const handleSaveEdit = () => {
    if (editingItem && editAmount > 0) {
      onUpdateItem(editingItem.id, editAmount, editUnit);
      setEditingItem(null);
    }
  };

  const itemCount = blend?.items.length || 0;

  if (!blend) {
    return null;
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="bg-card/60 backdrop-blur-glass rounded-2xl border border-border/50 shadow-soft overflow-hidden">
          <CollapsibleTrigger asChild>
            <button className="w-full p-4 flex items-center justify-between hover:bg-accent/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/80 to-primary/50 flex items-center justify-center">
                  <Beaker className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-lg tracking-tight">{blend.name || 'My Blend'}</h3>
                  <p className="text-sm text-muted-foreground">
                    {itemCount === 0 
                      ? 'No ingredients yet' 
                      : `${itemCount} ingredient${itemCount !== 1 ? 's' : ''} selected`
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {itemCount > 0 && (
                  <Badge variant="secondary" className="font-mono">
                    {itemCount}
                  </Badge>
                )}
                <ChevronDown 
                  className={cn(
                    "h-5 w-5 text-muted-foreground transition-transform duration-300",
                    isOpen && "rotate-180"
                  )} 
                />
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
            <div className="px-4 pb-4 space-y-3">
              {/* Blend name input */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/30">
                <Input
                  value={blend.name}
                  onChange={(e) => onUpdateName(e.target.value)}
                  className="h-8 bg-transparent border-none text-sm font-medium focus-visible:ring-0"
                  placeholder="Blend Name"
                />
              </div>

              {/* Items list */}
              {itemCount === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <p className="text-sm">Add supplements from the inventory above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blend.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-accent/40 group"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {CATEGORY_LABELS[item.category]}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {item.amount} {item.unit}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleStartEdit(item)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={() => onRemoveItem(item.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Clear button */}
              {itemCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-destructive"
                  onClick={onClear}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Edit Modal */}
      <Dialog open={!!editingItem} onOpenChange={(o) => !o && setEditingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editingItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount</Label>
              <div className="flex gap-2">
                <Input
                  id="edit-amount"
                  type="number"
                  min="0"
                  step="any"
                  value={editAmount}
                  onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
                  className="flex-1"
                />
                <Select value={editUnit} onValueChange={(v) => setEditUnit(v as DoseUnit)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editAmount <= 0}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

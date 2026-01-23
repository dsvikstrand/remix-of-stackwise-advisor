import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ChevronDown, Edit2, X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShakeRecipe, ShakeItem, PROTEIN_CATEGORY_LABELS } from '@/types/stacklab';

interface ProteinRecipeAccordionProps {
  shake: ShakeRecipe | null;
  onUpdateItem: (itemId: string, scoops: number, gramsProtein: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClear: () => void;
}

export function ProteinRecipeAccordion({
  shake,
  onUpdateItem,
  onRemoveItem,
  onClear,
}: ProteinRecipeAccordionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [editingItem, setEditingItem] = useState<ShakeItem | null>(null);
  const [editScoops, setEditScoops] = useState(1);

  if (!shake) return null;

  const itemCount = shake.items.length;

  const handleStartEdit = (item: ShakeItem) => {
    setEditingItem(item);
    setEditScoops(item.scoops);
  };

  const handleSaveEdit = () => {
    if (!editingItem || editScoops <= 0) return;
    const gramsProtein = editScoops * (editingItem.gramsProtein / editingItem.scoops);
    onUpdateItem(editingItem.id, editScoops, gramsProtein);
    setEditingItem(null);
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 cursor-pointer hover:bg-card/80 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">Your Shake</span>
              <Badge variant="secondary" className="text-xs">
                {itemCount} {itemCount === 1 ? 'source' : 'sources'}
              </Badge>
              {shake.totalProtein > 0 && (
                <Badge variant="outline" className="text-xs font-mono">
                  {shake.totalProtein.toFixed(0)}g protein
                </Badge>
              )}
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
            {itemCount === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">
                No protein sources added yet. Select from above to build your shake.
              </p>
            ) : (
              <div className="divide-y divide-border/20">
                {shake.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 hover:bg-accent/5 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.scoops} {item.scoops === 1 ? 'scoop' : 'scoops'} • {item.gramsProtein.toFixed(0)}g protein
                        <span className="ml-2 opacity-60">
                          ({PROTEIN_CATEGORY_LABELS[item.category]})
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(item);
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveItem(item.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {itemCount > 0 && (
              <div className="p-3 border-t border-border/30 flex justify-between items-center bg-card/30">
                <span className="text-sm font-semibold text-foreground">
                  Total: {shake.totalProtein.toFixed(0)}g protein
                </span>
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
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Edit Scoops Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-scoops">Number of Scoops</Label>
              <Input
                id="edit-scoops"
                type="number"
                value={editScoops}
                onChange={(e) => setEditScoops(Number(e.target.value))}
                min={0.5}
                max={10}
                step={0.5}
              />
            </div>
            {editingItem && (
              <p className="text-sm text-muted-foreground">
                = {(editScoops * (editingItem.gramsProtein / editingItem.scoops)).toFixed(0)}g protein
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useEffect, useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Check } from 'lucide-react';

interface Category {
  name: string;
  items: string[];
}

interface BlueprintItemPickerProps {
  categories: Category[];
  selectedItems: Record<string, string[]>;
  onToggleItem: (categoryName: string, item: string) => void;
  onAddCustomItem: (categoryName: string, item: string) => void;
}

export function BlueprintItemPicker({
  categories,
  selectedItems,
  onToggleItem,
  onAddCustomItem,
}: BlueprintItemPickerProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.name || '');
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<string>(categories[0]?.name || '');

  useEffect(() => {
    if (activeCategory) return;
    if (categories.length === 0) return;
    setActiveCategory(categories[0].name);
    setCustomCategory(categories[0].name);
  }, [activeCategory, categories]);

  // Get selected item IDs as a flat set for quick lookup
  const selectedSet = useMemo(() => {
    const set = new Set<string>();
    Object.entries(selectedItems).forEach(([cat, items]) => {
      items.forEach((item) => set.add(`${cat}::${item}`));
    });
    return set;
  }, [selectedItems]);

  const handleAddCustom = () => {
    if (!customName.trim() || !customCategory) return;
    onAddCustomItem(customCategory, customName.trim());
    setCustomName('');
    setCustomDialogOpen(false);
  };

  const activeItems = useMemo(() => {
    const category = categories.find((c) => c.name === activeCategory);
    if (!category) return [];
    if (!search.trim()) return category.items;
    const lowerSearch = search.toLowerCase();
    return category.items.filter((item) => item.toLowerCase().includes(lowerSearch));
  }, [categories, activeCategory, search]);

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No categories available in this library.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search + Add Custom */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Custom Item</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="custom-item-name">Item Name</Label>
                <Input
                  id="custom-item-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. My Custom Item"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={customCategory} onValueChange={setCustomCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.name} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddCustom} className="w-full">
                Add Item
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="w-full h-auto flex-wrap gap-1 bg-transparent p-0">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat.name}
              value={cat.name}
              className="text-xs px-2 py-0.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-normal"
            >
              {cat.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((cat) => (
          <TabsContent key={cat.name} value={cat.name} className="mt-3">
            <div className="flex flex-wrap gap-2">
              {activeItems.map((item) => {
                const isSelected = selectedSet.has(`${cat.name}::${item}`);
                return (
                  <Badge
                    key={item}
                    variant={isSelected ? 'default' : 'outline'}
                    className={`cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-primary hover:bg-primary/90'
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                    onClick={() => onToggleItem(cat.name, item)}
                  >
                    {isSelected && <Check className="h-3 w-3 mr-1" />}
                    {item}
                  </Badge>
                );
              })}
              {activeItems.length === 0 && (
                <p className="text-sm text-muted-foreground">No items found</p>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

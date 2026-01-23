import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Check } from 'lucide-react';
import {
  ProteinCategory,
  PROTEIN_CATALOG,
  PROTEIN_CATEGORY_LABELS,
} from '@/types/stacklab';

interface ProteinSourcePickerProps {
  selectedIds: Set<string>;
  onSelect: (proteinId: string, name: string, category: ProteinCategory, proteinPerServing: number) => void;
}

export function ProteinSourcePicker({ selectedIds, onSelect }: ProteinSourcePickerProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<ProteinCategory>('whey-casein');
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<ProteinCategory>('whey-casein');
  const [customProtein, setCustomProtein] = useState(20);

  const categories = Object.keys(PROTEIN_CATALOG) as ProteinCategory[];

  const handleAddCustom = () => {
    if (!customName.trim()) return;
    const customId = `custom-${Date.now()}`;
    onSelect(customId, customName.trim(), customCategory, customProtein);
    setCustomName('');
    setCustomProtein(20);
    setCustomDialogOpen(false);
  };

  const filteredSources = useMemo(() => {
    const sources = PROTEIN_CATALOG[activeCategory];
    if (!search.trim()) return sources;
    const lowerSearch = search.toLowerCase();
    return sources.filter((s) => s.name.toLowerCase().includes(lowerSearch));
  }, [activeCategory, search]);

  return (
    <div className="space-y-4">
      {/* Search + Add Custom */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search protein sources..."
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
              <DialogTitle>Add Custom Protein Source</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="custom-protein-name">Protein Name</Label>
                <Input
                  id="custom-protein-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. MyBrand Whey Isolate"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={customCategory} onValueChange={(v) => setCustomCategory(v as ProteinCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {PROTEIN_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-protein-grams">Protein per Serving (g)</Label>
                <Input
                  id="custom-protein-grams"
                  type="number"
                  value={customProtein}
                  onChange={(e) => setCustomProtein(Number(e.target.value))}
                  min={0}
                  max={100}
                />
              </div>
              <Button onClick={handleAddCustom} className="w-full">
                Add to Shake
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as ProteinCategory)}>
        <TabsList className="w-full h-auto flex-wrap gap-1 bg-transparent p-0">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat}
              value={cat}
              className="text-xs px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {PROTEIN_CATEGORY_LABELS[cat]}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-3">
            <div className="flex flex-wrap gap-2">
              {filteredSources.map((source) => {
                const isSelected = selectedIds.has(source.id);
                return (
                  <Badge
                    key={source.id}
                    variant={isSelected ? 'default' : 'outline'}
                    className={`cursor-pointer transition-all group ${
                      isSelected
                        ? 'bg-primary hover:bg-primary/90'
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                    onClick={() => onSelect(source.id, source.name, source.category, source.proteinPerServing)}
                  >
                    {isSelected && <Check className="h-3 w-3 mr-1" />}
                    <span>{source.name}</span>
                    <span className="ml-1 text-xs opacity-60">({source.proteinPerServing}g)</span>
                  </Badge>
                );
              })}
              {filteredSources.length === 0 && (
                <p className="text-sm text-muted-foreground">No protein sources found</p>
              )}
            </div>
            {/* Amino Highlights Legend */}
            {filteredSources.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/30">
                <p className="text-xs text-muted-foreground mb-2">Amino Highlights:</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set(filteredSources.flatMap((s) => s.aminoHighlights || []))).slice(0, 6).map((highlight) => (
                    <span key={highlight} className="text-xs bg-accent/30 text-accent-foreground px-2 py-0.5 rounded-full">
                      {highlight}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

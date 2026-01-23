import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ProteinDoseModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (scoops: number, gramsProtein: number) => void;
  proteinName: string;
  proteinPerServing: number;
}

export function ProteinDoseModal({
  open,
  onClose,
  onConfirm,
  proteinName,
  proteinPerServing,
}: ProteinDoseModalProps) {
  const [mode, setMode] = useState<'scoops' | 'grams'>('grams');
  const [scoops, setScoops] = useState(1);
  const [grams, setGrams] = useState(proteinPerServing);

  const handleConfirm = () => {
    if (mode === 'scoops') {
      if (scoops <= 0) return;
      const gramsProtein = scoops * proteinPerServing;
      onConfirm(scoops, gramsProtein);
    } else {
      if (grams <= 0) return;
      // Calculate equivalent scoops for display purposes
      const equivalentScoops = grams / proteinPerServing;
      onConfirm(equivalentScoops, grams);
    }
    setScoops(1);
    setGrams(proteinPerServing);
  };

  const calculatedFromScoops = scoops * proteinPerServing;
  const calculatedFromGrams = grams / proteinPerServing;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {proteinName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'scoops' | 'grams')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="grams">Grams</TabsTrigger>
              <TabsTrigger value="scoops">Scoops</TabsTrigger>
            </TabsList>

            <TabsContent value="grams" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="grams-input">Protein (grams)</Label>
                <Input
                  id="grams-input"
                  type="number"
                  value={grams}
                  onChange={(e) => setGrams(Number(e.target.value))}
                  min={1}
                  max={500}
                  step={1}
                />
              </div>
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-sm text-muted-foreground">
                  <span className="font-bold text-foreground">{grams}g protein</span>
                  <span className="ml-2 opacity-60">
                    (~{calculatedFromGrams.toFixed(1)} scoops)
                  </span>
                </p>
              </div>
            </TabsContent>

            <TabsContent value="scoops" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="scoops-input">Number of Scoops</Label>
                <Input
                  id="scoops-input"
                  type="number"
                  value={scoops}
                  onChange={(e) => setScoops(Number(e.target.value))}
                  min={0.5}
                  max={10}
                  step={0.5}
                />
              </div>
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-sm text-muted-foreground">
                  {scoops} {scoops === 1 ? 'scoop' : 'scoops'} = <span className="font-bold text-foreground">{calculatedFromScoops.toFixed(0)}g protein</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ({proteinPerServing}g per serving)
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={(mode === 'scoops' && scoops <= 0) || (mode === 'grams' && grams <= 0)}>
            Add to Shake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

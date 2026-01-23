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
  const [scoops, setScoops] = useState(1);

  const handleConfirm = () => {
    if (scoops <= 0) return;
    const gramsProtein = scoops * proteinPerServing;
    onConfirm(scoops, gramsProtein);
    setScoops(1);
  };

  const totalProtein = scoops * proteinPerServing;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {proteinName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="scoops">Number of Scoops</Label>
            <Input
              id="scoops"
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
              {scoops} {scoops === 1 ? 'scoop' : 'scoops'} = <span className="font-bold text-foreground">{totalProtein.toFixed(0)}g protein</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ({proteinPerServing}g per serving)
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={scoops <= 0}>
            Add to Shake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

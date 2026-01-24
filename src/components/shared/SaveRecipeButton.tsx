import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRecipes, RecipeType } from '@/hooks/useRecipes';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, Share2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

interface SaveRecipeButtonProps {
  recipeName: string;
  recipeType: RecipeType;
  items: Json;
  analysis?: Json | null;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
}

export function SaveRecipeButton({
  recipeName,
  recipeType,
  items,
  analysis,
  disabled,
  variant = 'outline',
}: SaveRecipeButtonProps) {
  const { user } = useAuth();
  const { saveRecipe, shareToWall, isSaving, isSharing } = useRecipes();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(recipeName);
  const [shareToWallAfter, setShareToWallAfter] = useState(false);

  if (!user) {
    return null;
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a name for your recipe.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const saved = await saveRecipe({
        name: name.trim(),
        recipe_type: recipeType,
        items,
        analysis,
        is_public: shareToWallAfter,
      });

      if (shareToWallAfter && saved) {
        await shareToWall({ recipeId: saved.id });
      }

      setOpen(false);
    } catch (error) {
      // Error toast handled in hook
    }
  };

  const isLoading = isSaving || isSharing;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm" className="gap-2" disabled={disabled}>
          <Save className="h-4 w-4" />
          <span className="hidden sm:inline">Save</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Recipe</DialogTitle>
          <DialogDescription>
            Save this recipe to your account for easy access later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="recipe-name">Recipe Name</Label>
            <Input
              id="recipe-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My awesome blend"
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="share-wall"
              checked={shareToWallAfter}
              onCheckedChange={(checked) => setShareToWallAfter(checked === true)}
              disabled={isLoading}
            />
            <Label htmlFor="share-wall" className="text-sm font-normal cursor-pointer">
              <span className="flex items-center gap-1">
                <Share2 className="h-3 w-3" />
                Also share to the Wall
              </span>
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Recipe'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Share2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import { TagInput } from '@/components/shared/TagInput';
import { useTagSuggestions } from '@/hooks/useTags';
import type { RecipeVisibility } from '@/hooks/useRecipes';
import { useRecentTags } from '@/hooks/useRecentTags';

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
  const [shareToWallAfter, setShareToWallAfter] = useState(true);
  const [visibility, setVisibility] = useState<RecipeVisibility>('public');
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const { data: tagSuggestions } = useTagSuggestions();
  const { recentTags, addRecentTags } = useRecentTags();

  useEffect(() => {
    if (!open) {
      setName(recipeName);
      setShareToWallAfter(true);
      setVisibility('public');
      setCaption('');
      setTags([]);
    }
  }, [open, recipeName]);

  useEffect(() => {
    if (shareToWallAfter) {
      setVisibility('public');
    } else if (visibility === 'public') {
      setVisibility('private');
    }
  }, [shareToWallAfter, visibility]);

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

    if (shareToWallAfter && tags.length === 0) {
      toast({
        title: 'Tags required',
        description: 'Add at least one tag before sharing.',
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
        visibility: shareToWallAfter ? 'public' : visibility,
      });

      if (shareToWallAfter && saved) {
        await shareToWall({ recipeId: saved.id, caption: caption.trim() || undefined, tags });
        addRecentTags(tags);
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
          <span className="hidden sm:inline">Post</span>
          <span className="sm:hidden">Post</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Post</DialogTitle>
          <DialogDescription>
            Post this recipe to the community. You can still keep it private.
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

          {!shareToWallAfter && (
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(value) => setVisibility(value as RecipeVisibility)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="unlisted">Unlisted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

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
                Post to the Wall
              </span>
            </Label>
          </div>

          {shareToWallAfter && (
            <div className="space-y-3">
              {recentTags.length > 0 && (
                <div className="space-y-2">
                  <Label>Recent tags</Label>
                  <div className="flex flex-wrap gap-2">
                    {recentTags.map((tag) => (
                      <Button
                        key={tag}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]).slice(0, 4))}
                        disabled={isLoading}
                      >
                        #{tag}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Tags (max 4)</Label>
                <TagInput
                  value={tags}
                  onChange={setTags}
                  suggestions={tagSuggestions || []}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="share-caption">Caption (optional)</Label>
                <Textarea
                  id="share-caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a note about this recipe..."
                  rows={3}
                  disabled={isLoading}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Posting...
              </>
            ) : (
              'Post'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

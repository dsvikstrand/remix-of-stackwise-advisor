import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagInput } from '@/components/shared/TagInput';
import { useTagSuggestions } from '@/hooks/useTags';
import { useRecipes } from '@/hooks/useRecipes';
import { useToast } from '@/hooks/use-toast';
import { useRecentTags } from '@/hooks/useRecentTags';

interface ShareToWallDialogProps {
  recipeId: string;
  recipeName: string;
  trigger: React.ReactNode;
}

export function ShareToWallDialog({ recipeId, recipeName, trigger }: ShareToWallDialogProps) {
  const { shareToWall, isSharing } = useRecipes();
  const { toast } = useToast();
  const { data: tagSuggestions } = useTagSuggestions();
  const { recentTags, addRecentTags } = useRecentTags();

  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [caption, setCaption] = useState('');

  useEffect(() => {
    if (!open) {
      setTags([]);
      setCaption('');
    }
  }, [open]);

  const handleShare = async () => {
    if (tags.length === 0) {
      toast({
        title: 'Tags required',
        description: 'Add at least one tag before sharing.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await shareToWall({ recipeId, caption: caption.trim() || undefined, tags });
      addRecentTags(tags);
      setOpen(false);
      setTags([]);
      setCaption('');
    } catch {
      // Error toast handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share to Wall</DialogTitle>
          <DialogDescription>
            Share "{recipeName}" with the community. Add tags to help people discover it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
                    disabled={isSharing}
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
              disabled={isSharing}
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
              disabled={isSharing}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSharing}>
            Cancel
          </Button>
          <Button onClick={handleShare} disabled={isSharing}>
            {isSharing ? 'Sharing...' : 'Share'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

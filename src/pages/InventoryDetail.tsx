import { Link, useParams } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInventory, useToggleInventoryLike } from '@/hooks/useInventories';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_REVIEW_SECTIONS } from '@/lib/reviewSections';
import { Heart } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

function getCategories(schema: Json) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [] as string[];
  const categories = (schema as { categories?: Array<{ name?: string }> }).categories;
  if (!Array.isArray(categories)) return [];
  return categories
    .map((category) => (typeof category.name === 'string' ? category.name : ''))
    .filter(Boolean);
}

function getReviewSections(sections?: string[] | null) {
  if (Array.isArray(sections) && sections.length > 0) return sections;
  return DEFAULT_REVIEW_SECTIONS;
}

export default function InventoryDetail() {
  const { inventoryId } = useParams();
  const { data: inventory, isLoading } = useInventory(inventoryId);
  const toggleLike = useToggleInventoryLike();
  const { toast } = useToast();

  const handleLike = async () => {
    if (!inventory) return;
    try {
      await toggleLike.mutateAsync({ inventoryId: inventory.id, liked: inventory.user_liked });
    } catch (error) {
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ) : inventory ? (
          <>
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{inventory.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {inventory.prompt_inventory}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={inventory.user_liked ? 'text-red-500' : 'text-muted-foreground'}
                    onClick={handleLike}
                  >
                    <Heart className={`h-4 w-4 ${inventory.user_liked ? 'fill-current' : ''}`} />
                    <span className="ml-1 text-xs">{inventory.likes_count}</span>
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inventory.tags.map((tag) => (
                    <Badge key={tag.id} variant="outline">#{tag.slug}</Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold">Categories</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {getCategories(inventory.generated_schema).map((category) => (
                      <Badge key={category} variant="secondary">{category}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold">Review sections</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {getReviewSections(inventory.review_sections).map((section) => (
                      <Badge key={section} variant="outline">{section}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link to={`/inventory/${inventory.id}/build`}>
                    <Button>Create Blueprint</Button>
                  </Link>
                  <Link to="/inventory">
                    <Button variant="outline">Back to Inventory</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">Inventory not found.</CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

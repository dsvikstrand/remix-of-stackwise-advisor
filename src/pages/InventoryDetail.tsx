import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useInventory, useToggleInventoryLike, useUpdateInventory } from '@/hooks/useInventories';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_ADDITIONAL_SECTIONS,
  MAX_ADDITIONAL_SECTIONS,
  MAX_REVIEW_SECTIONS,
  OVERVIEW_SECTION,
  buildReviewSections,
  formatReviewSection,
  normalizeAdditionalSections,
} from '@/lib/reviewSections';
import { Heart, X } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

function getCategories(schema: Json) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [] as string[];
  const categories = (schema as { categories?: Array<{ name?: string }> }).categories;
  if (!Array.isArray(categories)) return [];
  return categories
    .map((category) => (typeof category.name === 'string' ? category.name : ''))
    .filter(Boolean);
}

export default function InventoryDetail() {
  const { inventoryId } = useParams();
  const { data: inventory, isLoading } = useInventory(inventoryId);
  const toggleLike = useToggleInventoryLike();
  const updateInventory = useUpdateInventory();
  const { toast } = useToast();
  const [editableSections, setEditableSections] = useState<string[]>([]);
  const [sectionInput, setSectionInput] = useState('');
  const [sectionError, setSectionError] = useState('');
  const [includeScore, setIncludeScore] = useState(true);

  useEffect(() => {
    if (!inventory) return;
    setEditableSections(normalizeAdditionalSections(inventory.review_sections));
    setIncludeScore(inventory.include_score ?? true);
    setSectionInput('');
    setSectionError('');
  }, [inventory]);

  const availableSections = useMemo(() => {
    return DEFAULT_ADDITIONAL_SECTIONS.filter(
      (section) => !editableSections.some((existing) => existing.toLowerCase() === section.toLowerCase())
    );
  }, [editableSections]);

  const fullSections = useMemo(
    () => buildReviewSections(inventory?.review_sections ?? null),
    [inventory]
  );

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

  const handleAddSection = (raw: string) => {
    const formatted = formatReviewSection(raw);
    if (!formatted) return;
    if (formatted.toLowerCase() === OVERVIEW_SECTION.toLowerCase()) {
      setSectionInput('');
      return;
    }
    if (editableSections.some((section) => section.toLowerCase() === formatted.toLowerCase())) {
      setSectionInput('');
      setSectionError('');
      return;
    }
    if (editableSections.length >= MAX_ADDITIONAL_SECTIONS) {
      setSectionError(`You can add up to ${MAX_REVIEW_SECTIONS} sections total.`);
      return;
    }
    setEditableSections((prev) => [...prev, formatted]);
    setSectionInput('');
    setSectionError('');
  };

  const handleRemoveSection = (section: string) => {
    setEditableSections((prev) => prev.filter((item) => item !== section));
    setSectionError('');
  };

  const handleSaveReviewSettings = async () => {
    if (!inventory) return;
    if (editableSections.length > MAX_ADDITIONAL_SECTIONS) {
      toast({
        title: 'Too many sections',
        description: `Please use ${MAX_REVIEW_SECTIONS} sections or fewer.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateInventory.mutateAsync({
        inventoryId: inventory.id,
        reviewSections: editableSections,
        includeScore,
      });
      toast({
        title: 'Saved',
        description: 'Review settings updated.',
      });
    } catch (error) {
      toast({
        title: 'Save failed',
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
                  {inventory.is_owner ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{OVERVIEW_SECTION}</Badge>
                        {editableSections.map((section) => (
                          <Badge key={section} variant="secondary" className="gap-1">
                            {section}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4"
                              onClick={() => handleRemoveSection(section)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                      {availableSections.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {availableSections.map((section) => (
                            <Button
                              key={section}
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleAddSection(section)}
                            >
                              {section}
                            </Button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input
                          value={sectionInput}
                          onChange={(event) => setSectionInput(event.target.value)}
                          placeholder="Add custom section"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleAddSection(sectionInput);
                            }
                          }}
                        />
                        <Button type="button" variant="outline" onClick={() => handleAddSection(sectionInput)}>
                          Add
                        </Button>
                      </div>
                      {sectionError && (
                        <p className="text-sm text-destructive">{sectionError}</p>
                      )}
                      <div className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3">
                        <div>
                          <p className="font-medium">Include score</p>
                          <p className="text-sm text-muted-foreground">Adds a 1–100 score in Overview.</p>
                        </div>
                        <Switch checked={includeScore} onCheckedChange={setIncludeScore} />
                      </div>
                      <Button
                        type="button"
                        onClick={handleSaveReviewSettings}
                        disabled={updateInventory.isPending}
                      >
                        Save review settings
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {fullSections.map((section) => (
                        <Badge key={section} variant="outline">{section}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link to={`/inventory/${inventory.id}/build`}>
                    <Button>Create Blueprint</Button>
                  </Link>
                  <Link to="/inventory">
                    <Button variant="outline">Back to Library</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">Library not found.</CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

import { useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { TagInput } from '@/components/shared/TagInput';
import { MixButton } from '@/components/blend/MixButton';
import { BlueprintItemPicker } from '@/components/blueprint/BlueprintItemPicker';
import { BlueprintRecipeAccordion } from '@/components/blueprint/BlueprintRecipeAccordion';
import { BlueprintAnalysisView } from '@/components/blueprint/BlueprintAnalysisView';
import { BlueprintLoadingAnimation } from '@/components/blueprint/BlueprintLoadingAnimation';
import { useInventory } from '@/hooks/useInventories';
import { useCreateBlueprint } from '@/hooks/useBlueprints';
import { useTagSuggestions } from '@/hooks/useTags';
import { useRecentTags } from '@/hooks/useRecentTags';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

const ANALYZE_BLUEPRINT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-blueprint`;

interface InventoryCategory {
  name: string;
  items: string[];
}

function parseCategories(schema: Json): InventoryCategory[] {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
  const categories = (schema as { categories?: Array<{ name?: string; items?: string[] }> }).categories;
  if (!Array.isArray(categories)) return [];

  return categories
    .map((category) => ({
      name: typeof category.name === 'string' ? category.name : 'Untitled',
      items: Array.isArray(category.items)
        ? category.items.filter((item): item is string => typeof item === 'string')
        : [],
    }))
    .filter((category) => category.name.trim().length > 0);
}

export default function InventoryBuild() {
  const { inventoryId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: inventory, isLoading } = useInventory(inventoryId);
  const { data: tagSuggestions } = useTagSuggestions();
  const { recentTags, addRecentTags } = useRecentTags();
  const createBlueprint = useCreateBlueprint();

  // Blueprint state
  const [title, setTitle] = useState('');
  const [selectedItems, setSelectedItems] = useState<Record<string, string[]>>({});
  const [itemContexts, setItemContexts] = useState<Record<string, string>>({}); // key: "category::item"
  const [mixNotes, setMixNotes] = useState('');
  const [reviewPrompt, setReviewPrompt] = useState('');
  const [review, setReview] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Categories with custom items
  const [categories, setCategories] = useState<InventoryCategory[]>([]);

  // Initialize categories when inventory loads
  useMemo(() => {
    if (inventory && categories.length === 0) {
      setCategories(parseCategories(inventory.generated_schema));
      setTitle(inventory.title);
    }
  }, [inventory, categories.length]);

  const totalSelected = useMemo(
    () => Object.values(selectedItems).reduce((sum, items) => sum + items.length, 0),
    [selectedItems]
  );

  const toggleItem = useCallback((categoryName: string, item: string) => {
    setSelectedItems((prev) => {
      const existing = new Set(prev[categoryName] || []);
      if (existing.has(item)) {
        existing.delete(item);
      } else {
        existing.add(item);
      }
      return {
        ...prev,
        [categoryName]: Array.from(existing),
      };
    });
  }, []);

  const addCustomItem = useCallback((categoryName: string, itemName: string) => {
    // Add to categories if not exists
    setCategories((prev) =>
      prev.map((category) =>
        category.name === categoryName
          ? {
              ...category,
              items: category.items.includes(itemName) ? category.items : [...category.items, itemName],
            }
          : category
      )
    );

    // Auto-select the newly added item
    setSelectedItems((prev) => ({
      ...prev,
      [categoryName]: [...(prev[categoryName] || []), itemName],
    }));
  }, []);

  const removeItem = useCallback((categoryName: string, item: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [categoryName]: (prev[categoryName] || []).filter((i) => i !== item),
    }));
    // Also remove context
    setItemContexts((prev) => {
      const newContexts = { ...prev };
      delete newContexts[`${categoryName}::${item}`];
      return newContexts;
    });
  }, []);

  const updateItemContext = useCallback((categoryName: string, item: string, context: string) => {
    setItemContexts((prev) => ({
      ...prev,
      [`${categoryName}::${item}`]: context,
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItems({});
    setItemContexts({});
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!inventory) return;

    if (totalSelected === 0) {
      toast({
        title: 'No items selected',
        description: 'Select at least one item before generating the review.',
        variant: 'destructive',
      });
      return;
    }

    // Build payload with context
    const payload: Record<string, Array<{ name: string; context?: string }>> = {};
    Object.entries(selectedItems).forEach(([category, items]) => {
      if (items.length > 0) {
        payload[category] = items.map((item) => ({
          name: item,
          context: itemContexts[`${category}::${item}`] || undefined,
        }));
      }
    });

    setIsAnalyzing(true);
    setReview('');

    try {
      const response = await fetch(ANALYZE_BLUEPRINT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          title: title.trim() || inventory.title,
          inventoryTitle: inventory.title,
          selectedItems: payload,
          mixNotes: mixNotes.trim(),
          reviewPrompt: reviewPrompt.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to analyze blueprint');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullContent += content;
              setReview(fullContent);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      toast({
        title: 'Analysis complete!',
        description: 'Your blueprint has been reviewed.',
      });
    } catch (error) {
      toast({
        title: 'Analysis failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [inventory, selectedItems, title, mixNotes, reviewPrompt, totalSelected, toast]);

  const handlePublish = async () => {
    if (!inventory) return;

    if (!title.trim()) {
      toast({
        title: 'Title required',
        description: 'Add a blueprint title before publishing.',
        variant: 'destructive',
      });
      return;
    }

    if (totalSelected === 0) {
      toast({
        title: 'Select items',
        description: 'Pick at least one item before publishing.',
        variant: 'destructive',
      });
      return;
    }

    if (!review.trim()) {
      toast({
        title: 'Generate review',
        description: 'Generate the review before publishing.',
        variant: 'destructive',
      });
      return;
    }

    if (tags.length === 0) {
      toast({
        title: 'Tags required',
        description: 'Add at least one tag so the wall can surface your blueprint.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Build payload with context for storage
      const payload: Record<string, Array<{ name: string; context?: string }>> = {};
      Object.entries(selectedItems).forEach(([category, items]) => {
        if (items.length > 0) {
          payload[category] = items.map((item) => ({
            name: item,
            context: itemContexts[`${category}::${item}`] || undefined,
          }));
        }
      });

      const blueprint = await createBlueprint.mutateAsync({
        inventoryId: inventory.id,
        title: title.trim(),
        selectedItems: payload,
        mixNotes: mixNotes.trim() ? mixNotes.trim() : null,
        reviewPrompt: reviewPrompt.trim() ? reviewPrompt.trim() : null,
        llmReview: review,
        tags,
        isPublic,
        sourceBlueprintId: null,
      });

      addRecentTags(tags);
      navigate(`/blueprint/${blueprint.id}`);
    } catch (error) {
      toast({
        title: 'Publish failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-primary/8 rounded-full blur-3xl animate-drift" />
        <div className="absolute top-1/2 -left-32 w-96 h-96 bg-accent/15 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-20 right-1/4 w-80 h-80 bg-secondary/10 rounded-full blur-3xl animate-pulse-soft" />
        <div className="absolute top-20 right-20 w-4 h-4 bg-primary/20 rounded-full blur-sm animate-float-delayed" />
        <div className="absolute top-40 right-40 w-2 h-2 bg-accent/30 rounded-full blur-sm animate-float-slow" />
        <div className="absolute bottom-40 left-20 w-3 h-3 bg-primary/15 rounded-full blur-sm animate-drift" />
      </div>

      <AppHeader />

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Back link */}
        <Link
          to={inventory ? `/inventory/${inventory.id}` : '/inventory'}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to inventory
        </Link>

        {/* Hero Header with dynamic inventory name */}
        <div className="text-center mb-12 pt-8 animate-fade-in">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight mb-4 relative inline-block">
            <span
              className="relative inline-block"
              style={{
                fontFamily: "'Impact', 'Haettenschweiler', 'Franklin Gothic Bold', 'Charcoal', 'Helvetica Inserat', sans-serif",
                letterSpacing: '0.06em',
              }}
            >
              <span
                className="absolute inset-0 text-border/40"
                style={{ transform: 'translate(4px, 4px)' }}
                aria-hidden="true"
              >
                {inventory?.title.toUpperCase() || 'BUILD'}
              </span>
              <span
                className="absolute inset-0 text-border/60"
                style={{ transform: 'translate(2px, 2px)' }}
                aria-hidden="true"
              >
                {inventory?.title.toUpperCase() || 'BUILD'}
              </span>
              <span className="text-gradient-themed animate-shimmer bg-[length:200%_auto] relative">
                {inventory?.title.toUpperCase() || 'BUILD'}
              </span>
            </span>
            <span className="absolute -inset-4 bg-primary/10 blur-2xl rounded-full animate-pulse-soft -z-10" />
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Build your blueprint from this inventory
          </p>
        </div>

        {isLoading ? (
          <Card className="bg-card/60 backdrop-blur-glass border-border/50">
            <CardContent className="p-6">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full mt-4" />
            </CardContent>
          </Card>
        ) : inventory ? (
          <div className="space-y-6">
            {/* Combined Name + Items Section */}
            <section className="animate-fade-in" style={{ animationDelay: '0.05s' }}>
              <div className="bg-card/60 backdrop-blur-glass rounded-2xl border border-border/50 overflow-hidden">
                {/* Blueprint Name Input */}
                <div className="p-4 border-b border-border/30">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Name your blueprint..."
                    className="text-xl font-bold bg-transparent border-none focus-visible:ring-2 focus-visible:ring-primary/50 h-14"
                  />
                </div>
                {/* Item Picker */}
                <div className="p-4">
                  <BlueprintItemPicker
                    categories={categories}
                    selectedItems={selectedItems}
                    onToggleItem={toggleItem}
                    onAddCustomItem={addCustomItem}
                  />
                </div>
              </div>
            </section>

            {/* Selected Items Accordion */}
            <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <BlueprintRecipeAccordion
                title={title || 'Your Selection'}
                selectedItems={selectedItems}
                itemContexts={itemContexts}
                onRemoveItem={removeItem}
                onUpdateContext={updateItemContext}
                onClear={clearSelection}
              />
            </section>

            {/* Optional Notes */}
            <section className="animate-fade-in" style={{ animationDelay: '0.15s' }}>
              <Card className="bg-card/60 backdrop-blur-glass border-border/50">
                <CardContent className="p-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="mix-notes">Mix notes (optional)</Label>
                      <Textarea
                        id="mix-notes"
                        value={mixNotes}
                        onChange={(e) => setMixNotes(e.target.value)}
                        placeholder="Any additional context for your mix..."
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="review-prompt">Review focus (optional)</Label>
                      <Textarea
                        id="review-prompt"
                        value={reviewPrompt}
                        onChange={(e) => setReviewPrompt(e.target.value)}
                        placeholder="What should the AI focus on?"
                        rows={3}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Central MIX Button */}
            <section className="flex justify-center py-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <MixButton
                onClick={handleAnalyze}
                disabled={totalSelected === 0}
                isLoading={isAnalyzing}
                itemCount={totalSelected}
              />
            </section>

            {/* Loading Animation */}
            {isAnalyzing && (
              <section className="animate-fade-in-scale">
                <Card className="overflow-hidden bg-card/60 backdrop-blur-glass border-primary/20">
                  <CardContent className="p-0">
                    <BlueprintLoadingAnimation />
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Analysis Results */}
            {review && !isAnalyzing && (
              <section className="animate-fade-in-up">
                <BlueprintAnalysisView review={review} />
              </section>
            )}

            {/* Streaming Analysis */}
            {review && isAnalyzing && (
              <section className="animate-fade-in">
                <BlueprintAnalysisView review={review} isStreaming />
              </section>
            )}

            {/* Publish Section */}
            {review && !isAnalyzing && (
              <section className="animate-fade-in" style={{ animationDelay: '0.25s' }}>
                <Card className="bg-card/60 backdrop-blur-glass border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Publish Blueprint
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {recentTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {recentTags.map((tag) => (
                          <Button
                            key={tag}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]).slice(0, 4))}
                          >
                            #{tag}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Tags (max 4)</Label>
                      <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions || []} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3">
                      <div>
                        <p className="font-medium">Public blueprint</p>
                        <p className="text-sm text-muted-foreground">Public blueprints appear on the wall.</p>
                      </div>
                      <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                    </div>
                    <Button
                      onClick={handlePublish}
                      disabled={createBlueprint.isPending}
                      className="w-full gap-2"
                      size="lg"
                    >
                      <Sparkles className="h-4 w-4" />
                      Publish Blueprint
                    </Button>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Footer Disclaimer */}
            <footer className="text-center py-8 text-sm text-muted-foreground border-t border-border/30 mt-8">
              <p>
                Blueprint analysis is for informational purposes only. Always do your own research.
              </p>
            </footer>
          </div>
        ) : (
          <Card className="bg-card/60 backdrop-blur-glass border-border/50">
            <CardContent className="py-12 text-center">
              Inventory not found.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

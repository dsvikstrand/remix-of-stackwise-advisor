import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BlueprintLoadingAnimation } from '@/components/blueprint/BlueprintLoadingAnimation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { TagInput } from '@/components/shared/TagInput';
import { useTagSuggestions } from '@/hooks/useTags';
import { useRecentTags } from '@/hooks/useRecentTags';
import { useCreateBlueprint } from '@/hooks/useBlueprints';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/lib/errors';
import { buildReviewSections } from '@/lib/reviewSections';
import { apiFetch } from '@/lib/api';
import type { InventoryListItem } from '@/hooks/useInventories';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/config/runtime';

interface InventoryCategory {
  name: string;
  items: string[];
}

interface BlueprintBuilderProps {
  inventory: InventoryListItem;
  initialTitle?: string;
  initialSelectedItems?: Record<string, string[]>;
  initialMixNotes?: string | null;
  initialReviewPrompt?: string | null;
  initialReview?: string | null;
  sourceBlueprintId?: string | null;
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

export function BlueprintBuilder({
  inventory,
  initialTitle,
  initialSelectedItems,
  initialMixNotes,
  initialReviewPrompt,
  initialReview,
  sourceBlueprintId,
}: BlueprintBuilderProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session } = useAuth();
  const { data: tagSuggestions } = useTagSuggestions();
  const { recentTags, addRecentTags } = useRecentTags();
  const createBlueprint = useCreateBlueprint();

  const [title, setTitle] = useState(initialTitle || inventory.title);
  const [selectedItems, setSelectedItems] = useState<Record<string, string[]>>(initialSelectedItems || {});
  const [mixNotes, setMixNotes] = useState(initialMixNotes || '');
  const [reviewPrompt, setReviewPrompt] = useState(initialReviewPrompt || '');
  const [review, setReview] = useState(initialReview || '');
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [categories, setCategories] = useState<InventoryCategory[]>(() => parseCategories(inventory.generated_schema));
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const reviewSections = useMemo(() => buildReviewSections(inventory.review_sections), [inventory]);

  const totalSelected = useMemo(
    () => Object.values(selectedItems).reduce((sum, items) => sum + items.length, 0),
    [selectedItems]
  );

  const toggleItem = (categoryName: string, item: string) => {
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
  };

  const addCustomItem = (categoryName: string) => {
    const value = customInputs[categoryName]?.trim();
    if (!value) return;

    setCategories((prev) =>
      prev.map((category) =>
        category.name === categoryName
          ? {
              ...category,
              items: category.items.includes(value) ? category.items : [...category.items, value],
            }
          : category
      )
    );

    setCustomInputs((prev) => ({ ...prev, [categoryName]: '' }));
  };

  const handleGenerate = async () => {
    if (!title.trim()) {
      toast({
        title: 'Title required',
        description: 'Add a blueprint title before generating the review.',
        variant: 'destructive',
      });
      return;
    }

    if (totalSelected === 0) {
      toast({
        title: 'No items selected',
        description: 'Select at least one item before generating the review.',
        variant: 'destructive',
      });
      return;
    }

    if (config.useAgenticBackend && !session?.access_token) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to generate a review.',
        variant: 'destructive',
      });
      return;
    }
    const payload: Record<string, string[]> = {};
    Object.entries(selectedItems).forEach(([category, items]) => {
      if (items.length > 0) payload[category] = items;
    });

    setIsAnalyzing(true);
    setReview('');

    try {
      const response = await apiFetch<Response>('analyze-blueprint', {
        stream: true,
        body: {
          title: title.trim(),
          inventoryTitle: inventory.title,
          selectedItems: payload,
          mixNotes: mixNotes.trim(),
          reviewPrompt: reviewPrompt.trim(),
          reviewSections,
          includeScore: inventory.include_score ?? true,
        },
      });

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
    } catch (error) {
      toast({
        title: 'Analysis failed',
        description: getFriendlyErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePublish = async () => {
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

    if (tags.length > 4) {
      toast({
        title: 'Too many tags',
        description: 'Please use 4 tags or fewer.',
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
      const payload: Record<string, string[]> = {};
      Object.entries(selectedItems).forEach(([category, items]) => {
        if (items.length > 0) payload[category] = items;
      });

      const blueprint = await createBlueprint.mutateAsync({
        inventoryId: inventory.id,
        title: title.trim(),
        selectedItems: payload,
        steps: null,
        mixNotes: mixNotes.trim() ? mixNotes.trim() : null,
        reviewPrompt: reviewPrompt.trim() ? reviewPrompt.trim() : null,
        bannerUrl: null,
        llmReview: review,
        tags,
        isPublic,
        sourceBlueprintId: sourceBlueprintId || null,
      });

      addRecentTags(tags);
      navigate(`/blueprint/${blueprint.id}`);
    } catch (error) {
      toast({
        title: 'Publish failed',
        description: getFriendlyErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Blueprint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="blueprint-title">Blueprint title</Label>
            <Input
              id="blueprint-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Name your blueprint"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mix-notes">Build notes</Label>
              <Textarea
                id="mix-notes"
                value={mixNotes}
                onChange={(event) => setMixNotes(event.target.value)}
                placeholder="Optional notes for your build"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-prompt">LLM review focus</Label>
              <Textarea
                id="review-prompt"
                value={reviewPrompt}
                onChange={(event) => setReviewPrompt(event.target.value)}
                placeholder="What should the review focus on?"
                rows={4}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No library items yet. Add categories in the library builder.</p>
          ) : (
            categories.map((category) => (
              <div key={category.name} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{category.name}</h3>
                  <Badge variant="secondary">{selectedItems[category.name]?.length || 0} selected</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {category.items.map((item) => (
                    <label
                      key={`${category.name}-${item}`}
                      className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={(selectedItems[category.name] || []).includes(item)}
                        onCheckedChange={() => toggleItem(category.name, item)}
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={customInputs[category.name] || ''}
                    onChange={(event) =>
                      setCustomInputs((prev) => ({ ...prev, [category.name]: event.target.value }))
                    }
                    placeholder={`Add item to ${category.name}`}
                  />
                  <Button type="button" variant="outline" onClick={() => addCustomItem(category.name)}>
                    Add
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {isAnalyzing && (
        <Card className="overflow-hidden bg-card/60 backdrop-blur-glass border-primary/20">
          <CardContent className="p-0">
            <BlueprintLoadingAnimation />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>LLM Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" onClick={handleGenerate} disabled={isAnalyzing || createBlueprint.isPending}>
            {isAnalyzing ? 'Building...' : 'Build Blueprint'}
          </Button>
          <Textarea value={review} onChange={(event) => setReview(event.target.value)} rows={12} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publish</CardTitle>
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
                  onClick={() => setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]))}
                >
                  #{tag}
                </Button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput
              value={tags}
              onChange={setTags}
              suggestions={tagSuggestions || []}
              maxTags={12}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3">
            <div>
              <p className="font-medium">Public blueprint</p>
              <p className="text-sm text-muted-foreground">Public blueprints appear on the wall.</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          <Button
            type="button"
            onClick={handlePublish}
            disabled={createBlueprint.isPending || isAnalyzing}
            className="w-full"
          >
            Publish Blueprint
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

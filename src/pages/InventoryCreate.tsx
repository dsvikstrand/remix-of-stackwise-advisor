import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { TagInput } from '@/components/shared/TagInput';
import { useCreateInventory } from '@/hooks/useInventories';
import { useToast } from '@/hooks/use-toast';
import { useTagSuggestions } from '@/hooks/useTags';
import { useRecentTags } from '@/hooks/useRecentTags';
import { DEFAULT_REVIEW_SECTIONS, MAX_REVIEW_SECTIONS, formatReviewSection } from '@/lib/reviewSections';
import { Loader2, Sparkles, Wand2, X } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

const GENERATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-inventory`;

interface GeneratedSchema {
  summary: string;
  categories: Array<{ name: string; items: string[] }>;
  suggestedTags?: string[];
}

export default function InventoryCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createInventory = useCreateInventory();
  const { data: tagSuggestions } = useTagSuggestions();
  const { recentTags, addRecentTags } = useRecentTags();

  // Step 1: Keywords input
  const [keywords, setKeywords] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Step 2: Generated/edited inventory
  const [title, setTitle] = useState('');
  const [promptInventory, setPromptInventory] = useState('');
  const [generatedSchema, setGeneratedSchema] = useState<GeneratedSchema | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [reviewSections, setReviewSections] = useState<string[]>(DEFAULT_REVIEW_SECTIONS);
  const [reviewSectionInput, setReviewSectionInput] = useState('');
  const [reviewSectionsError, setReviewSectionsError] = useState('');

  const categoryNames = useMemo(() => {
    if (!generatedSchema) return [];
    return generatedSchema.categories
      .map((c) => c.name.trim())
      .filter(Boolean);
  }, [generatedSchema]);

  const [categoryItemInputs, setCategoryItemInputs] = useState<Record<number, string>>({});
  const [newCategoryName, setNewCategoryName] = useState('');

  const availableReviewSections = useMemo(() => {
    return DEFAULT_REVIEW_SECTIONS.filter(
      (section) => !reviewSections.some((existing) => existing.toLowerCase() === section.toLowerCase())
    );
  }, [reviewSections]);

  const addReviewSection = (raw: string) => {
    const formatted = formatReviewSection(raw);
    if (!formatted) return;

    if (reviewSections.some((section) => section.toLowerCase() === formatted.toLowerCase())) {
      setReviewSectionInput('');
      setReviewSectionsError('');
      return;
    }

    if (reviewSections.length >= MAX_REVIEW_SECTIONS) {
      setReviewSectionsError(`You can add up to ${MAX_REVIEW_SECTIONS} sections.`);
      return;
    }

    setReviewSections((prev) => [...prev, formatted]);
    setReviewSectionInput('');
    setReviewSectionsError('');
  };

  const removeReviewSection = (section: string) => {
    setReviewSections((prev) => prev.filter((item) => item !== section));
    setReviewSectionsError('');
  };

  const handleGenerate = async () => {
    if (!keywords.trim()) {
      toast({
        title: 'Keywords required',
        description: 'Enter what kind of inventory you want to create.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          keywords: keywords.trim(),
          title: title.trim() || undefined,
          customInstructions: customInstructions.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate inventory');
      }

      const schema: GeneratedSchema = await response.json();

      setGeneratedSchema(schema);
      setPromptInventory(schema.summary || '');
      setCategoryItemInputs({});

      // Auto-fill title if empty
      if (!title.trim()) {
        const autoTitle = keywords.trim().split(' ').slice(0, 3).map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ') + ' Inventory';
        setTitle(autoTitle);
      }

      // Use suggested tags if available
      if (schema.suggestedTags && schema.suggestedTags.length > 0) {
        setTags(schema.suggestedTags.slice(0, 4));
      }

      toast({
        title: 'Inventory generated!',
        description: `Created ${schema.categories.length} categories with ${schema.categories.reduce((sum, c) => sum + c.items.length, 0)} items.`,
      });
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({
        title: 'Title required',
        description: 'Add a title before creating the inventory.',
        variant: 'destructive',
      });
      return;
    }

    if (!generatedSchema) {
      toast({
        title: 'Generate inventory first',
        description: 'Use the generate button to create your inventory.',
        variant: 'destructive',
      });
      return;
    }

    if (tags.length === 0) {
      toast({
        title: 'Tags required',
        description: 'Add at least one tag to help discovery.',
        variant: 'destructive',
      });
      return;
    }

    if (reviewSections.length > MAX_REVIEW_SECTIONS) {
      toast({
        title: 'Too many sections',
        description: `Please use ${MAX_REVIEW_SECTIONS} sections or fewer.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      const promptCategories = categoryNames.join(', ');
      const sectionsToSave = reviewSections.length > 0 ? reviewSections : DEFAULT_REVIEW_SECTIONS;
      const inventory = await createInventory.mutateAsync({
        title: title.trim(),
        promptInventory: promptInventory.trim(),
        promptCategories,
        generatedSchema: generatedSchema as unknown as Json,
        reviewSections: sectionsToSave,
        tags,
        isPublic,
      });

      addRecentTags(tags);
      navigate(`/inventory/${inventory.id}/build`);
    } catch (error) {
      toast({
        title: 'Creation failed',
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
      </div>

      <AppHeader />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Hero Header */}
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
                CREATE INVENTORY
              </span>
              <span
                className="absolute inset-0 text-border/60"
                style={{ transform: 'translate(2px, 2px)' }}
                aria-hidden="true"
              >
                CREATE INVENTORY
              </span>
              <span className="text-gradient-themed animate-shimmer bg-[length:200%_auto] relative">
                CREATE INVENTORY
              </span>
            </span>
            <span className="absolute -inset-4 bg-primary/10 blur-2xl rounded-full animate-pulse-soft -z-10" />
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Describe what you want to build, and AI will generate your inventory
          </p>
        </div>

        {/* Step 1: Keywords Generation */}
        <Card className="bg-card/60 backdrop-blur-glass border-border/50 animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              What kind of inventory?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="keywords">Describe your inventory in a few words</Label>
              <div className="flex gap-2">
                <Input
                  id="keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="e.g., skincare routine, green smoothie, morning habits..."
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                />
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !keywords.trim()}
                  className="gap-2"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isGenerating ? 'Generating...' : generatedSchema ? 'Regenerate' : 'Generate'}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-instructions">Custom instructions (optional)</Label>
              <Textarea
                id="custom-instructions"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g., more beginner-friendly, fewer categories, emphasize budget options..."
                rows={3}
              />
              {generatedSchema && (
                <p className="text-xs text-muted-foreground">
                  Regenerating will replace the current categories and items.
                </p>
              )}
            </div>

            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-2">
              {['skincare routine', 'green smoothie', 'morning routine', 'home workout', 'meditation practice'].map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setKeywords(suggestion)}
                  className="text-xs"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Generated Schema Preview & Edit */}
        {generatedSchema && (
          <>
            <Card className="bg-card/60 backdrop-blur-glass border-border/50 animate-fade-in">
              <CardHeader>
                <CardTitle>Inventory Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inventory-title">Title</Label>
                  <Input
                    id="inventory-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My Custom Inventory"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inventory-description">Description</Label>
                  <Textarea
                    id="inventory-description"
                    value={promptInventory}
                    onChange={(e) => setPromptInventory(e.target.value)}
                    placeholder="What this inventory is for..."
                    rows={3}
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Review sections</Label>
                    <p className="text-sm text-muted-foreground">
                      Pick the headings the AI should use for the review.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {reviewSections.map((section) => (
                      <Badge key={section} variant="secondary" className="gap-1">
                        {section}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4"
                          onClick={() => removeReviewSection(section)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                  {availableReviewSections.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {availableReviewSections.map((section) => (
                        <Button
                          key={section}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addReviewSection(section)}
                        >
                          {section}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={reviewSectionInput}
                      onChange={(event) => setReviewSectionInput(event.target.value)}
                      placeholder="Add custom section"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addReviewSection(reviewSectionInput);
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={() => addReviewSection(reviewSectionInput)}>
                      Add
                    </Button>
                  </div>
                  {reviewSectionsError && (
                    <p className="text-sm text-destructive">{reviewSectionsError}</p>
                  )}
                  {reviewSections.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      We&apos;ll use the default sections if you leave this blank.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/60 backdrop-blur-glass border-border/50 animate-fade-in">
              <CardHeader>
                <CardTitle>Generated Categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {generatedSchema.categories.map((category, idx) => (
                  <div key={idx} className="space-y-3 rounded-lg border border-border/60 p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        value={category.name}
                        onChange={(event) => {
                          const value = event.target.value;
                          setGeneratedSchema((prev) => {
                            if (!prev) return prev;
                            const nextCategories = prev.categories.map((cat, catIdx) =>
                              catIdx === idx ? { ...cat, name: value } : cat
                            );
                            return { ...prev, categories: nextCategories };
                          });
                        }}
                        className="font-semibold"
                        placeholder="Category name"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setGeneratedSchema((prev) => {
                            if (!prev) return prev;
                            const nextCategories = prev.categories.filter((_, catIdx) => catIdx !== idx);
                            return { ...prev, categories: nextCategories };
                          });
                        }}
                        aria-label="Remove category"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Badge variant="secondary">{category.items.length} items</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {category.items.map((item, itemIdx) => (
                        <Badge key={itemIdx} variant="outline" className="text-xs gap-1">
                          {item}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-3 w-3"
                            onClick={() => {
                              setGeneratedSchema((prev) => {
                                if (!prev) return prev;
                                const nextCategories = prev.categories.map((cat, catIdx) => {
                                  if (catIdx !== idx) return cat;
                                  return {
                                    ...cat,
                                    items: cat.items.filter((_, i) => i !== itemIdx),
                                  };
                                });
                                return { ...prev, categories: nextCategories };
                              });
                            }}
                            aria-label="Remove item"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={categoryItemInputs[idx] || ''}
                        onChange={(event) =>
                          setCategoryItemInputs((prev) => ({ ...prev, [idx]: event.target.value }))
                        }
                        placeholder={`Add item to ${category.name || 'category'}`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const value = categoryItemInputs[idx]?.trim();
                          if (!value) return;
                          setGeneratedSchema((prev) => {
                            if (!prev) return prev;
                            const nextCategories = prev.categories.map((cat, catIdx) =>
                              catIdx === idx ? { ...cat, items: [...cat.items, value] } : cat
                            );
                            return { ...prev, categories: nextCategories };
                          });
                          setCategoryItemInputs((prev) => ({ ...prev, [idx]: '' }));
                        }}
                      >
                        Add item
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="New category name"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const value = newCategoryName.trim();
                      if (!value) return;
                      setGeneratedSchema((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          categories: [...prev.categories, { name: value, items: [] }],
                        };
                      });
                      setNewCategoryName('');
                    }}
                  >
                    Add category
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/60 backdrop-blur-glass border-border/50 animate-fade-in">
              <CardHeader>
                <CardTitle>Discovery</CardTitle>
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
                    <p className="font-medium">Public inventory</p>
                    <p className="text-sm text-muted-foreground">Public inventories appear in search.</p>
                  </div>
                  <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleSubmit}
              disabled={createInventory.isPending}
              className="w-full gap-2"
              size="lg"
            >
              {createInventory.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Create Inventory
            </Button>
          </>
        )}
      </main>
    </div>
  );
}

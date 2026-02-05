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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TagInput } from '@/components/shared/TagInput';
import { 
  InventoryCreateTour, 
  InventoryTourBanner, 
  InventoryTourButton, 
  isInventoryTourCompleted 
} from '@/components/inventory/InventoryCreateTour';
import { 
  InventoryCreateHelpOverlay, 
  InventoryHelpButton 
} from '@/components/inventory/InventoryCreateHelpOverlay';
import { useCreateInventory } from '@/hooks/useInventories';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/lib/errors';
import { useTagSuggestions } from '@/hooks/useTags';
import { useRecentTags } from '@/hooks/useRecentTags';
import { DEFAULT_ADDITIONAL_SECTIONS } from '@/lib/reviewSections';
import { ChevronDown, Loader2, Settings2, Sparkles, Wand2, X } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { logMvpEvent } from '@/lib/logEvent';

const SUPABASE_GENERATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-inventory`;
const AGENTIC_BASE_URL = import.meta.env.VITE_AGENTIC_BACKEND_URL;
const USE_AGENTIC_BACKEND = import.meta.env.VITE_USE_AGENTIC_BACKEND === 'true';
const AGENTIC_GENERATE_URL = AGENTIC_BASE_URL
  ? `${AGENTIC_BASE_URL.replace(/\/$/, '')}/api/generate-inventory`
  : '';

const GENERATE_URL = USE_AGENTIC_BACKEND && AGENTIC_GENERATE_URL
  ? AGENTIC_GENERATE_URL
  : SUPABASE_GENERATE_URL;

interface GeneratedSchema {
  summary: string;
  categories: Array<{ name: string; items: string[] }>;
  suggestedTags?: string[];
}

export default function InventoryCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session, isLoading } = useAuth();
  const createInventory = useCreateInventory();
  const { data: tagSuggestions } = useTagSuggestions();
  const { recentTags, addRecentTags } = useRecentTags();

  // Step 1: Keywords input
  const [keywords, setKeywords] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [preferredCategoryInput, setPreferredCategoryInput] = useState('');
  const [preferredCategoryError, setPreferredCategoryError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Step 2: Generated/edited inventory
  const [title, setTitle] = useState('');
  const [promptInventory, setPromptInventory] = useState('');
  const [generatedSchema, setGeneratedSchema] = useState<GeneratedSchema | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const maxInventoryTags = 5;
  const maxPreferredCategories = 6;

  // Help & Tour state
  const [showHelp, setShowHelp] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showTourBanner, setShowTourBanner] = useState(() => !isInventoryTourCompleted());

  const categoryNames = useMemo(() => {
    if (!generatedSchema) return [];
    return generatedSchema.categories
      .map((c) => c.name.trim())
      .filter(Boolean);
  }, [generatedSchema]);

  const [categoryItemInputs, setCategoryItemInputs] = useState<Record<number, string>>({});
  const [newCategoryName, setNewCategoryName] = useState('');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 py-12">
          <Card className="bg-card/60 backdrop-blur-glass border-border/50">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">Loading…</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!session?.access_token) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 py-12">
          <Card className="bg-card/60 backdrop-blur-glass border-border/50">
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Creating a library requires an account. Sign in to generate and publish libraries.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => navigate('/auth')}>Sign in</Button>
                <Button variant="outline" onClick={() => navigate('/inventory')}>
                  Back to Library
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }


  const handleGenerate = async () => {
    if (!keywords.trim()) {
      toast({
        title: 'Keywords required',
        description: 'Enter what kind of library you want to create.',
        variant: 'destructive',
      });
      return;
    }

    if (USE_AGENTIC_BACKEND && !session?.access_token) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to generate a library.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (!USE_AGENTIC_BACKEND) {
        headers.Authorization = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
      } else if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch(GENERATE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          keywords: keywords.trim(),
          title: title.trim() || undefined,
          customInstructions: customInstructions.trim() || undefined,
          preferredCategories: preferredCategories.length > 0 ? preferredCategories : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate library');
      }

      const schema: GeneratedSchema = await response.json();

      setGeneratedSchema(schema);
      setPromptInventory(schema.summary || '');
      setCategoryItemInputs({});

      // Auto-fill title if empty
      if (!title.trim()) {
        const autoTitle = keywords.trim().split(' ').slice(0, 3).map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ') + ' Library';
        setTitle(autoTitle);
      }

      // Use suggested tags if available
      if (schema.suggestedTags && schema.suggestedTags.length > 0) {
        setTags(schema.suggestedTags.slice(0, 4));
      }

      toast({
        title: 'Library generated!',
        description: `Created ${schema.categories.length} categories with ${schema.categories.reduce((sum, c) => sum + c.items.length, 0)} items.`,
      });
      void logMvpEvent({
        eventName: 'generate_library',
        userId: session?.user?.id,
        path: window.location.pathname,
        metadata: {
          categoryCount: schema.categories.length,
          itemCount: schema.categories.reduce((sum, c) => sum + c.items.length, 0),
        },
      });
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: getFriendlyErrorMessage(error, 'Please try again.'),
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
        description: 'Add a title before creating the library.',
        variant: 'destructive',
      });
      return;
    }

    if (!generatedSchema) {
      toast({
        title: 'Generate library first',
        description: 'Use the generate button to create your library.',
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

    if (tags.length > maxInventoryTags) {
      toast({
        title: 'Too many tags',
        description: `Please use ${maxInventoryTags} tags or fewer.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      const promptCategories = categoryNames.join(', ');
      const inventory = await createInventory.mutateAsync({
        title: title.trim(),
        promptInventory: promptInventory.trim(),
        promptCategories,
        generatedSchema: generatedSchema as unknown as Json,
        reviewSections: DEFAULT_ADDITIONAL_SECTIONS,
        includeScore: true,
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
        {/* Sub-header row: Library + Help buttons */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Library</h2>
          <div className="flex items-center gap-1">
            <InventoryTourButton onClick={() => setShowTour(true)} />
            <InventoryHelpButton onClick={() => setShowHelp(true)} />
          </div>
        </div>

        {/* Tour Banner (first-time users) */}
        {showTourBanner && (
          <InventoryTourBanner
            onStartTour={() => {
              setShowTourBanner(false);
              setShowTour(true);
            }}
            onDismiss={() => setShowTourBanner(false)}
          />
        )}

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
            Describe what you want to build, and AI will generate your library
          </p>
        </div>

        {/* Step 1: Keywords Generation */}
        <Card className="bg-card/60 backdrop-blur-glass border-border/50 animate-fade-in">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              What kind of library?
            </CardTitle>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !keywords.trim()}
              className="gap-2"
              data-help-id="generate"
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isGenerating ? 'Generating...' : generatedSchema ? 'Regenerate' : 'Generate'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2" data-help-id="keywords">
              <Label htmlFor="keywords">Describe your library in a few words</Label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g., skincare routine, green smoothie, morning habits..."
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              />
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

            {/* Advanced Options - Collapsed by default */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between text-muted-foreground hover:text-foreground"
                  data-help-id="advanced-options"
                >
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Advanced Options
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
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
                <div className="space-y-3">
                  <div>
                    <Label>Preferred categories (optional)</Label>
                    <p className="text-xs text-muted-foreground">
                      We will always generate 6 categories total.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {preferredCategories.map((category, index) => (
                      <Badge key={`${category}-${index}`} variant="secondary" className="gap-1">
                        {category}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4"
                          onClick={() => {
                            setPreferredCategories((prev) => prev.filter((_, i) => i !== index));
                            setPreferredCategoryError('');
                          }}
                          aria-label="Remove category"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={preferredCategoryInput}
                      onChange={(event) => setPreferredCategoryInput(event.target.value)}
                      placeholder="Add category"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          const value = preferredCategoryInput.trim();
                          if (!value) return;
                          if (preferredCategories.length >= maxPreferredCategories) {
                            setPreferredCategoryError('You can only add up to 6 categories.');
                            return;
                          }
                          setPreferredCategories((prev) => [...prev, value]);
                          setPreferredCategoryInput('');
                          setPreferredCategoryError('');
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const value = preferredCategoryInput.trim();
                        if (!value) return;
                        if (preferredCategories.length >= maxPreferredCategories) {
                          setPreferredCategoryError('You can only add up to 6 categories.');
                          return;
                        }
                        setPreferredCategories((prev) => [...prev, value]);
                        setPreferredCategoryInput('');
                        setPreferredCategoryError('');
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  {preferredCategoryError && (
                    <p className="text-xs text-destructive">{preferredCategoryError}</p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* Step 2: Generated Schema Preview & Edit */}
        {generatedSchema && (
          <>
            <Card className="bg-card/60 backdrop-blur-glass border-border/50 animate-fade-in">
              <CardHeader>
                <CardTitle>Library Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inventory-title">Title</Label>
                  <Input
                    id="inventory-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My Custom Library"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inventory-description">Description</Label>
                  <Textarea
                    id="inventory-description"
                    value={promptInventory}
                    onChange={(e) => setPromptInventory(e.target.value)}
                    placeholder="What this library is for..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/60 backdrop-blur-glass border-border/50 animate-fade-in" data-help-id="edit-categories">
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

            <Card className="bg-card/60 backdrop-blur-glass border-border/50 animate-fade-in" data-help-id="tags">
              <CardHeader>
                <CardTitle>Discovery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions || []} maxTags={maxInventoryTags} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3">
                  <div>
                    <p className="font-medium">Public library</p>
                    <p className="text-sm text-muted-foreground">Public libraries appear in search.</p>
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
              data-help-id="publish"
            >
              {createInventory.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Create Library
            </Button>
          </>
        )}
      </main>

      {/* Tour and Help Overlays */}
      <InventoryCreateTour
        isActive={showTour}
        onComplete={() => setShowTour(false)}
        onSkip={() => setShowTour(false)}
      />
      <InventoryCreateHelpOverlay
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        onStartTour={() => {
          setShowHelp(false);
          setShowTour(true);
        }}
      />
    </div>
  );
}

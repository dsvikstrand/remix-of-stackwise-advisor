import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BlueprintItemPicker } from '@/components/blueprint/BlueprintItemPicker';
import { StepAccordion, type BlueprintStep } from '@/components/blueprint/StepAccordion';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, ArrowRight, RotateCcw, Wand2, Lock } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

type InventoryCategory = { name: string; items: string[] };

type HomeDraftV1 = {
  version: 1;
  inventoryId: string;
  title: string;
  selectedItems: Record<string, string[]>;
  steps: BlueprintStep[];
  source: 'home-starter' | 'home-example';
};

const HOME_DRAFT_KEY = 'blueprints_home_draft_v1';

const FEATURED = [
  { key: 'morning', title: 'HOME MORNING ROUTINE LIBRARY', fallbackIlike: '%morning routine%library%' },
  { key: 'skincare', title: 'Home Skincare Routine Library', fallbackIlike: '%skincare%routine%library%' },
] as const;

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
    .filter((category) => category.name.trim().length > 0 && category.items.length > 0);
}

function uniqStrings(values: string[]) {
  return Array.from(new Set(values));
}

function pushSelected(map: Record<string, string[]>, category: string, item: string) {
  const existing = new Set(map[category] || []);
  existing.add(item);
  map[category] = Array.from(existing);
}

function findItemsByNeedle(categories: InventoryCategory[], needles: string[]) {
  const hits: Array<{ category: string; item: string }> = [];
  const normalizedNeedles = needles.map((n) => n.toLowerCase());

  categories.forEach((cat) => {
    cat.items.forEach((item) => {
      const lower = item.toLowerCase();
      if (normalizedNeedles.some((needle) => lower.includes(needle))) {
        hits.push({ category: cat.name, item });
      }
    });
  });

  return hits;
}

function buildExampleDraft(featureKey: (typeof FEATURED)[number]['key'], inventoryId: string, inventoryTitle: string, categories: InventoryCategory[]): HomeDraftV1 {
  // Best-effort: prefer meaningful items, but fall back to "first N items" if nothing matches.
  const allItems = categories.flatMap((c) => c.items.map((item) => ({ category: c.name, item })));
  const fallback = allItems.slice(0, 10);

  const morningSteps = [
    { title: 'Wake up & reset', needles: ['alarm', 'light', 'water', 'curtain', 'lamp'] },
    { title: 'Hygiene', needles: ['tooth', 'floss', 'cleanser', 'deodor', 'shower', 'sunscreen'] },
    { title: 'Move a bit', needles: ['yoga', 'mat', 'shoe', 'run', 'band', 'dumbbell', 'stretch'] },
    { title: 'Plan the day', needles: ['journal', 'planner', 'calendar', 'notebook', 'todo', 'timer'] },
  ];

  const skincareSteps = [
    { title: 'Cleanse', needles: ['cleanser', 'wash', 'gel', 'foam'] },
    { title: 'Treat', needles: ['serum', 'vitamin', 'retinol', 'niacin', 'acid', 'bha', 'aha'] },
    { title: 'Moisturize', needles: ['moist', 'cream', 'lotion'] },
    { title: 'Protect (AM)', needles: ['sunscreen', 'spf'] },
  ];

  const spec = featureKey === 'skincare' ? skincareSteps : morningSteps;

  const selectedItems: Record<string, string[]> = {};
  const steps: BlueprintStep[] = [];

  spec.forEach((step, index) => {
    const matches = findItemsByNeedle(categories, step.needles);
    const picked = (matches.length > 0 ? matches : fallback).slice(0, 3);
    const itemKeys = picked.map((p) => `${p.category}::${p.item}`);
    picked.forEach((p) => pushSelected(selectedItems, p.category, p.item));

    steps.push({
      id: `home-step-${index + 1}`,
      title: step.title,
      description: '',
      itemKeys: uniqStrings(itemKeys),
    });
  });

  const titleBase = featureKey === 'skincare' ? 'Skincare Routine Blueprint' : 'Morning Routine Blueprint';
  return {
    version: 1,
    inventoryId,
    title: titleBase,
    selectedItems,
    steps,
    source: 'home-example',
  };
}

export function FeaturedLibrariesStarter() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [activeKey, setActiveKey] = useState<(typeof FEATURED)[number]['key']>(FEATURED[0].key);
  const [stateByInventoryId, setStateByInventoryId] = useState<
    Record<
      string,
      {
        categories: InventoryCategory[];
        selectedItems: Record<string, string[]>;
        itemContexts: Record<string, string>;
        steps: BlueprintStep[];
        activeStepId: string | null;
        title: string;
      }
    >
  >({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ['home-featured-inventories-v1'],
    queryFn: async () => {
      const results = await Promise.all(
        FEATURED.map(async (f) => {
          const baseQuery = supabase
            .from('inventories')
            .select('id, title, generated_schema, is_public')
            .eq('is_public', true)
            .limit(1);

          const exact = await baseQuery.ilike('title', f.title);
          const exactRow = exact.data?.[0];
          if (exactRow) return { featureKey: f.key, ...exactRow };

          const fallback = await baseQuery.ilike('title', f.fallbackIlike);
          const fallbackRow = fallback.data?.[0];
          if (fallbackRow) return { featureKey: f.key, ...fallbackRow };

          return null;
        })
      );

      return results.filter((r): r is NonNullable<typeof r> => !!r);
    },
  });

  const activeInventory = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data.find((row) => row.featureKey === activeKey) ?? data[0];
  }, [data, activeKey]);

  const ensureStateForActive = () => {
    if (!activeInventory) return;
    setStateByInventoryId((prev) => {
      if (prev[activeInventory.id]) return prev;
      const cats = parseCategories(activeInventory.generated_schema as Json);
      return {
        ...prev,
        [activeInventory.id]: {
          categories: cats,
          selectedItems: {},
          itemContexts: {},
          steps: [],
          activeStepId: null,
          title: activeInventory.title,
        },
      };
    });
  };

  const activeState = useMemo(() => {
    if (!activeInventory) return null;
    return stateByInventoryId[activeInventory.id] || null;
  }, [activeInventory, stateByInventoryId]);

  const categories = activeState?.categories || [];
  const selectedItems = activeState?.selectedItems || {};
  const itemContexts = activeState?.itemContexts || {};
  const steps = activeState?.steps || [];
  const activeStepId = activeState?.activeStepId || null;

  const selectedCount = useMemo(() => {
    return Object.values(selectedItems).reduce((sum, items) => sum + items.length, 0);
  }, [selectedItems]);

  const setActiveState = (updates: Partial<NonNullable<typeof activeState>>) => {
    if (!activeInventory) return;
    setStateByInventoryId((prev) => ({
      ...prev,
      [activeInventory.id]: {
        ...(prev[activeInventory.id] || {
          categories: parseCategories(activeInventory.generated_schema as Json),
          selectedItems: {},
          itemContexts: {},
          steps: [],
          activeStepId: null,
          title: activeInventory.title,
        }),
        ...updates,
      },
    }));
  };

  const getItemKey = (categoryName: string, item: string) => `${categoryName}::${item}`;

  const removeItemFromSteps = (itemKey: string) => {
    setActiveState({
      steps: steps.map((step) => ({ ...step, itemKeys: step.itemKeys.filter((k) => k !== itemKey) })),
    });
  };

  const addItemToActiveStep = (itemKey: string) => {
    if (steps.length === 0) {
      const newId = crypto.randomUUID();
      setActiveState({
        activeStepId: newId,
        steps: [{ id: newId, title: '', description: '', itemKeys: [itemKey] }],
      });
      return;
    }

    const targetId = steps.find((s) => s.id === activeStepId)?.id || steps[steps.length - 1].id;
    setActiveState({
      steps: steps.map((step) => {
        if (step.id !== targetId) return step;
        if (step.itemKeys.includes(itemKey)) return step;
        return { ...step, itemKeys: [...step.itemKeys, itemKey] };
      }),
    });
  };

  const toggleItem = (categoryName: string, item: string) => {
    const itemKey = getItemKey(categoryName, item);
    const nextSelected: Record<string, string[]> = { ...selectedItems };
    const existing = new Set(nextSelected[categoryName] || []);
    const wasSelected = existing.has(item);
    if (wasSelected) existing.delete(item);
    else existing.add(item);
    nextSelected[categoryName] = Array.from(existing);
    setActiveState({ selectedItems: nextSelected });

    if (wasSelected) removeItemFromSteps(itemKey);
    else addItemToActiveStep(itemKey);
  };

  const addCustomItem = (categoryName: string, itemName: string) => {
    const nextCategories = categories.map((c) =>
      c.name === categoryName
        ? { ...c, items: c.items.includes(itemName) ? c.items : [...c.items, itemName] }
        : c
    );
    const nextSelected: Record<string, string[]> = {
      ...selectedItems,
      [categoryName]: [...(selectedItems[categoryName] || []), itemName],
    };
    setActiveState({ categories: nextCategories, selectedItems: nextSelected });
    addItemToActiveStep(getItemKey(categoryName, itemName));
  };

  const handleAddStep = () => {
    const newStep: BlueprintStep = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      itemKeys: [],
    };
    setActiveState({ steps: [...steps, newStep], activeStepId: newStep.id });
  };

  const handleUpdateStep = (stepId: string, updates: Partial<BlueprintStep>) => {
    setActiveState({ steps: steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)) });
  };

  const handleRemoveStep = (stepId: string) => {
    const stepToRemove = steps.find((s) => s.id === stepId);
    const itemKeysToRemove = new Set(stepToRemove?.itemKeys || []);

    const nextSelected: Record<string, string[]> = {};
    Object.entries(selectedItems).forEach(([category, items]) => {
      const filtered = items.filter((it) => !itemKeysToRemove.has(getItemKey(category, it)));
      if (filtered.length > 0) nextSelected[category] = filtered;
    });

    const nextContexts = { ...itemContexts };
    itemKeysToRemove.forEach((key) => delete nextContexts[key]);

    const remaining = steps.filter((s) => s.id !== stepId);
    const nextActive =
      activeStepId === stepId
        ? remaining.length > 0
          ? remaining[remaining.length - 1].id
          : null
        : activeStepId;

    setActiveState({
      selectedItems: nextSelected,
      itemContexts: nextContexts,
      steps: remaining,
      activeStepId: nextActive,
    });
  };

  const handleReorderSteps = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const next = [...steps];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setActiveState({ steps: next });
  };

  const removeItem = (categoryName: string, item: string) => {
    const itemKey = getItemKey(categoryName, item);
    const nextSelected: Record<string, string[]> = {
      ...selectedItems,
      [categoryName]: (selectedItems[categoryName] || []).filter((i) => i !== item),
    };
    const nextContexts = { ...itemContexts };
    delete nextContexts[itemKey];
    setActiveState({ selectedItems: nextSelected, itemContexts: nextContexts });
    removeItemFromSteps(itemKey);
  };

  const updateItemContext = (categoryName: string, item: string, context: string) => {
    setActiveState({
      itemContexts: {
        ...itemContexts,
        [getItemKey(categoryName, item)]: context,
      },
    });
  };

  const clearSelection = () => {
    setActiveState({
      selectedItems: {},
      itemContexts: {},
      steps: steps.map((s) => ({ ...s, itemKeys: [] })),
    });
  };

  const applyExampleToLocal = () => {
    if (!activeInventory) return;
    const draft = buildExampleDraft(activeInventory.featureKey, activeInventory.id, activeInventory.title, categories);
    setActiveState({
      title: draft.title,
      selectedItems: draft.selectedItems,
      itemContexts: {},
      steps: draft.steps,
      activeStepId: draft.steps[0]?.id || null,
    });
    toast({
      title: 'Example loaded',
      description: 'Your blueprint has been pre-filled with steps and items.',
    });
  };

  const openBuilderWithDraft = (source: HomeDraftV1['source']) => {
    if (!activeInventory) return;
    const draft: HomeDraftV1 = {
      version: 1,
      inventoryId: activeInventory.id,
      title: activeState?.title || activeInventory.title,
      selectedItems,
      steps,
      source,
    };
    sessionStorage.setItem(HOME_DRAFT_KEY, JSON.stringify(draft));
    navigate(`/inventory/${draft.inventoryId}/build`);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-primary uppercase tracking-wide">Start building</p>
          <h2 className="text-xl font-semibold tracking-tight">Featured libraries</h2>
          <p className="text-sm text-muted-foreground">
            Pick a library, select a few items, or load an example blueprint. You will need to sign in to use AI review, banners, and publishing.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit text-xs">Starter</Badge>
      </div>

      <Card className="bg-card/60 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {FEATURED.map((f) => (
                <Button
                  key={f.key}
                  type="button"
                  size="sm"
                  variant={activeKey === f.key ? 'default' : 'outline'}
                  onClick={() => setActiveKey(f.key)}
                  disabled={!data?.some((row) => row.featureKey === f.key)}
                >
                  {f.key === 'morning' ? 'Morning routine' : 'Skincare'}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-2"
                onClick={clearSelection}
                disabled={!activeInventory}
              >
                <RotateCcw className="h-4 w-4" />
                Clear all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  ensureStateForActive();
                  applyExampleToLocal();
                }}
                disabled={!activeInventory}
              >
                <Wand2 className="h-4 w-4" />
                Auto-generate Blueprint
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-2"
                onClick={() => {
                  ensureStateForActive();
                  openBuilderWithDraft('home-starter');
                }}
                disabled={!activeInventory}
              >
                Open Builder
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {activeInventory?.title || 'Loading…'}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{selectedCount} item{selectedCount === 1 ? '' : 's'} selected</p>
          <p className="text-xs text-muted-foreground/80">
            This loads a prebuilt example (no AI). Sign in to unlock AI review, banners, and publishing.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-4/6" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError || !activeInventory ? (
            <div className="text-sm text-muted-foreground">
              Featured libraries are not available right now. Try browsing the Library page instead.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-card/60 backdrop-blur-glass rounded-2xl border border-border/50 overflow-hidden">
                <div className="p-4 border-b border-border/30 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-primary uppercase tracking-wide">
                      {activeKey === 'morning' ? 'Morning routine' : 'Skincare'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Search items, tap to add them, and build steps automatically.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      ensureStateForActive();
                      applyExampleToLocal();
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                    Auto-generate Blueprint
                  </Button>
                </div>
                <div className="p-4">
                  <BlueprintItemPicker
                    categories={categories}
                    selectedItems={selectedItems}
                    onToggleItem={(cat, item) => {
                      ensureStateForActive();
                      toggleItem(cat, item);
                    }}
                    onAddCustomItem={(cat, item) => {
                      ensureStateForActive();
                      addCustomItem(cat, item);
                    }}
                  />
                </div>
              </div>

              <div className="bg-card/60 backdrop-blur-glass rounded-2xl border border-border/50 overflow-hidden">
                <div className="p-4 border-b border-border/30 flex items-center justify-between">
                  <p className="text-sm font-semibold tracking-tight">Steps</p>
                  <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={clearSelection}>
                    <RotateCcw className="h-4 w-4" />
                    Clear all selections
                  </Button>
                </div>
                <div className="p-4">
                  <StepAccordion
                    steps={steps}
                    activeStepId={activeStepId}
                    onSetActive={(id) => setActiveState({ activeStepId: id })}
                    onUpdateStep={(id, updates) => handleUpdateStep(id, updates)}
                    onRemoveStep={(id) => handleRemoveStep(id)}
                    onAddStep={handleAddStep}
                    onReorderSteps={handleReorderSteps}
                    onRemoveItem={(cat, item) => removeItem(cat, item)}
                    onUpdateItemContext={(cat, item, context) => updateItemContext(cat, item, context)}
                    itemContexts={itemContexts}
                  />
                </div>
                <div className="p-4 border-t border-border/30 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    {user || session?.access_token ? (
                      <span>Continue to unlock AI review, banners, and publishing.</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5" />
                        Sign in to use AI review, banners, and publishing.
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openBuilderWithDraft('home-starter')}
                    >
                      Continue building
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        if (!session?.access_token) {
                          openBuilderWithDraft('home-starter');
                          toast({
                            title: 'Sign in required',
                            description: 'Please sign in on the build page to generate an AI review.',
                            variant: 'destructive',
                          });
                          return;
                        }
                        openBuilderWithDraft('home-starter');
                      }}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      Review with AI
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

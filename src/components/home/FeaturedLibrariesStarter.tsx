import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DemoPillPicker } from '@/components/home/DemoPillPicker';
import { DemoBlueprintPreview } from '@/components/home/DemoBlueprintPreview';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, ArrowRight } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

type InventoryCategory = { name: string; items: string[] };

type HomeDraftV1 = {
  version: 1;
  inventoryId: string;
  title: string;
  selectedItems: Record<string, string[]>;
  itemContexts?: Record<string, string>;
  modeHint?: 'simple' | 'full';
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

function noteify(parts: string[]) {
  return parts.filter((p) => p.trim().length > 0).slice(0, 2).join(', ');
}

function buildContext(featureKey: (typeof FEATURED)[number]['key'], stepTitle: string, item: string) {
  const lower = item.toLowerCase();
  const notes: string[] = [];

  if (featureKey === 'skincare') {
    if (lower.includes('spf') || lower.includes('sunscreen')) notes.push('AM');
    if (lower.includes('retinol')) notes.push('PM');
    if (lower.includes('cleanser') || lower.includes('wash')) notes.push('daily');
  } else {
    if (lower.includes('water') || lower.includes('hydrate')) notes.push('first');
    if (lower.includes('alarm') || lower.includes('light')) notes.push('wake-up');
    if (lower.includes('journal') || lower.includes('planner') || lower.includes('calendar')) notes.push('focus');
  }

  notes.push(stepTitle);
  return noteify(notes);
}

function buildExampleSelection(
  featureKey: (typeof FEATURED)[number]['key'],
  inventoryId: string,
  inventoryTitle: string,
  categories: InventoryCategory[]
) {
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
  const itemContexts: Record<string, string> = {};

  spec.forEach((step) => {
    const matches = findItemsByNeedle(categories, step.needles);
    const picked = (matches.length > 0 ? matches : fallback).slice(0, 3);
    picked.forEach((p) => {
      pushSelected(selectedItems, p.category, p.item);
      const key = `${p.category}::${p.item}`;
      itemContexts[key] = buildContext(featureKey, step.title, p.item);
    });
  });

  const titleBase = featureKey === 'skincare' ? 'Skincare Routine Blueprint' : 'Morning Routine Blueprint';
  return {
    version: 1 as const,
    inventoryId,
    title: titleBase,
    selectedItems,
    itemContexts,
    source: 'home-example' as const,
  };
}

// ─── Auto-play: stagger-select items when section scrolls into view ───

function useAutoPlayDemo(
  categories: InventoryCategory[],
  featureKey: string,
  onSelect: (category: string, item: string) => void,
  enabled: boolean
) {
  const hasPlayed = useRef(false);
  const [animatingItems, setAnimatingItems] = useState<Set<string>>(new Set());

  const play = useCallback(() => {
    if (hasPlayed.current || categories.length === 0) return;
    hasPlayed.current = true;

    // Pick 3 items across different categories
    const picks: Array<{ category: string; item: string }> = [];
    for (const cat of categories) {
      if (picks.length >= 3) break;
      if (cat.items.length > 0) {
        picks.push({ category: cat.name, item: cat.items[0] });
      }
    }

    picks.forEach(({ category, item }, i) => {
      setTimeout(() => {
        const key = `${category}::${item}`;
        setAnimatingItems((prev) => new Set(prev).add(key));
        onSelect(category, item);

        // Remove animation class after it plays
        setTimeout(() => {
          setAnimatingItems((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }, 600);
      }, 400 + i * 350);
    });
  }, [categories, onSelect]);

  return { play, animatingItems };
}

export function FeaturedLibrariesStarter() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { toast } = useToast();
  const sectionRef = useRef<HTMLElement>(null);
  const [activeKey, setActiveKey] = useState<(typeof FEATURED)[number]['key']>(FEATURED[0].key);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
  const [stateByInventoryId, setStateByInventoryId] = useState<
    Record<
      string,
      {
        categories: InventoryCategory[];
        selectedItems: Record<string, string[]>;
        itemContexts: Record<string, string>;
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

  const activeInventoryCategories = useMemo(() => {
    if (!activeInventory) return [] as InventoryCategory[];
    return parseCategories(activeInventory.generated_schema as Json);
  }, [activeInventory]);

  // Init state for active inventory (start empty for auto-play)
  useEffect(() => {
    if (!activeInventory) return;
    setStateByInventoryId((prev) => {
      if (prev[activeInventory.id]) return prev;
      return {
        ...prev,
        [activeInventory.id]: {
          categories: activeInventoryCategories,
          selectedItems: {},
          itemContexts: {},
          title: activeInventory.title,
        },
      };
    });
  }, [activeInventory?.id, activeInventoryCategories, activeInventory?.title]);

  const activeState = useMemo(() => {
    if (!activeInventory) return null;
    return stateByInventoryId[activeInventory.id] || null;
  }, [activeInventory, stateByInventoryId]);

  const categories = activeState?.categories || activeInventoryCategories;
  const selectedItems = activeState?.selectedItems || {};
  const itemContexts = activeState?.itemContexts || {};

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
          title: activeInventory.title,
        }),
        ...updates,
      },
    }));
  };

  const getItemKey = (categoryName: string, item: string) => `${categoryName}::${item}`;

  const toggleItem = useCallback((categoryName: string, item: string) => {
    setStateByInventoryId((prev) => {
      if (!activeInventory) return prev;
      const current = prev[activeInventory.id];
      if (!current) return prev;

      const itemKey = `${categoryName}::${item}`;
      const nextSelected = { ...current.selectedItems };
      const existing = new Set(nextSelected[categoryName] || []);
      const wasSelected = existing.has(item);
      if (wasSelected) existing.delete(item);
      else existing.add(item);
      nextSelected[categoryName] = Array.from(existing);
      const nextContexts = { ...current.itemContexts };
      if (wasSelected) delete nextContexts[itemKey];

      return {
        ...prev,
        [activeInventory.id]: {
          ...current,
          selectedItems: nextSelected,
          itemContexts: nextContexts,
        },
      };
    });
  }, [activeInventory]);

  // Auto-play
  const { play: playAutoDemo, animatingItems } = useAutoPlayDemo(
    categories,
    activeKey,
    toggleItem,
    !hasAutoPlayed && !isLoading && !!activeInventory
  );

  // IntersectionObserver to trigger auto-play
  useEffect(() => {
    if (hasAutoPlayed || isLoading || !activeInventory || categories.length === 0) return;

    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasAutoPlayed(true);
          playAutoDemo();
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasAutoPlayed, isLoading, activeInventory, categories.length, playAutoDemo]);

  const openBuilderWithDraft = (source: HomeDraftV1['source']) => {
    if (!activeInventory) return;
    if (!session?.access_token) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to use the full builder.',
      });
      navigate('/auth');
      return;
    }
    const draft: HomeDraftV1 = {
      version: 1,
      inventoryId: activeInventory.id,
      title: activeState?.title || activeInventory.title,
      selectedItems,
      itemContexts,
      modeHint: 'full',
      source,
    };
    sessionStorage.setItem(HOME_DRAFT_KEY, JSON.stringify(draft));
    navigate(`/inventory/${draft.inventoryId}/build`);
  };

  const blueprintTitle = useMemo(() => {
    if (activeKey === 'skincare') return 'My Skincare Routine';
    return 'My Morning Routine';
  }, [activeKey]);

  return (
    <section ref={sectionRef} className="space-y-5">
      {/* Header — invitation, not documentation */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">
            Build a blueprint in 30 seconds
          </h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Tap items below to build your routine. See your blueprint come together in real time.
        </p>
      </div>

      {/* Library switcher */}
      <div className="flex items-center justify-center gap-2">
        {FEATURED.map((f) => (
          <Button
            key={f.key}
            type="button"
            size="sm"
            variant={activeKey === f.key ? 'default' : 'outline'}
            onClick={() => setActiveKey(f.key)}
            disabled={!data?.some((row) => row.featureKey === f.key)}
            className="rounded-full"
          >
            {f.key === 'morning' ? '🌅 Morning routine' : '✨ Skincare'}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-full rounded-full" />
                <Skeleton className="h-8 w-5/6 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : isError || !activeInventory ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          Featured libraries aren't available right now. Try the Library page instead.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left: Pill picker */}
          <div className="lg:col-span-3 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                Tap to select · {selectedCount} chosen
              </p>
              {selectedCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveState({ selectedItems: {}, itemContexts: {} })}
                  className="text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
            <DemoPillPicker
              categories={categories}
              selectedItems={selectedItems}
              onToggleItem={toggleItem}
              animatingItems={animatingItems}
            />
          </div>

          {/* Right: Live blueprint preview */}
          <div className="lg:col-span-2 space-y-3">
            {selectedCount > 0 ? (
              <DemoBlueprintPreview
                title={blueprintTitle}
                selectedItems={selectedItems}
                itemContexts={itemContexts}
                onContinue={() => openBuilderWithDraft('home-starter')}
                isAuthenticated={!!session?.access_token}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-8 text-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="h-6 w-6 text-primary/50" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Your blueprint preview will appear here
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Select a few items to see it build in real time
                </p>
              </div>
            )}

            {/* Single CTA */}
            {selectedCount > 0 && (
              <Button
                className="w-full gap-2"
                onClick={() => openBuilderWithDraft('home-starter')}
              >
                Continue in full builder
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

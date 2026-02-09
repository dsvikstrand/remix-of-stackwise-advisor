import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TagInput } from '@/components/shared/TagInput';
import { MixButton } from '@/components/blend/MixButton';
import { BlueprintItemPicker } from '@/components/blueprint/BlueprintItemPicker';
import { BlueprintAnalysisView } from '@/components/blueprint/BlueprintAnalysisView';
import { BlueprintLoadingAnimation } from '@/components/blueprint/BlueprintLoadingAnimation';
import { BuildPageGuide } from '@/components/blueprint/BuildPageGuide';
import { StepAccordion, type BlueprintStep } from '@/components/blueprint/StepAccordion';
import { BlueprintRecipeAccordion } from '@/components/blueprint/BlueprintRecipeAccordion';
import { BuildHelpOverlay, HelpButton } from '@/components/blueprint/BuildHelpOverlay';
import { BuildTour, TourBanner, TourButton, isTourCompleted } from '@/components/blueprint/BuildTour';
import { useInventory } from '@/hooks/useInventories';
import { useBlueprint, useCreateBlueprint, useUpdateBlueprint } from '@/hooks/useBlueprints';
import { useTagSuggestions } from '@/hooks/useTags';
import { useRecentTags } from '@/hooks/useRecentTags';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logMvpEvent } from '@/lib/logEvent';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
	  BLUEPRINT_FOCUS_OPTIONS,
	  LENGTH_OPTIONS,
	  makeBlueprintGenerationControlsV0,
	  type BlueprintFocus,
	  type CautionLevel,
	  type LengthHint,
	  type VarietyLevel,
	  type LibraryDomain,
	} from '@/lib/generationControls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  MAX_ADDITIONAL_SECTIONS,
  MAX_REVIEW_SECTIONS,
  OVERVIEW_SECTION,
  buildReviewSections,
  formatReviewSection,
  normalizeAdditionalSections,
} from '@/lib/reviewSections';
import { ArrowLeft, ChevronDown, RefreshCcw, Settings2, Sparkles, X } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

import { config, getFunctionUrl } from '@/config/runtime';

const ANALYZE_BLUEPRINT_URL = getFunctionUrl('analyze-blueprint');
const BANNER_URL = config.agenticBackendUrl ? getFunctionUrl('generate-banner') : '';
const GENERATE_BLUEPRINT_URL = config.agenticBackendUrl ? getFunctionUrl('generate-blueprint') : '';

const HOME_DRAFT_KEY = 'blueprints_home_draft_v1';

interface InventoryCategory {
  name: string;
  items: string[];
}

type ItemValue = string | { name?: string; context?: string };
type StepItem = { category?: string; name?: string; context?: string };
type GeneratedStep = {
  title: string;
  description?: string | null;
  items: Array<{ category: string; name: string; context?: string }>;
};
type GeneratedBlueprint = {
  title: string;
  steps: GeneratedStep[];
};

type HomeDraftV1 = {
  version: 1;
  inventoryId: string;
  title: string;
  selectedItems: Record<string, string[]>;
  steps?: BlueprintStep[];
  itemContexts?: Record<string, string>;
  modeHint?: 'simple' | 'full';
  source: 'home-starter' | 'home-example';
};

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
  const { inventoryId, blueprintId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { session, user } = useAuth();
  const isEditing = !!blueprintId;
  const { data: blueprint, isLoading: blueprintLoading } = useBlueprint(blueprintId);
  const inventoryLookupId = inventoryId || blueprint?.inventory_id || undefined;
  const { data: inventory, isLoading: inventoryLoading } = useInventory(inventoryLookupId);
  const { data: tagSuggestions } = useTagSuggestions();
  const { recentTags, addRecentTags } = useRecentTags();
  const createBlueprint = useCreateBlueprint();
  const updateBlueprint = useUpdateBlueprint();

  // Blueprint state
  const [title, setTitle] = useState('');
  const [builderMode, setBuilderMode] = useState<'full' | 'simple'>('full');
  const [selectedItems, setSelectedItems] = useState<Record<string, string[]>>({});
  const [itemContexts, setItemContexts] = useState<Record<string, string>>({});
  const [mixNotes, setMixNotes] = useState('');
  const [reviewPrompt, setReviewPrompt] = useState('');
  const [review, setReview] = useState('');
  const [generateBanner, setGenerateBanner] = useState(true);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [isGeneratingBanner, setIsGeneratingBanner] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [additionalSections, setAdditionalSections] = useState<string[]>([]);
  const [sectionInput, setSectionInput] = useState('');
  const [sectionError, setSectionError] = useState('');
  const [includeScore, setIncludeScore] = useState(true);
  const [steps, setSteps] = useState<BlueprintStep[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showAutoGenerate, setShowAutoGenerate] = useState(false);
  const [autoTitle, setAutoTitle] = useState('');
  const [autoNotes, setAutoNotes] = useState('');
	  const [autoFocus, setAutoFocus] = useState<BlueprintFocus>('starter');
	  const [autoFocusCustom, setAutoFocusCustom] = useState('');
	  const [autoLength, setAutoLength] = useState<LengthHint>('medium');
	  const [autoVariety, setAutoVariety] = useState<VarietyLevel>('medium');
	  const [autoCaution, setAutoCaution] = useState<CautionLevel>('balanced');
	  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [autoGenerationControls, setAutoGenerationControls] = useState<Json | null>(null);

  // Help & Tour state
  const [showHelp, setShowHelp] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showTourBanner, setShowTourBanner] = useState(() => !isTourCompleted());
  const hasLoggedEdit = useRef(false);

  // Categories with custom items
  const [categories, setCategories] = useState<InventoryCategory[]>([]);

  const isOwner = !!(isEditing && blueprint && user && blueprint.creator_user_id === user.id);
  const isLoading = inventoryLoading || (isEditing && blueprintLoading);
  const canGenerateBanner = config.useAgenticBackend && (!!user || !!session?.access_token);
  const bannerHelpText = !config.useAgenticBackend
    ? 'Banner generation requires the agentic backend.'
    : !user && !session?.access_token
      ? 'Sign in to generate a banner.'
      : null;
  const autoGenerateHelpText = !config.useAgenticBackend
    ? 'Auto-generation requires the agentic backend.'
    : !session?.access_token
      ? 'Sign in to auto-generate a blueprint.'
      : null;

  const parseSelectedItemsWithContext = useCallback((selected: Json) => {
    const items: Record<string, string[]> = {};
    const contexts: Record<string, string> = {};
    if (!selected || typeof selected !== 'object' || Array.isArray(selected)) {
      return { items, contexts };
    }

    Object.entries(selected as Record<string, ItemValue[]>).forEach(([category, list]) => {
      if (!Array.isArray(list)) return;
      const names: string[] = [];
      list.forEach((entry) => {
        if (typeof entry === 'string') {
          names.push(entry);
          return;
        }
        if (!entry || typeof entry !== 'object') return;
        const name = typeof entry.name === 'string' ? entry.name : '';
        if (!name) return;
        names.push(name);
        if (typeof entry.context === 'string' && entry.context.trim()) {
          contexts[`${category}::${name}`] = entry.context.trim();
        }
      });
      if (names.length > 0) items[category] = names;
    });

    return { items, contexts };
  }, []);

  const parseStepsForBuilder = useCallback((stepsJson: Json) => {
    if (!stepsJson || typeof stepsJson !== 'object' || !Array.isArray(stepsJson)) return [] as BlueprintStep[];
    return stepsJson
      .filter((step) => step && typeof step === 'object')
      .map((step, index) => {
        const data = step as { id?: string; title?: string; description?: string | null; items?: StepItem[] };
        const itemKeys = (data.items || [])
          .map((item) => {
            const category = typeof item.category === 'string' ? item.category : '';
            const name = typeof item.name === 'string' ? item.name : '';
            if (!category || !name) return null;
            return `${category}::${name}`;
          })
          .filter((key): key is string => !!key);
        return {
          id: data.id || `step-${index}`,
          title: data.title || '',
          description: typeof data.description === 'string' ? data.description : '',
          itemKeys,
        } as BlueprintStep;
      });
  }, []);

  const extractStepItems = useCallback((stepsJson: Json) => {
    const items: Record<string, string[]> = {};
    const contexts: Record<string, string> = {};
    if (!stepsJson || typeof stepsJson !== 'object' || !Array.isArray(stepsJson)) {
      return { items, contexts };
    }
    stepsJson.forEach((step) => {
      const data = step as { items?: StepItem[] };
      (data.items || []).forEach((item) => {
        const category = typeof item.category === 'string' ? item.category : '';
        const name = typeof item.name === 'string' ? item.name : '';
        if (!category || !name) return;
        if (!items[category]) items[category] = [];
        if (!items[category].includes(name)) items[category].push(name);
        if (typeof item.context === 'string' && item.context.trim()) {
          contexts[`${category}::${name}`] = item.context.trim();
        }
      });
    });
    return { items, contexts };
  }, []);

  useEffect(() => {
    if (!inventory || isInitialized) return;
    if (isEditing && !blueprint) return;

    setCategories(parseCategories(inventory.generated_schema));
    setAdditionalSections(
      normalizeAdditionalSections(inventory.review_sections).slice(0, MAX_ADDITIONAL_SECTIONS)
    );
    setIncludeScore(inventory.include_score ?? true);

    if (isEditing && blueprint) {
      const parsed = parseSelectedItemsWithContext(blueprint.selected_items);
      const fromSteps = extractStepItems(blueprint.steps);
      const mergedItems: Record<string, string[]> = { ...parsed.items };
      Object.entries(fromSteps.items).forEach(([category, items]) => {
        const existing = new Set(mergedItems[category] || []);
        items.forEach((item) => existing.add(item));
        mergedItems[category] = Array.from(existing);
      });
      const mergedContexts = { ...parsed.contexts, ...fromSteps.contexts };
      setTitle(blueprint.title || inventory.title);
      setSelectedItems(mergedItems);
      setItemContexts(mergedContexts);
      setMixNotes(blueprint.mix_notes || '');
      setReviewPrompt(blueprint.review_prompt || '');
      setReview(blueprint.llm_review || '');
      setBannerUrl(blueprint.banner_url || null);
      setGenerateBanner(true);
      setTags(blueprint.tags.map((tag) => tag.slug));
      setIsPublic(blueprint.is_public);
      const initialSteps = parseStepsForBuilder(blueprint.steps);
      setSteps(initialSteps);
      setActiveStepId(initialSteps[0]?.id || null);
      setBuilderMode('full');
    } else {
      setTitle(inventory.title);
      setSteps([]);
      setActiveStepId(null);
      setBannerUrl(null);
      setGenerateBanner(true);
      setBuilderMode('full');

      // One-time Home prefill bridge (non-LLM): lets Home load starter items or a full example blueprint.
      // Intentional behavior: if present, it overwrites the current build state.
      try {
        const raw = sessionStorage.getItem(HOME_DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<HomeDraftV1>;
          sessionStorage.removeItem(HOME_DRAFT_KEY);

          if (
            parsed &&
            parsed.version === 1 &&
            typeof parsed.inventoryId === 'string' &&
            parsed.inventoryId === inventory.id
          ) {
            setTitle(typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : inventory.title);
            const draftSelected =
              parsed.selectedItems && typeof parsed.selectedItems === 'object' ? parsed.selectedItems : {};
            setSelectedItems(draftSelected);
            const draftContexts =
              parsed.itemContexts && typeof parsed.itemContexts === 'object' ? parsed.itemContexts : {};
            setItemContexts(draftContexts);
            setMixNotes('');
            setReviewPrompt('');
            setReview('');
            setTags([]);
            setIsPublic(true);
            setBannerUrl(null);
            setGenerateBanner(true);

            const modeHint = parsed.modeHint === 'simple' ? 'simple' : parsed.modeHint === 'full' ? 'full' : null;
            if (modeHint) setBuilderMode(modeHint);

            const nextSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
            if (nextSteps.length > 0) {
              setSteps(nextSteps);
              setActiveStepId(nextSteps[0]?.id || null);
            } else if (modeHint !== 'simple') {
              const itemKeys = Object.entries(draftSelected).flatMap(([category, items]) =>
                (items || []).map((item) => `${category}::${item}`)
              );
              if (itemKeys.length > 0) {
                const id = crypto.randomUUID();
                setSteps([{ id, title: '', description: '', itemKeys }]);
                setActiveStepId(id);
              } else {
                setSteps([]);
                setActiveStepId(null);
              }
            } else {
              setSteps([]);
              setActiveStepId(null);
            }
          }
        }
      } catch {
        // Ignore malformed payloads.
      }
    }

    setIsInitialized(true);
  }, [
    inventory,
    blueprint,
    isEditing,
    isInitialized,
    parseSelectedItemsWithContext,
    parseStepsForBuilder,
    extractStepItems,
  ]);

  useEffect(() => {
    if (!inventory) return;
    setAutoTitle((prev) => prev || title || inventory.title);
  }, [inventory, title]);

  const totalSelected = useMemo(
    () => Object.values(selectedItems).reduce((sum, items) => sum + items.length, 0),
    [selectedItems]
  );
  const categoryItemMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    categories.forEach((category) => {
      map.set(category.name, new Set(category.items));
    });
    return map;
  }, [categories]);
  const shouldConfirmOverwrite = totalSelected > 0 || steps.length > 0;

  useEffect(() => {
    if (hasLoggedEdit.current) return;
    if (!inventory) return;
    if (totalSelected <= 0) return;
    hasLoggedEdit.current = true;
    void logMvpEvent({
      eventName: 'edit_blueprint',
      userId: user?.id,
      blueprintId: blueprintId ?? null,
      path: location.pathname,
      metadata: {
        inventoryId: inventory.id,
        selectedCount: totalSelected,
        isEditing,
      },
    });
  }, [inventory, totalSelected, user?.id, blueprintId, location.pathname, isEditing]);

  useEffect(() => {
    if (!inventory) return;
    if (isEditing) return;
    void logMvpEvent({
      eventName: 'start_build',
      userId: user?.id,
      blueprintId: blueprintId ?? null,
      path: location.pathname,
      metadata: {
        inventoryId: inventory.id,
      },
    });
  }, [inventory, isEditing, user?.id, blueprintId, location.pathname]);

  const reviewSections = useMemo(
    () => buildReviewSections(additionalSections),
    [additionalSections]
  );

  const heroTitle = (isEditing ? blueprint?.title : inventory?.title) || (isEditing ? 'EDIT' : 'BUILD');

  const getItemKey = useCallback((categoryName: string, item: string) => `${categoryName}::${item}`, []);

  const removeItemFromSteps = useCallback((itemKey: string) => {
    setSteps((prev) =>
      prev.map((step) => ({
        ...step,
        itemKeys: step.itemKeys.filter((key) => key !== itemKey),
      }))
    );
  }, []);

  const addItemToActiveStep = useCallback((itemKey: string) => {
    setSteps((prev) => {
      if (prev.length === 0) {
        // Create first step automatically
        const newId = crypto.randomUUID();
        setActiveStepId(newId);
        return [{
          id: newId,
          title: '',
          description: '',
          itemKeys: [itemKey],
        }];
      }

      // Find the active step (or use the last one)
      const targetId = prev.find((s) => s.id === activeStepId)?.id || prev[prev.length - 1].id;
      
      return prev.map((step) => {
        if (step.id !== targetId) return step;
        if (step.itemKeys.includes(itemKey)) return step;
        return { ...step, itemKeys: [...step.itemKeys, itemKey] };
      });
    });
  }, [activeStepId]);

  const toggleItem = useCallback((categoryName: string, item: string) => {
    const itemKey = getItemKey(categoryName, item);
    setSelectedItems((prev) => {
      const existing = new Set(prev[categoryName] || []);
      const wasSelected = existing.has(item);
      if (wasSelected) {
        existing.delete(item);
      } else {
        existing.add(item);
      }
      if (builderMode === 'full') {
        if (wasSelected) {
          removeItemFromSteps(itemKey);
        } else {
          addItemToActiveStep(itemKey);
        }
      } else if (wasSelected) {
        setItemContexts((prevContexts) => {
          const next = { ...prevContexts };
          delete next[itemKey];
          return next;
        });
      }
      return {
        ...prev,
        [categoryName]: Array.from(existing),
      };
    });
  }, [addItemToActiveStep, builderMode, getItemKey, removeItemFromSteps]);

  const addCustomItem = useCallback((categoryName: string, itemName: string) => {
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

    setSelectedItems((prev) => ({
      ...prev,
      [categoryName]: [...(prev[categoryName] || []), itemName],
    }));
    if (builderMode === 'full') {
      addItemToActiveStep(getItemKey(categoryName, itemName));
    }
  }, [addItemToActiveStep, builderMode, getItemKey]);

  const removeItem = useCallback((categoryName: string, item: string) => {
    const itemKey = getItemKey(categoryName, item);
    setSelectedItems((prev) => ({
      ...prev,
      [categoryName]: (prev[categoryName] || []).filter((i) => i !== item),
    }));
    setItemContexts((prev) => {
      const newContexts = { ...prev };
      delete newContexts[itemKey];
      return newContexts;
    });
    if (builderMode === 'full') {
      removeItemFromSteps(itemKey);
    }
  }, [builderMode, getItemKey, removeItemFromSteps]);

  const updateItemContext = useCallback((categoryName: string, item: string, context: string) => {
    setItemContexts((prev) => ({
      ...prev,
      [`${categoryName}::${item}`]: context,
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItems({});
    setItemContexts({});
    setSteps((prev) => prev.map((step) => ({ ...step, itemKeys: [] })));
  }, []);

  const handleAddStep = useCallback(() => {
    const newStep: BlueprintStep = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      itemKeys: [],
    };
    setSteps((prev) => [...prev, newStep]);
    setActiveStepId(newStep.id);
  }, []);

  const handleUpdateStep = useCallback((stepId: string, updates: Partial<BlueprintStep>) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === stepId ? { ...step, ...updates } : step))
    );
  }, []);

  const handleRemoveStep = useCallback((stepId: string) => {
    setSteps((prev) => {
      const stepToRemove = prev.find((s) => s.id === stepId);
      if (!stepToRemove) return prev;

      const itemKeysToRemove = new Set(stepToRemove.itemKeys);
      if (itemKeysToRemove.size > 0) {
        setSelectedItems((prevSelected) => {
          const nextSelected: Record<string, string[]> = {};
          Object.entries(prevSelected).forEach(([category, items]) => {
            const filtered = items.filter((item) => !itemKeysToRemove.has(getItemKey(category, item)));
            if (filtered.length > 0) {
              nextSelected[category] = filtered;
            }
          });
          return nextSelected;
        });
        setItemContexts((prevContexts) => {
          const nextContexts = { ...prevContexts };
          itemKeysToRemove.forEach((key) => {
            delete nextContexts[key];
          });
          return nextContexts;
        });
      }

      const remaining = prev.filter((s) => s.id !== stepId);
      
      // Update active step if needed
      if (activeStepId === stepId && remaining.length > 0) {
        setActiveStepId(remaining[remaining.length - 1].id);
      } else if (remaining.length === 0) {
        setActiveStepId(null);
      }

      return remaining;
    });
  }, [activeStepId, getItemKey]);

  const handleReorderSteps = useCallback((fromIndex: number, toIndex: number) => {
    setSteps((prev) => {
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleToggleGenerateBanner = (value: boolean) => {
    setGenerateBanner(value);
    if (!value) {
      setBannerUrl(null);
    }
  };

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

    if (!session?.access_token) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to generate a review.',
        variant: 'destructive',
      });
      return;
    }

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
          Authorization: config.useAgenticBackend && session?.access_token
            ? `Bearer ${session.access_token}`
            : `Bearer ${config.supabaseAnonKey}`,
        },
        body: JSON.stringify({
          title: title.trim() || inventory.title,
          inventoryTitle: inventory.title,
          selectedItems: payload,
          mixNotes: mixNotes.trim(),
          reviewPrompt: reviewPrompt.trim(),
          reviewSections,
          includeScore,
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
      void logMvpEvent({
        eventName: 'generate_ai_review',
        userId: user?.id,
        blueprintId: blueprintId ?? null,
        path: location.pathname,
        metadata: {
          inventoryId: inventory?.id ?? null,
          selectedCount: totalSelected,
          isEditing,
        },
      });
    } catch (error) {
      toast({
        title: 'Analysis failed',
        description: getFriendlyErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    inventory,
    selectedItems,
    itemContexts,
    title,
    mixNotes,
    reviewPrompt,
    reviewSections,
    includeScore,
    totalSelected,
    toast,
    blueprintId,
    location.pathname,
    user?.id,
    isEditing,
    session?.access_token,
  ]);

  const resolveAccessToken = useCallback(async () => {
    if (session?.access_token) return session.access_token;
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) return sessionData.session.access_token;
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? null;
  }, [session?.access_token]);

  const applyGeneratedBlueprint = useCallback((generated: GeneratedBlueprint) => {
    const nextSelected: Record<string, string[]> = {};
    const nextContexts: Record<string, string> = {};
    const nextSteps: BlueprintStep[] = [];

    (generated.steps || []).forEach((step) => {
      const itemKeys: string[] = [];
      (step.items || []).forEach((item) => {
        const categoryName = item.category?.trim();
        const itemName = item.name?.trim();
        if (!categoryName || !itemName) return;
        const allowedItems = categoryItemMap.get(categoryName);
        if (!allowedItems || !allowedItems.has(itemName)) return;
        if (!nextSelected[categoryName]) nextSelected[categoryName] = [];
        if (!nextSelected[categoryName].includes(itemName)) {
          nextSelected[categoryName].push(itemName);
        }
        const key = `${categoryName}::${itemName}`;
        itemKeys.push(key);
        if (item.context && item.context.trim()) {
          nextContexts[key] = item.context.trim();
        }
      });

      if (itemKeys.length > 0) {
        nextSteps.push({
          id: crypto.randomUUID(),
          title: step.title?.trim() || '',
          description: step.description?.trim() || '',
          itemKeys,
        });
      }
    });

    if (generated.title?.trim()) {
      setTitle(generated.title.trim());
    }
    setSelectedItems(nextSelected);
    setItemContexts(nextContexts);
    setSteps(nextSteps);
    setActiveStepId(nextSteps[0]?.id ?? null);
    setReview('');
    setBannerUrl(null);
  }, [categoryItemMap]);

  const executeAutoGenerate = useCallback(async () => {
    if (!inventory) return;
    if (!config.useAgenticBackend || !GENERATE_BLUEPRINT_URL) {
      toast({
        title: 'Auto-generation unavailable',
        description: 'The agentic backend is not configured.',
        variant: 'destructive',
      });
      return;
    }

    if (!session?.access_token) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to auto-generate a blueprint.',
        variant: 'destructive',
      });
      return;
    }

    setIsAutoGenerating(true);

    try {
      const domainHint =
        (inventory.tags || []).some((t) => String(t || '').toLowerCase().includes('skincare'))
          ? 'skincare'
          : (inventory.tags || []).some((t) => String(t || '').toLowerCase().includes('workout') || String(t || '').toLowerCase().includes('fitness'))
            ? 'fitness'
            : (inventory.tags || []).some((t) => String(t || '').toLowerCase().includes('nutrition') || String(t || '').toLowerCase().includes('diet'))
              ? 'nutrition'
              : (inventory.tags || []).some((t) => String(t || '').toLowerCase().includes('productivity') || String(t || '').toLowerCase().includes('planning'))
                ? 'productivity'
                : 'general';

	      const genControls = makeBlueprintGenerationControlsV0({
	        controls: {
	          focus: autoFocus,
	          focusCustom: autoFocus === 'custom' ? autoFocusCustom : undefined,
	          length: autoLength,
	          // Developer-only tuning knob. Keep payload shape stable while hiding from UI.
	          strictness: 'medium',
	          variety: autoVariety,
	          caution: autoCaution,
	        },
	        domainHint: domainHint as LibraryDomain,
        optional: {
          name: autoTitle.trim() || undefined,
          notes: autoNotes.trim() || undefined,
          tags,
          inventoryTitle: inventory.title,
        },
      });

      setAutoGenerationControls(genControls as unknown as Json);
      const inferredTitle = genControls.derived.title;
      const inferredDescription = genControls.derived.description;
      const inferredNotes = genControls.derived.notes;

      const response = await fetch(GENERATE_BLUEPRINT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: inferredTitle,
          description: inferredDescription,
          notes: inferredNotes,
          inventoryTitle: inventory.title,
          categories: categories.map((category) => ({
            name: category.name,
            items: category.items,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to auto-generate blueprint');
      }

      const data = await response.json() as GeneratedBlueprint;
      if (!data?.steps || data.steps.length === 0) {
        throw new Error('No steps were generated');
      }

      applyGeneratedBlueprint(data);
      setShowAutoGenerate(false);
      toast({
        title: 'Blueprint generated',
        description: 'Your steps and items have been updated.',
      });
	          void logMvpEvent({
	            eventName: 'auto_generate_blueprint',
	            userId: user?.id,
	            blueprintId: blueprintId ?? null,
	            path: location.pathname,
	            metadata: {
	              inventoryId: inventory.id,
	              stepCount: data.steps.length,
	              focus: autoFocus,
	              focusCustom: autoFocus === 'custom' ? autoFocusCustom : undefined,
	              length: autoLength,
	              variety: autoVariety,
	              caution: autoCaution,
	              domainHint,
	            },
	          });
    } catch (error) {
      toast({
        title: 'Auto-generation failed',
        description: getFriendlyErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsAutoGenerating(false);
    }
  }, [
    inventory,
    categories,
    autoTitle,
    autoNotes,
	    autoFocus,
	    autoFocusCustom,
	    autoLength,
	    autoVariety,
	    autoCaution,
	    applyGeneratedBlueprint,
	    toast,
    session?.access_token,
    user?.id,
    blueprintId,
    location.pathname,
  ]);

  const handleAutoGenerateClick = useCallback(() => {
    if (shouldConfirmOverwrite) {
      setShowOverwriteDialog(true);
      return;
    }
    void executeAutoGenerate();
  }, [shouldConfirmOverwrite, executeAutoGenerate]);

  const handleGenerateBanner = useCallback(async () => {
    if (!inventory) return;
    if (!config.useAgenticBackend || !BANNER_URL) {
      toast({
        title: 'Banner generation unavailable',
        description: 'The agentic backend is not configured.',
        variant: 'destructive',
      });
      return null;
    }

    const accessToken = await resolveAccessToken();
    if (!accessToken) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to generate a banner.',
        variant: 'destructive',
      });
      return null;
    }

    if (!title.trim()) {
      toast({
        title: 'Title required',
        description: 'Add a blueprint title before generating a banner.',
        variant: 'destructive',
      });
      return null;
    }

    setIsGeneratingBanner(true);

    try {
      const response = await fetch(BANNER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          inventoryTitle: inventory.title,
          tags,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate banner');
      }

      const data = await response.json();
      if (!data?.bannerUrl) {
        throw new Error('No banner URL returned');
      }

      setBannerUrl(data.bannerUrl);
      return data.bannerUrl as string;
    } catch (error) {
      toast({
        title: 'Banner generation failed',
        description: getFriendlyErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsGeneratingBanner(false);
    }
  }, [inventory, resolveAccessToken, title, tags, toast]);

  const handlePublish = async () => {
    if (isEditing && blueprintId && !isOwner) {
      toast({
        title: 'Permission denied',
        description: 'Only the blueprint owner can edit this blueprint.',
        variant: 'destructive',
      });
      return;
    }

    if (!session?.access_token) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to publish your blueprint.',
        variant: 'destructive',
      });
      return;
    }

    if (!inventory) return;

    if (!title.trim()) {
      toast({
        title: 'Title required',
        description: isEditing
          ? 'Add a blueprint title before saving changes.'
          : 'Add a blueprint title before publishing.',
        variant: 'destructive',
      });
      return;
    }

    if (totalSelected === 0) {
      toast({
        title: 'Select items',
        description: isEditing
          ? 'Pick at least one item before saving changes.'
          : 'Pick at least one item before publishing.',
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
      const payload: Record<string, Array<{ name: string; context?: string }>> = {};
      Object.entries(selectedItems).forEach(([category, items]) => {
        if (items.length > 0) {
          payload[category] = items.map((item) => ({
            name: item,
            context: itemContexts[`${category}::${item}`] || undefined,
          }));
        }
      });

      const itemMap = new Map<string, { category: string; name: string; context?: string }>();
      Object.entries(selectedItems).forEach(([category, items]) => {
        items.forEach((item) => {
          const key = getItemKey(category, item);
          itemMap.set(key, {
            category,
            name: item,
            context: itemContexts[key] || undefined,
          });
        });
      });

      const stepsPayload = steps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description || null,
        items: step.itemKeys
          .map((key) => itemMap.get(key))
          .filter((item): item is { category: string; name: string; context?: string } => !!item),
      }));

      const assignedKeys = new Set(stepsPayload.flatMap((step) =>
        step.items.map((item) => `${item.category}::${item.name}`)
      ));

      const unassignedItems = Array.from(itemMap.entries())
        .filter(([key]) => !assignedKeys.has(key))
        .map(([, item]) => item);

      const finalSteps =
        builderMode === 'simple'
          ? null
          : stepsPayload.length > 0
            ? [
                ...stepsPayload,
                ...(unassignedItems.length > 0
                  ? [{
                      id: 'unassigned',
                      title: 'Unassigned',
                      description: null,
                      items: unassignedItems,
                    }]
                  : []),
              ]
            : null;

      let resolvedBannerUrl = bannerUrl;
      if (generateBanner && !resolvedBannerUrl) {
        resolvedBannerUrl = await handleGenerateBanner();
      }

      if (generateBanner && !resolvedBannerUrl) {
        throw new Error('Banner generation is required before publishing.');
      }

      if (isEditing && blueprintId) {
        const updated = await updateBlueprint.mutateAsync({
          blueprintId,
          title: title.trim(),
          selectedItems: payload,
          steps: finalSteps,
          mixNotes: mixNotes.trim() ? mixNotes.trim() : null,
          reviewPrompt: reviewPrompt.trim() ? reviewPrompt.trim() : null,
          bannerUrl: resolvedBannerUrl,
          llmReview: review,
          generationControls: autoGenerationControls,
          tags,
          isPublic,
        });

        addRecentTags(tags);
        void logMvpEvent({
          eventName: 'save_blueprint',
          userId: user?.id,
          blueprintId: updated.id,
          path: location.pathname,
          metadata: {
            isEditing: true,
            hasReview: !!review,
            tagCount: tags.length,
          },
        });
        void logMvpEvent({
          eventName: 'publish_blueprint',
          userId: user?.id,
          blueprintId: updated.id,
          path: location.pathname,
          metadata: {
            isPublic,
            isEditing: true,
          },
        });
        navigate(`/blueprint/${updated.id}`);
      } else {
        const created = await createBlueprint.mutateAsync({
          inventoryId: inventory.id,
          title: title.trim(),
          selectedItems: payload,
          steps: finalSteps,
          mixNotes: mixNotes.trim() ? mixNotes.trim() : null,
          reviewPrompt: reviewPrompt.trim() ? reviewPrompt.trim() : null,
          bannerUrl: resolvedBannerUrl,
          llmReview: review,
          generationControls: autoGenerationControls,
          tags,
          isPublic,
          sourceBlueprintId: null,
        });

        addRecentTags(tags);
        void logMvpEvent({
          eventName: 'save_blueprint',
          userId: user?.id,
          blueprintId: created.id,
          path: location.pathname,
          metadata: {
            isEditing: false,
            hasReview: !!review,
            tagCount: tags.length,
          },
        });
        void logMvpEvent({
          eventName: 'publish_blueprint',
          userId: user?.id,
          blueprintId: created.id,
          path: location.pathname,
          metadata: {
            isPublic,
            isEditing: false,
          },
        });
        navigate(`/blueprint/${created.id}`);
      }
    } catch (error) {
      toast({
        title: isEditing ? 'Update failed' : 'Publish failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (isEditing && blueprint && !isOwner) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-3xl mx-auto px-4 py-12">
          <Card className="bg-card/60 backdrop-blur-glass border-border/50">
            <CardContent className="py-12 text-center space-y-3">
              <h2 className="text-lg font-semibold">You cannot edit this blueprint</h2>
              <p className="text-sm text-muted-foreground">
                Only the original creator can make changes.
              </p>
              <Link to={`/blueprint/${blueprint.id}`}>
                <Button>Back to blueprint</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

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
        {/* Sub-header row: Back link + Help buttons */}
        <div className="flex items-center justify-between mb-6">
          <Link
            to={isEditing && blueprintId ? `/blueprint/${blueprintId}` : '/inventory'}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {isEditing ? 'Back to blueprint' : 'Back to library'}
          </Link>
          <div className="flex items-center gap-1">
            <TourButton onClick={() => setShowTour(true)} />
            <HelpButton onClick={() => setShowHelp(true)} />
          </div>
        </div>

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
                {heroTitle.toUpperCase()}
              </span>
              <span
                className="absolute inset-0 text-border/60"
                style={{ transform: 'translate(2px, 2px)' }}
                aria-hidden="true"
              >
                {heroTitle.toUpperCase()}
              </span>
              <span className="text-gradient-themed animate-shimmer bg-[length:200%_auto] relative">
                {heroTitle.toUpperCase()}
              </span>
            </span>
            <span className="absolute -inset-4 bg-primary/10 blur-2xl rounded-full animate-pulse-soft -z-10" />
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            {isEditing
              ? 'Update your blueprint, regenerate the review, and save the changes.'
              : 'Build your blueprint from this library'}
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
            {/* Tour Banner (first-time users) */}
            {showTourBanner && (
              <TourBanner
                onStartTour={() => {
                  setShowTourBanner(false);
                  setShowTour(true);
                }}
                onDismiss={() => setShowTourBanner(false)}
              />
            )}

            {/* Step Guide */}
            <BuildPageGuide currentStep={review ? 3 : totalSelected > 0 ? 2 : 1} />
            
            {/* Combined Name + Items Section */}
            <section className="animate-fade-in" style={{ animationDelay: '0.05s' }}>
              <div className="bg-card/60 backdrop-blur-glass rounded-2xl border border-border/50 overflow-hidden">
                {/* Blueprint Name Input */}
                <div className="p-4 border-b border-border/30 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Name your blueprint..."
                      className="text-xl font-bold bg-transparent border-none focus-visible:ring-2 focus-visible:ring-primary/50 h-14 flex-1"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => setShowAutoGenerate((prev) => !prev)}
                        disabled={!config.useAgenticBackend}
                      >
                        <Sparkles className="h-4 w-4" />
                        Auto-generate Blueprint
                      </Button>
                    </div>
                  </div>
                  {autoGenerateHelpText && (
                    <p className="text-xs text-muted-foreground">{autoGenerateHelpText}</p>
                  )}
                  {showAutoGenerate && (
                    <div className="grid gap-3 rounded-lg border border-border/40 bg-muted/20 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2 sm:col-span-2">
                          <Label>Name (optional)</Label>
                          <Input
                            value={autoTitle}
                            onChange={(e) => setAutoTitle(e.target.value)}
                            placeholder="Give your blueprint a name (Optional)"
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label>Focus</Label>
                          <Select value={autoFocus} onValueChange={(v) => setAutoFocus(v as BlueprintFocus)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose focus" />
                            </SelectTrigger>
                            <SelectContent>
                              {BLUEPRINT_FOCUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {autoFocus === 'custom' && (
                          <div className="grid gap-2 sm:col-span-2">
                            <Label>Custom focus (optional)</Label>
                            <Input
                              value={autoFocusCustom}
                              onChange={(e) => setAutoFocusCustom(e.target.value)}
                              placeholder="e.g., Knee-friendly strength, Marathon base, Acne-safe barrier..."
                            />
                          </div>
                        )}

                        <div className="grid gap-2">
                          <Label>Length</Label>
                          <ToggleGroup
                            type="single"
                            value={autoLength}
                            onValueChange={(v) => v && setAutoLength(v as LengthHint)}
                            className="flex flex-wrap justify-start gap-2"
                          >
                            {LENGTH_OPTIONS.map((o) => (
                              <ToggleGroupItem key={o.value} value={o.value} variant="outline" className="rounded-full px-3">
                                {o.label}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </div>

	                        <div className="grid gap-2">
	                          <Label>Variety</Label>
	                          <ToggleGroup
	                            type="single"
                            value={autoVariety}
                            onValueChange={(v) => v && setAutoVariety(v as VarietyLevel)}
                            className="flex flex-wrap justify-start gap-2"
                          >
                            {(['low', 'medium', 'high'] as const).map((v) => (
                              <ToggleGroupItem key={v} value={v} variant="outline" className="rounded-full px-3">
                                {v.charAt(0).toUpperCase() + v.slice(1)}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </div>

                        <div className="grid gap-2 sm:col-span-2">
                          <Label>Caution</Label>
                          <ToggleGroup
                            type="single"
                            value={autoCaution}
                            onValueChange={(v) => v && setAutoCaution(v as CautionLevel)}
                            className="flex flex-wrap justify-start gap-2"
                          >
                            {(['conservative', 'balanced', 'aggressive'] as const).map((v) => (
                              <ToggleGroupItem key={v} value={v} variant="outline" className="rounded-full px-3">
                                {v === 'conservative' ? 'Conservative' : v === 'aggressive' ? 'Aggressive' : 'Balanced'}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </div>

                        <div className="grid gap-2 sm:col-span-2">
                          <Label>Notes (optional)</Label>
                          <Textarea
                            value={autoNotes}
                            onChange={(e) => setAutoNotes(e.target.value)}
                            placeholder="Any constraints or preferences? (Optional)"
                            rows={2}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                          This will replace your current steps and selected items.
                        </p>
                        <Button
                          type="button"
                          onClick={handleAutoGenerateClick}
                          disabled={
                            isAutoGenerating ||
                            !session?.access_token ||
                            (autoFocus === 'custom' && !autoFocusCustom.trim())
                          }
                        >
                          {isAutoGenerating ? 'Generating...' : 'Generate blueprint'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                {/* Item Picker */}
                <div className="p-4" data-help-id="picker">
                  <BlueprintItemPicker
                    categories={categories}
                    selectedItems={selectedItems}
                    onToggleItem={toggleItem}
                    onAddCustomItem={addCustomItem}
                  />
                </div>
              </div>
            </section>
            <AlertDialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Replace current blueprint?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will overwrite your current steps and selected items. You can’t undo this action.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setShowOverwriteDialog(false);
                      void executeAutoGenerate();
                    }}
                  >
                    Replace and generate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Steps Section - New Accordion */}
            <section className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <Card className="bg-card/60 backdrop-blur-glass border-border/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle>{builderMode === 'simple' ? 'Selected items' : 'Steps'}</CardTitle>
                    {builderMode === 'simple' && (
                      <p className="text-xs text-muted-foreground">
                        Simple mode hides steps. If you publish in simple mode, your blueprint will be published without steps.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${builderMode === 'full' ? 'text-foreground' : 'text-muted-foreground'}`}>
                      Full
                    </span>
                    <Switch
                      checked={builderMode === 'simple'}
                      onCheckedChange={(checked) => {
                        const nextMode = checked ? 'simple' : 'full';
                        setBuilderMode(nextMode);
                        if (nextMode !== 'full') return;

                        const selectedKeys = Object.entries(selectedItems).flatMap(([category, items]) =>
                          items.map((item) => `${category}::${item}`)
                        );
                        const selectedSet = new Set(selectedKeys);

                        // Reconcile steps to match the current selection (keeps structure, adds missing items to active step).
                        let nextSteps = steps.map((step) => ({
                          ...step,
                          itemKeys: step.itemKeys.filter((key) => selectedSet.has(key)),
                        }));

                        const assigned = new Set(nextSteps.flatMap((step) => step.itemKeys));
                        const missing = selectedKeys.filter((key) => !assigned.has(key));

                        if (missing.length > 0) {
                          if (nextSteps.length === 0) {
                            const id = crypto.randomUUID();
                            nextSteps = [{ id, title: '', description: '', itemKeys: missing }];
                            setActiveStepId(id);
                          } else {
                            const targetId =
                              nextSteps.find((s) => s.id === activeStepId)?.id || nextSteps[nextSteps.length - 1].id;
                            nextSteps = nextSteps.map((step) => {
                              if (step.id !== targetId) return step;
                              return { ...step, itemKeys: Array.from(new Set([...step.itemKeys, ...missing])) };
                            });
                          }
                        }

                        setSteps(nextSteps);
                        if (nextSteps.length === 0) {
                          setActiveStepId(null);
                        } else if (!nextSteps.some((s) => s.id === activeStepId)) {
                          setActiveStepId(nextSteps[nextSteps.length - 1].id);
                        }
                      }}
                    />
                    <span className={`text-xs ${builderMode === 'simple' ? 'text-foreground' : 'text-muted-foreground'}`}>
                      Simple
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {builderMode === 'simple' ? (
                    totalSelected > 0 ? (
                      <BlueprintRecipeAccordion
                        title="Build Blueprint"
                        selectedItems={selectedItems}
                        itemContexts={itemContexts}
                        onRemoveItem={removeItem}
                        onUpdateContext={updateItemContext}
                        onClear={clearSelection}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Select items from the library above to start building.
                      </p>
                    )
                  ) : (
                    <>
                      <StepAccordion
                        steps={steps}
                        activeStepId={activeStepId}
                        onSetActive={setActiveStepId}
                        onUpdateStep={handleUpdateStep}
                        onRemoveStep={handleRemoveStep}
                        onAddStep={handleAddStep}
                        onReorderSteps={handleReorderSteps}
                        onRemoveItem={removeItem}
                        onUpdateItemContext={updateItemContext}
                        itemContexts={itemContexts}
                      />

                      {totalSelected > 0 && (
                        <div className="flex justify-end pt-2">
                          <Button type="button" variant="ghost" onClick={clearSelection}>
                            Clear all selections
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* Review Button */}
            <section className="flex justify-center py-8 animate-fade-in" style={{ animationDelay: '0.2s' }} data-help-id="mix">
              <MixButton
                onClick={handleAnalyze}
                disabled={totalSelected === 0}
                isLoading={isAnalyzing}
                itemCount={totalSelected}
              />
            </section>

            {/* Review Options (Collapsed by default) */}
            <section className="animate-fade-in" style={{ animationDelay: '0.15s' }}>
              <Collapsible>
                <Card className="bg-card/60 backdrop-blur-glass border-border/50">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-muted-foreground" />
                          Review Options
                        </CardTitle>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
                      </div>
                      <p className="text-xs text-muted-foreground text-left">
                        Build notes, review focus, custom sections
                      </p>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-4 px-4 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="mix-notes">Blueprint Notes</Label>
                          <Textarea
                            id="mix-notes"
                            value={mixNotes}
                            onChange={(e) => setMixNotes(e.target.value)}
                            placeholder="Any additional context for your blueprint..."
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
                        <div className="space-y-3 sm:col-span-2">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <Label>Review sections</Label>
                              <p className="text-xs text-muted-foreground">
                                Overview is always included.
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-xs font-medium">Include score</p>
                                <p className="text-[11px] text-muted-foreground">Adds a 1–100 score in Overview.</p>
                              </div>
                              <Switch checked={includeScore} onCheckedChange={setIncludeScore} className="scale-90" />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">{OVERVIEW_SECTION}</Badge>
                            {additionalSections.map((section) => (
                              <Badge key={section} variant="secondary" className="gap-1">
                                {section}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4"
                                  onClick={() => {
                                    setAdditionalSections((prev) => prev.filter((item) => item !== section));
                                    setSectionError('');
                                  }}
                                  aria-label="Remove section"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={sectionInput}
                              onChange={(event) => setSectionInput(event.target.value)}
                              placeholder="Add custom section"
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  const formatted = formatReviewSection(sectionInput);
                                  if (!formatted) return;
                                  if (formatted.toLowerCase() === OVERVIEW_SECTION.toLowerCase()) {
                                    setSectionInput('');
                                    return;
                                  }
                                  if (additionalSections.some((item) => item.toLowerCase() === formatted.toLowerCase())) {
                                    setSectionInput('');
                                    return;
                                  }
                                  if (additionalSections.length >= MAX_ADDITIONAL_SECTIONS) {
                                    setSectionError(`You can add up to ${MAX_REVIEW_SECTIONS} sections total.`);
                                    return;
                                  }
                                  setAdditionalSections((prev) => [...prev, formatted]);
                                  setSectionInput('');
                                  setSectionError('');
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                const formatted = formatReviewSection(sectionInput);
                                if (!formatted) return;
                                if (formatted.toLowerCase() === OVERVIEW_SECTION.toLowerCase()) {
                                  setSectionInput('');
                                  return;
                                }
                                if (additionalSections.some((item) => item.toLowerCase() === formatted.toLowerCase())) {
                                  setSectionInput('');
                                  return;
                                }
                                if (additionalSections.length >= MAX_ADDITIONAL_SECTIONS) {
                                  setSectionError(`You can add up to ${MAX_REVIEW_SECTIONS} sections total.`);
                                  return;
                                }
                                setAdditionalSections((prev) => [...prev, formatted]);
                                setSectionInput('');
                                setSectionError('');
                              }}
                            >
                              Add
                            </Button>
                          </div>
                          {sectionError && (
                            <p className="text-sm text-destructive">{sectionError}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
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
                <BlueprintAnalysisView review={review} sectionOrder={reviewSections} />
              </section>
            )}

            {/* Streaming Analysis */}
            {review && isAnalyzing && (
              <section className="animate-fade-in">
                <BlueprintAnalysisView review={review} isStreaming sectionOrder={reviewSections} />
              </section>
            )}

            {/* Publish Section - always visible when items selected */}
            {totalSelected > 0 && !isAnalyzing && (
              <section className="animate-fade-in" style={{ animationDelay: '0.25s' }}>
                <Card className="bg-card/60 backdrop-blur-glass border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      {isEditing ? 'Save changes' : 'Publish Blueprint'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-border/60 px-4 py-3 space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium">Generate banner</p>
                          <p className="text-sm text-muted-foreground">Create a 4:1 banner for this blueprint.</p>
                        </div>
                        <Switch checked={generateBanner} onCheckedChange={handleToggleGenerateBanner} />
                      </div>

                      {generateBanner && (
                        <div className="space-y-3">
                          <div className="aspect-[4/1] w-full overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                            {bannerUrl ? (
                              <img
                                src={bannerUrl}
                                alt="Blueprint banner"
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                                No banner yet
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => handleGenerateBanner()}
                              disabled={isGeneratingBanner || !canGenerateBanner}
                            >
                              <RefreshCcw className={`h-3.5 w-3.5 ${isGeneratingBanner ? 'animate-spin' : ''}`} />
                              {bannerUrl ? 'Regenerate banner' : 'Generate banner'}
                            </Button>
                            {bannerUrl && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setBannerUrl(null)}
                                disabled={isGeneratingBanner}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                          {bannerHelpText && (
                            <p className="text-xs text-muted-foreground">{bannerHelpText}</p>
                          )}
                        </div>
                      )}
                    </div>

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
                      <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions || []} maxTags={12} />
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
                      disabled={isEditing ? updateBlueprint.isPending : createBlueprint.isPending}
                      className="w-full gap-2"
                      size="lg"
                    >
                      <Sparkles className="h-4 w-4" />
                      {isEditing ? 'Save Changes' : 'Publish Blueprint'}
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
            <AppFooter />
          </div>
        ) : (
          <Card className="bg-card/60 backdrop-blur-glass border-border/50">
            <CardContent className="py-12 text-center">
              Library not found.
            </CardContent>
          </Card>
        )}
      </main>

      {/* Help Overlay */}
      <BuildHelpOverlay
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        onStartTour={() => {
          setShowHelp(false);
          setShowTour(true);
        }}
      />

      {/* Guided Tour */}
      <BuildTour
        isActive={showTour}
        onComplete={() => setShowTour(false)}
        onSkip={() => setShowTour(false)}
      />
    </div>
  );
}

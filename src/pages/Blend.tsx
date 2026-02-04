import { useState, useMemo, useCallback } from 'react';
import { useBlendState } from '@/hooks/useBlendState';
import { BlendInventoryPicker } from '@/components/blend/BlendInventoryPicker';
import { BlendDoseModal } from '@/components/blend/BlendDoseModal';
import { BlendRecipeAccordion } from '@/components/blend/BlendRecipeAccordion';
import { HistoryDropdown } from '@/components/blend/HistoryDropdown';
import { MixButton } from '@/components/blend/MixButton';
import { AppHeader } from '@/components/shared/AppHeader';
import { SaveRecipeButton } from '@/components/shared/SaveRecipeButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  SupplementCategory,
  DoseUnit,
  BlendItem,
} from '@/types/stacklab';
import { RotateCcw, Sparkles } from 'lucide-react';
import type { Json } from '@/integrations/supabase/types';

const Blend = () => {
  const {
    currentBlend,
    history,
    createBlend,
    addItem,
    updateItem,
    removeItem,
    updateBlendName,
    clearCurrentBlend,
    loadFromHistory,
    deleteFromHistory,
    resetAll,
  } = useBlendState();

  const { toast } = useToast();

  // Modal state for adding items
  const [doseModalOpen, setDoseModalOpen] = useState(false);
  const [pendingSupplement, setPendingSupplement] = useState<{
    id: string;
    name: string;
    category: SupplementCategory;
  } | null>(null);

  // Get selected supplement IDs for the picker
  const selectedIds = useMemo(() => {
    if (!currentBlend) return new Set<string>();
    return new Set(currentBlend.items.map((item) => item.supplementId));
  }, [currentBlend]);

  // Handle supplement selection from picker
  const handleSelectSupplement = useCallback(
    (supplementId: string, name: string, category: SupplementCategory) => {
      // If already in blend, remove it
      if (currentBlend?.items.some((i) => i.supplementId === supplementId)) {
        const item = currentBlend.items.find((i) => i.supplementId === supplementId);
        if (item) removeItem(item.id);
        return;
      }

      // Ensure we have a current blend
      if (!currentBlend) {
        createBlend();
      }

      // Open dose modal
      setPendingSupplement({ id: supplementId, name, category });
      setDoseModalOpen(true);
    },
    [currentBlend, createBlend, removeItem]
  );

  // Handle dose confirmation
  const handleConfirmDose = useCallback(
    (amount: number, unit: DoseUnit) => {
      if (!pendingSupplement) return;

      // Ensure blend exists
      if (!currentBlend) {
        createBlend();
      }

      const newItem: BlendItem = {
        id: `item-${Date.now()}`,
        supplementId: pendingSupplement.id,
        name: pendingSupplement.name,
        category: pendingSupplement.category,
        amount,
        unit,
      };

      addItem(newItem);
      setDoseModalOpen(false);
      setPendingSupplement(null);
    },
    [pendingSupplement, currentBlend, createBlend, addItem]
  );

  // Handle update item dose
  const handleUpdateItemDose = useCallback(
    (itemId: string, amount: number, unit: DoseUnit) => {
      updateItem(itemId, { amount, unit });
    },
    [updateItem]
  );

  const handleAnalyze = useCallback(() => {
    toast({
      title: 'Analysis deprecated',
      description: 'This flow is being rebuilt and is unavailable for now.',
    });
  }, [toast]);

  // Handle starting a new blend
  const handleNewBlend = useCallback(() => {
    clearCurrentBlend();
    createBlend();
  }, [clearCurrentBlend, createBlend]);

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

      <AppHeader
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={handleNewBlend} className="gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">New</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={resetAll}
              className="text-muted-foreground h-8 w-8"
              title="Reset All"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </>
        )}
      />

      {/* Floating History Button */}
      <HistoryDropdown
        history={history}
        onLoad={loadFromHistory}
        onDelete={deleteFromHistory}
      />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Hero Header */}
        <div className="text-center mb-12 pt-16 animate-fade-in">
          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter mb-4 relative inline-block">
            <span className="text-gradient-themed animate-shimmer bg-[length:200%_auto]" 
                  style={{ 
                    fontFamily: "'Impact', 'Haettenschweiler', 'Franklin Gothic Bold', 'Charcoal', 'Helvetica Inserat', sans-serif",
                    letterSpacing: '0.15em',
                  }}>
              BLEND
            </span>
            <span className="absolute -inset-4 bg-primary/5 blur-2xl rounded-full animate-pulse-soft -z-10" />
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Create your perfect supplement cocktail
          </p>
        </div>

        {/* Combined Name + Ingredients Section */}
        <section className="mb-8 animate-fade-in" style={{ animationDelay: '0.05s' }}>
          <div className="bg-card/60 backdrop-blur-glass rounded-2xl border border-border/50 overflow-hidden">
            {/* Blend Name Input */}
            <div className="p-4 border-b border-border/30">
              <Input
                value={currentBlend?.name || ''}
                onChange={(e) => {
                  if (!currentBlend) createBlend();
                  updateBlendName(e.target.value);
                }}
                placeholder="Enter blend name..."
                className="text-xl font-bold bg-transparent border-none focus-visible:ring-2 focus-visible:ring-primary/50 h-14"
              />
            </div>
            {/* Inventory Picker */}
            <div className="p-4">
              <BlendInventoryPicker
                selectedIds={selectedIds}
                onSelect={handleSelectSupplement}
              />
            </div>
          </div>
        </section>

        {/* Selected Items Accordion */}
        <section className="mb-8 animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <BlendRecipeAccordion
            blend={currentBlend}
            onUpdateName={updateBlendName}
            onUpdateItem={handleUpdateItemDose}
            onRemoveItem={removeItem}
            onClear={clearCurrentBlend}
          />
        </section>

        {/* Central MIX Button */}
        <section className="flex justify-center mb-12 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <MixButton
            onClick={handleAnalyze}
            disabled={!currentBlend || currentBlend.items.length === 0}
            isLoading={false}
            itemCount={currentBlend?.items.length || 0}
          />
        </section>

        {/* Post Button */}
        <section className="flex justify-center mb-8 animate-fade-in" style={{ animationDelay: '0.25s' }}>
          <SaveRecipeButton
            recipeName={currentBlend?.name || 'Untitled Blend'}
            recipeType="blend"
            items={JSON.parse(JSON.stringify(currentBlend?.items || []))}
            analysis={null}
            disabled={!currentBlend || currentBlend.items.length === 0}
            variant="default"
          />
        </section>

        {/* Footer Disclaimer */}
        <footer className="text-center py-8 text-sm text-muted-foreground border-t border-border/30 mt-8">
          <p>
            Blend Builder is for educational purposes only. Always consult a healthcare
            provider before starting any supplement regimen.
          </p>
        </footer>
      </main>

      {/* Dose Modal */}
      {pendingSupplement && (
        <BlendDoseModal
          open={doseModalOpen}
          onClose={() => {
            setDoseModalOpen(false);
            setPendingSupplement(null);
          }}
          onConfirm={handleConfirmDose}
          supplementId={pendingSupplement.id}
          supplementName={pendingSupplement.name}
        />
      )}
    </div>
  );
};

export default Blend;

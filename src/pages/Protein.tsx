import { useState, useMemo, useCallback } from 'react';
import { useProteinState } from '@/hooks/useProteinState';
import { ProteinSourcePicker } from '@/components/protein/ProteinSourcePicker';
import { ProteinDoseModal } from '@/components/protein/ProteinDoseModal';
import { ProteinRecipeAccordion } from '@/components/protein/ProteinRecipeAccordion';
import { ProteinHistoryDropdown } from '@/components/protein/ProteinHistoryDropdown';
import { BlendButton } from '@/components/protein/BlendButton';
import { AppHeader } from '@/components/shared/AppHeader';
import { SaveRecipeButton } from '@/components/shared/SaveRecipeButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  ProteinCategory,
  ShakeItem,
} from '@/types/stacklab';
import { RotateCcw, Sparkles } from 'lucide-react';

const Protein = () => {
  const {
    currentShake,
    history,
    createShake,
    addItem,
    updateItem,
    removeItem,
    updateShakeName,
    clearCurrentShake,
    loadFromHistory,
    deleteFromHistory,
    resetAll,
  } = useProteinState();

  const { toast } = useToast();

  // Modal state for adding items
  const [doseModalOpen, setDoseModalOpen] = useState(false);
  const [pendingProtein, setPendingProtein] = useState<{
    id: string;
    name: string;
    category: ProteinCategory;
    proteinPerServing: number;
  } | null>(null);

  // Get selected protein IDs for the picker
  const selectedIds = useMemo(() => {
    if (!currentShake) return new Set<string>();
    return new Set(currentShake.items.map((item) => item.proteinId));
  }, [currentShake]);

  // Handle protein selection from picker
  const handleSelectProtein = useCallback(
    (proteinId: string, name: string, category: ProteinCategory, proteinPerServing: number) => {
      // If already in shake, remove it
      if (currentShake?.items.some((i) => i.proteinId === proteinId)) {
        const item = currentShake.items.find((i) => i.proteinId === proteinId);
        if (item) removeItem(item.id);
        return;
      }

      // Ensure we have a current shake
      if (!currentShake) {
        createShake();
      }

      // Open dose modal
      setPendingProtein({ id: proteinId, name, category, proteinPerServing });
      setDoseModalOpen(true);
    },
    [currentShake, createShake, removeItem]
  );

  // Handle dose confirmation
  const handleConfirmDose = useCallback(
    (scoops: number, gramsProtein: number) => {
      if (!pendingProtein) return;

      // Ensure shake exists
      if (!currentShake) {
        createShake();
      }

      const newItem: ShakeItem = {
        id: `item-${Date.now()}`,
        proteinId: pendingProtein.id,
        name: pendingProtein.name,
        category: pendingProtein.category,
        scoops,
        gramsProtein,
      };

      addItem(newItem);
      setDoseModalOpen(false);
      setPendingProtein(null);
    },
    [pendingProtein, currentShake, createShake, addItem]
  );

  // Handle update item
  const handleUpdateItem = useCallback(
    (itemId: string, scoops: number, gramsProtein: number) => {
      updateItem(itemId, { scoops, gramsProtein });
    },
    [updateItem]
  );

  const handleAnalyze = useCallback(() => {
    toast({
      title: 'Analysis deprecated',
      description: 'This flow is being rebuilt and is unavailable for now.',
    });
  }, [toast]);

  // Handle starting a new shake
  const handleNewShake = useCallback(() => {
    clearCurrentShake();
    createShake();
  }, [clearCurrentShake, createShake]);

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
            <Button variant="outline" size="sm" onClick={handleNewShake} className="gap-2">
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
      <ProteinHistoryDropdown
        history={history}
        onLoad={loadFromHistory}
        onDelete={deleteFromHistory}
      />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Hero Header */}
        <div className="text-center mb-12 pt-16 animate-fade-in">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight mb-4 relative inline-block">
            <span 
              className="relative inline-block"
              style={{ 
                fontFamily: "'Impact', 'Haettenschweiler', 'Franklin Gothic Bold', 'Charcoal', 'Helvetica Inserat', sans-serif",
                letterSpacing: '0.06em',
              }}>
              {/* 3D shadow layers */}
              <span 
                className="absolute inset-0 text-border/40"
                style={{ transform: 'translate(4px, 4px)' }}
                aria-hidden="true"
              >
                COMPLETE MY PROTEIN
              </span>
              <span 
                className="absolute inset-0 text-border/60"
                style={{ transform: 'translate(2px, 2px)' }}
                aria-hidden="true"
              >
                COMPLETE MY PROTEIN
              </span>
              {/* Main gradient text */}
              <span className="text-gradient-themed animate-shimmer bg-[length:200%_auto] relative">
                COMPLETE MY PROTEIN
              </span>
            </span>
            <span className="absolute -inset-4 bg-primary/10 blur-2xl rounded-full animate-pulse-soft -z-10" />
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Complete your amino acid profile
          </p>
        </div>

        {/* Combined Name + Ingredients Section */}
        <section className="mb-8 animate-fade-in" style={{ animationDelay: '0.05s' }}>
          <div className="bg-card/60 backdrop-blur-glass rounded-2xl border border-border/50 overflow-hidden">
            {/* Shake Name Input */}
            <div className="p-4 border-b border-border/30">
              <Input
                value={currentShake?.name || ''}
                onChange={(e) => {
                  if (!currentShake) createShake();
                  updateShakeName(e.target.value);
                }}
                placeholder="Enter shake name..."
                className="text-xl font-bold bg-transparent border-none focus-visible:ring-2 focus-visible:ring-primary/50 h-14"
              />
            </div>
            {/* Protein Source Picker */}
            <div className="p-4">
              <ProteinSourcePicker
                selectedIds={selectedIds}
                onSelect={handleSelectProtein}
              />
            </div>
          </div>
        </section>

        {/* Selected Items Accordion */}
        <section className="mb-8 animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <ProteinRecipeAccordion
            shake={currentShake}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={removeItem}
            onClear={clearCurrentShake}
          />
        </section>

        {/* Central BLEND Button */}
        <section className="flex justify-center mb-12 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <BlendButton
            onClick={handleAnalyze}
            disabled={!currentShake || currentShake.items.length === 0}
            isLoading={false}
            itemCount={currentShake?.items.length || 0}
          />
        </section>

        {/* Post Button */}
        <section className="flex justify-center mb-8 animate-fade-in" style={{ animationDelay: '0.25s' }}>
          <SaveRecipeButton
            recipeName={currentShake?.name || 'Untitled Shake'}
            recipeType="protein"
            items={JSON.parse(JSON.stringify(currentShake?.items || []))}
            analysis={null}
            disabled={!currentShake || currentShake.items.length === 0}
            variant="default"
          />
        </section>

        {/* Footer Disclaimer */}
        <footer className="text-center py-8 text-sm text-muted-foreground border-t border-border/30 mt-8">
          <p>
            Complete My Protein is for educational purposes only. Always consult a healthcare
            provider or registered dietitian before starting any supplement regimen.
          </p>
        </footer>
      </main>

      {/* Dose Modal */}
      {pendingProtein && (
        <ProteinDoseModal
          open={doseModalOpen}
          onClose={() => {
            setDoseModalOpen(false);
            setPendingProtein(null);
          }}
          onConfirm={handleConfirmDose}
          proteinName={pendingProtein.name}
          proteinPerServing={pendingProtein.proteinPerServing}
        />
      )}
    </div>
  );
};

export default Protein;

import { useStackLabState } from '@/hooks/useStackLabState';
import { InventoryPicker } from '@/components/InventoryPicker';
import { GoalsPicker } from '@/components/GoalsPicker';
import { PlanSettings } from '@/components/PlanSettings';
import { SafetyCard } from '@/components/SafetyCard';
import { ChatPanel } from '@/components/ChatPanel';
import { Button } from '@/components/ui/button';
import { RotateCcw, Beaker } from 'lucide-react';

const Index = () => {
  const {
    state,
    addToInventory,
    removeFromInventory,
    clearInventory,
    toggleGoal,
    addCustomGoal,
    removeCustomGoal,
    updateSettings,
    addRecommendation,
    clearRecommendations,
    resetAll,
  } = useStackLabState();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Beaker className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">StackLab</h1>
              <p className="text-xs text-muted-foreground">Supplement Stack Builder</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset All
          </Button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-120px)]">
          {/* Left Panel - Setup */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            <InventoryPicker
              inventory={state.inventory}
              onAdd={addToInventory}
              onRemove={removeFromInventory}
            />

            <GoalsPicker
              selectedGoals={state.selectedGoals}
              customGoals={state.customGoals}
              onToggleGoal={toggleGoal}
              onAddCustomGoal={addCustomGoal}
              onRemoveCustomGoal={removeCustomGoal}
            />

            <PlanSettings
              settings={state.settings}
              onUpdate={updateSettings}
            />

            <SafetyCard
              safetyFlags={state.settings.safetyFlags}
              onUpdate={(flags) =>
                updateSettings({ safetyFlags: { ...state.settings.safetyFlags, ...flags } })
              }
            />
          </div>

          {/* Right Panel - Recommendations */}
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="h-full min-h-[600px]">
              <ChatPanel
                state={state}
                recommendations={state.recommendations}
                onNewRecommendation={addRecommendation}
                onReset={clearRecommendations}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-4 mt-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            ⚠️ StackLab is for educational purposes only. Always consult a healthcare
            provider before starting any supplement regimen.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;

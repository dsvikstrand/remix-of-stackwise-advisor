import { useStackLabState } from '@/hooks/useStackLabState';
import { InventoryPicker } from '@/components/InventoryPicker';
import { GoalsPicker } from '@/components/GoalsPicker';
import { PlanSettings } from '@/components/PlanSettings';
import { SafetyCard } from '@/components/SafetyCard';
import { ChatPanel } from '@/components/ChatPanel';
import { AppNavigation } from '@/components/shared/AppNavigation';
import { UserMenu } from '@/components/shared/UserMenu';
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
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-drift" />
        <div className="absolute top-1/3 -right-32 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] bg-secondary/10 rounded-full blur-3xl animate-pulse-soft" />
      </div>

      {/* Header */}
      <header className="border-b border-border/50 bg-card/40 backdrop-blur-glass sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-glow-aqua animate-pulse-soft">
                <Beaker className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground tracking-tight">StackLab</h1>
                <p className="text-xs text-muted-foreground">Supplement Stack Builder</p>
              </div>
            </div>

            {/* Navigation */}
            <div className="hidden sm:block ml-4">
              <AppNavigation variant="header" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={resetAll} className="text-muted-foreground">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset All
            </Button>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <div className="sm:hidden">
        <AppNavigation variant="floating" />
      </div>

      {/* Main Layout */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-120px)]">
          {/* Left Panel - Setup */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <InventoryPicker
                inventory={state.inventory}
                onAdd={addToInventory}
                onRemove={removeFromInventory}
              />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <GoalsPicker
                selectedGoals={state.selectedGoals}
                customGoals={state.customGoals}
                onToggleGoal={toggleGoal}
                onAddCustomGoal={addCustomGoal}
                onRemoveCustomGoal={removeCustomGoal}
              />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <PlanSettings
                settings={state.settings}
                onUpdate={updateSettings}
              />
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '0.4s' }}>
              <SafetyCard
                safetyFlags={state.settings.safetyFlags}
                onUpdate={(flags) =>
                  updateSettings({ safetyFlags: { ...state.settings.safetyFlags, ...flags } })
                }
              />
            </div>
          </div>

          {/* Right Panel - Recommendations */}
          <div className="lg:col-span-7 xl:col-span-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
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
      <footer className="border-t border-border/30 py-4 mt-8 bg-card/30 backdrop-blur-sm">
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
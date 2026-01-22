import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useBlendState } from '@/hooks/useBlendState';
import { BlendInventoryPicker } from '@/components/blend/BlendInventoryPicker';
import { BlendDoseModal } from '@/components/blend/BlendDoseModal';
import { BlendRecipeAccordion } from '@/components/blend/BlendRecipeAccordion';
import { BlendAnalysisView } from '@/components/blend/BlendAnalysisView';
import { HistoryDropdown } from '@/components/blend/HistoryDropdown';
import { MixButton } from '@/components/blend/MixButton';
import { CocktailLoadingAnimation } from '@/components/blend/CocktailLoadingAnimation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  SupplementCategory,
  DoseUnit,
  BlendItem,
  BlendAnalysis,
} from '@/types/stacklab';
import { Beaker, RotateCcw, Sparkles, ArrowLeft } from 'lucide-react';

const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-blend`;

const Blend = () => {
  const {
    currentBlend,
    history,
    createBlend,
    addItem,
    updateItem,
    removeItem,
    updateBlendName,
    saveAnalysis,
    clearCurrentBlend,
    loadFromHistory,
    deleteFromHistory,
    resetAll,
  } = useBlendState();

  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [streamingAnalysis, setStreamingAnalysis] = useState<string>('');

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

  // Analyze the blend
  const handleAnalyze = useCallback(async () => {
    if (!currentBlend || currentBlend.items.length === 0) return;

    setIsAnalyzing(true);
    setStreamingAnalysis('');

    try {
      const response = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          blendName: currentBlend.name,
          items: currentBlend.items.map((item) => ({
            name: item.name,
            amount: item.amount,
            unit: item.unit,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to analyze blend');
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
              setStreamingAnalysis(fullContent);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Parse and save the analysis
      const analysis = parseAnalysis(fullContent);
      saveAnalysis(analysis);
      setStreamingAnalysis('');

      toast({
        title: '✨ Blend Analyzed!',
        description: `Your ${currentBlend.name} has been classified as: ${analysis.classification || 'Custom Blend'}`,
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentBlend, saveAnalysis, toast]);

  // Parse the raw markdown into structured analysis
  function parseAnalysis(markdown: string): BlendAnalysis {
    let classification = '';
    let score = 0;
    let summary = '';
    let timing = '';
    const tweaks: string[] = [];
    const warnings: string[] = [];

    const lines = markdown.split('\n');
    let currentSection = '';

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      if (line.startsWith('### ')) {
        if (lowerLine.includes('classification')) currentSection = 'classification';
        else if (lowerLine.includes('score') || lowerLine.includes('effectiveness'))
          currentSection = 'score';
        else if (lowerLine.includes('summary')) currentSection = 'summary';
        else if (lowerLine.includes('when') || lowerLine.includes('timing'))
          currentSection = 'timing';
        else if (lowerLine.includes('tweak') || lowerLine.includes('suggest'))
          currentSection = 'tweaks';
        else if (lowerLine.includes('warning') || lowerLine.includes('interaction'))
          currentSection = 'warnings';
        else currentSection = '';
        continue;
      }

      const trimmed = line.trim();
      if (!trimmed) continue;

      switch (currentSection) {
        case 'classification':
          if (!classification) classification = trimmed.replace(/^\*\*|\*\*$/g, '');
          break;
        case 'score':
          const scoreMatch = trimmed.match(/(\d+)\s*\/\s*10/);
          if (scoreMatch) score = parseInt(scoreMatch[1], 10);
          break;
        case 'summary':
          summary += (summary ? ' ' : '') + trimmed;
          break;
        case 'timing':
          timing += (timing ? ' ' : '') + trimmed;
          break;
        case 'tweaks':
          if (trimmed.startsWith('- ')) tweaks.push(trimmed.slice(2));
          break;
        case 'warnings':
          if (trimmed.startsWith('- ')) warnings.push(trimmed.slice(2));
          break;
      }
    }

    return {
      classification,
      score,
      summary,
      timing,
      tweaks,
      warnings,
      rawMarkdown: markdown,
    };
  }

  // Handle starting a new blend
  const handleNewBlend = useCallback(() => {
    clearCurrentBlend();
    createBlend();
  }, [clearCurrentBlend, createBlend]);

  const showAnalysis = currentBlend?.analysis && !isAnalyzing;
  const showStreaming = streamingAnalysis && !currentBlend?.analysis;

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

      {/* Floating History Button */}
      <HistoryDropdown
        history={history}
        onLoad={loadFromHistory}
        onDelete={deleteFromHistory}
      />

      {/* Minimal Top Bar */}
      <header className="fixed top-4 right-4 z-40 flex items-center gap-2">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">StackLab</span>
          </Button>
        </Link>
        <Button variant="outline" size="sm" onClick={handleNewBlend} className="gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={resetAll} className="text-muted-foreground h-8 w-8" title="Reset All">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Hero Header */}
        <div className="text-center mb-12 pt-16 animate-fade-in">
          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter mb-4 relative inline-block">
            <span className="text-gradient-aqua animate-shimmer bg-[length:200%_auto] bg-clip-text [-webkit-background-clip:text]" 
                  style={{ 
                    fontFamily: "'Impact', 'Haettenschweiler', 'Franklin Gothic Bold', 'Charcoal', 'Helvetica Inserat', sans-serif",
                    letterSpacing: '-0.05em',
                    textShadow: '0 0 40px hsl(185 55% 50% / 0.4), 0 0 80px hsl(185 55% 50% / 0.2)'
                  }}>
              BLEND
            </span>
            <span className="absolute -inset-4 bg-primary/5 blur-2xl rounded-full animate-pulse-soft -z-10" />
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Create your perfect supplement cocktail
          </p>
        </div>

        {/* Inventory Section */}
        <section className="mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-2xl font-bold tracking-tight mb-4 text-foreground">
            CHOOSE YOUR INGREDIENTS
          </h2>
          <BlendInventoryPicker
            selectedIds={selectedIds}
            onSelect={handleSelectSupplement}
          />
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
            isLoading={isAnalyzing}
            itemCount={currentBlend?.items.length || 0}
          />
        </section>

        {/* Loading Animation */}
        {isAnalyzing && (
          <section className="mb-8 animate-fade-in-scale">
            <Card className="overflow-hidden bg-card/60 backdrop-blur-glass border-primary/20">
              <CardContent className="p-0">
                <CocktailLoadingAnimation />
              </CardContent>
            </Card>
          </section>
        )}

        {/* Streaming Analysis Preview */}
        {showStreaming && (
          <section className="mb-8 animate-fade-in">
            <BlendAnalysisView
              analysis={{
                classification: '',
                score: 0,
                summary: '',
                timing: '',
                tweaks: [],
                warnings: [],
                rawMarkdown: streamingAnalysis,
              }}
              isStreaming
            />
          </section>
        )}

        {/* Final Analysis - Conditional Reveal */}
        {showAnalysis && (
          <section className="mb-8 animate-fade-in-up">
            <BlendAnalysisView analysis={currentBlend.analysis!} />
          </section>
        )}

        {/* Footer Disclaimer */}
        <footer className="text-center py-8 text-sm text-muted-foreground border-t border-border/30 mt-8">
          <p>
            ⚠️ Blend Builder is for educational purposes only. Always consult a healthcare
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

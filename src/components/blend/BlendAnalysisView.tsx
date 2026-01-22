import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BlendAnalysis } from '@/types/stacklab';
import { cn } from '@/lib/utils';

interface BlendAnalysisViewProps {
  analysis: BlendAnalysis;
  isStreaming?: boolean;
}

type AnalysisView = 'overview' | 'optimize' | 'safety';

interface ParsedSections {
  classification: string;
  score: number;
  summary: string;
  timing: string;
  tweaks: string[];
  tips: string[];
  warnings: string[];
  interactions: string[];
}

function parseAnalysisMarkdown(markdown: string): ParsedSections {
  const sections: ParsedSections = {
    classification: '',
    score: 0,
    summary: '',
    timing: '',
    tweaks: [],
    tips: [],
    warnings: [],
    interactions: [],
  };

  const lines = markdown.split('\n');
  let currentSection = '';
  let contentBuffer: string[] = [];

  const flushBuffer = () => {
    const content = contentBuffer.join('\n').trim();
    if (!content) return;

    const lowerSection = currentSection.toLowerCase();
    
    if (lowerSection.includes('classification')) {
      sections.classification = content.replace(/^\*\*|\*\*$/g, '').trim();
    } else if (lowerSection.includes('score') || lowerSection.includes('effectiveness')) {
      const match = content.match(/(\d+(?:\.\d+)?)/);
      if (match) sections.score = parseFloat(match[1]);
    } else if (lowerSection.includes('summary')) {
      sections.summary = content;
    } else if (lowerSection.includes('when') || lowerSection.includes('timing')) {
      sections.timing = content;
    } else if (lowerSection.includes('tweak') || lowerSection.includes('suggest')) {
      sections.tweaks = content.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
    } else if (lowerSection.includes('tip') || lowerSection.includes('pro')) {
      sections.tips = content.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
    } else if (lowerSection.includes('warning')) {
      sections.warnings = content.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
    } else if (lowerSection.includes('interaction')) {
      sections.interactions = content.split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim());
    }
    
    contentBuffer = [];
  };

  for (const line of lines) {
    if (line.startsWith('### ')) {
      flushBuffer();
      currentSection = line.replace(/^###\s*/, '').trim();
    } else if (currentSection) {
      contentBuffer.push(line);
    }
  }
  flushBuffer();

  return sections;
}

function formatBoldText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function TabButton({ 
  active, 
  onClick, 
  children,
  variant = 'default'
}: { 
  active: boolean; 
  onClick: () => void; 
  children: React.ReactNode;
  variant?: 'default' | 'warning';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 py-4 px-4 text-sm font-black uppercase tracking-widest transition-all duration-300 relative",
        "border-b-4",
        active && variant === 'default' && "border-primary text-primary bg-primary/10",
        active && variant === 'warning' && "border-destructive text-destructive bg-destructive/10",
        !active && "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      {children}
      {active && (
        <span className={cn(
          "absolute inset-x-0 bottom-0 h-1 blur-sm",
          variant === 'default' ? "bg-primary" : "bg-destructive"
        )} />
      )}
    </button>
  );
}

function OverviewContent({ sections }: { sections: ParsedSections }) {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Classification - Big and bold */}
      {sections.classification && (
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground mb-2">
            CLASSIFICATION
          </p>
          <Badge className="text-xl md:text-2xl font-black uppercase tracking-wider px-6 py-3 bg-gradient-to-r from-primary to-primary/70">
            {sections.classification}
          </Badge>
        </div>
      )}

      {/* Score - Massive display */}
      {sections.score > 0 && (
        <div className="text-center space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
            EFFECTIVENESS SCORE
          </p>
          <div className="flex items-center justify-center gap-4">
            <span className="text-6xl md:text-7xl font-black text-primary">
              {sections.score}
            </span>
            <span className="text-3xl md:text-4xl font-bold text-muted-foreground">/10</span>
          </div>
          <Progress value={sections.score * 10} className="h-3 max-w-md mx-auto" />
        </div>
      )}

      {/* Summary */}
      {sections.summary && (
        <div className="space-y-3">
          <h3 className="text-lg font-black uppercase tracking-wider text-foreground">
            SUMMARY
          </h3>
          <p className="text-base leading-relaxed text-muted-foreground">
            {formatBoldText(sections.summary)}
          </p>
        </div>
      )}

      {/* Timing */}
      {sections.timing && (
        <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border/50">
          <h3 className="text-lg font-black uppercase tracking-wider text-foreground">
            WHEN TO TAKE
          </h3>
          <p className="text-base leading-relaxed text-muted-foreground">
            {formatBoldText(sections.timing)}
          </p>
        </div>
      )}
    </div>
  );
}

function OptimizeContent({ sections }: { sections: ParsedSections }) {
  const hasTweaks = sections.tweaks.length > 0;
  const hasTips = sections.tips.length > 0;

  if (!hasTweaks && !hasTips) {
    return (
      <div className="text-center py-12 text-muted-foreground animate-fade-in">
        <p className="text-lg">No optimization suggestions available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Tweaks */}
      {hasTweaks && (
        <div className="space-y-4">
          <h3 className="text-xl font-black uppercase tracking-wider text-primary">
            SUGGESTED TWEAKS
          </h3>
          <ul className="space-y-3">
            {sections.tweaks.map((tweak, i) => (
              <li 
                key={i} 
                className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-sm">
                  {i + 1}
                </span>
                <span className="text-base leading-relaxed pt-1">
                  {formatBoldText(tweak)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pro Tips */}
      {hasTips && (
        <div className="space-y-4">
          <h3 className="text-xl font-black uppercase tracking-wider text-foreground">
            PRO TIPS
          </h3>
          <ul className="space-y-3">
            {sections.tips.map((tip, i) => (
              <li 
                key={i} 
                className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 border border-border/50"
              >
                <span className="flex-shrink-0 text-primary font-black text-lg">→</span>
                <span className="text-base leading-relaxed">
                  {formatBoldText(tip)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SafetyContent({ sections }: { sections: ParsedSections }) {
  const hasWarnings = sections.warnings.length > 0;
  const hasInteractions = sections.interactions.length > 0;

  if (!hasWarnings && !hasInteractions) {
    return (
      <div className="text-center py-12 animate-fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/20 mb-4">
          <span className="text-success text-2xl font-black">✓</span>
        </div>
        <p className="text-lg text-muted-foreground">No safety concerns detected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Warnings */}
      {hasWarnings && (
        <div className="space-y-4">
          <h3 className="text-xl font-black uppercase tracking-wider text-destructive">
            WARNINGS
          </h3>
          <ul className="space-y-3">
            {sections.warnings.map((warning, i) => (
              <li 
                key={i} 
                className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30"
              >
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center text-destructive font-black text-sm">
                  !
                </span>
                <span className="text-base leading-relaxed pt-1">
                  {formatBoldText(warning)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Interactions */}
      {hasInteractions && (
        <div className="space-y-4">
          <h3 className="text-xl font-black uppercase tracking-wider text-warning">
            INTERACTIONS
          </h3>
          <ul className="space-y-3">
            {sections.interactions.map((interaction, i) => (
              <li 
                key={i} 
                className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/30"
              >
                <span className="flex-shrink-0 text-warning font-black text-lg">⚡</span>
                <span className="text-base leading-relaxed">
                  {formatBoldText(interaction)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function BlendAnalysisView({ analysis, isStreaming }: BlendAnalysisViewProps) {
  const [activeView, setActiveView] = useState<AnalysisView>('overview');
  const sections = parseAnalysisMarkdown(analysis.rawMarkdown);

  // Show raw markdown while streaming if parsing fails
  if (!analysis.rawMarkdown) {
    return null;
  }

  // Streaming fallback
  if (isStreaming && !sections.classification && !sections.summary) {
    return (
      <Card className="overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-2xl font-black uppercase tracking-wider">ANALYZING</h2>
            <Badge variant="secondary" className="animate-pulse">
              Processing...
            </Badge>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-mono">
            {analysis.rawMarkdown}
          </pre>
        </div>
      </Card>
    );
  }

  const hasWarningsOrInteractions = sections.warnings.length > 0 || sections.interactions.length > 0;

  return (
    <Card className="overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex border-b border-border bg-muted/30">
        <TabButton 
          active={activeView === 'overview'} 
          onClick={() => setActiveView('overview')}
        >
          Overview
        </TabButton>
        <TabButton 
          active={activeView === 'optimize'} 
          onClick={() => setActiveView('optimize')}
        >
          Optimize
        </TabButton>
        <TabButton 
          active={activeView === 'safety'} 
          onClick={() => setActiveView('safety')}
          variant={hasWarningsOrInteractions ? 'warning' : 'default'}
        >
          Safety
          {hasWarningsOrInteractions && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
              {sections.warnings.length + sections.interactions.length}
            </span>
          )}
        </TabButton>
      </div>

      {/* Content Area */}
      <CardContent className="p-6 md:p-8 min-h-[300px]">
        {activeView === 'overview' && <OverviewContent sections={sections} />}
        {activeView === 'optimize' && <OptimizeContent sections={sections} />}
        {activeView === 'safety' && <SafetyContent sections={sections} />}
      </CardContent>

      {/* Disclaimer */}
      <div className="px-6 pb-6">
        <p className="text-xs text-muted-foreground text-center">
          Educational purposes only. Consult a healthcare provider.
        </p>
      </div>
    </Card>
  );
}

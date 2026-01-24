import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Zap, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProteinAnalysis } from '@/types/stacklab';

interface ProteinAnalysisViewProps {
  analysis: ProteinAnalysis;
  isStreaming?: boolean;
}

type AnalysisView = 'profile' | 'optimize';

interface ParsedSections {
  completenessScore: number;
  leucineStatus: string;
  absorptionProfile: string;
  eaaBreakdown: string[];
  neaaBreakdown: string[];
  timing: string;
  optimizations: string[];
  tips: string[];
  warnings: string[];
  mpsAnalysis: string;
  costEfficiency: string;
  effectiveness: string;
  verdict: string;
}

function parseAnalysisMarkdown(markdown: string): ParsedSections {
  const sections: ParsedSections = {
    completenessScore: 0,
    leucineStatus: '',
    absorptionProfile: '',
    eaaBreakdown: [],
    neaaBreakdown: [],
    timing: '',
    optimizations: [],
    tips: [],
    warnings: [],
    mpsAnalysis: '',
    costEfficiency: '',
    effectiveness: '',
    verdict: '',
  };

  // Parse completeness score
  const scoreMatch = markdown.match(/(\d+)\s*(?:\/\s*100|%)/);
  if (scoreMatch) {
    sections.completenessScore = parseInt(scoreMatch[1], 10);
  }

  // Parse leucine status
  const leucineMatch = markdown.match(/leucine[:\s]+(\d+\.?\d*)\s*g?\s*\(?([^)]+)\)?/i);
  if (leucineMatch) {
    sections.leucineStatus = `${leucineMatch[1]}g - ${leucineMatch[2]}`;
  }

  // Parse absorption profile
  const absorptionMatch = markdown.match(/absorption\s*(?:profile)?[:\s]+([^\n]+)/i);
  if (absorptionMatch) {
    sections.absorptionProfile = absorptionMatch[1].trim();
  }

  // Parse EAA breakdown
  const eaaSection = markdown.match(/essential\s*amino\s*acid[^:]*:([\s\S]*?)(?=###|non-essential|$)/i);
  if (eaaSection) {
    const lines = eaaSection[1].split('\n').filter((l) => l.trim().startsWith('-'));
    sections.eaaBreakdown = lines.map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean);
  }

  // Parse NEAA breakdown
  const neaaSection = markdown.match(/non-essential[^:]*:([\s\S]*?)(?=###|$)/i);
  if (neaaSection) {
    const lines = neaaSection[1].split('\n').filter((l) => l.trim().startsWith('-'));
    sections.neaaBreakdown = lines.map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean);
  }

  // Parse timing
  const timingMatch = markdown.match(/when\s*to\s*take[:\s]+([\s\S]*?)(?=###|$)/i);
  if (timingMatch) {
    sections.timing = timingMatch[1].replace(/^[#\s-]+/, '').trim().split('\n')[0];
  }

  // Parse optimizations
  const optSection = markdown.match(/optimization[^:]*:([\s\S]*?)(?=###|$)/i);
  if (optSection) {
    const lines = optSection[1].split('\n').filter((l) => l.trim().startsWith('-'));
    sections.optimizations = lines.map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean);
  }

  // Parse tips
  const tipsSection = markdown.match(/pro\s*tips?[:\s]*([\s\S]*?)(?=###|$)/i);
  if (tipsSection) {
    const lines = tipsSection[1].split('\n').filter((l) => l.trim().startsWith('-') || l.trim().length > 10);
    sections.tips = lines.map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean).slice(0, 3);
  }

  // Parse warnings
  const warningsSection = markdown.match(/warnings?[^:]*:([\s\S]*?)(?=###|$)/i);
  if (warningsSection) {
    const lines = warningsSection[1].split('\n').filter((l) => l.trim().startsWith('-'));
    sections.warnings = lines.map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean);
  }

  // Parse GAINS section
  const mpsMatch = markdown.match(/muscle\s*protein\s*synthesis[^:]*:[:\s]*([\s\S]*?)(?=\*\*|###|$)/i);
  if (mpsMatch) {
    sections.mpsAnalysis = mpsMatch[1].trim().split('\n')[0];
  }

  const costMatch = markdown.match(/cost\s*efficiency[^:]*:[:\s]*([\s\S]*?)(?=\*\*|###|$)/i);
  if (costMatch) {
    sections.costEfficiency = costMatch[1].trim().split('\n')[0];
  }

  const effectMatch = markdown.match(/effectiveness[^:]*:[:\s]*([\s\S]*?)(?=\*\*|###|$)/i);
  if (effectMatch) {
    sections.effectiveness = effectMatch[1].trim().split('\n')[0];
  }

  const verdictMatch = markdown.match(/verdict[^:]*:[:\s]*([\s\S]*?)(?=###|---|$)/i);
  if (verdictMatch) {
    sections.verdict = verdictMatch[1].trim().split('\n')[0];
  }

  return sections;
}

function formatBoldText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function TabButton({
  active,
  onClick,
  children,
  variant = 'default',
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
        'px-4 py-2 text-sm font-medium rounded-lg transition-all',
        active
          ? variant === 'warning'
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            : 'bg-primary/20 text-primary border border-primary/30'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      )}
    >
      {children}
    </button>
  );
}

function ProfileContent({ sections }: { sections: ParsedSections }) {
  const scoreColor =
    sections.completenessScore >= 80
      ? 'text-green-500'
      : sections.completenessScore >= 60
      ? 'text-amber-500'
      : 'text-red-500';

  return (
    <div className="space-y-8">
      {/* Completeness Score */}
      <div className="text-center py-6">
        <p className="text-sm uppercase tracking-wider text-muted-foreground mb-2">Amino Profile Completeness</p>
        <p className={cn('text-7xl font-black', scoreColor)}>
          {sections.completenessScore}
          <span className="text-2xl text-muted-foreground">/100</span>
        </p>
      </div>

      {/* Key Stats - Stack vertically for better readability */}
      <div className="space-y-4">
        {sections.leucineStatus && (
          <div className="p-4 rounded-xl bg-card/50 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-primary" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Leucine Threshold</p>
            </div>
            <p className="text-lg font-semibold">{formatBoldText(sections.leucineStatus)}</p>
          </div>
        )}
        {sections.absorptionProfile && (
          <div className="p-4 rounded-xl bg-card/50 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-primary" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Absorption Profile</p>
            </div>
            <p className="text-lg font-semibold">{formatBoldText(sections.absorptionProfile)}</p>
          </div>
        )}
      </div>

      {/* EAA Breakdown */}
      {sections.eaaBreakdown.length > 0 && (
        <div>
          <p className="text-sm uppercase tracking-wider text-muted-foreground mb-3">Essential Amino Acids</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sections.eaaBreakdown.slice(0, 9).map((aa, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-card/30">
                <CheckCircle className="h-3 w-3 text-primary shrink-0" />
                <span className="text-sm">{formatBoldText(aa)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timing */}
      {sections.timing && (
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Optimal Timing</p>
          <p className="text-lg">{formatBoldText(sections.timing)}</p>
        </div>
      )}

      {/* Verdict */}
      {sections.verdict && (
        <div className="p-5 rounded-xl bg-primary/10 border border-primary/30">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Verdict</p>
          <p className="text-lg font-semibold">{formatBoldText(sections.verdict)}</p>
        </div>
      )}
    </div>
  );
}

function OptimizeContent({ sections }: { sections: ParsedSections }) {
  return (
    <div className="space-y-8">
      {/* Optimizations */}
      {sections.optimizations.length > 0 && (
        <div>
          <p className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Optimization Suggestions</p>
          <div className="space-y-3">
            {sections.optimizations.map((opt, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 rounded-xl bg-card/50 border border-border/30"
              >
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">{i + 1}</span>
                </div>
                <p className="text-sm leading-relaxed">{formatBoldText(opt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pro Tips */}
      {sections.tips.length > 0 && (
        <div>
          <p className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Pro Tips</p>
          <div className="space-y-3">
            {sections.tips.map((tip, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 rounded-xl bg-accent/10 border border-accent/20"
              >
                <Zap className="h-4 w-4 text-accent-foreground shrink-0 mt-0.5" />
                <p className="text-sm leading-relaxed">{formatBoldText(tip)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {sections.optimizations.length === 0 && sections.tips.length === 0 && (
        <div className="text-center py-12">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium">Your shake is already well-optimized!</p>
          <p className="text-muted-foreground">No major improvements needed.</p>
        </div>
      )}
    </div>
  );
}


export function ProteinAnalysisView({ analysis, isStreaming }: ProteinAnalysisViewProps) {
  const [activeView, setActiveView] = useState<AnalysisView>('profile');

  const sections = useMemo(() => parseAnalysisMarkdown(analysis.rawMarkdown), [analysis.rawMarkdown]);

  // While streaming, show raw markdown
  if (isStreaming) {
    return (
      <Card className="overflow-hidden bg-card/60 backdrop-blur-glass border-primary/20">
        <CardContent className="p-6">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-sm text-foreground/80 font-mono">
              {analysis.rawMarkdown}
            </pre>
          </div>
        </CardContent>
      </Card>
    );
  }

  const warningCount = sections.warnings.length;

  return (
    <Card className="overflow-hidden bg-card/60 backdrop-blur-glass border-primary/20">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 p-4 border-b border-border/30 overflow-x-auto">
        <TabButton active={activeView === 'profile'} onClick={() => setActiveView('profile')}>
          PROFILE
        </TabButton>
        <TabButton active={activeView === 'optimize'} onClick={() => setActiveView('optimize')}>
          OPTIMIZE
        </TabButton>
      </div>

      {/* Content */}
      <CardContent className="p-6">
        {activeView === 'profile' && <ProfileContent sections={sections} />}
        {activeView === 'optimize' && <OptimizeContent sections={sections} />}
      </CardContent>
    </Card>
  );
}

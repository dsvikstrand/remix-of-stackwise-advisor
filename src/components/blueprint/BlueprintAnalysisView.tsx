import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface BlueprintAnalysisViewProps {
  review: string;
  isStreaming?: boolean;
  sectionOrder?: string[];
  density?: 'default' | 'compact';
}

interface ParsedSection {
  title: string;
  key: string;
  bullets: string[];
  text: string;
}

function normalizeSectionKey(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getSectionMarker(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes('strength')) return '+';
  if (lower.includes('gap') || lower.includes('risk')) return '!';
  if (lower.includes('suggest')) return '>';
  return '-';
}

function parseReviewSections(markdown: string): ParsedSection[] {
  if (!markdown) return [];

  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  const lines = markdown.split('\n');

  for (const line of lines) {
    if (line.startsWith('### ') || line.startsWith('## ')) {
      const title = line.replace(/^#+\s*/, '').trim();
      if (!title) continue;
      current = {
        title,
        key: normalizeSectionKey(title),
        bullets: [],
        text: '',
      };
      sections.push(current);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!current) {
      current = {
        title: 'Overview',
        key: 'overview',
        bullets: [],
        text: '',
      };
      sections.push(current);
    }

    const cleaned = trimmed
      .replace(/^\*\*|\*\*$/g, '')
      .replace(/^\*|\*$/g, '')
      .replace(/^[-*+]\s+/, '');

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ')) {
      current.bullets.push(cleaned);
    } else {
      current.text += (current.text ? ' ' : '') + cleaned;
    }
  }

  return sections;
}

function applySectionOrder(sections: ParsedSection[], sectionOrder?: string[]) {
  if (!sectionOrder || sectionOrder.length === 0) {
    return sections.length > 0
      ? sections
      : [{ title: 'Overview', key: 'overview', bullets: [], text: '' }];
  }

  const sectionMap = new Map(sections.map((section) => [normalizeSectionKey(section.title), section]));
  const ordered = sectionOrder.map((title) => {
    const key = normalizeSectionKey(title);
    return sectionMap.get(key) || { title, key, bullets: [], text: '' };
  });

  const extras = sections.filter(
    (section) => !ordered.some((orderedSection) => orderedSection.key === section.key)
  );

  return ordered.concat(extras);
}

function extractScore(section: ParsedSection) {
  const scoreRegex = /score\s*:\s*(\d{1,3})\s*\/\s*100/i;
  let score: number | null = null;

  const textMatch = section.text.match(scoreRegex);
  if (textMatch) {
    score = parseInt(textMatch[1], 10);
  }

  const filteredBullets = section.bullets.filter((item) => {
    const match = item.match(scoreRegex);
    if (match && score === null) {
      score = parseInt(match[1], 10);
    }
    return !match;
  });

  const cleanedText = section.text.replace(scoreRegex, '').replace(/\s{2,}/g, ' ').trim();

  return { score, text: cleanedText, bullets: filteredBullets };
}

export function BlueprintAnalysisView({ review, isStreaming, sectionOrder, density = 'default' }: BlueprintAnalysisViewProps) {
  const parsedSections = parseReviewSections(review);
  const orderedSections = applySectionOrder(parsedSections, sectionOrder);
  const isCompact = density === 'compact';

  return (
    <Card className="bg-transparent border-border/40 overflow-hidden shadow-none">
      <CardContent className="p-0">
        <Tabs defaultValue={orderedSections[0]?.key || 'overview'} className="w-full">
          <TabsList
            className={cn(
              'w-full justify-start rounded-none border-b border-border/40 bg-muted/20',
              'flex-nowrap overflow-x-auto',
              isCompact ? 'px-3 py-2' : 'px-4 pt-4',
            )}
          >
            {orderedSections.map((section) => (
              <TabsTrigger
                key={section.key}
                value={section.key}
                className={cn(
                  'shrink-0 data-[state=active]:bg-background uppercase tracking-wide',
                  isCompact ? 'text-[11px] px-2 py-1' : '',
                )}
              >
                {section.title}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className={cn(isCompact ? 'p-3 sm:p-4' : 'p-6')}>
            {orderedSections.map((section) => {
              const isOverview = section.key === 'overview' || section.title.toLowerCase().includes('overview');
              const { score, text, bullets } = isOverview ? extractScore(section) : {
                score: null,
                text: section.text,
                bullets: section.bullets,
              };

              const scoreColor =
                score !== null && score >= 80
                  ? 'text-green-500'
                  : score !== null && score >= 60
                  ? 'text-amber-500'
                  : 'text-red-500';

              return (
                <TabsContent
                  key={section.key}
                  value={section.key}
                  className={cn('mt-0', isCompact ? 'space-y-2.5' : 'space-y-4')}
                >
                  <h3 className={cn(isCompact ? 'text-base font-semibold' : 'text-2xl font-bold tracking-tight')}>
                    {section.title}
                  </h3>

                  {isOverview && score !== null && (
                    <div className={cn('text-center', isCompact ? 'py-2' : 'py-4')}>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Blueprint score</p>
                      <p className={cn(isCompact ? 'text-4xl font-black' : 'text-6xl font-black', scoreColor)}>
                        {score}
                        <span className={cn(isCompact ? 'text-lg' : 'text-2xl', 'text-muted-foreground')}>/100</span>
                      </p>
                    </div>
                  )}

                  {text ? (
                    <p className={cn('text-muted-foreground', isCompact ? 'text-sm leading-snug' : 'leading-relaxed')}>
                      {text}
                    </p>
                  ) : null}

                  {bullets.length > 0 ? (
                    <ul className={cn(isCompact ? 'space-y-2' : 'space-y-3')}>
                      {bullets.map((item, index) => (
                        <li key={index} className={cn('flex', isCompact ? 'gap-2 text-sm' : 'gap-3')}>
                          <span className="text-primary font-bold">{getSectionMarker(section.title)}</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {!text && bullets.length === 0 && (
                    <p className="text-muted-foreground leading-relaxed">
                      {isStreaming ? 'Generating...' : 'No details yet.'}
                    </p>
                  )}
                </TabsContent>
              );
            })}
          </div>
        </Tabs>

        {isStreaming && (
          <div className={cn(isCompact ? 'px-3 pb-3' : 'px-6 pb-4')}>
            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

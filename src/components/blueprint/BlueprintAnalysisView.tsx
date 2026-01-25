import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface BlueprintAnalysisViewProps {
  review: string;
  isStreaming?: boolean;
  sectionOrder?: string[];
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

export function BlueprintAnalysisView({ review, isStreaming, sectionOrder }: BlueprintAnalysisViewProps) {
  const parsedSections = parseReviewSections(review);
  const orderedSections = applySectionOrder(parsedSections, sectionOrder);

  return (
    <Card className="bg-card/80 backdrop-blur-glass border-border/50 overflow-hidden">
      <CardContent className="p-0">
        <Tabs defaultValue={orderedSections[0]?.key || 'overview'} className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-muted/30 px-4 pt-4">
            {orderedSections.map((section) => (
              <TabsTrigger
                key={section.key}
                value={section.key}
                className="data-[state=active]:bg-background"
              >
                {section.title.toUpperCase()}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="p-6">
            {orderedSections.map((section) => (
              <TabsContent key={section.key} value={section.key} className="mt-0 space-y-4">
                <h3 className="text-2xl font-bold tracking-tight">{section.title}</h3>
                {section.bullets.length > 0 ? (
                  <ul className="space-y-3">
                    {section.bullets.map((item, index) => (
                      <li key={index} className="flex gap-3">
                        <span className="text-primary font-bold">{getSectionMarker(section.title)}</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground leading-relaxed">
                    {section.text || (isStreaming ? 'Generating...' : 'No details yet.')}
                  </p>
                )}
              </TabsContent>
            ))}
          </div>
        </Tabs>

        {isStreaming && (
          <div className="px-6 pb-4">
            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

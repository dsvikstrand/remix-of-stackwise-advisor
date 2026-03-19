import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SummarySlides } from '@/components/blueprint/SummarySlides';
import {
  buildRenderBlocksFromBlueprintSections,
  parseBlueprintSectionsV1,
  type BlueprintSectionsV1,
} from '@/lib/blueprintSections';
import { splitSummaryIntoSlides } from '@/lib/summarySlides';

const parsedBlueprintModules = import.meta.glob('../../eval/yt2bp-model-probe/output/**/*.parsed.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

type PreviewEntry = {
  path: string;
  runId: string;
  caseId: string;
  videoId: string;
  variant: string;
  attemptNumber: number;
  label: string;
  sections: BlueprintSectionsV1;
};

function buildPreviewEntries() {
  return Object.entries(parsedBlueprintModules)
    .map(([path, moduleValue]) => {
      const match = path.match(/output\/([^/]+)\/([^/]+)\/([^/]+)\.parsed\.json$/);
      if (!match) return null;
      const [, runId, caseId, filename] = match;
      const attemptMatch = filename.match(/^(.*)-attempt-(\d+)$/);
      if (!attemptMatch) return null;
      const [, variant, attemptNumberRaw] = attemptMatch;
      const attemptNumber = Number.parseInt(attemptNumberRaw, 10);
      const parsed = parseBlueprintSectionsV1(moduleValue as never);
      if (!parsed) return null;
      const videoId = caseId.replace(/^case_\d+_/, '');
      return {
        path,
        runId,
        caseId,
        videoId,
        variant,
        attemptNumber,
        label: `${caseId} • ${variant} • attempt ${attemptNumber}`,
        sections: parsed,
      } satisfies PreviewEntry;
    })
    .filter((entry): entry is PreviewEntry => Boolean(entry))
    .sort((left, right) =>
      right.runId.localeCompare(left.runId)
      || left.caseId.localeCompare(right.caseId)
      || left.attemptNumber - right.attemptNumber,
    );
}

const previewEntries = buildPreviewEntries();
const previewRuns = Array.from(new Set(previewEntries.map((entry) => entry.runId)));

function displaySectionTitle(title: string) {
  return title === 'Bleup' ? 'Storyline' : title;
}

export default function DevBlueprintPreview() {
  const [selectedRun, setSelectedRun] = useState(previewRuns[0] || '');
  const runEntries = useMemo(
    () => previewEntries.filter((entry) => entry.runId === selectedRun),
    [selectedRun],
  );
  const [selectedPath, setSelectedPath] = useState(runEntries[0]?.path || previewEntries[0]?.path || '');

  useEffect(() => {
    if (runEntries.some((entry) => entry.path === selectedPath)) return;
    setSelectedPath(runEntries[0]?.path || '');
  }, [runEntries, selectedPath]);

  const selectedEntry = runEntries.find((entry) => entry.path === selectedPath) || runEntries[0] || null;
  const renderBlocks = selectedEntry
    ? buildRenderBlocksFromBlueprintSections(selectedEntry.sections)
    : [];

  if (!selectedEntry) {
    return (
      <PageRoot>
        <AppHeader />
        <PageMain>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">No Eval Blueprints Found</CardTitle>
              <CardDescription>
                Save at least one parsed eval output under <code>eval/yt2bp-model-probe/output/</code> to preview it here.
              </CardDescription>
            </CardHeader>
          </Card>
        </PageMain>
        <AppFooter />
      </PageRoot>
    );
  }

  return (
    <PageRoot>
      <AppHeader />
      <PageMain className="space-y-6">
        <PageSection>
          <Card>
            <CardHeader className="space-y-3">
              <div className="space-y-1">
                <CardTitle className="text-lg">Dev Blueprint Preview</CardTitle>
                <CardDescription>
                  Local-only preview for parsed eval outputs. This does not read or write app data.
                </CardDescription>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Run</p>
                  <Select value={selectedRun} onValueChange={setSelectedRun}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select run" />
                    </SelectTrigger>
                    <SelectContent>
                      {previewRuns.map((runId) => (
                        <SelectItem key={runId} value={runId}>
                          {runId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Case</p>
                  <Select value={selectedPath} onValueChange={setSelectedPath}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select case" />
                    </SelectTrigger>
                    <SelectContent>
                      {runEntries.map((entry) => (
                        <SelectItem key={entry.path} value={entry.path}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{selectedEntry.videoId}</Badge>
                <Badge variant="outline">{selectedEntry.variant}</Badge>
                <Badge variant="outline">attempt {selectedEntry.attemptNumber}</Badge>
                <Badge variant="secondary">{selectedEntry.sections.schema_version}</Badge>
              </div>
              <p className="text-xs text-muted-foreground break-all">{selectedEntry.path}</p>
            </CardHeader>
          </Card>
        </PageSection>

        <PageSection>
          <div className="flex flex-wrap gap-2">
            {selectedEntry.sections.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                #{tag}
              </Badge>
            ))}
          </div>
        </PageSection>

        <PageSection className="space-y-4">
          {renderBlocks.map((block) => {
            const title = displaySectionTitle(block.title);
            if (title === 'Storyline') {
              return (
                <Card key={block.id || title}>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SummarySlides title="" slides={splitSummaryIntoSlides(block.description)} surface="flat" />
                  </CardContent>
                </Card>
              );
            }
            return (
              <Card key={block.id || title}>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {block.description ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{block.description}</p>
                  ) : null}
                  {block.items.length > 0 ? (
                    <ul className="space-y-2 list-disc pl-5">
                      {block.items.map((item, index) => (
                        <li key={`${block.id || title}-${index}`} className="text-sm leading-snug">
                          {item.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </PageSection>
      </PageMain>
      <AppFooter />
    </PageRoot>
  );
}

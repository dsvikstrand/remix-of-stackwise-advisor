import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Megaphone, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useAiCredits } from '@/hooks/useAiCredits';
import { useToast } from '@/hooks/use-toast';
import { listMyFeedItems } from '@/lib/myFeedApi';
import type { MyFeedItemView } from '@/lib/myFeedData';

type OutreachCandidate = {
  id: string;
  blueprintId: string;
  sourceUrl: string;
  title: string;
  sourceName: string;
  createdLabel: string;
  status: 'ready';
};

type AdminOutreachDraftsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function getStatusView(status: OutreachCandidate['status']) {
  switch (status) {
    case 'ready':
      return { label: 'Ready', variant: 'default' as const };
    default:
      return { label: 'New', variant: 'outline' as const };
  }
}

function formatRelativeDate(value: string | null | undefined) {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown time';

  const diffMs = Date.now() - timestamp;
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) return 'Just now';
  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
    return `${minutes}m ago`;
  }
  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.floor(diffMs / hourMs));
    return `${hours}h ago`;
  }
  if (diffMs < 7 * dayMs) {
    const days = Math.max(1, Math.floor(diffMs / dayMs));
    return `${days}d ago`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toOutreachCandidate(item: MyFeedItemView): OutreachCandidate | null {
  const blueprintId = String(item.blueprint?.id || '').trim();
  const sourceUrl = String(item.source?.sourceUrl || '').trim();
  if (!blueprintId || !sourceUrl) return null;

  return {
    id: item.id,
    blueprintId,
    sourceUrl,
    title: item.blueprint?.title || item.source?.title || 'Untitled blueprint',
    sourceName: item.source?.sourceChannelTitle || 'YouTube',
    createdLabel: formatRelativeDate(item.createdAt),
    status: 'ready',
  };
}

function buildOutreachCandidates(items: MyFeedItemView[]) {
  const seenBlueprintIds = new Set<string>();
  return items
    .map(toOutreachCandidate)
    .filter((candidate): candidate is OutreachCandidate => Boolean(candidate))
    .filter((candidate) => {
      if (seenBlueprintIds.has(candidate.blueprintId)) return false;
      seenBlueprintIds.add(candidate.blueprintId);
      return true;
    })
    .slice(0, 50);
}

export function AdminOutreachDraftsButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const creditsQuery = useAiCredits({
    enabled: Boolean(user),
    refetchIntervalMs: false,
  });
  const isAdmin = creditsQuery.data?.plan === 'admin';

  if (!user || !isAdmin) return null;

  return (
    <>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 rounded-full text-primary"
              aria-label="Outreach drafts"
              title="Outreach drafts"
              onClick={() => setOpen(true)}
            >
              <Megaphone className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Outreach drafts</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AdminOutreachDraftsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AdminOutreachDraftsSheet({ open, onOpenChange }: AdminOutreachDraftsSheetProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const candidatesQuery = useQuery({
    queryKey: ['admin-outreach-drafts-candidates', user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as OutreachCandidate[];
      const result = await listMyFeedItems(user.id);
      return buildOutreachCandidates(result.items);
    },
    enabled: Boolean(open && user?.id),
    staleTime: 60_000,
  });

  const candidates = useMemo(
    () => candidatesQuery.data || [],
    [candidatesQuery.data],
  );

  const handleCreateDraft = (candidate: OutreachCandidate) => {
    toast({
      title: 'Draft flow not connected yet',
      description: candidate.title,
    });
  };

  const handleOpenBlueprint = (candidate: OutreachCandidate) => {
    window.open(`/blueprint/${encodeURIComponent(candidate.blueprintId)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border/40 px-4 py-4 text-left">
          <SheetTitle>Outreach Drafts</SheetTitle>
          <SheetDescription>
            Latest unlocked YouTube blueprints queued for manual outreach review.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {candidatesQuery.isLoading ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Loading latest generated blueprints...
            </div>
          ) : candidatesQuery.isError ? (
            <div className="px-4 py-6 text-sm text-destructive">
              Could not load outreach candidates. Please try again.
            </div>
          ) : candidates.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              No generated YouTube blueprints with source videos were found for this account yet.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {candidates.map((candidate) => {
              const statusView = getStatusView(candidate.status);
              return (
                <div key={candidate.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">
                        {candidate.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{candidate.sourceName}</span>
                        <span>{candidate.createdLabel}</span>
                        <Badge variant={statusView.variant} className="h-5 px-2 text-[10px]">
                          {statusView.label}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => handleCreateDraft(candidate)}
                    >
                      <MessageSquareText className="h-3.5 w-3.5" />
                      Create draft
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => handleOpenBlueprint(candidate)}
                    >
                      Open blueprint
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5"
                      asChild
                    >
                      <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Video
                      </a>
                    </Button>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

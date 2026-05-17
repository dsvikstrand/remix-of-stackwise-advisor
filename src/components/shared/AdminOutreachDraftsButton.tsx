import { useState } from 'react';
import { Megaphone, MessageSquareText } from 'lucide-react';
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

type OutreachCandidate = {
  id: string;
  title: string;
  sourceName: string;
  createdLabel: string;
  status: 'ready' | 'not_started' | 'drafted';
};

type AdminOutreachDraftsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MOCK_OUTREACH_CANDIDATES: OutreachCandidate[] = [
  {
    id: 'toy-candidate-1',
    title: 'Beta-Alanine: What It Does and Why the Tingles Do Not Mean It Is Working',
    sourceName: 'MTS Nutrition',
    createdLabel: 'Today',
    status: 'ready',
  },
  {
    id: 'toy-candidate-2',
    title: 'How Zone 2 Training Changes Endurance and Recovery',
    sourceName: 'Health creator',
    createdLabel: 'Yesterday',
    status: 'not_started',
  },
  {
    id: 'toy-candidate-3',
    title: 'A Practical Guide to Building a Morning Learning Routine',
    sourceName: 'Productivity creator',
    createdLabel: '2d ago',
    status: 'drafted',
  },
];

function getStatusView(status: OutreachCandidate['status']) {
  switch (status) {
    case 'drafted':
      return { label: 'Drafted', variant: 'secondary' as const };
    case 'ready':
      return { label: 'Ready', variant: 'default' as const };
    default:
      return { label: 'New', variant: 'outline' as const };
  }
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
  const { toast } = useToast();

  const handleCreateDraft = (candidate: OutreachCandidate) => {
    toast({
      title: 'Draft flow not connected yet',
      description: candidate.title,
    });
  };

  const handleOpenBlueprint = (candidate: OutreachCandidate) => {
    toast({
      title: 'Blueprint link not connected yet',
      description: candidate.title,
    });
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
          <div className="divide-y divide-border/40">
            {MOCK_OUTREACH_CANDIDATES.map((candidate) => {
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

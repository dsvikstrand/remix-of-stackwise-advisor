import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, Megaphone, MessageSquareText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useAiCredits } from '@/hooks/useAiCredits';
import { useToast } from '@/hooks/use-toast';
import { ApiRequestError } from '@/lib/subscriptionsApi';
import {
  generateOutreachDrafts,
  postOutreachDraft,
  type OutreachDraftGenerationResult,
  type OutreachPromoVariant,
} from '@/lib/adminOutreachApi';
import { listMyFeedItems } from '@/lib/myFeedApi';
import type { MyFeedItemView } from '@/lib/myFeedData';
import {
  getYouTubeConnectionStatus,
  startYouTubeConnection,
} from '@/lib/youtubeConnectionApi';

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

function appendPromoText(commentText: string, promoText: string) {
  const comment = String(commentText || '').trim();
  const promo = String(promoText || '').trim();
  if (!comment) return promo;
  if (!promo) return comment;
  return `${comment}\n\n${promo}`;
}

function removeKnownPromoText(commentText: string, promoVariants: OutreachPromoVariant[]) {
  const text = String(commentText || '').trim();
  for (const promo of promoVariants) {
    const promoText = String(promo.text || '').trim();
    if (!promoText || !text.endsWith(promoText)) continue;
    return text.slice(0, text.length - promoText.length).trim();
  }
  return text;
}

function getYouTubeConnectionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    switch (error.errorCode) {
      case 'YT_OAUTH_NOT_CONFIGURED':
        return 'YouTube connect is not configured yet.';
      case 'YT_REAUTH_REQUIRED':
        return 'YouTube authorization expired. Reconnect required.';
      case 'YT_RETURN_TO_INVALID':
        return 'Invalid return URL. Refresh this page and retry.';
      case 'RATE_LIMITED':
        return error.message || 'Please wait a moment before trying again.';
      default:
        return error.message || fallback;
    }
  }
  return error instanceof Error ? error.message : fallback;
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
  const [draftResult, setDraftResult] = useState<OutreachDraftGenerationResult | null>(null);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [postedDraftIds, setPostedDraftIds] = useState<Set<string>>(() => new Set());
  const youtubeConnectionQuery = useQuery({
    queryKey: ['admin-outreach-youtube-connection-status', user?.id],
    queryFn: getYouTubeConnectionStatus,
    enabled: Boolean(open && user?.id),
    retry: false,
  });
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
  const draftMutation = useMutation({
    mutationFn: async (candidate: OutreachCandidate) => {
      return generateOutreachDrafts({ blueprintId: candidate.blueprintId });
    },
    onSuccess: (result) => {
      setDraftResult(result);
      setDraftEdits(Object.fromEntries(
        result.options.map((option) => [option.id, option.finalText]),
      ));
      setDraftDialogOpen(true);
    },
    onError: (error) => {
      toast({
        title: 'Could not create outreach drafts',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });
  const startYouTubeConnectMutation = useMutation({
    mutationFn: async () => {
      return startYouTubeConnection({ returnTo: window.location.href });
    },
    onSuccess: (payload) => {
      window.location.assign(payload.auth_url);
    },
    onError: (error) => {
      toast({
        title: 'Could not start YouTube connect',
        description: getYouTubeConnectionErrorMessage(error, 'Please try again.'),
        variant: 'destructive',
      });
    },
  });
  const postMutation = useMutation({
    mutationFn: async (input: { optionId: string; finalText: string }) => {
      return postOutreachDraft({
        draftId: input.optionId,
        finalText: input.finalText,
      });
    },
    onSuccess: (result) => {
      setPostedDraftIds((current) => new Set(current).add(result.draftId));
      const visible = result.status === 'posted' && result.verification?.visible !== false;
      toast({
        title: visible ? 'Comment posted' : 'Comment submitted, visibility not confirmed',
        description: visible
          ? `YouTube comment id: ${result.youtubeCommentId}`
          : result.verification?.errorMessage
            || 'YouTube accepted the comment, but it is not publicly visible yet. It may be held for review or filtered by YouTube.',
        variant: visible ? 'default' : 'destructive',
      });
      void candidatesQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: 'Could not post outreach comment',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleCreateDraft = (candidate: OutreachCandidate) => {
    draftMutation.mutate(candidate);
  };

  const handleOpenBlueprint = (candidate: OutreachCandidate) => {
    window.open(`/blueprint/${encodeURIComponent(candidate.blueprintId)}`, '_blank', 'noopener,noreferrer');
  };

  const handleCopyDraft = async (optionId: string) => {
    const text = draftEdits[optionId] || '';
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    toast({
      title: 'Draft copied',
      description: 'Paste it into YouTube after your manual review.',
    });
  };

  const handleAddPromo = (optionId: string, promo: OutreachPromoVariant) => {
    if (!draftResult) return;
    setDraftEdits((current) => {
      const currentText = current[optionId] || '';
      const baseText = removeKnownPromoText(currentText, draftResult.promoVariants);
      return {
        ...current,
        [optionId]: appendPromoText(baseText, promo.text),
      };
    });
  };

  const handleRemovePromo = (optionId: string) => {
    if (!draftResult) return;
    setDraftEdits((current) => ({
      ...current,
      [optionId]: removeKnownPromoText(current[optionId] || '', draftResult.promoVariants),
    }));
  };

  const handlePostDraft = (optionId: string) => {
    const finalText = draftEdits[optionId] || '';
    if (!finalText.trim()) return;
    const confirmed = window.confirm(
      'Post this edited outreach comment to YouTube now? This is a real public comment from the connected admin YouTube account.',
    );
    if (!confirmed) return;
    postMutation.mutate({ optionId, finalText });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border/40 px-4 py-4 text-left">
            <SheetTitle>Outreach Drafts</SheetTitle>
            <SheetDescription>
              Latest unlocked YouTube blueprints queued for manual outreach review.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-border/40 px-4 py-4">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">YouTube posting account</p>
                      {youtubeConnectionQuery.data?.connected ? (
                        <Badge variant="default" className="h-5 px-2 text-[10px]">
                          Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-5 px-2 text-[10px]">
                          Not connected
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {youtubeConnectionQuery.isLoading
                        ? 'Checking connection...'
                        : youtubeConnectionQuery.isError
                          ? getYouTubeConnectionErrorMessage(youtubeConnectionQuery.error, 'Could not load connection status.')
                          : youtubeConnectionQuery.data?.connected
                            ? `Posting will use ${youtubeConnectionQuery.data.channel_title || 'the connected YouTube account'}. Reconnect if YouTube asks for comment permission.`
                            : 'Connect the admin YouTube account before posting outreach comments.'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={youtubeConnectionQuery.data?.connected ? 'outline' : 'default'}
                    className="h-8 gap-1.5"
                    disabled={startYouTubeConnectMutation.isPending}
                    onClick={() => startYouTubeConnectMutation.mutate()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {startYouTubeConnectMutation.isPending
                      ? 'Opening Google...'
                      : youtubeConnectionQuery.data?.connected
                        ? 'Reconnect posting account'
                        : 'Connect posting account'}
                  </Button>
                  {youtubeConnectionQuery.data?.needs_reauth ? (
                    <span className="text-xs text-destructive">Reconnect required.</span>
                  ) : null}
                </div>
              </div>
            </div>
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
                const createPending = draftMutation.isPending && draftMutation.variables?.id === candidate.id;
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
                        disabled={createPending}
                        onClick={() => handleCreateDraft(candidate)}
                      >
                        <MessageSquareText className="h-3.5 w-3.5" />
                        {createPending ? 'Creating...' : 'Create draft'}
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

      <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review Outreach Drafts</DialogTitle>
            <DialogDescription>
              Start with a regular video comment. Add a stored BLEUP promo only when the thread is worth it.
            </DialogDescription>
          </DialogHeader>
          {draftResult ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
                <div>Model: {draftResult.model} · reasoning: {draftResult.reasoningEffort}</div>
                <div>Creator cap: 1 per {draftResult.limits.channelWindowDays} days · daily cap: {draftResult.limits.dailyCap}</div>
                <div>
                  Creator subscribers: {typeof draftResult.sourceChannelSubscriberCount === 'number'
                    ? draftResult.sourceChannelSubscriberCount.toLocaleString()
                    : 'unavailable'}
                </div>
              </div>
              {draftResult.options.map((option) => (
                <div key={option.id} className="space-y-2 rounded-lg border border-border/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">Comment suggestion {option.optionIndex}</div>
                    <Badge variant="outline" className="text-[10px]">
                      Regular first
                    </Badge>
                  </div>
                  <Textarea
                    value={draftEdits[option.id] || option.finalText}
                    rows={8}
                    onChange={(event) => {
                      setDraftEdits((current) => ({
                        ...current,
                        [option.id]: event.target.value,
                      }));
                    }}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Regular comment by default. Add promo only when useful.
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {draftResult.promoVariants.slice(0, 3).map((promo, index) => (
                        <Button
                          key={promo.id}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleAddPromo(option.id, promo)}
                        >
                          Add promo {index + 1}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="gap-1.5"
                        onClick={() => handleRemovePromo(option.id)}
                      >
                        Remove promo
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => handleCopyDraft(option.id)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        disabled={postMutation.isPending || postedDraftIds.has(option.id)}
                        onClick={() => handlePostDraft(option.id)}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {postedDraftIds.has(option.id)
                          ? 'Posted'
                          : postMutation.isPending && postMutation.variables?.optionId === option.id
                            ? 'Posting...'
                            : 'Post to YouTube'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

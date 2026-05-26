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
  refreshOutreachCandidateStats,
  type OutreachCandidateStatsRefreshResult,
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
  sourceItemId: string;
  sourceUrl: string;
  title: string;
  sourceName: string;
  createdLabel: string;
  viewCount: number | null;
  commentCount: number | null;
  postedCommentsLast10Days: number | null;
  durationSeconds: number | null;
  status: 'ready' | 'posted';
};

type CandidateStatsItem = OutreachCandidateStatsRefreshResult['items'][number];

type AdminOutreachDraftsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function getStatusView(status: OutreachCandidate['status']) {
  switch (status) {
    case 'ready':
      return { label: 'Ready', variant: 'default' as const };
    case 'posted':
      return { label: 'Posted', variant: 'secondary' as const };
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

function formatCompactCount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value));
}

function formatVideoDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return null;
  const totalSeconds = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function toOutreachCandidate(item: MyFeedItemView): OutreachCandidate | null {
  const blueprintId = String(item.blueprint?.id || '').trim();
  const sourceItemId = String(item.source?.id || '').trim();
  const sourceUrl = String(item.source?.sourceUrl || '').trim();
  if (!blueprintId || !sourceItemId || !sourceUrl) return null;

  return {
    id: item.id,
    blueprintId,
    sourceItemId,
    sourceUrl,
    title: item.blueprint?.title || item.source?.title || 'Untitled blueprint',
    sourceName: item.source?.sourceChannelTitle || 'YouTube',
    createdLabel: formatRelativeDate(item.createdAt),
    viewCount: item.source?.viewCount ?? null,
    commentCount: item.source?.commentCount ?? null,
    postedCommentsLast10Days: null,
    durationSeconds: item.source?.durationSeconds ?? null,
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

function getPromoVariantLabel(promo: OutreachPromoVariant, index: number) {
  const fallback = `Promo ${index + 1}`;
  switch (promo.id) {
    case 'keep-up-short-v4':
      return 'Keep up';
    case 'watch-later-short-v4':
      return 'Watch Later';
    case 'revisit-takeaways-short-v4':
      return 'Useful takeaways';
    case 'profile-keep-up-short-v4':
      return 'Stay up to date';
    case 'miss-good-videos-short-v4':
      return 'Good videos';
    case 'simple-youtube-learning-short-v4':
      return 'Simple way';
    default:
      return fallback;
  }
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
  const [selectedDraftOptionId, setSelectedDraftOptionId] = useState<string | null>(null);
  const [selectedPromoId, setSelectedPromoId] = useState('none');
  const [statsFetchLimit, setStatsFetchLimit] = useState(10);
  const [postedDraftIds, setPostedDraftIds] = useState<Set<string>>(() => new Set());
  const [postedBlueprintIds, setPostedBlueprintIds] = useState<Set<string>>(() => new Set());
  const [candidateStatsBySourceItemId, setCandidateStatsBySourceItemId] = useState<Record<string, CandidateStatsItem>>({});
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
    () => (candidatesQuery.data || []).map((candidate) => {
      const stats = candidateStatsBySourceItemId[candidate.sourceItemId];
      const posted = postedBlueprintIds.has(candidate.blueprintId);
      return {
        ...candidate,
        viewCount: stats?.viewCount ?? candidate.viewCount,
        commentCount: stats?.commentCount ?? candidate.commentCount,
        postedCommentsLast10Days: stats?.postedCommentsLast10Days ?? candidate.postedCommentsLast10Days,
        durationSeconds: stats?.durationSeconds ?? candidate.durationSeconds,
        status: posted ? 'posted' as const : candidate.status,
      };
    }),
    [candidateStatsBySourceItemId, candidatesQuery.data, postedBlueprintIds],
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
      setSelectedDraftOptionId(result.options[0]?.id || null);
      setSelectedPromoId('none');
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
  const refreshStatsMutation = useMutation({
    mutationFn: async (limit: number) => {
      const sourceItemIds = candidates
        .slice(0, Math.max(1, Math.min(50, Math.floor(Number(limit) || 10))))
        .map((candidate) => candidate.sourceItemId)
        .filter(Boolean);
      if (sourceItemIds.length === 0) {
        throw new Error('No outreach candidates available.');
      }
      return refreshOutreachCandidateStats({ sourceItemIds });
    },
    onSuccess: (result) => {
      setCandidateStatsBySourceItemId((current) => {
        const next = { ...current };
        for (const item of result.items) {
          next[item.sourceItemId] = item;
        }
        return next;
      });
      toast({
        title: 'Comment stats refreshed',
        description: `Fetched ${result.requested} videos using about ${result.quotaUnitsEstimated} YouTube quota unit${result.quotaUnitsEstimated === 1 ? '' : 's'}.`,
      });
      void candidatesQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: 'Could not fetch comment stats',
        description: error instanceof Error ? error.message : 'Please try again.',
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
      setPostedBlueprintIds((current) => new Set(current).add(result.blueprintId));
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
      if (error instanceof ApiRequestError && error.errorCode === 'YT_REAUTH_REQUIRED') {
        void youtubeConnectionQuery.refetch();
      }
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

  const getSelectedPromoText = () => {
    if (!draftResult || selectedPromoId === 'none') return '';
    return draftResult.promoVariants.find((promo) => promo.id === selectedPromoId)?.text || '';
  };

  const buildFinalDraftText = (optionId: string) => {
    const option = draftResult?.options.find((draftOption) => draftOption.id === optionId);
    const commentText = draftEdits[optionId] ?? option?.finalText ?? '';
    return appendPromoText(commentText, getSelectedPromoText());
  };

  const selectedDraftOption = draftResult?.options.find((option) => option.id === selectedDraftOptionId) || null;
  const selectedDraftFinalText = selectedDraftOption ? buildFinalDraftText(selectedDraftOption.id) : '';
  const youtubeNeedsReconnect = Boolean(youtubeConnectionQuery.data?.needs_reauth);

  const handleCopyDraft = async (optionId: string) => {
    const text = buildFinalDraftText(optionId);
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    toast({
      title: 'Draft copied',
      description: getSelectedPromoText()
        ? 'Copied with the selected promo appended.'
        : 'Copied as a regular comment.',
    });
  };

  const handlePostSelectedDraft = () => {
    if (!selectedDraftOption) return;
    const promoText = getSelectedPromoText();
    const finalText = selectedDraftFinalText;
    if (!finalText.trim()) return;
    const confirmed = window.confirm(
      promoText
        ? 'Post this edited outreach comment with the selected promo appended? This is a real public comment from the connected admin YouTube account.'
        : 'Post this edited outreach comment to YouTube now? This is a real public comment from the connected admin YouTube account.',
    );
    if (!confirmed) return;
    postMutation.mutate({ optionId: selectedDraftOption.id, finalText });
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
                      {youtubeNeedsReconnect ? (
                        <Badge variant="destructive" className="h-5 px-2 text-[10px]">
                          Reconnect required
                        </Badge>
                      ) : youtubeConnectionQuery.data?.connected ? (
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
                            ? youtubeNeedsReconnect
                              ? 'YouTube authorization expired or was revoked. Reconnect the posting account before posting comments.'
                              : `Posting will use ${youtubeConnectionQuery.data.channel_title || 'the connected YouTube account'}. Reconnect if YouTube asks for comment permission.`
                            : 'Connect the admin YouTube account before posting outreach comments.'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={youtubeConnectionQuery.data?.connected && !youtubeNeedsReconnect ? 'outline' : 'default'}
                    className="h-8 gap-1.5"
                    disabled={startYouTubeConnectMutation.isPending}
                    onClick={() => startYouTubeConnectMutation.mutate()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {startYouTubeConnectMutation.isPending
                      ? 'Opening Google...'
                      : youtubeConnectionQuery.data?.connected || youtubeNeedsReconnect
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
              <div>
                <div className="border-b border-border/40 px-4 py-3">
                  <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Video stats</p>
                      <p className="text-xs text-muted-foreground">
                        Manually fetch views, total comments, and video length for the latest generated candidates.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={statsFetchLimit}
                        onChange={(event) => setStatsFetchLimit(Number(event.target.value))}
                        disabled={refreshStatsMutation.isPending}
                        aria-label="Number of latest candidates to fetch stats for"
                      >
                        <option value={10}>Latest 10</option>
                        <option value={25}>Latest 25</option>
                        <option value={50}>Latest 50</option>
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={refreshStatsMutation.isPending}
                        onClick={() => refreshStatsMutation.mutate(statsFetchLimit)}
                      >
                        {refreshStatsMutation.isPending ? 'Fetching...' : 'Fetch video stats'}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-border/40">
                  {candidates.map((candidate) => {
                const statusView = getStatusView(candidate.status);
                const createPending = draftMutation.isPending && draftMutation.variables?.id === candidate.id;
                const viewCountLabel = formatCompactCount(candidate.viewCount);
                const commentCountLabel = formatCompactCount(candidate.commentCount);
                const postedCommentsLabel = typeof candidate.postedCommentsLast10Days === 'number'
                  ? candidate.postedCommentsLast10Days.toLocaleString()
                  : null;
                const durationLabel = formatVideoDuration(candidate.durationSeconds);
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
                          {durationLabel ? <span>{durationLabel}</span> : null}
                          {viewCountLabel ? <span>{viewCountLabel} views</span> : null}
                          {commentCountLabel ? <span>{commentCountLabel} comments</span> : null}
                          {postedCommentsLabel ? <span>{postedCommentsLabel} posted / 10d</span> : null}
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
                        disabled={createPending || candidate.status === 'posted'}
                        onClick={() => handleCreateDraft(candidate)}
                      >
                        <MessageSquareText className="h-3.5 w-3.5" />
                        {candidate.status === 'posted' ? 'Posted' : createPending ? 'Creating...' : 'Create draft'}
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
                <div>
                  Creator cap: {draftResult.limits.channelWindowCap || 1} per {draftResult.limits.channelWindowDays} days · daily cap: {draftResult.limits.dailyCap > 0 ? draftResult.limits.dailyCap : 'off'}
                </div>
                <div>
                  Creator subscribers: {typeof draftResult.sourceChannelSubscriberCount === 'number'
                    ? draftResult.sourceChannelSubscriberCount.toLocaleString()
                    : 'unavailable'}
                </div>
              </div>
              {draftResult.options.map((option) => {
                const selected = selectedDraftOptionId === option.id;
                const posted = postedDraftIds.has(option.id);
                return (
                <div
                  key={option.id}
                  className={`space-y-2 rounded-lg border p-3 transition ${
                    selected ? 'border-primary bg-primary/5' : 'border-border/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{option.roleLabel || `Comment suggestion ${option.optionIndex}`}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant={selected ? 'default' : 'outline'} className="text-[10px]">
                        {selected ? 'Selected' : `Suggestion ${option.optionIndex}`}
                      </Badge>
                      {posted ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Posted
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <Textarea
                    value={draftEdits[option.id] ?? option.finalText}
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
                      Edit the regular comment only. The promo selector below is appended when copying or posting.
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
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
                        variant={selected ? 'default' : 'outline'}
                        disabled={posted}
                        onClick={() => setSelectedDraftOptionId(option.id)}
                      >
                        {selected ? 'Selected' : 'Select draft'}
                      </Button>
                    </div>
                  </div>
                </div>
                );
              })}
              <div className="space-y-2 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Optional promo add-on</div>
                  <p className="text-xs text-muted-foreground">
                    Default is comment-only. Select one one-liner below to append it when you copy or post.
                  </p>
                </div>
                <div className="grid gap-2">
                  <button
                    type="button"
                    aria-pressed={selectedPromoId === 'none'}
                    className={`rounded-md border p-2 text-left text-xs transition ${
                      selectedPromoId === 'none'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border/60 bg-background/70 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                    onClick={() => setSelectedPromoId('none')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">None</span>
                      {selectedPromoId === 'none' ? (
                        <Badge variant="default" className="h-5 px-2 text-[10px]">Selected</Badge>
                      ) : null}
                    </div>
                    <div className="mt-1">Post or copy the selected comment without a promo.</div>
                  </button>
                  {draftResult.promoVariants.map((promo, index) => {
                    const selected = selectedPromoId === promo.id;
                    return (
                      <button
                        key={promo.id}
                        type="button"
                        aria-pressed={selected}
                        className={`rounded-md border p-2 text-left text-xs transition ${
                          selected
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border/60 bg-background/70 text-muted-foreground hover:border-primary/50 hover:text-foreground'
                        }`}
                        onClick={() => setSelectedPromoId(promo.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{getPromoVariantLabel(promo, index)}</span>
                          {selected ? (
                            <Badge variant="default" className="h-5 px-2 text-[10px]">Selected</Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 leading-relaxed">{promo.text}</div>
                      </button>
                    );
                  })}
                </div>
                {getSelectedPromoText() ? (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Selected add-on preview
                    </div>
                    <div className="rounded-md bg-background/70 p-2 text-xs text-muted-foreground">
                      {getSelectedPromoText()}
                    </div>
                  </div>
                ) : null}
                {selectedDraftOption ? (
                  <div className="space-y-2 border-t border-border/50 pt-3">
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Final post preview
                      </div>
                      <div className="whitespace-pre-wrap rounded-md bg-background/70 p-2 text-xs text-foreground">
                        {selectedDraftFinalText}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        Posts the selected suggestion with the selected promo setting.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        disabled={
                          postMutation.isPending
                          || !selectedDraftFinalText.trim()
                          || postedDraftIds.has(selectedDraftOption.id)
                          || youtubeNeedsReconnect
                        }
                        onClick={handlePostSelectedDraft}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {postedDraftIds.has(selectedDraftOption.id)
                          ? 'Posted'
                          : youtubeNeedsReconnect
                            ? 'Reconnect required'
                          : postMutation.isPending && postMutation.variables?.optionId === selectedDraftOption.id
                            ? 'Posting...'
                            : 'Post selected draft'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md bg-background/70 p-2 text-xs text-muted-foreground">
                    Select one comment suggestion before posting.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

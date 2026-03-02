import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  ApiRequestError,
  generateSubscriptionRefreshBlueprints,
  scanSubscriptionRefreshCandidates,
  type GenerationTier,
  type SubscriptionRefreshCandidate,
} from '@/lib/subscriptionsApi';
import { hydrateQueueItemsWithClientTranscripts } from '@/lib/clientTranscript';
import { useGenerationTierAccess } from '@/hooks/useGenerationTierAccess';

type RefreshSubscriptionsDialogProps = {
  open: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  subscriptionsEnabled: boolean;
  userId?: string;
  generationRunning?: boolean;
  onQueued?: (payload: { jobId: string; queuedCount: number }) => void;
};

function getRefreshCandidateKey(item: SubscriptionRefreshCandidate) {
  return `${item.subscription_id}:${item.video_id}`;
}

function formatDateTime(value: string | null) {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString();
}

export function RefreshSubscriptionsDialog({
  open,
  onOpenChange,
  subscriptionsEnabled,
  userId,
  generationRunning = false,
  onQueued,
}: RefreshSubscriptionsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [refreshCandidates, setRefreshCandidates] = useState<SubscriptionRefreshCandidate[]>([]);
  const [refreshSelected, setRefreshSelected] = useState<Record<string, boolean>>({});
  const [refreshScanErrors, setRefreshScanErrors] = useState<Array<{ subscription_id: string; error: string }>>([]);
  const [refreshCooldownFiltered, setRefreshCooldownFiltered] = useState<number>(0);
  const [refreshDurationFiltered, setRefreshDurationFiltered] = useState<number>(0);
  const [refreshErrorText, setRefreshErrorText] = useState<string | null>(null);
  const [hasScannedRefreshCandidates, setHasScannedRefreshCandidates] = useState(false);
  const [requestedTier, setRequestedTier] = useState<GenerationTier>('free');
  const generationTierAccessQuery = useGenerationTierAccess(Boolean(open && userId));
  const allowedGenerationTiers = generationTierAccessQuery.data?.allowedTiers || ['free'];

  useEffect(() => {
    if (!userId) return;
    const defaultTier = generationTierAccessQuery.data?.defaultTier || 'free';
    if (!allowedGenerationTiers.includes(requestedTier)) {
      setRequestedTier(defaultTier);
    }
  }, [allowedGenerationTiers, generationTierAccessQuery.data?.defaultTier, requestedTier, userId]);

  const resetDialogState = () => {
    setHasScannedRefreshCandidates(false);
    setRefreshErrorText(null);
    setRefreshCandidates([]);
    setRefreshSelected({});
    setRefreshScanErrors([]);
    setRefreshCooldownFiltered(0);
    setRefreshDurationFiltered(0);
    refreshScanMutation.reset();
  };

  useEffect(() => {
    if (open) return;
    resetDialogState();
  }, [open]);

  const invalidateSubscriptionViews = () => {
    queryClient.invalidateQueries({ queryKey: ['source-subscriptions', userId] });
    queryClient.invalidateQueries({ queryKey: ['my-feed-items', userId] });
  };

  const refreshScanMutation = useMutation({
    mutationFn: async () => {
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      return scanSubscriptionRefreshCandidates();
    },
    onSuccess: (payload) => {
      setHasScannedRefreshCandidates(true);
      setRefreshErrorText(null);
      setRefreshCandidates(payload.candidates || []);
      setRefreshScanErrors(payload.scan_errors || []);
      setRefreshCooldownFiltered(Math.max(0, Number(payload.cooldown_filtered || 0)));
      setRefreshDurationFiltered(Math.max(0, Number(payload.duration_filtered_count || 0)));
      const next: Record<string, boolean> = {};
      for (const candidate of payload.candidates || []) {
        next[getRefreshCandidateKey(candidate)] = true;
      }
      setRefreshSelected(next);
    },
    onError: (error) => {
      setHasScannedRefreshCandidates(true);
      if (error instanceof ApiRequestError && error.errorCode === 'RATE_LIMITED') {
        setRefreshErrorText(error.message || 'Refresh scan is cooling down. Please retry shortly.');
      } else {
        setRefreshErrorText(error instanceof Error ? error.message : 'Could not scan subscriptions.');
      }
      setRefreshCandidates([]);
      setRefreshScanErrors([]);
      setRefreshCooldownFiltered(0);
      setRefreshDurationFiltered(0);
      setRefreshSelected({});
    },
  });

  const selectedRefreshItems = useMemo(
    () => refreshCandidates.filter((item) => refreshSelected[getRefreshCandidateKey(item)]),
    [refreshCandidates, refreshSelected],
  );

  const refreshGenerateMutation = useMutation({
    mutationFn: async (items: SubscriptionRefreshCandidate[]) => {
      if (!subscriptionsEnabled) throw new Error('Backend API is not configured.');
      const hydrated = await hydrateQueueItemsWithClientTranscripts(items);
      if (hydrated.ready.length === 0) {
        throw new Error('Could not fetch transcript in browser for the selected videos.');
      }
      const payload = await generateSubscriptionRefreshBlueprints({
        items: hydrated.ready,
        requestedTier,
      });
      return {
        payload,
        failedCount: hydrated.failed.length,
      };
    },
    onSuccess: (result) => {
      const payload = result.payload;
      invalidateSubscriptionViews();
      onQueued?.({ jobId: payload.job_id, queuedCount: payload.queued_count });
      toast({
        title: 'Background generation started',
        description: `Queued ${payload.queued_count} video(s). You can keep using the app while blueprints are generated.`,
      });
      if (result.failedCount > 0) {
        toast({
          title: 'Some videos were skipped',
          description: `Skipped ${result.failedCount} selected video(s) because transcript fetch failed in your browser.`,
        });
      }
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError) {
        if (error.errorCode === 'JOB_ALREADY_RUNNING') {
          const jobId = (error.data as { job_id?: string } | null)?.job_id || null;
          if (jobId) {
            onQueued?.({ jobId, queuedCount: 0 });
          }
          toast({
            title: 'Generation already in progress',
            description: 'Please wait for the current background generation to finish.',
          });
          return;
        }
        if (error.errorCode === 'MAX_ITEMS_EXCEEDED') {
          toast({
            title: 'Selection too large',
            description: 'Select up to 20 videos per generation run.',
            variant: 'destructive',
          });
          return;
        }
        if (error.errorCode === 'VIDEO_DURATION_POLICY_BLOCKED' || error.errorCode === 'VIDEO_TOO_LONG') {
          toast({
            title: 'Selection blocked by length policy',
            description: 'Only videos up to 45 minutes can be generated in MVP.',
            variant: 'destructive',
          });
          return;
        }
        if (error.errorCode === 'TIER_NOT_ALLOWED') {
          toast({
            title: 'Tier access denied',
            description: 'This generation tier is not enabled for your account.',
            variant: 'destructive',
          });
          return;
        }
      }
      toast({
        title: 'Could not start generation',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const toggleRefreshCandidate = (item: SubscriptionRefreshCandidate, nextChecked: boolean) => {
    const key = getRefreshCandidateKey(item);
    setRefreshSelected((previous) => ({
      ...previous,
      [key]: nextChecked,
    }));
  };

  const handleRefreshSelectAll = (nextChecked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const candidate of refreshCandidates) {
      next[getRefreshCandidateKey(candidate)] = nextChecked;
    }
    setRefreshSelected(next);
  };

  const handleStartBackgroundGeneration = () => {
    if (selectedRefreshItems.length === 0) return;
    if (selectedRefreshItems.length > 20) {
      toast({
        title: 'Selection too large',
        description: 'Select up to 20 videos per generation run.',
        variant: 'destructive',
      });
      return;
    }
    refreshGenerateMutation.mutate(selectedRefreshItems);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Refresh subscriptions</DialogTitle>
          <DialogDescription>
            Scan your active subscriptions for new videos, then choose what to generate in the background.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refreshScanMutation.mutate()}
              disabled={refreshScanMutation.isPending || refreshGenerateMutation.isPending || generationRunning || !subscriptionsEnabled}
            >
              {refreshScanMutation.isPending ? 'Scanning...' : 'Scan'}
            </Button>
            <span className="ml-2 text-xs text-muted-foreground">Tier:</span>
            <Button
              type="button"
              size="sm"
              variant={requestedTier === 'free' ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => setRequestedTier('free')}
            >
              Free
            </Button>
            {allowedGenerationTiers.includes('tier') ? (
              <Button
                type="button"
                size="sm"
                variant={requestedTier === 'tier' ? 'default' : 'outline'}
                className="h-7 px-2 text-xs"
                onClick={() => setRequestedTier('tier')}
              >
                Tier
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Tier locked</span>
            )}
            {refreshCandidates.length > 0 ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRefreshSelectAll(true)}
                  disabled={refreshGenerateMutation.isPending}
                >
                  Select all
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRefreshSelectAll(false)}
                  disabled={refreshGenerateMutation.isPending}
                >
                  Clear
                </Button>
              </>
            ) : null}
          </div>

          {refreshErrorText ? (
            <p className="text-sm text-destructive">{refreshErrorText}</p>
          ) : null}

          {refreshScanErrors.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Some channels could not be scanned right now ({refreshScanErrors.length}).
            </p>
          ) : null}

          {refreshScanMutation.status === 'success' && refreshCooldownFiltered > 0 ? (
            <p className="text-xs text-muted-foreground">
              Hidden due to recent failures: {refreshCooldownFiltered} (retry window: 6 hours).
            </p>
          ) : null}

          {refreshScanMutation.status === 'success' && refreshDurationFiltered > 0 ? (
            <p className="text-xs text-muted-foreground">
              Filtered by length policy: {refreshDurationFiltered} (45-minute max, unknown length blocked).
            </p>
          ) : null}

          {refreshScanMutation.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
            </div>
          ) : null}

          {!refreshScanMutation.isPending && !refreshErrorText && refreshCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {refreshScanMutation.status === 'success'
                ? 'No new videos found.'
                : 'Click Scan to check your subscriptions for new videos.'}
            </p>
          ) : null}

          {refreshCandidates.length > 0 ? (
            <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
              {refreshCandidates.map((item) => {
                const key = getRefreshCandidateKey(item);
                const checked = Boolean(refreshSelected[key]);
                return (
                  <div key={key} className="rounded-md border border-border/40 p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleRefreshCandidate(item, value === true)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.source_channel_title || item.source_channel_id}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatDateTime(item.published_at)}</span>
                          <a
                            href={item.video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            Open video
                          </a>
                        </div>
                      </div>
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt={item.title}
                          className="h-12 w-20 rounded-md object-cover border border-border/40 shrink-0"
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 pt-2">
            {hasScannedRefreshCandidates ? (
              <p className="text-xs text-muted-foreground">
                Selected: {selectedRefreshItems.length} / {refreshCandidates.length}
              </p>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              onClick={handleStartBackgroundGeneration}
              disabled={
                selectedRefreshItems.length === 0
                || selectedRefreshItems.length > 20
                || refreshGenerateMutation.isPending
                || refreshScanMutation.isPending
                || generationRunning
              }
            >
              {refreshGenerateMutation.isPending ? 'Starting...' : 'Generate blueprints'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

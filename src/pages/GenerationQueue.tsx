import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppFooter } from '@/components/shared/AppFooter';
import { AppHeader } from '@/components/shared/AppHeader';
import { PageMain, PageRoot, PageSection } from '@/components/layout/Page';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GenerationQueueRow } from '@/components/queue/GenerationQueueRow';
import { PwaPushCta } from '@/components/pwa/PwaPushCta';
import { useGenerationQueue } from '@/hooks/useGenerationQueue';
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications';
import {
  getGenerationQueueScopeLabel,
  getGenerationResultActionLabel,
  resolveGenerationResultLinkPath,
} from '@/lib/generationQueueLabels';

type RecentResultRow = {
  id: string;
  type: 'generation_succeeded' | 'generation_failed';
  title: string;
  body: string;
  scope: string | null;
  linkPath: string | null;
  createdAt: string;
  insertedCount: number;
  skippedCount: number;
  failedCount: number;
};

function toInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function parseRecentResult(item: NotificationItem): RecentResultRow | null {
  if (item.type !== 'generation_succeeded' && item.type !== 'generation_failed') return null;
  const metadata = item.metadata && typeof item.metadata === 'object'
    ? item.metadata as Record<string, unknown>
    : {};
  const insertedCount = toInt(metadata.inserted_count);
  const skippedCount = toInt(metadata.skipped_count);
  const failedCount = toInt(metadata.failed_count);
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    scope: String(metadata.scope || '').trim() || null,
    linkPath: item.link_path,
    createdAt: item.created_at,
    insertedCount,
    skippedCount,
    failedCount,
  };
}

function formatRelativeTime(iso: string) {
  const dateMs = Date.parse(iso);
  if (!Number.isFinite(dateMs)) return '';
  const diffSeconds = Math.max(1, Math.floor((Date.now() - dateMs) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function GenerationQueue() {
  const navigate = useNavigate();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const {
    items: activeItems,
    summary,
    isLoading: isActiveLoading,
    isFetching: isActiveFetching,
  } = useGenerationQueue({
    limit: 50,
    pollMs: 4_000,
    enabled: true,
  });
  const {
    items: notifications,
    isLoading: isNotificationsLoading,
    isOfflineSnapshot: isOfflineNotificationsSnapshot,
    lastSyncedAt: notificationsLastSyncedAt,
  } = useNotifications({ limit: 50 });

  const filteredActiveItems = activeItems;

  const recentResults = useMemo(() => {
    return notifications
      .map(parseRecentResult)
      .filter((item): item is RecentResultRow => Boolean(item))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [notifications]);

  return (
    <PageRoot>
      <AppHeader />
      <PageMain className="space-y-6">
        <PageSection className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Generation Queue</h1>
          <p className="text-sm text-muted-foreground">
            Track active blueprint generations and recent generation outcomes in one place.
          </p>
        </PageSection>

        <PwaPushCta />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Queue</CardTitle>
            <p className="text-xs text-muted-foreground">
              Active {summary.active_count} • Queued {summary.queued_count} • Running {summary.running_count}
              {isActiveFetching ? ' • Refreshing...' : ''}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {isActiveLoading && filteredActiveItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading active queue...</p>
            ) : filteredActiveItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active jobs right now.</p>
            ) : (
              filteredActiveItems.map((job) => {
                const isExpanded = expandedJobId === job.job_id;
                return (
                  <div key={job.job_id} className="space-y-2">
                    <GenerationQueueRow
                      job={job}
                      action={(
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setExpandedJobId(isExpanded ? null : job.job_id)}
                        >
                          {isExpanded ? 'Hide details' : 'View details'}
                        </Button>
                      )}
                    />
                    {isExpanded ? (
                      <div className="rounded-md border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
                        <p className="break-all">Job ID: {job.job_id}</p>
                        <p>Trigger: {job.trigger || 'manual'}</p>
                        <p>Attempts: {job.attempts}/{job.max_attempts}</p>
                        <p>Created: {new Date(job.created_at).toLocaleString()}</p>
                        <p>Started: {job.started_at ? new Date(job.started_at).toLocaleString() : 'Not started yet'}</p>
                        <p>Next run: {job.next_run_at ? new Date(job.next_run_at).toLocaleString() : 'Pending'}</p>
                        {job.error_message ? <p className="mt-1">Last error: {job.error_message}</p> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Results</CardTitle>
            {isOfflineNotificationsSnapshot ? (
              <p className="text-xs text-muted-foreground">
                Offline snapshot{notificationsLastSyncedAt ? ` • Synced ${formatRelativeTime(notificationsLastSyncedAt)}` : ''}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {isNotificationsLoading && recentResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading recent results...</p>
            ) : recentResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent generation results yet.</p>
            ) : (
              recentResults.map((item) => {
                const isSucceeded = item.type === 'generation_succeeded';
                const actionLabel = getGenerationResultActionLabel(item.type, item.scope, item.linkPath);
                const actionPath = resolveGenerationResultLinkPath(item.scope, item.linkPath);
                return (
                  <div key={item.id} className="rounded-lg border border-border/50 bg-background px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {getGenerationQueueScopeLabel(item.scope)} • {formatRelativeTime(item.createdAt)}
                        </p>
                      </div>
                      <Badge variant={isSucceeded ? 'default' : 'destructive'}>
                        {isSucceeded ? 'Succeeded' : 'Failed'}
                      </Badge>
                    </div>
                    {item.body ? (
                      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>Inserted {item.insertedCount}</span>
                      <span>Skipped {item.skippedCount}</span>
                      <span>Failed {item.failedCount}</span>
                    </div>
                    <div className="mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => navigate(actionPath)}
                      >
                        {actionLabel}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </PageMain>
      <AppFooter />
    </PageRoot>
  );
}

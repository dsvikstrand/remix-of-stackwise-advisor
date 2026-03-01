import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getGenerationQueueScopeLabel } from '@/lib/generationQueueLabels';
import type { ActiveIngestionJob } from '@/lib/subscriptionsApi';

function getStatusVariant(status: ActiveIngestionJob['status']) {
  if (status === 'running') return 'default';
  return 'secondary';
}

function getStatusLabel(status: ActiveIngestionJob['status']) {
  if (status === 'running') return 'Running';
  return 'Queued';
}

function toFailedCount(job: ActiveIngestionJob) {
  return Math.max(0, Number(job.processed_count || 0) - Number(job.inserted_count || 0) - Number(job.skipped_count || 0));
}

type GenerationQueueRowProps = {
  job: ActiveIngestionJob;
  compact?: boolean;
  className?: string;
  action?: ReactNode;
};

export function GenerationQueueRow({
  job,
  compact = false,
  className,
  action = null,
}: GenerationQueueRowProps) {
  const failedCount = toFailedCount(job);
  const isQueued = job.status === 'queued';

  return (
    <div className={cn('rounded-lg border border-border/50 bg-background px-3 py-2.5', compact ? 'space-y-1.5' : 'space-y-2', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{getGenerationQueueScopeLabel(job.scope)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isQueued ? (
              job.queue_position == null
                ? 'Position unavailable'
                : `Position ~${job.queue_position}${job.estimated_start_seconds == null ? '' : ` • ETA ~${job.estimated_start_seconds}s`}`
            ) : 'Active now'}
          </p>
        </div>
        <Badge variant={getStatusVariant(job.status)} className="shrink-0">
          {getStatusLabel(job.status)}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>Inserted {job.inserted_count || 0}</span>
        <span>Skipped {job.skipped_count || 0}</span>
        <span>Failed {failedCount}</span>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}


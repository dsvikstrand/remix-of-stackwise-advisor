import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SourceUnlockJobView } from '@/hooks/useSourceUnlockJobTracker';

type UnlockActivityCardProps = {
  title?: string;
  activity: SourceUnlockJobView;
  onClear?: () => void;
  showViewMyFeed?: boolean;
};

export function UnlockActivityCard({
  title = 'Unlock activity',
  activity,
  onClear,
  showViewMyFeed = true,
}: UnlockActivityCardProps) {
  if (!activity.visible || !activity.label) return null;

  const badgeVariant = activity.status === 'failed'
    ? 'destructive'
    : activity.status === 'succeeded'
      ? 'secondary'
      : 'outline';

  return (
    <Card className="border-border/40 bg-muted/10">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{title}</p>
          <Badge variant={badgeVariant}>{activity.label}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Inserted {activity.insertedCount}, skipped {activity.skippedCount}, failed {activity.failedCount}.
        </p>
        {activity.status === 'failed' && activity.errorMessage ? (
          <p className="mt-1 text-xs text-destructive line-clamp-2">{activity.errorMessage}</p>
        ) : null}
        {(!activity.isActive && (showViewMyFeed || onClear)) ? (
          <div className="mt-2 flex items-center gap-2">
            {showViewMyFeed && activity.status === 'succeeded' && activity.insertedCount > 0 ? (
              <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs">
                <Link to="/wall">View Home</Link>
              </Button>
            ) : null}
            {onClear ? (
              <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={onClear}>
                Dismiss
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

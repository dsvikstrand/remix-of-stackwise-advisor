import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatRelativeShort } from '@/lib/timeFormat';

const unlockCostFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

type ForYouLockedSourceCardProps = {
  title: string;
  sourceChannelTitle: string | null;
  sourceChannelAvatarUrl?: string | null;
  createdAt: string;
  sourceUrl: string | null;
  unlockCost: number;
  isUnlocking: boolean;
  onUnlock: () => void;
};

export function ForYouLockedSourceCard({
  title,
  sourceChannelTitle,
  sourceChannelAvatarUrl,
  createdAt,
  sourceUrl,
  unlockCost,
  isUnlocking,
  onUnlock,
}: ForYouLockedSourceCardProps) {
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const sourceLabel = sourceChannelTitle || 'Subscribed source';
  const sourceInitials = sourceLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'S';

  const handleCardActivate = () => {
    if (isUnlocking) return;
    setShowUnlockConfirm(true);
  };

  const handleConfirmUnlock = () => {
    setShowUnlockConfirm(false);
    void onUnlock();
  };

  return (
    <>
      <div className="px-3 py-2 transition-colors hover:bg-muted/20">
      <div
        className={`relative overflow-hidden rounded-lg border border-border/50 bg-background/80 ${isUnlocking ? 'cursor-default' : 'cursor-pointer'}`}
        role="button"
        tabIndex={isUnlocking ? -1 : 0}
        aria-disabled={isUnlocking}
        onClick={handleCardActivate}
        onKeyDown={(event) => {
          if (isUnlocking) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleCardActivate();
          }
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-primary/50 via-primary/10 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

        <div className="relative p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Avatar className="h-4 w-4 shrink-0 border border-border/60">
                  <AvatarImage src={sourceChannelAvatarUrl || undefined} alt={sourceLabel} />
                  <AvatarFallback className="text-[8px]">{sourceInitials}</AvatarFallback>
                </Avatar>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/70 truncate">
                  {sourceLabel}
                </p>
              </div>
              <h3 className="text-sm font-semibold leading-snug line-clamp-2">{title}</h3>
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0">{formatRelativeShort(createdAt)}</span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant="secondary"
                className="h-6 rounded-full border border-primary/20 bg-primary/10 px-2.5 text-[11px] font-medium text-primary"
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock available'}
              </Badge>
              <span className="inline-flex h-6 items-center rounded-full border border-border/60 bg-muted/40 px-2.5 text-[11px] text-muted-foreground">
                Cost {unlockCostFormatter.format(unlockCost)} cr
              </span>
            </div>

            <div className="flex items-center gap-2">
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-muted-foreground underline underline-offset-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  Open source
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      </div>

      <AlertDialog open={showUnlockConfirm} onOpenChange={setShowUnlockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock this blueprint?</AlertDialogTitle>
            <AlertDialogDescription>
              This will spend {unlockCostFormatter.format(unlockCost)} credits to unlock and generate it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnlocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUnlock} disabled={isUnlocking}>
              {isUnlocking ? 'Unlocking...' : 'Confirm unlock'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

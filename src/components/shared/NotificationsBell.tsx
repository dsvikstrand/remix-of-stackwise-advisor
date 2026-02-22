import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, LoaderCircle, MessageCircleReply, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications';

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
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateMs).toLocaleDateString();
}

function notificationIcon(item: NotificationItem) {
  if (item.type === 'comment_reply') return MessageCircleReply;
  if (item.type === 'generation_started') return LoaderCircle;
  if (item.type === 'generation_failed') return TriangleAlert;
  return Sparkles;
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const {
    items,
    unreadCount,
    isEnabled,
    isLoading,
    markAllRead,
  } = useNotifications({ limit: 15 });

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [items],
  );

  const handleOpenItem = async (item: NotificationItem) => {
    if (item.link_path) {
      navigate(item.link_path);
    }
  };

  if (!isEnabled) return null;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && unreadCount > 0) {
          void markAllRead().catch(() => undefined);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <DropdownMenuLabel className="px-3 py-2">Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="max-h-[420px]">
          {isLoading ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">Loading notifications...</div>
          ) : sortedItems.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            sortedItems.map((item) => {
              const Icon = notificationIcon(item);
              return (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleOpenItem(item);
                  }}
                  className={cn(
                    'group flex cursor-pointer items-start gap-3 px-3 py-3',
                    !item.is_read && 'bg-primary/5',
                  )}
                >
                  <span className={cn(
                    'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background',
                    item.type === 'generation_failed' ? 'text-destructive' : 'text-primary',
                  )}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      {!item.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </div>
                    {item.body ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(item.created_at)}</p>
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { X } from 'lucide-react';
interface TagFilterChipsProps {
  tags: Array<{ id: string; slug: string; count: number }>;
  selectedTag: string | null;
  onSelectTag: (slug: string | null) => void;
  followedTagIds?: Set<string>;
  onToggleFollow?: (tag: { id: string; slug: string }) => void;
}

export function TagFilterChips({ tags, selectedTag, onSelectTag, followedTagIds, onToggleFollow }: TagFilterChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const enableFollowState = !!followedTagIds && !!onToggleFollow;

  if (tags.length === 0) return null;

  return (
    <div className="relative">
      <ScrollArea className="w-full whitespace-nowrap" ref={scrollRef}>
        <div className="flex gap-2 pb-2">
          {selectedTag && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs shrink-0"
              onClick={() => onSelectTag(null)}
            >
              <X className="h-3 w-3" />
              Clear filter
            </Button>
          )}
          {tags.map((tag) => {
            const isFollowed = followedTagIds?.has(tag.id) ?? false;

            return (
              <Badge
                key={tag.id}
                variant={selectedTag === tag.slug ? 'default' : 'secondary'}
                className={`cursor-pointer shrink-0 transition-colors ${
                  selectedTag === tag.slug
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : enableFollowState
                      ? isFollowed
                        ? 'bg-primary/15 text-primary border border-primary/30 hover:bg-primary/20'
                        : 'bg-muted/40 text-muted-foreground border border-border/60 hover:bg-muted/60'
                      : 'hover:bg-secondary/80'
                }`}
                onClick={() => {
                  onSelectTag(selectedTag === tag.slug ? null : tag.slug);
                  onToggleFollow?.({ id: tag.id, slug: tag.slug });
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectTag(selectedTag === tag.slug ? null : tag.slug);
                    onToggleFollow?.({ id: tag.id, slug: tag.slug });
                  }
                }}
                aria-pressed={selectedTag === tag.slug}
              >
                #{tag.slug}
                <span className="ml-1 text-xs opacity-70">({tag.count})</span>
              </Badge>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

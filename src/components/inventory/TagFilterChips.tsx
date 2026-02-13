import { useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { X } from 'lucide-react';
interface TagFilterChipsProps {
  tags: Array<{ id: string; slug: string; count: number }>;
  selectedTag: string | null;
  onSelectTag: (slug: string | null) => void;
  variant?: 'scroll' | 'wrap';
}

export function TagFilterChips({
  tags,
  selectedTag,
  onSelectTag,
  variant = 'scroll',
}: TagFilterChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (tags.length === 0) return null;

  const chips = (
    <div className={variant === 'wrap' ? 'flex flex-wrap gap-2' : 'flex gap-2 pb-2'}>
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
        return (
          <Badge
            key={tag.id}
            variant={selectedTag === tag.slug ? 'default' : 'secondary'}
            className={`cursor-pointer shrink-0 transition-colors ${
              selectedTag === tag.slug
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'hover:bg-secondary/80'
            }`}
            onClick={() => {
              onSelectTag(selectedTag === tag.slug ? null : tag.slug);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectTag(selectedTag === tag.slug ? null : tag.slug);
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
  );

  if (variant === 'wrap') {
    return <div className="relative">{chips}</div>;
  }

  return (
    <div className="relative">
      <ScrollArea className="w-full whitespace-nowrap" ref={scrollRef}>
        {chips}
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

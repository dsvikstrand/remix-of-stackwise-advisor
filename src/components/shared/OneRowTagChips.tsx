import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface OneRowTagChipItem {
  key: string;
  label: string;
  variant?: BadgeVariant;
  className?: string;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

interface OneRowTagChipsProps {
  items: OneRowTagChipItem[];
  gapPx?: number;
  className?: string;
}

export function OneRowTagChips({ items, gapPx = 6, className }: OneRowTagChipsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [fitCount, setFitCount] = useState(items.length);

  const recalculate = useCallback(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) {
      setFitCount(0);
      return;
    }

    const available = container.clientWidth;
    let used = 0;
    let count = 0;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const el = measureRefs.current[item.key];
      if (!el) continue;

      const width = Math.ceil(el.getBoundingClientRect().width);
      const next = count === 0 ? width : used + gapPx + width;

      if (next <= available) {
        used = next;
        count += 1;
      } else {
        break;
      }
    }

    setFitCount(count);
  }, [gapPx, items]);

  useLayoutEffect(() => {
    recalculate();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(recalculate);
    observer.observe(container);
    return () => observer.disconnect();
  }, [recalculate]);

  useLayoutEffect(() => {
    recalculate();
  }, [items, recalculate]);

  const visibleItems = items.slice(0, fitCount);
  if (visibleItems.length === 0) return null;

  return (
    <>
      <div ref={containerRef} className={className}>
        {visibleItems.map((item) => (
          <Badge
            key={item.key}
            variant={item.variant || 'outline'}
            className={item.className}
            onClick={item.onClick}
          >
            {item.label}
          </Badge>
        ))}
      </div>

      <div className="pointer-events-none absolute -left-[9999px] -top-[9999px] opacity-0" aria-hidden="true">
        <div className="flex flex-nowrap">
          {items.map((item) => (
            <Badge
              key={item.key}
              variant={item.variant || 'outline'}
              className={item.className}
              ref={(el) => {
                measureRefs.current[item.key] = el;
              }}
            >
              {item.label}
            </Badge>
          ))}
        </div>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import type { CarouselApi } from '@/components/ui/carousel';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SummarySlidesProps = {
  title: string;
  slides: string[];
};

export function SummarySlides({ title, slides }: SummarySlidesProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);
  const canSlide = slides.length > 1;

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setActiveIndex(api.selectedScrollSnap());
    onSelect();
    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api]);

  if (!canSlide) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{slides[0] || ''}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <span className="text-[11px] text-muted-foreground">Slide {activeIndex + 1}/{slides.length}</span>
      </div>

      <Carousel setApi={setApi} opts={{ align: 'start', loop: false }}>
        <CarouselContent className="ml-0">
          {slides.map((slide, index) => (
            <CarouselItem key={`summary-slide-${index}`} className="pl-0">
              <div className="min-h-[132px] rounded-md border border-border/30 bg-muted/20 px-3 py-2.5">
                <p className="text-sm text-muted-foreground whitespace-pre-line">{slide}</p>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {slides.map((_, index) => (
            <button
              key={`summary-dot-${index}`}
              type="button"
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === activeIndex ? 'w-5 bg-foreground/70' : 'w-1.5 bg-foreground/25 hover:bg-foreground/40',
              )}
              aria-label={`Go to summary slide ${index + 1}`}
              onClick={() => api?.scrollTo(index)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => api?.scrollPrev()}
            disabled={activeIndex <= 0}
          >
            Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => api?.scrollNext()}
            disabled={activeIndex >= slides.length - 1}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}


import { ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const GLOSSARY: Record<string, string> = {
  inventory: 'A library is a collection of items you can choose from—like a recipe ingredient list.',
  blueprint: 'Your personal selection from a library, with AI-powered analysis.',
  wall: 'The community feed where users share and discover blueprints.',
  tag: 'A label that helps organize and discover content.',
  remix: "Create your own version of someone else's blueprint.",
};

interface GlossaryTipProps {
  term: keyof typeof GLOSSARY;
  children?: ReactNode;
  className?: string;
  iconOnly?: boolean;
}

export function GlossaryTip({ term, children, className, iconOnly }: GlossaryTipProps) {
  const definition = GLOSSARY[term];

  if (!definition) return <>{children}</>;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1 cursor-help',
              iconOnly ? '' : 'underline decoration-dotted underline-offset-2 decoration-muted-foreground/50',
              className
            )}
          >
            {!iconOnly && children}
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-sm">
          <p>{definition}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

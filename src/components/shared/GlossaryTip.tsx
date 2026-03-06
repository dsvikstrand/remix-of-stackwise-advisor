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
  inventory: 'Legacy term from earlier builds. The current MVP focuses on source-first blueprint generation.',
  blueprint: 'A bite-sized, step-by-step summary generated from source content, optionally remixed by users.',
  wall: 'Home: For You is your source-driven lane (locked + unlocked), Joined is your joined-channel discovery lane, and All is the global published blueprint lane.',
  tag: 'A label that helps organize and discover content.',
  remix: 'A user-edited insight variant attached to an imported blueprint.',
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

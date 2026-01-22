import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { BlendRecipe } from '@/types/stacklab';
import { History, Trash2, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface HistoryDropdownProps {
  history: BlendRecipe[];
  onLoad: (blendId: string) => void;
  onDelete: (blendId: string) => void;
}

export function HistoryDropdown({ history, onLoad, onDelete }: HistoryDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="fixed top-20 left-4 z-40 h-14 w-14 rounded-full bg-card/80 backdrop-blur-glass border-border/50 shadow-soft-md hover:shadow-glow-aqua hover:border-primary/30 transition-all duration-300 group"
        >
          <History className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          {history.length > 0 && (
            <Badge 
              variant="default" 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] font-bold"
            >
              {history.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        side="right" 
        align="start" 
        className="w-80 p-0 bg-card/95 backdrop-blur-glass border-border/50 shadow-soft-lg"
        sideOffset={8}
      >
        <div className="p-4 border-b border-border/30">
          <h3 className="font-semibold text-lg tracking-tight">Blend History</h3>
          <p className="text-xs text-muted-foreground">Your analyzed blends</p>
        </div>
        
        {history.length === 0 ? (
          <div className="p-8 text-center">
            <History className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No blends yet</p>
            <p className="text-xs text-muted-foreground/70">Analyzed blends will appear here</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="p-2 space-y-1">
              {history.map((blend) => (
                <div
                  key={blend.id}
                  className="p-3 rounded-lg hover:bg-accent/50 transition-colors group cursor-pointer"
                  onClick={() => {
                    onLoad(blend.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{blend.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {blend.items.length} ingredients •{' '}
                        {formatDistanceToNow(new Date(blend.createdAt), { addSuffix: true })}
                      </p>
                      {blend.analysis?.classification && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          {blend.analysis.classification}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLoad(blend.id);
                          setOpen(false);
                        }}
                        title="Use as template"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(blend.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

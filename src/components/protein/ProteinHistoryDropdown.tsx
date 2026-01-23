import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { History, Copy, Trash2, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ShakeRecipe } from '@/types/stacklab';

interface ProteinHistoryDropdownProps {
  history: ShakeRecipe[];
  onLoad: (shakeId: string) => void;
  onDelete: (shakeId: string) => void;
}

export function ProteinHistoryDropdown({
  history,
  onLoad,
  onDelete,
}: ProteinHistoryDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed top-4 left-4 z-40 gap-2 bg-card/80 backdrop-blur-sm border-border/50 shadow-soft"
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">History</span>
          {history.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {history.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="bottom">
        <div className="p-3 border-b border-border/50">
          <h4 className="font-semibold text-sm">Shake History</h4>
          <p className="text-xs text-muted-foreground">Your past protein shake analyses</p>
        </div>

        {history.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">No shakes analyzed yet</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="divide-y divide-border/30">
              {history.map((shake) => (
                <div
                  key={shake.id}
                  className="p-3 hover:bg-accent/50 transition-colors cursor-pointer group"
                  onClick={() => {
                    onLoad(shake.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{shake.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {shake.items.length} source{shake.items.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {shake.totalProtein.toFixed(0)}g protein
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(shake.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      {shake.analysis && (
                        <Badge variant="outline" className="mt-2 text-xs">
                          Score: {shake.analysis.completenessScore}/100
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLoad(shake.id);
                          setOpen(false);
                        }}
                        title="Use as template"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(shake.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-2" />
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

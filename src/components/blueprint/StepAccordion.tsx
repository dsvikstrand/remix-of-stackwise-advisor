import { useState, useCallback } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Check, GripVertical, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BlueprintStep {
  id: string;
  title: string;
  description: string;
  itemKeys: string[];
}

interface ItemEntry {
  key: string;
  category: string;
  item: string;
}

interface StepAccordionProps {
  steps: BlueprintStep[];
  activeStepId: string | null;
  onSetActive: (stepId: string) => void;
  onUpdateStep: (stepId: string, updates: Partial<BlueprintStep>) => void;
  onRemoveStep: (stepId: string) => void;
  onAddStep: () => void;
  onReorderSteps: (fromIndex: number, toIndex: number) => void;
  onRemoveItem: (category: string, item: string) => void;
  onUpdateItemContext: (category: string, item: string, context: string) => void;
  itemContexts: Record<string, string>;
}

export function StepAccordion({
  steps,
  activeStepId,
  onSetActive,
  onUpdateStep,
  onRemoveStep,
  onAddStep,
  onReorderSteps,
  onRemoveItem,
  onUpdateItemContext,
  itemContexts,
}: StepAccordionProps) {
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const parseItemKey = useCallback((key: string): ItemEntry | null => {
    const [category, item] = key.split('::');
    if (!category || !item) return null;
    return { key, category, item };
  }, []);

  const startEditing = useCallback((step: BlueprintStep) => {
    setEditingStepId(step.id);
    setTitleDraft(step.title);
  }, []);

  const saveTitle = useCallback((stepId: string) => {
    onUpdateStep(stepId, { title: titleDraft.trim() });
    setEditingStepId(null);
    setTitleDraft('');
  }, [onUpdateStep, titleDraft]);

  const cancelEditing = useCallback(() => {
    setEditingStepId(null);
    setTitleDraft('');
  }, []);

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((targetIndex: number) => {
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      onReorderSteps(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
  }, [draggedIndex, onReorderSteps]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  return (
    <div className="space-y-3">
      {/* Quick Add Step Button */}
      <Button
        type="button"
        variant="outline"
        onClick={onAddStep}
        className="w-full gap-2 border-dashed"
        data-help-id="add-step"
      >
        <Plus className="h-4 w-4" />
        Add Step
      </Button>

      {steps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No steps yet. Select items from the library above — they'll appear in your first step automatically.
          </p>
        </div>
      ) : (
        <Accordion
          type="single"
          collapsible
          value={activeStepId || undefined}
          onValueChange={(value) => value && onSetActive(value)}
          className="space-y-2"
          data-help-id="steps"
        >
          {steps.map((step, index) => {
            const displayTitle = step.title.trim() || `Step ${index + 1}`;
            const itemEntries = step.itemKeys
              .map(parseItemKey)
              .filter((entry): entry is ItemEntry => entry !== null);
            const isActive = activeStepId === step.id;
            const isEditing = editingStepId === step.id;

            return (
              <AccordionItem
                key={step.id}
                value={step.id}
                className={cn(
                  'rounded-xl border transition-all duration-200',
                  isActive
                    ? 'border-primary/40 bg-card shadow-sm'
                    : 'border-border/40 bg-muted/30 hover:bg-muted/50'
                )}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                onDragEnd={handleDragEnd}
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline [&>svg]:hidden">
                  <div className="flex w-full items-center gap-3">
                    {/* Drag Handle */}
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />

                    {/* Title (editable) */}
                    {isEditing ? (
                      <div
                        className="flex items-center gap-2 flex-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          placeholder={`Step ${index + 1}`}
                          className="h-8 flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveTitle(step.id);
                            } else if (e.key === 'Escape') {
                              cancelEditing();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            saveTitle(step.id);
                          }}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEditing();
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium truncate">{displayTitle}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(step);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                    {/* Badges & Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-xs">
                        {itemEntries.length} {itemEntries.length === 1 ? 'item' : 'items'}
                      </Badge>
                      {isActive && (
                        <Badge variant="outline" className="gap-1 text-xs border-primary/40 text-primary">
                          <Zap className="h-3 w-3" />
                          Active
                        </Badge>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveStep(step.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4">
                    {/* Description */}
                    <div className="space-y-1.5">
                      <Textarea
                        value={step.description}
                        onChange={(e) => onUpdateStep(step.id, { description: e.target.value })}
                        placeholder="Add step notes or instructions..."
                        rows={2}
                        className="resize-none"
                      />
                    </div>

                    {/* Active step hint */}
                    {isActive && itemEntries.length === 0 && (
                      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-center" data-help-id="active-step">
                        <p className="text-sm text-muted-foreground">
                          Items you select will be added here automatically
                        </p>
                      </div>
                    )}

                    {/* Items list */}
                    {itemEntries.length > 0 && (
                      <div className="space-y-2">
                        {itemEntries.map((entry) => (
                          <div
                            key={entry.key}
                            className="rounded-lg border border-border/40 bg-background/50 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{entry.item}</p>
                                <p className="text-xs text-muted-foreground">{entry.category}</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => onRemoveItem(entry.category, entry.item)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                            <Input
                              value={itemContexts[entry.key] || ''}
                              onChange={(e) => onUpdateItemContext(entry.category, entry.item, e.target.value)}
                              placeholder="Add context (e.g., 0.5 mg, morning, with food...)"
                              className="h-8 text-sm"
                              data-help-id="context"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}

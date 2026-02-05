import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BuildPageGuideProps {
  currentStep: 1 | 2 | 3;
}

const STEPS = [
  { number: 1, label: 'Build Blueprint' },
  { number: 2, label: 'Review with AI' },
  { number: 3, label: 'Publish' },
];

export function BuildPageGuide({ currentStep }: BuildPageGuideProps) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 py-4">
      {STEPS.map((step, i) => {
        const isCompleted = currentStep > step.number;
        const isCurrent = currentStep === step.number;

        return (
          <div key={step.number} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : isCurrent
                    ? 'bg-primary/20 text-primary border-2 border-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : step.number}
              </div>
              <span
                className={cn(
                  'text-sm font-medium hidden sm:inline',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-8 sm:w-12',
                  currentStep > step.number ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

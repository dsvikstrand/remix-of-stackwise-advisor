import { Dialog, DialogContent } from '@/components/ui/dialog';
import { HomeOnboardingCard } from '@/components/onboarding/HomeOnboardingCard';

interface HomeOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HomeOnboardingDialog({ open, onOpenChange }: HomeOnboardingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl border-none bg-transparent p-0 shadow-none">
        <HomeOnboardingCard
          onDismiss={() => onOpenChange(false)}
          className="mx-0 sm:mx-0"
        />
      </DialogContent>
    </Dialog>
  );
}

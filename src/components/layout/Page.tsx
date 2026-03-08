import { cn } from '@/lib/utils';

export function PageRoot({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('min-h-[100dvh] bg-background', className)}>{children}</div>;
}

export function PageMain({
  className,
  children,
  padBottom = true,
}: {
  className?: string;
  children: React.ReactNode;
  padBottom?: boolean;
}) {
  return (
    <main
      className={cn(
        'mx-auto max-w-3xl py-6',
        'pl-[calc(0.75rem+var(--bleup-app-safe-left))] pr-[calc(0.75rem+var(--bleup-app-safe-right))]',
        'sm:pl-[calc(1rem+var(--bleup-app-safe-left))] sm:pr-[calc(1rem+var(--bleup-app-safe-right))]',
        padBottom && 'pb-[calc(6rem+var(--bleup-app-safe-bottom))]',
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageSection({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn('space-y-3', className)}>{children}</section>;
}

export function PageDivider({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-border/40', className)} />;
}

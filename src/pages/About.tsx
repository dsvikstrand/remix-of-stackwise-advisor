import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-10 pb-24 space-y-6">
        <div className="border border-border/40 px-3 py-4 space-y-4">
          <h1 className="text-lg font-semibold">About Bleup</h1>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Bleup helps you turn YouTube into something easier to follow, save, and return to
              later. Pull in creators you care about, turn videos into blueprints, and keep the
              useful parts instead of losing them to endless watch time.
            </p>
            <p>
              The product is still intentionally simple: discover from your sources, save what is
              useful, and browse a feed that feels more curated than the default YouTube loop.
            </p>
            <div>
              <p className="font-medium text-foreground">Contact</p>
              <p>
                Email: <a href="mailto:hi@bleup.app" className="underline">hi@bleup.app</a>
              </p>
            </div>
          </div>
        </div>
        <AppFooter />
      </main>
    </div>
  );
}

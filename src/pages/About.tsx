import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-10 pb-24 space-y-6">
        <div className="border border-border/40 px-3 py-4 space-y-4">
          <h1 className="text-lg font-semibold">About Blueprints</h1>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Blueprints is a source-first community app. Pull content into your personal My Feed,
              remix it into useful steps, and let eligible items auto-publish to Home for
              discussion and voting.
            </p>
            <p>
              The primary path is source-first: pull videos, generate blueprints, and publish to
              community lanes when eligible.
            </p>
            <div>
              <p className="font-medium text-foreground">Contact</p>
              <p>
                Email: <a href="mailto:hi@vdsai.cloud" className="underline">hi@vdsai.cloud</a>
              </p>
              <p>Based in Sweden</p>
            </div>
          </div>
        </div>
        <AppFooter />
      </main>
    </div>
  );
}

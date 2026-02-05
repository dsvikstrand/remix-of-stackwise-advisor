import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function About() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <Card className="bg-card/60 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>About Blueprints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Blueprints is a community space for sharing step-by-step routines built from
              libraries. Use it to discover what works, remix it for your needs, and share
              back with others.
            </p>
            <div>
              <p className="font-medium text-foreground">Contact</p>
              <p>
                Email: <a href="mailto:hi@vdsai.cloud" className="underline">hi@vdsai.cloud</a>
              </p>
              <p>Based in Sweden</p>
            </div>
          </CardContent>
        </Card>
        <AppFooter />
      </main>
    </div>
  );
}

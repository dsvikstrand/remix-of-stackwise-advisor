import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';

const EFFECTIVE_DATE = '2026-03-05';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 py-10 pb-24 space-y-6">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>

        <section className="space-y-3 text-sm leading-6">
          <p>
            These Terms govern your use of Bleup. By creating an account or using the service, you agree to follow
            these Terms and all applicable laws.
          </p>
          <p>
            You are responsible for your account activity, including content you create, publish, or share. Do not use
            the service for unlawful, abusive, or deceptive behavior.
          </p>
          <p>
            Bleup is provided on an as-is basis for MVP usage. Features, limits, and availability may change as we
            improve reliability and safety.
          </p>
          <p>
            If you believe your account or data is affected by misuse, contact support immediately at
            {' '}
            <a className="underline" href="mailto:support@vdsai.cloud">support@vdsai.cloud</a>.
          </p>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}

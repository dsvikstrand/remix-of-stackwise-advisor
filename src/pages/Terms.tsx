import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';

const EFFECTIVE_DATE = '2026-03-05';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 py-10 pb-24 space-y-8">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>

        <section className="space-y-3 text-sm leading-6">
          <p>
            These Terms govern your use of Bleu. By creating an account or using the service, you agree to follow
            these Terms and all applicable laws.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6">
          <h2 className="text-lg font-semibold text-foreground">About the service</h2>
          <p>
            Bleu helps users follow creators, generate blueprint summaries from videos, and browse published blueprints
            by topic. Some features depend on third-party providers such as Google, YouTube, transcript providers, and
            language model services.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6">
          <h2 className="text-lg font-semibold text-foreground">Accounts and connected services</h2>
          <p>
            You are responsible for activity that occurs through your account. If you connect a third-party account such
            as YouTube, you are responsible for ensuring you have the right to connect that account and for reviewing any
            permissions you grant.
          </p>
          <p>
            Bleu may rely on connected-provider data to support product features such as subscription import and feed
            personalization. Connected-provider availability, permissions, and API behavior may change over time.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6">
          <h2 className="text-lg font-semibold text-foreground">Acceptable use</h2>
          <p>
            Do not use the service for unlawful, abusive, deceptive, or harmful behavior. Do not attempt to interfere
            with platform security, rate limits, data integrity, or the accounts and data of other users.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6">
          <h2 className="text-lg font-semibold text-foreground">Availability and changes</h2>
          <p>
            Bleu is provided on an as-is basis for MVP usage. Features, limits, provider integrations, and availability
            may change as we improve reliability, safety, and product scope.
          </p>
        </section>

        <section className="space-y-3 text-sm leading-6">
          <h2 className="text-lg font-semibold text-foreground">Contact</h2>
          <p>
            If you believe your account or data is affected by misuse, contact support immediately at{' '}
            <a className="underline" href="mailto:support@vdsai.cloud">support@vdsai.cloud</a>.
          </p>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
